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
const FAILED_CHECKS = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'ERROR', 'STARTUP_FAILURE', 'STALE'])
const PENDING_CHECKS = new Set(['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'EXPECTED', 'REQUESTED'])
const PENDING_DELIVERY_STATUSES = ['review-required', 'awaiting-merge', 'awaiting-ci', 'merge-queued', 'publishing', 'merging', 'delivery-blocked']

export function pullRequestUrl(value) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (url.origin === 'https://github.com' && !url.username && !url.password && PR_URL.test(url.href)) return url.href
  } catch {
    return undefined
  }
}

export function checksRollup(value) {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const states = value.map(check => {
    if (typeof check?.state === 'string') return check.state.toUpperCase()
    if (typeof check?.conclusion === 'string') {
      return String(check.status ?? '').toUpperCase() === 'COMPLETED' ? check.conclusion.toUpperCase() : 'PENDING'
    }
    return 'PENDING'
  })
  const state = states.some(value => FAILED_CHECKS.has(value))
    ? 'failure'
    : states.some(value => PENDING_CHECKS.has(value)) ? 'pending' : 'success'
  return { state, total: states.length }
}

function commentCount(view) {
  const comments = Array.isArray(view?.comments) ? view.comments.length
    : Number.isInteger(view?.comments) ? view.comments : undefined
  const reviews = Array.isArray(view?.reviews)
    ? view.reviews.filter(review => typeof review?.body === 'string' && review.body.trim()).length
    : Number.isInteger(view?.reviews) ? view.reviews : undefined
  if (comments === undefined && reviews === undefined) return undefined
  return (comments ?? 0) + (reviews ?? 0)
}

function commitRows(output) {
  return output.split('\n').filter(Boolean).map(line => {
    const [hash, author, date, ...subject] = line.split('\x1f')
    return { hash, author, date, subject: subject.join('\x1f') }
  })
}

function changedFiles(output) {
  return output.split('\n').filter(Boolean).map(line => {
    const [additions, deletions, ...path] = line.split('\t')
    return {
      path: path.join('\t'),
      additions: /^\d+$/.test(additions) ? Number(additions) : undefined,
      deletions: /^\d+$/.test(deletions) ? Number(deletions) : undefined,
    }
  })
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
      const author = await git(['log', '-1', '--format=%an', head], path, signal).catch(() => undefined)
      return { head, uncommitted: status.length > 0, onBranch: current === `refs/heads/${branch}`, author }
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
    const cached = pullRequests.get(url)
    if (cached && now() - cached.at < PR_CACHE_MS) return cached.value
    let value = { url, state: 'UNKNOWN', exact: false }
    try {
      const timeout = AbortSignal.timeout(PR_TIMEOUT_MS)
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
      const raw = await gh([
        'pr', 'view', url, '--json',
        'state,headRefOid,headRefName,baseRefName,isCrossRepository,isDraft,author,comments,reviews,statusCheckRollup',
        '--jq', '{state,headRefOid,headRefName,baseRefName,isCrossRepository,isDraft,author:{login:.author.login},comments:(.comments|length),reviews:([.reviews[]|select((.body // "") | test("[^[:space:]]"))]|length),statusCheckRollup}',
      ], task.projectRoot, combined)
      const view = JSON.parse(raw)
      const exact = view.headRefOid === task.review?.head &&
        view.headRefName === task.worktree?.branch &&
        view.baseRefName === task.baseBranch &&
        view.isCrossRepository === false
      value = {
        url,
        state: typeof view.state === 'string' ? view.state : 'UNKNOWN',
        exact,
        draft: view.isDraft === true,
        author: typeof view.author?.login === 'string' && view.author.login ? view.author.login : undefined,
        comments: commentCount(view),
        checks: checksRollup(view.statusCheckRollup),
      }
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

  async function settle(task, status) {
    if (task.status === status) return task
    return store.updateTask(task.id, { status })
  }

  async function viewFor(record, project, signal) {
    let task = record
    let pr
    if (task.prUrl) {
      pr = await syncPullRequest(task, signal)
      if (pr?.status) task = { ...task, status: pr.status }
    }
    if (task.mode === 'report' && PENDING_DELIVERY_STATUSES.includes(task.status)) {
      task = await settle(task, 'completed')
    }
    const branch = task.worktree?.branch
    if (!branch) return { status: task.status, git: undefined }
    const facts = await worktreeFacts(task, signal)
    const approved = task.review?.approved === true
    const reviewed = approved && facts?.head !== undefined && facts.head === task.review.head
    const mergedInPr = pr?.exact === true && pr.state === 'MERGED'
    // A squash-merged pull request is not an ancestor of the base branch; keep the stored merge state
    // when GitHub cannot be read. Otherwise the row would claim both merged and unmerged at once.
    const merged = mergedInPr || task.status === 'merged' || await isMerged(task, facts?.head ?? task.review?.head, signal)
    if (merged && PENDING_DELIVERY_STATUSES.includes(task.status)) {
      task = await settle(task, 'merged')
    }
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
        author: facts?.author,
        repository: project.origin?.repo,
        pr: pr ? {
          url: pr.url,
          state: pr.state,
          exact: pr.exact,
          draft: pr.draft,
          author: pr.author,
          comments: pr.comments,
          checks: pr.checks,
        } : undefined,
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

  async function detail(taskId, signal) {
    if (typeof taskId !== 'string' || !TASK_ID.test(taskId)) throw new Error('Invalid task ID')
    const task = await store.readTask(taskId)
    if (!task) {
      const error = new Error('Task not found')
      error.status = 404
      throw error
    }
    const base = task.worktree?.baseCommit ?? task.baseCommit
    let head = task.review?.head
    if (!head && task.worktree?.path) {
      head = await git(['rev-parse', '--verify', 'HEAD^{commit}'], task.worktree.path, signal).catch(() => undefined)
    }
    if (!base || !head) return { taskId, branch: task.worktree?.branch, baseBranch: task.baseBranch, commits: [], files: [] }
    const range = `${base}..${head}`
    try {
      const [log, numstat] = await Promise.all([
        git(['log', '--reverse', '--format=%H%x1f%an%x1f%aI%x1f%s', range], task.projectRoot, signal),
        git(['diff', '--numstat', range], task.projectRoot, signal),
      ])
      return {
        taskId,
        branch: task.worktree?.branch,
        baseBranch: task.baseBranch,
        commits: commitRows(log),
        files: changedFiles(numstat),
      }
    } catch (error) {
      throw new Error(`Could not read the branch history: ${error.message}`)
    }
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

  return { list, detail, perform }
}
