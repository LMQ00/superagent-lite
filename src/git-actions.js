import { readTask, updateTask } from './task-store.js'
import { runCommand, runProcess } from './process.js'
import { githubOrigin, mergeGithub, publishGithub, pullRequestUrl } from './github.js'
import { mergeCommand } from './merge.js'
import { worktreeHead } from './review.js'

export { pullRequestUrl }

const TASK_ID = /^[a-f0-9]{16}$/
const ORIGIN_CACHE_MS = 30_000
const PR_CACHE_MS = 30_000
const PR_TIMEOUT_MS = 10_000
const DELIVERY_STATUSES = ['review-required', 'awaiting-merge', 'awaiting-ci', 'merge-queued', 'publishing', 'merging', 'delivery-blocked']

function dirtyTargetLine(line) {
  return line && line !== '?? .agents/worktrees/.gitignore'
}

export function createGitManager(ctx, dependencies = {}) {
  const store = dependencies.store ?? { readTask, updateTask }
  const git = dependencies.git ?? ((args, cwd, signal) => runCommand(ctx, args, cwd, signal))
  const originOf = dependencies.originOf ?? ((root, signal) => githubOrigin(ctx, root, signal))
  const merge = dependencies.merge ?? mergeCommand(ctx)
  const publish = dependencies.publish ?? ((task, origin, signal, record) => publishGithub(ctx, task, origin, signal, record))
  const mergeRemote = dependencies.mergeRemote ?? ((task, origin, signal, record) => mergeGithub(ctx, task, origin, signal, record))
  const gh = dependencies.gh ?? ((args, cwd, signal) => runProcess(ctx, 'gh', args, cwd, signal))
  const checkedHead = dependencies.checkedHead ?? ((task, signal) => worktreeHead(ctx, task, signal))
  const policy = dependencies.policy
  const now = dependencies.now ?? (() => Date.now())

  const origins = new Map()
  const pullRequests = new Map()
  const inFlight = new Map()

  function serialize(taskId, operation) {
    const previous = inFlight.get(taskId) ?? Promise.resolve()
    const current = previous.catch(() => {}).then(operation)
    inFlight.set(taskId, current)
    return current.finally(() => {
      if (inFlight.get(taskId) === current) inFlight.delete(taskId)
    })
  }

  function deliveryMode(task) {
    if (policy) return policy(task).mode
    const router = ctx.agents?.get?.(task.parentSessionId)
    if (router) return ctx.sandboxPolicy.resolve({ session: router.session }).mode
    const scoped = (ctx.agents?.list?.() ?? []).filter(candidate => {
      try {
        return ctx.workingDirectory?.get?.(candidate.session) === task.projectRoot
      } catch {
        return false
      }
    })
    const modes = scoped.map(candidate => ctx.sandboxPolicy.resolve({ session: candidate.session }).mode)
    if (modes.includes('danger-full-access')) return 'danger-full-access'
    return modes[0] ?? 'danger-full-access'
  }

  function requireFullAccess(task) {
    if (deliveryMode(task) !== 'danger-full-access') {
      throw new Error('Git delivery is unavailable under the current Session file policy')
    }
  }

  function routerFor(task) {
    const agent = ctx.agents?.get(task.parentSessionId)
    if (!agent) throw new Error('The router Session is not running')
    return agent
  }

  async function resolveOrigin(root, signal, fresh = false) {
    if (typeof root !== 'string' || !root) return { error: new Error('This task has no project checkout') }
    const cached = origins.get(root)
    if (!fresh && cached && now() - cached.at < ORIGIN_CACHE_MS) return cached.value
    let value
    try {
      value = { origin: await originOf(root, signal) }
    } catch (error) {
      value = { error }
    }
    origins.set(root, { at: now(), value })
    return value
  }

  async function worktreeFacts(task, signal) {
    const { path, branch } = task.worktree ?? {}
    if (!path || !branch) return undefined
    try {
      const head = await git(['rev-parse', '--verify', 'HEAD^{commit}'], path, signal)
      const status = await git(['status', '--porcelain', '--untracked-files=all'], path, signal)
      let current
      try {
        current = await git(['symbolic-ref', '--quiet', 'HEAD'], path, signal)
      } catch {
        current = undefined
      }
      return { head, uncommitted: status.length > 0, onBranch: current === `refs/heads/${branch}` }
    } catch {
      return undefined
    }
  }

  async function isMerged(task, head, signal) {
    if (!head || head === task.baseCommit) return false
    try {
      const tip = await git(['rev-parse', '--verify', `refs/heads/${task.baseBranch}^{commit}`], task.projectRoot, signal)
      if (tip === head) return true
      await git(['merge-base', '--is-ancestor', head, tip], task.projectRoot, signal)
      return true
    } catch {
      return false
    }
  }

  async function settle(task, changes) {
    if (task.status === changes.status && Object.keys(changes).length === 1) return task
    return store.updateTask(task.id, changes)
  }

  async function reviewedHead(task, signal) {
    if (!task.worktree?.branch) throw new Error('This task has no worker branch')
    if (task.review?.approved !== true) throw new Error('The review has not approved this branch')
    let head
    try {
      head = await checkedHead(task, signal)
    } catch (error) {
      throw new Error(`The worker worktree is unavailable: ${error.message}`)
    }
    if (head !== task.review.head) throw new Error('The worker branch no longer matches its reviewed commit')
    return head
  }

  async function assertCheckoutReady(task, signal) {
    const root = task.projectRoot
    if (await git(['rev-parse', '--show-toplevel'], root, signal) !== root) {
      throw new Error('The target checkout no longer resolves to the project root')
    }
    if (await git(['symbolic-ref', '--quiet', 'HEAD'], root, signal) !== `refs/heads/${task.baseBranch}`) {
      throw new Error('The target checkout no longer has its original branch checked out')
    }
    try {
      await git(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], root, signal)
      throw new Error('The target already has an in-progress merge')
    } catch (error) {
      if (error.exitCode !== 1) throw error
    }
    const dirty = await git(['status', '--porcelain', '--untracked-files=all'], root, signal)
    if (dirty.split('\n').some(dirtyTargetLine)) throw new Error('The target checkout has uncommitted changes')
  }

  async function assertTargetReady(task, head, signal) {
    await assertCheckoutReady(task, signal)
    const root = task.projectRoot
    try {
      await git(['merge-tree', '--write-tree', 'HEAD', head], root, signal)
    } catch (error) {
      if (error.exitCode === 1 && !signal?.aborted) throw new Error('Merge would conflict; the target was not changed')
      throw error
    }
  }

  async function syncBaseCheckout(task, signal) {
    await assertCheckoutReady(task, signal)
    await git(['pull', '--ff-only', 'origin', task.baseBranch], task.projectRoot, signal)
    return git(['rev-parse', '--verify', 'HEAD^{commit}'], task.projectRoot, signal)
  }

  async function assertMergeReady(task, project, signal) {
    if (project.error) throw project.error
    const head = await reviewedHead(task, signal)
    requireFullAccess(task)
    if (project.origin) {
      await assertCheckoutReady(task, signal)
      return { head, github: true }
    }
    if (task.status !== 'awaiting-merge') throw new Error('This branch is not waiting for merge')
    const agent = routerFor(task)
    await assertTargetReady(task, head, signal)
    return { head, github: false, agent }
  }

  async function assertPublishReady(task, project, signal) {
    if (project.error) throw project.error
    const head = await reviewedHead(task, signal)
    if (!project.origin) throw new Error('This project has no GitHub origin')
    if (task.status === 'merged') throw new Error('This branch is already merged')
    requireFullAccess(task)
    return head
  }

  async function syncPullRequest(task, signal) {
    const url = pullRequestUrl(task.prUrl)
    if (!url) return undefined
    if (task.status === 'merged') return { url, state: 'MERGED', exact: true }
    const cached = pullRequests.get(url)
    if (cached && now() - cached.at < PR_CACHE_MS) return cached.value
    let value = { url, state: task.prState ?? 'UNKNOWN', exact: false }
    try {
      const timeout = AbortSignal.timeout(PR_TIMEOUT_MS)
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
      const raw = await gh([
        'pr', 'view', url, '--json', 'state,headRefOid,headRefName,baseRefName,isCrossRepository,mergeable',
      ], task.projectRoot, combined)
      const view = JSON.parse(raw)
      const exact = view.headRefOid === task.review?.head &&
        view.headRefName === task.worktree?.branch &&
        view.baseRefName === task.baseBranch &&
        view.isCrossRepository === false
      value = { url, state: typeof view.state === 'string' ? view.state : 'UNKNOWN', exact, mergeable: view.mergeable }
      if (exact && view.state === 'MERGED') {
        const next = await store.updateTask(task.id, latest => latest.status === 'merged'
          ? {}
          : { status: 'merged', prState: 'MERGED' })
        value.status = next.status
      } else if (exact && view.state === 'CLOSED') {
        const next = await store.updateTask(task.id, latest => ['awaiting-merge', 'awaiting-ci', 'merge-queued', 'publishing', 'merging'].includes(latest.status)
          ? { status: 'delivery-blocked', prState: 'CLOSED', failure: 'The pull request was closed' }
          : {})
        value.status = next.status
      } else if (exact && view.state === 'OPEN') {
        const next = await store.updateTask(task.id, latest => ['review-required', 'awaiting-merge'].includes(latest.status)
          ? { status: 'awaiting-ci', prState: 'OPEN' }
          : {})
        value.status = next.status
      }
    } catch {
      // A missing gh client, offline host, or unreadable pull request leaves the stored state alone.
    }
    pullRequests.set(url, { at: now(), value })
    return value
  }

  async function selfHeal(task, signal) {
    if (!task.worktree?.branch || task.review?.approved !== true) return task
    let head
    try {
      head = await checkedHead(task, signal)
    } catch {
      return task
    }
    if (head !== task.review.head) return task
    if (task.status === 'review-required') return settle(task, { status: 'awaiting-merge' })
    return task
  }

  async function viewFor(record, project, signal) {
    let task = record
    let pr
    if (task.prUrl) {
      pr = await syncPullRequest(task, signal)
      if (pr?.status) task = { ...task, status: pr.status }
    }
    if (task.mode === 'report' && DELIVERY_STATUSES.includes(task.status)) {
      task = await settle(task, { status: 'completed' })
    }
    const branch = task.worktree?.branch
    if (!branch) return { status: task.status, git: undefined }
    const facts = await worktreeFacts(task, signal)
    const approved = task.review?.approved === true
    const reviewed = approved && facts?.head !== undefined && facts.head === task.review.head
    const mergedInPr = pr?.exact === true && pr.state === 'MERGED'
    const merged = mergedInPr || await isMerged(task, facts?.head ?? task.review?.head, signal)
    if (merged && DELIVERY_STATUSES.includes(task.status)) {
      task = await settle(task, { status: 'merged', ...(mergedInPr ? { prState: 'MERGED' } : {}) })
    } else if (!merged && task.status === 'review-required' && reviewed) {
      task = await settle(task, { status: 'awaiting-merge' })
    }
    const closed = pr?.exact === true && pr.state === 'CLOSED'
    let mergeReason
    let publishReason
    let canMerge = false
    let canPublish = false
    try {
      await assertMergeReady(task, project, signal)
      canMerge = true
    } catch (error) {
      mergeReason = error.message
    }
    try {
      await assertPublishReady(task, project, signal)
      canPublish = true
    } catch (error) {
      publishReason = error.message
    }
    if (merged) {
      canMerge = false
      canPublish = false
      mergeReason = 'This branch is already merged'
      publishReason = 'This branch is already merged'
    } else if (closed) {
      canMerge = false
      canPublish = false
      mergeReason = 'The pull request was closed; reopen it or dispatch a new task'
      publishReason = mergeReason
    } else if (pr?.mergeable === 'CONFLICTING') {
      canMerge = false
      mergeReason = 'The pull request has merge conflicts; resolve them before merging'
    }
    if (project.origin && pr?.exact === true && pr.state === 'OPEN' && !merged) {
      canPublish = false
      publishReason = 'A pull request already exists for this branch'
    }
    return {
      status: task.status,
      git: {
        branch,
        baseBranch: task.baseBranch,
        head: facts?.head,
        reviewedHead: task.review?.head,
        approved,
        reviewed,
        merged,
        unmerged: !merged && Boolean(facts?.head),
        uncommitted: facts?.uncommitted ?? false,
        onBranch: facts?.onBranch ?? false,
        repository: project.origin?.repo,
        pr: pr ? { url: pr.url, state: pr.state, exact: pr.exact, mergeable: pr.mergeable } : undefined,
        canMerge,
        canPublish,
        mergeReason,
        publishReason,
      },
    }
  }

  async function list(records, signal) {
    const projects = new Map()
    const entries = await Promise.all(records.map(async record => {
      let project = projects.get(record.projectRoot)
      if (!project) {
        project = resolveOrigin(record.projectRoot, signal)
        projects.set(record.projectRoot, project)
      }
      return [record.id, await viewFor(record, await project, signal)]
    }))
    return new Map(entries)
  }

  function result(task, action, changes) {
    return { taskId: task.id, action, ...changes }
  }

  async function alreadyMerged(task, action, project, signal) {
    let message = `Task ${task.id} is already merged`
    if (project.origin && !project.error) {
      try {
        const baseHead = await syncBaseCheckout(task, signal)
        message = `${message}; the project checkout is at ${baseHead}`
      } catch (error) {
        throw new Error(`Task ${task.id} is already merged, but the project checkout could not be fast-forwarded: ${error.message}`)
      }
    }
    return result(task, action, { status: 'merged', prUrl: task.prUrl, message: `${message}.` })
  }

  async function publishAction(task, project, signal) {
    const head = await assertPublishReady(task, project, signal)
    if (task.prUrl) {
      const pr = await syncPullRequest(task, signal)
      if (pr?.exact && pr.state === 'OPEN') {
        return result(task, 'publish', { status: task.status, prUrl: task.prUrl, prState: 'OPEN', message: `A pull request already exists for ${task.id}.` })
      }
      if (pr?.exact && pr.state === 'MERGED') {
        await settle(task, { status: 'merged', prState: 'MERGED' })
        return alreadyMerged({ ...task, status: 'merged' }, 'publish', project, signal)
      }
      if (pr?.exact && pr.state === 'CLOSED') throw new Error('The pull request was closed; reopen it or dispatch a new task')
    }
    await store.updateTask(task.id, latest => {
      if (latest.status === 'merged') throw new Error('This branch is already merged')
      if (latest.review?.approved !== true || latest.review?.head !== head) throw new Error('The review changed during publication')
      return { status: 'publishing', failure: undefined }
    })
    try {
      const published = await publish(task, project.origin, signal, changes => store.updateTask(task.id, changes))
      const next = await store.readTask(task.id)
      const url = pullRequestUrl(next.prUrl) ?? published.url
      if (url) pullRequests.delete(url)
      return result(task, 'publish', {
        status: next.status,
        prUrl: next.prUrl ?? published.url,
        prState: next.prState ?? published.state,
        message: published.adopted
          ? `Pushed the reviewed commit for ${task.id}; pull request ${published.number} already existed.`
          : `Published the reviewed commit for ${task.id} as pull request ${published.number}.`,
      })
    } catch (error) {
      await store.updateTask(task.id, latest => latest.status === 'merged' ? {} : { status: 'delivery-blocked', failure: error.message })
      throw error
    }
  }

  async function mergeGithubAction(task, project, signal) {
    if (task.prUrl) {
      const pr = await syncPullRequest(task, signal)
      if (pr?.exact && pr.state === 'MERGED') {
        await settle(task, { status: 'merged', prState: 'MERGED' })
        return alreadyMerged({ ...task, status: 'merged' }, 'merge', project, signal)
      }
      if (pr?.exact && pr.state === 'CLOSED') throw new Error('The pull request was closed; reopen it or dispatch a new task')
    }
    await assertMergeReady(task, project, signal)
    let current = await store.readTask(task.id)
    let pr = current.prUrl ? await syncPullRequest(current, signal) : undefined
    if (!pr?.exact || pr.state !== 'OPEN') {
      await store.updateTask(task.id, { status: 'publishing', failure: undefined })
      try {
        await publish(current, project.origin, signal, changes => store.updateTask(task.id, changes))
      } catch (error) {
        await store.updateTask(task.id, latest => latest.status === 'merged' ? {} : { status: 'delivery-blocked', failure: error.message })
        throw error
      }
      current = await store.readTask(task.id)
      const url = pullRequestUrl(current.prUrl)
      if (url) pullRequests.delete(url)
      pr = await syncPullRequest(current, signal)
      if (!pr?.exact || pr.state !== 'OPEN') throw new Error('The pull request could not be opened for the reviewed commit')
    }
    await store.updateTask(task.id, { status: 'merging' })
    let merged
    try {
      merged = await mergeRemote(current, project.origin, signal, changes => store.updateTask(task.id, changes))
    } catch (error) {
      await store.updateTask(task.id, latest => latest.status === 'merged' ? {} : { status: 'delivery-blocked', failure: error.message })
      throw error
    }
    await settle(current, { status: 'merged', prState: 'MERGED', failure: undefined })
    let baseHead
    try {
      baseHead = await syncBaseCheckout(task, signal)
    } catch (error) {
      throw new Error(`Pull request ${merged.number} merged, but the project checkout could not be fast-forwarded: ${error.message}`)
    }
    return result(task, 'merge', {
      status: 'merged',
      prUrl: merged.url,
      prState: 'MERGED',
      baseHead,
      message: `Merged pull request ${merged.number} for ${task.id} into ${task.baseBranch}; the project checkout is at ${baseHead}.`,
    })
  }

  async function mergeLocalAction(task, project, signal) {
    const ready = await assertMergeReady(task, project, signal)
    const merged = await merge.handler({ agent: ready.agent, rawInput: task.id, signal })
    if (merged.kind === 'error') throw new Error(merged.text)
    const next = await store.readTask(task.id)
    return result(task, 'merge', { status: next.status, prUrl: next.prUrl, message: merged.text })
  }

  async function perform(taskId, action, signal) {
    if (typeof taskId !== 'string' || !TASK_ID.test(taskId)) throw new Error('Invalid task ID')
    if (action !== 'merge' && action !== 'publish') throw new Error('Unknown Git action')
    return serialize(taskId, async () => {
      const task = await store.readTask(taskId)
      if (!task) throw new Error('Task not found')
      if (task.mode === 'report') throw new Error('Report-only tasks have no Git action')
      const project = await resolveOrigin(task.projectRoot, signal, true)
      if (task.status !== 'merged') {
        const facts = await worktreeFacts(task, signal)
        if (facts?.head && await isMerged(task, facts.head, signal)) {
          return alreadyMerged(await settle(task, { status: 'merged' }), action, project, signal)
        }
      }
      if (task.status === 'merged') return alreadyMerged(task, action, project, signal)
      const healed = await selfHeal(task, signal)
      if (action === 'publish') return publishAction(healed, project, signal)
      if (project.origin) return mergeGithubAction(healed, project, signal)
      return mergeLocalAction(healed, project, signal)
    })
  }

  return { list, perform }
}
