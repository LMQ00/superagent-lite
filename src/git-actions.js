import { readTask, updateTask } from './task-store.js'
import { runCommand, runProcess } from './process.js'
import { deliverGithub, githubOrigin } from './github.js'
import { mergeCommand } from './merge.js'
import { worktreeHead } from './review.js'

const TASK_ID = /^[a-f0-9]{16}$/
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/
const ORIGIN_CACHE_MS = 30_000
const PR_CACHE_MS = 30_000
const PR_TIMEOUT_MS = 10_000
const PUBLISHABLE_STATUSES = ['awaiting-merge', 'delivery-blocked']

export function pullRequestUrl(value) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (url.origin === 'https://github.com' && !url.username && !url.password && PR_URL.test(url.href)) return url.href
  } catch {
    return undefined
  }
}

function dirtyTargetLine(line) {
  return line && line !== '?? .agents/worktrees/.gitignore'
}

export function createGitManager(ctx, dependencies = {}) {
  const store = dependencies.store ?? { readTask, updateTask }
  const git = dependencies.git ?? ((args, cwd, signal) => runCommand(ctx, args, cwd, signal))
  const originOf = dependencies.originOf ?? ((root, signal) => githubOrigin(ctx, root, signal))
  const merge = dependencies.merge ?? mergeCommand(ctx)
  const deliver = dependencies.deliver ?? deliverGithub
  const gh = dependencies.gh ?? ((args, cwd, signal) => runProcess(ctx, 'gh', args, cwd, signal))
  const checkedHead = dependencies.checkedHead ?? ((task, signal) => worktreeHead(ctx, task, signal))
  const now = dependencies.now ?? (() => Date.now())

  const origins = new Map()
  const pullRequests = new Map()

  function routerFor(task) {
    const agent = ctx.agents?.get(task.parentSessionId)
    if (!agent) throw new Error('The router Session is not running')
    if (ctx.sandboxPolicy.resolve({ session: agent.session }).mode !== 'danger-full-access') {
      throw new Error('Git delivery is unavailable under this Session file policy')
    }
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
    if (!head) return false
    try {
      const tip = await git(['rev-parse', '--verify', `refs/heads/${task.baseBranch}^{commit}`], task.projectRoot, signal)
      if (tip === head) return true
      await git(['merge-base', '--is-ancestor', head, tip], task.projectRoot, signal)
      return true
    } catch {
      return false
    }
  }

  async function assertTargetReady(task, head, signal) {
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
    try {
      await git(['merge-tree', '--write-tree', 'HEAD', head], root, signal)
    } catch (error) {
      if (error.exitCode === 1 && !signal?.aborted) throw new Error('Merge would conflict; the target was not changed')
      throw error
    }
  }

  async function assertMergeReady(task, project, signal) {
    if (project.error) throw project.error
    if (!task.worktree?.branch) throw new Error('This task has no worker branch')
    if (task.status !== 'awaiting-merge') throw new Error('This branch is not waiting for merge')
    if (task.review?.approved !== true) throw new Error('The review has not approved this branch')
    if (project.origin) throw new Error('GitHub projects must merge through a pull request')
    routerFor(task)
    const head = await checkedHead(task, signal)
    if (head !== task.review.head) throw new Error('The worker branch no longer matches its reviewed commit')
    await assertTargetReady(task, head, signal)
  }

  async function assertPublishReady(task, project, signal) {
    if (project.error) throw project.error
    if (!task.worktree?.branch) throw new Error('This task has no worker branch')
    if (task.review?.approved !== true) throw new Error('The review has not approved this branch')
    if (!PUBLISHABLE_STATUSES.includes(task.status)) throw new Error('This branch is not ready to publish')
    if (task.prUrl) throw new Error('This branch already has a pull request')
    if (!project.origin) throw new Error('This project has no GitHub origin')
    routerFor(task)
    const head = await checkedHead(task, signal)
    if (head !== task.review.head) throw new Error('The worker branch no longer matches its reviewed commit')
  }

  async function syncPullRequest(task, signal) {
    const url = pullRequestUrl(task.prUrl)
    if (!url) return undefined
    if (task.status === 'merged') return { url, state: 'MERGED', exact: true }
    const cached = pullRequests.get(url)
    if (cached && now() - cached.at < PR_CACHE_MS) return cached.value
    let value = { url, state: 'UNKNOWN', exact: false }
    try {
      const timeout = AbortSignal.timeout(PR_TIMEOUT_MS)
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
      const raw = await gh([
        'pr', 'view', url, '--json', 'state,headRefOid,headRefName,baseRefName,isCrossRepository',
      ], task.projectRoot, combined)
      const view = JSON.parse(raw)
      const exact = view.headRefOid === task.review?.head &&
        view.headRefName === task.worktree?.branch &&
        view.baseRefName === task.baseBranch &&
        view.isCrossRepository === false
      value = { url, state: typeof view.state === 'string' ? view.state : 'UNKNOWN', exact }
      if (exact && view.state === 'MERGED' && task.status !== 'merged') {
        await store.updateTask(task.id, { status: 'merged' })
        value.status = 'merged'
      } else if (exact && view.state === 'CLOSED' && ['publishing', 'awaiting-ci', 'merge-queued'].includes(task.status)) {
        await store.updateTask(task.id, { status: 'delivery-blocked', failure: 'The pull request was closed' })
        value.status = 'delivery-blocked'
      }
    } catch {
      // A missing gh client, offline host, or unreadable pull request leaves the stored state alone.
    }
    pullRequests.set(url, { at: now(), value })
    return value
  }

  async function viewFor(record, project, signal) {
    let task = record
    let pr
    if (task.prUrl) {
      pr = await syncPullRequest(task, signal)
      if (pr?.status) task = { ...task, status: pr.status }
    }
    const branch = task.worktree?.branch
    if (!branch) return { status: task.status, git: undefined }
    const facts = await worktreeFacts(task, signal)
    const approved = task.review?.approved === true
    const reviewed = approved && facts?.head !== undefined && facts.head === task.review.head
    const mergedInPr = pr?.exact === true && pr.state === 'MERGED'
    const merged = mergedInPr || await isMerged(task, facts?.head, signal)
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
        pr: pr ? { url: pr.url, state: pr.state, exact: pr.exact } : undefined,
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

  async function perform(taskId, action, signal) {
    if (typeof taskId !== 'string' || !TASK_ID.test(taskId)) throw new Error('Invalid task ID')
    if (action !== 'merge' && action !== 'publish') throw new Error('Unknown Git action')
    const task = await store.readTask(taskId)
    if (!task) throw new Error('Task not found')
    const project = await resolveOrigin(task.projectRoot, signal, true)
    if (action === 'merge') {
      await assertMergeReady(task, project, signal)
      const result = await merge.handler({ agent: routerFor(task), rawInput: task.id, signal })
      if (result.kind === 'error') throw new Error(result.text)
      const next = await store.readTask(task.id)
      return { taskId: task.id, action, status: next.status, message: result.text }
    }
    await assertPublishReady(task, project, signal)
    await store.updateTask(task.id, { status: 'publishing', failure: undefined })
    try {
      await deliver(ctx, { ...task, status: 'publishing' }, project.origin, signal, changes => store.updateTask(task.id, changes))
    } catch (error) {
      await store.updateTask(task.id, { status: 'delivery-blocked', failure: error.message })
      throw error
    }
    const next = await store.readTask(task.id)
    const url = pullRequestUrl(next.prUrl)
    if (url) pullRequests.delete(url)
    return {
      taskId: task.id, action, status: next.status, prUrl: next.prUrl,
      message: `Published the reviewed commit for ${task.id}.`,
    }
  }

  return { list, perform }
}
