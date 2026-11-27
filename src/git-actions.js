import { readTask, updateTask, listTasks } from './task-store.js'
import { runCommand, runProcess } from './process.js'
import { githubRepository, publishGithub, pullRequestUrl } from './github.js'
import { deleteWorkerBranch, deleteWorkerBranchOnly, deleteWorkerWorktreeAndBranch, mergeWorkerBranch, parseWorktrees, removeWorkerWorktree } from './merge.js'
import { setLandingPullRequest, setLandingReview } from './landing.js'
import { assertStillDeliverable, deliverableHead } from './delivery.js'
import { runReview, worktreeHead } from './review.js'
import { panelStatus, reviewIndex, reviewKey } from './status.js'

export { pullRequestUrl }

const TASK_ID = /^[a-f0-9]{16}$/
const PR_CACHE_MS = 30_000
const PR_TIMEOUT_MS = 10_000
const DELIVERY_STATUSES = ['review-required', 'awaiting-merge', 'awaiting-ci', 'merge-queued', 'publishing', 'merging', 'delivery-blocked']
const RUNNING_STATUSES = ['queued', 'starting', 'running', 'resuming', 'publishing', 'merging']
const FAILED_STATUSES = ['failed', 'delivery-blocked', 'merge-conflict', 'interrupted', 'cancelled']
const HEALABLE = ['review-required', 'delivery-blocked', 'failed', 'ready']
const PLUGIN_BRANCH = /^sl-/
const PLUGIN_WORKTREE = '.agents/worktrees/'

const FAILED_CHECKS = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'ERROR', 'STARTUP_FAILURE', 'STALE'])
const PENDING_CHECKS = new Set(['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'EXPECTED', 'REQUESTED'])

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
  const store = dependencies.store ?? { readTask, updateTask, listTasks }
  const git = dependencies.git ?? ((args, cwd, signal) => runCommand(ctx, args, cwd, signal))
  const merge = dependencies.merge ?? ((task, target, signal) => mergeWorkerBranch(ctx, task, target, signal, store.updateTask))
  const removeBranch = dependencies.deleteBranch ?? ((task, signal) => deleteWorkerBranch(ctx, task, signal, store.updateTask))
  const publish = dependencies.publish ?? ((task, origin, signal, record) => publishGithub(ctx, task, origin, signal, record))
  const reviewer = dependencies.review ?? ((agent, task, signal) => runReview(ctx, agent, task, signal))
  const gh = dependencies.gh ?? ((args, cwd, signal) => runProcess(ctx, 'gh', args, cwd, signal))
  const checkedHead = dependencies.checkedHead ?? ((task, signal) => worktreeHead(ctx, task, signal))
  const policy = dependencies.policy
  const now = dependencies.now ?? (() => Date.now())

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

  async function settle(task, changes) {
    if (task.status === changes.status && Object.keys(changes).length === 1) return task
    return store.updateTask(task.id, changes)
  }

  async function syncPullRequest(task, signal) {
    const url = pullRequestUrl(task.prUrl)
    if (!url) return undefined
    const cached = pullRequests.get(url)
    if (cached && now() - cached.at < PR_CACHE_MS) return cached.value
    let value = { url, state: task.prState ?? 'UNKNOWN', exact: false }
    try {
      const timeout = AbortSignal.timeout(PR_TIMEOUT_MS)
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
      const raw = await gh([
        'pr', 'view', url, '--json',
        'state,headRefOid,headRefName,baseRefName,isCrossRepository,isDraft,author,comments,reviews,statusCheckRollup,mergeable',
        '--jq', '{state,headRefOid,headRefName,baseRefName,isCrossRepository,isDraft,author:{login:.author.login},comments:(.comments|length),reviews:([.reviews[]|select((.body // "") | test("[^[:space:]]"))]|length),statusCheckRollup,mergeable}',
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
        mergeable: view.mergeable,
        draft: view.isDraft === true,
        author: typeof view.author?.login === 'string' && view.author.login ? view.author.login : undefined,
        comments: commentCount(view),
        checks: checksRollup(view.statusCheckRollup),
      }
      if (exact && view.state === 'MERGED') {
        const next = await store.updateTask(task.id, latest => latest.status === 'merged'
          ? {}
          : { status: 'merged', prState: 'MERGED' })
        value.status = next.status
      } else if (exact && view.state === 'CLOSED') {
        const next = await store.updateTask(task.id, latest => DELIVERY_STATUSES.includes(latest.status)
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

  async function checkoutFacts(root, signal) {
    try {
      const status = await git(['status', '--porcelain', '--untracked-files=all'], root, signal)
      const branch = await git(['symbolic-ref', '--quiet', '--short', 'HEAD'], root, signal).catch(() => undefined)
      return { clean: !status.split('\n').some(dirtyTargetLine), branch }
    } catch {
      return undefined
    }
  }

  async function remotesFor(root, signal) {
    if (typeof root !== 'string' || !root) return []
    const output = await git(['remote', '-v'], root, signal)
    const byName = new Map()
    for (const line of output.split('\n').filter(Boolean)) {
      const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line)
      if (!match) continue
      const [, name, url, kind] = match
      const entry = byName.get(name) ?? { name }
      if (kind === 'fetch') entry.fetchUrl = url
      else entry.pushUrl = url
      byName.set(name, entry)
    }
    return [...byName.values()].map(entry => {
      const repository = githubRepository(entry.fetchUrl)
      return {
        ...entry,
        ...(repository && repository === githubRepository(entry.pushUrl) ? { repository } : {}),
      }
    })
  }

  async function branchesFor(root, signal) {
    const output = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], root, signal)
    let current
    try {
      current = await git(['symbolic-ref', '--quiet', '--short', 'HEAD'], root, signal)
    } catch {
      current = undefined
    }
    return output.split('\n').filter(Boolean).map(name => ({ name, current: name === current }))
  }

  async function ghStatus(root, signal) {
    try {
      const output = await gh(['auth', 'status', '--hostname', 'github.com'], root, signal)
      const match = output.match(/(?:account|as)\s+([A-Za-z0-9-]+)/)
      return { ok: true, ...(match ? { account: match[1] } : {}) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async function adoptReview(task, signal, records) {
    if (task.review?.approved === true) return task
    let head
    try {
      head = await checkedHead(task, signal)
    } catch {
      return task
    }
    if (task.review?.head === head && task.review?.approved === false) return task
    const candidates = records ?? (store.listTasks ? await store.listTasks() : [task])
    const review = reviewIndex(candidates).get(reviewKey(task.projectRoot, head))
    if (!review) return task
    const next = await store.updateTask(task.id, {
      review: { head: review.head, reviewerSessionId: review.reviewerSessionId, approved: true },
    })
    setLandingReview(task.id, { head: review.head, approved: true })
    return next
  }

  async function viewFor(record, project, signal, reviews) {
    let task = record
    let pr
    if (task.prUrl) {
      pr = await syncPullRequest(task, signal)
      if (pr?.status) task = { ...task, status: pr.status }
    }
    // A report-only task has no review or merge path. Once report_task delivered
    // its conclusion it is complete even if the stored status is stale.
    if (task.mode === 'report' || task.report) {
      if (task.status !== 'completed' && (task.report || DELIVERY_STATUSES.includes(task.status))) {
        task = await settle(task, { status: 'completed', failure: undefined })
      }
      return { status: panelStatus(task), git: undefined }
    }
    const branch = task.worktree?.branch
    if (!branch) {
      // A deleted worker branch leaves nothing to review, merge or publish, so
      // the row settles as completed unless the Task had already failed.
      const status = task.branchDeletedAt && task.mode !== 'report' && !FAILED_STATUSES.includes(task.status)
        ? 'completed' : panelStatus(task)
      return { status, git: undefined }
    }
    const facts = await worktreeFacts(task, signal)
    const head = facts?.head
    const base = task.worktree?.baseCommit ?? task.baseCommit
    const hasCommits = head === undefined ? undefined : head !== base
    let reviewed = task.review?.approved === true && head !== undefined && head === task.review.head
    if (!reviewed && head !== undefined) {
      const adopted = reviews?.get(reviewKey(task.projectRoot, head))
      if (adopted && !(task.review?.head === head && task.review?.approved === false)) {
        task = await store.updateTask(task.id, {
          review: { head: adopted.head, reviewerSessionId: adopted.reviewerSessionId, approved: true },
        })
        setLandingReview(task.id, { head: adopted.head, approved: true })
        reviewed = true
      }
    }
    const mergedInPr = pr?.exact === true && pr.state === 'MERGED'
    // A removed worktree leaves no live HEAD. The recorded reviewed commit is
    // still enough to verify that the branch reached the base branch.
    const mergedHead = head ?? task.review?.head
    const merged = mergedInPr || task.status === 'merged' ||
      (mergedHead !== undefined && mergedHead !== base && await isMerged(task, mergedHead, signal))
    const closed = pr?.exact === true && pr.state === 'CLOSED'
    if (merged && DELIVERY_STATUSES.includes(task.status)) {
      task = await settle(task, { status: 'merged', ...(mergedInPr ? { prState: 'MERGED' } : {}) })
    } else if (!merged && reviewed && !closed && HEALABLE.includes(task.status)) {
      task = await settle(task, { status: 'awaiting-merge', failure: undefined })
    }
    const worker = ctx.agents?.get?.(task.workerSessionId)
    const githubRemotes = project.remotes.filter(remote => remote.repository)
    const canMerge = reviewed && !merged && !closed && hasCommits &&
      project.checkout?.clean === true && typeof project.checkout?.branch === 'string'
    const mergeReason = merged ? 'This branch is already merged'
      : closed ? 'The pull request was closed; reopen it or dispatch a new task'
        : !hasCommits ? 'This worker branch has no commits'
          : !reviewed ? 'The reviewed commit is not the current worker head'
            : !project.checkout ? 'The project checkout could not be read'
              : typeof project.checkout.branch !== 'string' ? 'The project checkout is not on a branch'
                : !project.checkout.clean ? 'The project checkout has uncommitted changes' : undefined
    const canPublish = reviewed && !merged && !closed && hasCommits && githubRemotes.length > 0
    const publishReason = merged ? 'This branch is already merged'
      : closed ? 'The pull request was closed; reopen it or dispatch a new task'
        : !hasCommits ? 'This worker branch has no commits'
          : !reviewed ? 'The reviewed commit is not the current worker head'
            : githubRemotes.length === 0 ? 'This project has no GitHub remote' : undefined
    const canReview = hasCommits && !reviewed && !merged && !closed && Boolean(worker)
    const reviewReason = merged ? 'This task is already merged'
      : !hasCommits ? 'This worker branch has no commits'
        : reviewed ? 'This commit is already reviewed'
          : !worker ? 'The worker Session is not running; open it to review the commit there' : undefined
    const running = RUNNING_STATUSES.includes(task.status)
    const canDelete = !running && !task.branchDeletedAt
    const deleteReason = running ? 'The task is still running; wait for it to finish before deleting the branch' : undefined
    return {
      status: panelStatus(task, { merged, reviewed, hasCommits, closed, branch: true }),
      git: {
        branch,
        baseBranch: task.baseBranch,
        head,
        reviewedHead: task.review?.head,
        approved: task.review?.approved === true,
        reviewed,
        merged,
        unmerged: !merged && Boolean(head),
        uncommitted: facts?.uncommitted ?? false,
        onBranch: facts?.onBranch ?? false,
        author: facts?.author,
        hasCommits,
        pr: pr ? {
          url: pr.url,
          state: pr.state,
          exact: pr.exact,
          mergeable: pr.mergeable,
          draft: pr.draft,
          author: pr.author,
          comments: pr.comments,
          checks: pr.checks,
        } : undefined,
        canMerge,
        mergeReason,
        canPublish,
        publishReason,
        canReview,
        reviewReason,
        canDelete,
        deleteReason,
      },
    }
  }

  async function list(records, signal) {
    const projects = new Map()
    const reviews = reviewIndex(records)
    const entries = await Promise.all(records.map(async record => {
      let project = projects.get(record.projectRoot)
      if (!project) {
        project = record.git === false
          ? Promise.resolve({ remotes: [], checkout: undefined })
          : Promise.all([
            remotesFor(record.projectRoot, signal).catch(() => []),
            checkoutFacts(record.projectRoot, signal),
          ]).then(([remotes, checkout]) => ({ remotes, checkout }))
        projects.set(record.projectRoot, project)
      }
      return [record.id, await viewFor(record, await project, signal, reviews)]
    }))
    return new Map(entries)
  }

  function result(task, action, changes) {
    return { taskId: task.id, action, ...changes }
  }

  async function reviewAction(task, signal) {
    if (task.mode === 'report') throw new Error('Report-only tasks have no review')
    if (task.status === 'merged') throw new Error('This task is already merged')
    if (!task.worktree?.branch) throw new Error('This task has no worker branch')
    const agent = ctx.agents?.get?.(task.workerSessionId)
    if (!agent) throw new Error('The worker Session is not running; open its conversation to review the commit there')
    const verdict = await reviewer(agent, task, signal)
    const next = await store.updateTask(task.id, {
      review: { head: verdict.head, reviewerSessionId: verdict.reviewerSessionId, approved: verdict.approved },
      status: verdict.approved ? 'awaiting-merge' : 'review-required',
      failure: verdict.approved ? undefined : task.failure,
    })
    setLandingReview(task.id, verdict)
    return result(task, 'review', {
      status: next.status,
      approved: verdict.approved,
      findings: verdict.findings,
      head: verdict.head,
      message: verdict.approved
        ? `Review approved ${verdict.head} for ${task.id}.`
        : `Review requested changes for ${verdict.head}: ${verdict.findings.slice(0, 6000)}`,
    })
  }

  async function mergeAction(task, target, signal) {
    if (typeof target !== 'string' || !target) throw new Error('A merge target branch is required')
    requireFullAccess(task)
    const merged = await merge(task, target, signal)
    const message = merged.alreadyMerged
      ? `Task ${task.id} is already merged.`
      : `Merged ${task.id} into ${merged.target}; the project checkout is at ${merged.baseHead}.` +
        (merged.checkoutRestored === false
          ? ` The project checkout is still on ${merged.target}; restore ${task.baseBranch} manually: ${merged.restoreError}`
          : '')
    // The panel updates this row in place instead of reloading the list, so
    // return the same view a fresh read would have produced.
    const record = await store.readTask(task.id).catch(() => undefined)
    const view = record
      ? await list([record], signal).then(views => views.get(task.id), () => undefined)
      : undefined
    return result(task, 'merge', {
      status: 'merged',
      target: merged.target,
      ...(merged.baseHead ? { baseHead: merged.baseHead } : {}),
      ...(typeof record?.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
      ...(view ? { view } : {}),
      message,
    })
  }

  async function publishAction(task, remoteName, signal) {
    if (typeof remoteName !== 'string' || !remoteName) throw new Error('A remote is required to send a pull request')
    requireFullAccess(task)
    const head = await deliverableHead(ctx, task, signal, (task, signal) => checkedHead(task, signal))
    const remotes = await remotesFor(task.projectRoot, signal)
    const remote = remotes.find(candidate => candidate.name === remoteName)
    if (!remote) throw new Error('The selected remote is not configured for this project')
    if (!remote.repository) throw new Error('The selected remote is not a single GitHub fetch/push repository')
    // Publishing is the only delivery that needs GitHub: the account must be
    // authenticated and the remote must name a GitHub repo. Write access is
    // proven by the push, which runs only after the shared checks above.
    const auth = await ghStatus(task.projectRoot, signal)
    if (!auth.ok) throw new Error(`GitHub authentication is required to publish: ${auth.error}`)
    if (task.prUrl) {
      const pr = await syncPullRequest(task, signal)
      if (pr?.exact && pr.state === 'OPEN') {
        return result(task, 'publish', { status: task.status, prUrl: task.prUrl, prState: 'OPEN', message: `A pull request already exists for ${task.id}.` })
      }
      if (pr?.exact && pr.state === 'MERGED') {
        await settle(task, { status: 'merged', prState: 'MERGED' })
        return result(task, 'publish', { status: 'merged', prUrl: task.prUrl, prState: 'MERGED', message: `Task ${task.id} is already merged.` })
      }
      if (pr?.exact && pr.state === 'CLOSED') throw new Error('The pull request was closed; reopen it or dispatch a new task')
    }
    await store.updateTask(task.id, latest => {
      if (latest.status === 'merged') throw new Error('This branch is already merged')
      assertStillDeliverable(latest, head)
      return { status: 'publishing', failure: undefined }
    })
    try {
      const published = await publish(task, { repo: remote.repository, pushUrl: remote.pushUrl }, signal, changes => store.updateTask(task.id, changes))
      const next = await store.readTask(task.id)
      const url = pullRequestUrl(next.prUrl) ?? published.url
      if (url) {
        pullRequests.delete(url)
        setLandingPullRequest(task.id, url)
      }
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

  async function deleteAction(task, signal) {
    requireFullAccess(task)
    const removed = await removeBranch(task, signal)
    // The panel updates this row in place instead of reloading the list, so
    // return the same view a fresh read would have produced.
    const record = await store.readTask(task.id).catch(() => undefined)
    const view = record
      ? await list([record], signal).then(views => views.get(task.id), () => undefined)
      : undefined
    return result(task, 'delete-branch', {
      status: record?.status ?? task.status,
      branch: removed.branch,
      deleted: removed.deleted,
      ...(typeof record?.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
      ...(view ? { view } : {}),
      message: removed.deleted
        ? `Deleted the worker branch ${removed.branch} for ${task.id}.`
        : `Task ${task.id} has no worker branch left to delete.`,
    })
  }

  async function detail(taskId, signal) {
    if (typeof taskId !== 'string' || !TASK_ID.test(taskId)) throw new Error('Invalid task ID')
    const task = await store.readTask(taskId)
    if (!task) {
      const error = new Error('Task not found')
      error.status = 404
      throw error
    }
    if (task.git === false) {
      return {
        taskId,
        branches: [],
        remotes: [],
        gh: { ok: false, error: 'This project is not a git repository' },
        commits: [],
        files: [],
      }
    }
    const [branches, remotes, gh] = await Promise.all([
      branchesFor(task.projectRoot, signal).catch(() => []),
      remotesFor(task.projectRoot, signal).catch(() => []),
      ghStatus(task.projectRoot, signal),
    ])
    const base = task.worktree?.baseCommit ?? task.baseCommit
    let head = task.review?.head
    if (!head && task.worktree?.path) {
      head = await git(['rev-parse', '--verify', 'HEAD^{commit}'], task.worktree.path, signal).catch(() => undefined)
    }
    const common = {
      taskId,
      branch: task.worktree?.branch,
      baseBranch: task.baseBranch,
      branches,
      remotes,
      gh,
    }
    if (!base || !head) return { ...common, commits: [], files: [] }
    const range = `${base}..${head}`
    try {
      const [log, numstat] = await Promise.all([
        git(['log', '--reverse', '--format=%H%x1f%an%x1f%aI%x1f%s', range], task.projectRoot, signal),
        git(['diff', '--numstat', range], task.projectRoot, signal),
      ])
      return { ...common, commits: commitRows(log), files: changedFiles(numstat) }
    } catch (error) {
      throw new Error(`Could not read the branch history: ${error.message}`)
    }
  }

  async function perform(taskId, action, options, signal) {
    if (typeof taskId !== 'string' || !TASK_ID.test(taskId)) throw new Error('Invalid task ID')
    if (!['merge', 'publish', 'review', 'delete-branch'].includes(action)) throw new Error('Unknown Git action')
    return serialize(taskId, async () => {
      let task = await store.readTask(taskId)
      if (!task) throw new Error('Task not found')
      if (task.mode === 'report') throw new Error('Report-only tasks have no Git action')
      if (task.git === false) throw new Error('This project is not a git repository; there is no branch to review, merge, publish, or delete')
      if (action === 'review') return reviewAction(task, signal)
      if (action === 'delete-branch') return deleteAction(task, signal)
      task = await adoptReview(task, signal)
      if (action === 'merge') return mergeAction(task, options?.target, signal)
      return publishAction(task, options?.remote, signal)
    })
  }

  // The branch tab may delete only what this plugin created: Worktrees under
  // .agents/worktrees and sl-* branches. Both are derived from the same Git
  // facts as the task list, but this view never writes a task status.
  async function branches(signal) {
    const records = store.listTasks ? await store.listTasks() : []
    return inventory(records, signal)
  }

  async function inventory(records, signal) {
    const rows = []
    const roots = [...new Set(records
      .filter(record => record.git !== false && typeof record.projectRoot === 'string' && record.projectRoot)
      .map(record => record.projectRoot))]
    for (const root of roots) {
      const [listing, refs] = await Promise.all([
        git(['worktree', 'list', '--porcelain'], root, signal).catch(() => ''),
        git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], root, signal).catch(() => ''),
      ])
      const prefix = `${root.replace(/[\\/]+$/, '')}/${PLUGIN_WORKTREE}`
      const worktrees = parseWorktrees(listing)
        .filter(entry => typeof entry.branch === 'string' && PLUGIN_BRANCH.test(entry.branch) && entry.path.startsWith(prefix))
      const names = new Set(refs.split('\n').filter(name => PLUGIN_BRANCH.test(name)))
      for (const worktree of worktrees) names.add(worktree.branch)
      const scoped = records.filter(record => record.projectRoot === root)
      for (const branch of [...names].sort((left, right) => left.localeCompare(right))) {
        const worktree = worktrees.find(entry => entry.branch === branch)
        const record = scoped.find(candidate => candidate.worktree?.branch === branch)
        const running = record !== undefined && RUNNING_STATUSES.includes(record.status)
        const task = record ? {
          id: record.id,
          title: typeof record.title === 'string' && record.title ? record.title : record.id,
          status: panelStatus({
            status: record.status,
            mode: record.mode,
            report: record.report,
            git: record.git === false ? false : undefined,
          }, { reviewed: record.review?.approved === true }),
          running,
        } : undefined
        rows.push({
          projectRoot: root,
          branch,
          ...(worktree ? { path: worktree.path } : {}),
          ...(task ? { task } : {}),
          canDeleteWorktree: worktree !== undefined && !running,
          ...(worktree
            ? (running ? { worktreeReason: 'The task is still running; stop its worker before deleting the worktree' } : {})
            : { worktreeReason: 'This branch has no worktree to delete' }),
          canDeleteBoth: worktree !== undefined && !running,
          ...(worktree
            ? (running ? { bothReason: 'The task is still running; stop its worker before deleting the worktree and branch' } : {})
            : { bothReason: 'This branch has no worktree to delete' }),
          canDeleteBranch: worktree === undefined && !running,
          ...(running
            ? { branchReason: 'The task is still running; stop its worker before deleting the branch' }
            : worktree ? { branchReason: `Delete the worktree at ${worktree.path} before deleting its branch` } : {}),
        })
      }
    }
    return rows
  }

  async function removeWorktreeEntry(target, signal) {
    const records = store.listTasks ? await store.listTasks() : []
    const rows = await inventory(records, signal)
    const row = rows.find(candidate => candidate.projectRoot === target?.projectRoot &&
      candidate.branch === target?.branch && candidate.path === target?.path)
    if (!row || typeof row.path !== 'string') throw new Error('This Worktree was not created by this plugin')
    if (!row.canDeleteWorktree) throw new Error(row.worktreeReason ?? 'The worktree cannot be deleted')
    const record = row.task ? records.find(candidate => candidate.id === row.task.id) : undefined
    const removed = await removeWorkerWorktree(ctx, {
      projectRoot: row.projectRoot, branch: row.branch, path: row.path, task: record,
    }, signal)
    const next = (await inventory(records, signal))
      .find(candidate => candidate.projectRoot === row.projectRoot && candidate.branch === row.branch)
    return {
      branch: row.branch,
      path: row.path,
      deleted: removed.deleted,
      ...(next ? { row: next } : {}),
      message: removed.deleted
        ? `Deleted the worktree at ${row.path} for ${row.branch}.`
        : `The worktree at ${row.path} no longer existed.`,
    }
  }

  async function removeBranchEntry(target, signal) {
    const records = store.listTasks ? await store.listTasks() : []
    const rows = await inventory(records, signal)
    const row = rows.find(candidate => candidate.projectRoot === target?.projectRoot && candidate.branch === target?.branch)
    if (!row) throw new Error('This branch was not created by this plugin')
    if (!row.canDeleteBranch) throw new Error(row.branchReason ?? 'The branch cannot be deleted')
    const record = row.task ? records.find(candidate => candidate.id === row.task.id) : undefined
    const removed = await deleteWorkerBranchOnly(ctx, {
      projectRoot: row.projectRoot, branch: row.branch, task: record,
    }, signal, store.updateTask)
    return {
      branch: row.branch,
      deleted: removed.deleted,
      message: removed.deleted
        ? `Deleted the worker branch ${row.branch}.`
        : `The worker branch ${row.branch} no longer existed.`,
    }
  }

  async function removeWorktreeAndBranchEntry(target, signal) {
    const records = store.listTasks ? await store.listTasks() : []
    const rows = await inventory(records, signal)
    const row = rows.find(candidate => candidate.projectRoot === target?.projectRoot &&
      candidate.branch === target?.branch && candidate.path === target?.path)
    if (!row || typeof row.path !== 'string') throw new Error('This Worktree was not created by this plugin')
    if (!row.canDeleteBoth) throw new Error(row.bothReason ?? 'The worktree and branch cannot be deleted')
    const record = row.task ? records.find(candidate => candidate.id === row.task.id) : undefined
    const removed = await deleteWorkerWorktreeAndBranch(ctx, {
      projectRoot: row.projectRoot, branch: row.branch, path: row.path, task: record,
    }, signal, store.updateTask)
    return {
      branch: row.branch,
      path: row.path,
      deleted: removed.branchDeleted,
      worktreeDeleted: removed.worktreeDeleted,
      branchDeleted: removed.branchDeleted,
      message: removed.branchDeleted
        ? `Deleted the worktree at ${row.path} and the worker branch ${row.branch}.`
        : `Removed the worktree at ${row.path}; the worker branch ${row.branch} no longer existed.`,
    }
  }

  return { list, detail, perform, branches, removeWorktree: removeWorktreeEntry, removeWorktreeAndBranch: removeWorktreeAndBranchEntry, removeBranch: removeBranchEntry }
}
