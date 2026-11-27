import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { checksRollup, createGitManager, pullRequestUrl } from '../src/git-actions.js'
import { deleteWorkerBranch, deleteWorkerWorktreeAndBranch, mergeWorkerBranch } from '../src/merge.js'

const run = promisify(execFile)
const signal = new AbortController().signal
const taskId = 'abcdef0123456789'
const head = 'b'.repeat(40)
const prUrl = 'https://github.com/example/project/pull/7'
const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const roots = []

after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

async function git(args, cwd) {
  const { stdout } = await run('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', '-c', 'commit.gpgsign=false', ...args], { cwd, maxBuffer: 1 << 20 })
  return stdout.trimEnd()
}

async function setupRepo({ remote = true } = {}) {
  const root = await mkdtemp(join(tmp, 'git-actions-'))
  roots.push(root)
  const repo = join(root, 'repo')
  const worktree = join(root, 'worktree')
  await mkdir(repo)
  await git(['init', '-b', 'main'], repo)
  if (remote) await git(['remote', 'add', 'origin', 'https://github.com/example/project.git'], repo)
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  await git(['add', 'notes.txt'], repo)
  await git(['commit', '-m', 'initial'], repo)
  const baseCommit = await git(['rev-parse', 'HEAD'], repo)
  await git(['branch', 'release'], repo)
  await git(['worktree', 'add', '-b', 'sl-feature', worktree, baseCommit], repo)
  await writeFile(join(worktree, 'notes.txt'), 'updated\n')
  await git(['commit', '-am', 'change notes'], worktree)
  const workerHead = await git(['rev-parse', 'HEAD'], worktree)
  return { root, repo, worktree, baseCommit, workerHead }
}

// A project with one plugin Worktree inside .agents/worktrees, one leftover
// plugin branch, and user branches/worktrees that must stay invisible.
async function setupPluginRepo() {
  const root = await mkdtemp(join(tmp, 'git-branches-'))
  roots.push(root)
  const repo = join(root, 'repo')
  const worktree = join(repo, '.agents', 'worktrees', 'sl-feature')
  await mkdir(repo)
  await git(['init', '-b', 'main'], repo)
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  await git(['add', 'notes.txt'], repo)
  await git(['commit', '-m', 'initial'], repo)
  const baseCommit = await git(['rev-parse', 'HEAD'], repo)
  await git(['branch', 'release'], repo)
  await git(['branch', 'sl-orphan', baseCommit], repo)
  await mkdir(join(repo, '.agents', 'worktrees'), { recursive: true })
  await git(['worktree', 'add', '-b', 'sl-feature', worktree, baseCommit], repo)
  await writeFile(join(worktree, 'notes.txt'), 'updated\n')
  await git(['commit', '-am', 'change notes'], worktree)
  const workerHead = await git(['rev-parse', 'HEAD'], worktree)
  const userWorktree = join(root, 'user-worktree')
  await git(['worktree', 'add', '-b', 'feature', userWorktree, baseCommit], repo)
  return { root, repo, worktree, userWorktree, baseCommit, workerHead }
}

function taskStore(initial) {
  const records = new Map(initial.map(record => [record.id, { ...record }]))
  return {
    records,
    async readTask(id) {
      const record = records.get(id)
      return record && { ...record }
    },
    async listTasks() {
      return [...records.values()].map(record => ({ ...record }))
    },
    async updateTask(id, changes) {
      const record = records.get(id)
      const next = { ...record, ...(typeof changes === 'function' ? changes(record) : changes) }
      records.set(id, next)
      return next
    },
  }
}

function recordFor({ repo, worktree, baseCommit, workerHead }, overrides = {}) {
  return {
    id: taskId,
    title: 'Change notes',
    mode: 'change',
    parentSessionId: 'router',
    projectRoot: repo,
    baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker',
    status: 'awaiting-merge',
    review: { head: workerHead, reviewerSessionId: 'reviewer', approved: true },
    worktree: { path: worktree, branch: 'sl-feature', baseCommit, repositoryRoot: repo, sourceBranch: 'main' },
    ...overrides,
  }
}

function context() {
  const worker = { id: 'worker', session: { id: 'worker' } }
  return {
    agents: { get: id => id === 'worker' ? worker : undefined, list: () => [worker] },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    workingDirectory: { get: () => undefined },
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv: [command, ...args], cwd, env }) {
        let stdout = ''
        let stderr = ''
        const done = new Promise(resolve => {
          execFile(command, ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, env, maxBuffer: 1 << 20 }, (error, out, err) => {
            stdout = out ?? ''
            stderr = err ?? ''
            resolve({ exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0 })
          })
        })
        return {
          done,
          collected: {
            stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
            stderr: { readFrom: () => ({ text: stderr }) },
          },
        }
      },
    },
  }
}

function scriptedContext(script) {
  const calls = []
  return {
    calls,
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv }) {
        const args = argv.slice(1)
        let index = 0
        while (args[index] === '-c') index += 2
        const command = args.slice(index)
        calls.push(command)
        const value = script(command)
        return {
          done: Promise.resolve({ exitCode: value.exitCode ?? 0 }),
          collected: {
            stdout: { readFrom: () => ({ text: value.stdout ?? '' }) },
            stderr: { readFrom: () => ({ text: value.stderr ?? '' }) },
          },
        }
      },
    },
  }
}

function managerFor(store, extra = {}) {
  return createGitManager(context(), {
    store,
    git: (args, cwd) => git(args, cwd),
    gh: async () => { throw new Error('gh unavailable') },
    checkedHead: async task => git(['rev-parse', '--verify', 'HEAD^{commit}'], task.worktree.path),
    policy: () => ({ mode: 'danger-full-access' }),
    ...extra,
  })
}

test('pull request URLs are restricted to GitHub pull requests', () => {
  assert.equal(pullRequestUrl(prUrl), prUrl)
  assert.equal(pullRequestUrl(`${prUrl}/`), prUrl)
  for (const value of [undefined, 'javascript:alert(1)', 'https://github.com.evil.test/example/project/pull/7', 'https://github.com/example/project/issues/7', `${prUrl}?x=1`, `${prUrl}#x`]) {
    assert.equal(pullRequestUrl(value), undefined)
  }
})

test('checks rollups summarize check runs and commit statuses', () => {
  assert.equal(checksRollup([]), undefined)
  assert.deepEqual(checksRollup([{ status: 'COMPLETED', conclusion: 'SUCCESS' }]), { state: 'success', total: 1 })
  assert.deepEqual(checksRollup([{ status: 'IN_PROGRESS', conclusion: null }]), { state: 'pending', total: 1 })
  assert.deepEqual(checksRollup([{ state: 'FAILURE' }]), { state: 'failure', total: 1 })
})

test('a reviewed current head is unmerged with merge and publish actions', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts)
  const store = taskStore([record])
  const manager = managerFor(store)
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'unmerged')
  assert.equal(view.git.reviewed, true)
  assert.equal(view.git.merged, false)
  assert.equal(view.git.hasCommits, true)
  assert.equal(view.git.canMerge, true)
  assert.equal(view.git.canPublish, true)
  assert.equal(view.git.canReview, false)
  assert.equal(view.git.mergeReason, undefined)
  assert.equal(view.git.publishReason, undefined)
  assert.equal((await store.readTask(taskId)).status, 'awaiting-merge')
})

test('a dirty project checkout disables merge and explains why', async () => {
  const facts = await setupRepo()
  await writeFile(join(facts.repo, 'dirty.txt'), 'dirty\n')
  const record = recordFor(facts)
  const store = taskStore([record])
  const dirty = (await managerFor(store).list([record], signal)).get(taskId)
  assert.equal(dirty.status, 'unmerged')
  assert.equal(dirty.git.canMerge, false)
  assert.equal(dirty.git.mergeReason, 'The project checkout has uncommitted changes')
  assert.equal(dirty.git.canPublish, true)
  await rm(join(facts.repo, 'dirty.txt'))
  const clean = (await managerFor(store).list([record], signal)).get(taskId)
  assert.equal(clean.git.canMerge, true)
})

test('a detached project checkout disables merge with a clear reason', async () => {
  const facts = await setupRepo()
  await git(['checkout', '--detach'], facts.repo)
  const record = recordFor(facts)
  const view = (await managerFor(taskStore([record])).list([record], signal)).get(taskId)
  assert.equal(view.git.canMerge, false)
  assert.equal(view.git.mergeReason, 'The project checkout is not on a branch')
})

test('a branch whose head moved after approval is unreviewed and not mergeable', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts, { review: { head: facts.baseCommit, reviewerSessionId: 'reviewer', approved: true } })
  const store = taskStore([record])
  const view = (await managerFor(store).list([record], signal)).get(taskId)
  assert.equal(view.status, 'unreviewed')
  assert.equal(view.git.reviewed, false)
  assert.equal(view.git.canMerge, false)
  assert.equal(view.git.mergeReason, 'The reviewed commit is not the current worker head')
  assert.equal(view.git.canReview, true)
})

test('a reviewed branch settles a stale review-required record as awaiting-merge', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts, { status: 'review-required' })
  const store = taskStore([record])
  const view = (await managerFor(store).list([record], signal)).get(taskId)
  assert.equal(view.status, 'unmerged')
  assert.equal((await store.readTask(taskId)).status, 'awaiting-merge')
})

test('an approved review for the same commit is adopted across tasks', async () => {
  const facts = await setupRepo()
  const donor = recordFor(facts, { id: 'a'.repeat(16) })
  const recipient = recordFor(facts, { id: 'b'.repeat(16), status: 'review-required', review: undefined })
  const store = taskStore([donor, recipient])
  const manager = managerFor(store)
  const views = await manager.list([donor, recipient], signal)
  assert.equal(views.get(recipient.id).status, 'unmerged')
  assert.equal(views.get(recipient.id).git.reviewed, true)
  const stored = await store.readTask(recipient.id)
  assert.deepEqual(stored.review, { head: facts.workerHead, reviewerSessionId: 'reviewer', approved: true })
  assert.equal(stored.status, 'awaiting-merge')
})

test('a merged worker branch shows completed and can delete its branch', async () => {
  const facts = await setupRepo()
  await git(['merge', '--no-ff', '--no-edit', 'sl-feature'], facts.repo)
  const record = recordFor(facts, { status: 'review-required' })
  const store = taskStore([record])
  const view = (await managerFor(store).list([record], signal)).get(taskId)
  assert.equal(view.status, 'completed')
  assert.equal(view.git.merged, true)
  assert.equal(view.git.canMerge, false)
  assert.equal(view.git.canDelete, true)
  assert.equal((await store.readTask(taskId)).status, 'merged')
})

test('a merged branch is completed after its worktree and branch are gone', async () => {
  const facts = await setupRepo()
  await git(['merge', '--no-ff', '--no-edit', 'sl-feature'], facts.repo)
  await git(['worktree', 'remove', facts.worktree], facts.repo)
  await git(['branch', '-D', 'sl-feature'], facts.repo)
  const record = recordFor(facts, { status: 'awaiting-merge' })
  const store = taskStore([record])
  const view = (await managerFor(store).list([record], signal)).get(taskId)
  assert.equal(view.status, 'completed')
  assert.equal(view.git.merged, true)
  assert.equal((await store.readTask(taskId)).status, 'merged')
})

test('a completed worker turn without commits is completed, not unreviewed', async () => {
  const root = await mkdtemp(join(tmp, 'git-actions-empty-'))
  roots.push(root)
  const repo = join(root, 'repo')
  await mkdir(repo)
  await git(['init', '-b', 'main'], repo)
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  await git(['add', 'notes.txt'], repo)
  await git(['commit', '-m', 'initial'], repo)
  const baseCommit = await git(['rev-parse', 'HEAD'], repo)
  const record = recordFor({ repo, worktree: repo, baseCommit, workerHead: baseCommit }, {
    status: 'review-required', review: undefined, stopReason: 'completed',
  })
  const store = taskStore([record])
  const view = (await managerFor(store).list([record], signal)).get(taskId)
  assert.equal(view.status, 'completed')
  assert.equal(view.git.hasCommits, false)
  assert.equal(view.git.canReview, false)
})

test('an unreadable worktree does not count as a commit-free completed task', async () => {
  const record = {
    id: taskId, title: 'Change', mode: 'change', parentSessionId: 'router', projectRoot: '/missing', baseCommit: 'a'.repeat(40),
    baseBranch: 'main', workerSessionId: 'worker', status: 'review-required', stopReason: 'completed',
    review: undefined, worktree: { path: '/missing/worktree', branch: 'sl-feature', baseCommit: 'a'.repeat(40) },
  }
  const manager = createGitManager(context(), {
    store: taskStore([record]),
    git: async () => { throw new Error('no checkout') },
    gh: async () => { throw new Error('gh unavailable') },
    policy: () => ({ mode: 'danger-full-access' }),
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'unreviewed')
  assert.equal(view.git.hasCommits, undefined)
})

test('report-only and failed tasks land in answer and failed', async () => {
  const facts = await setupRepo()
  const report = recordFor(facts, { id: 'c'.repeat(16), mode: 'report', status: 'completed', review: undefined, worktree: undefined })
  const failed = recordFor(facts, { id: 'd'.repeat(16), status: 'failed', review: undefined, worktree: undefined })
  const store = taskStore([report, failed])
  const manager = managerFor(store)
  const views = await manager.list([report, failed], signal)
  assert.equal(views.get(report.id).status, 'answer')
  assert.equal(views.get(failed.id).status, 'failed')
  assert.equal((await store.readTask(report.id)).status, 'completed')
  assert.equal((await store.readTask(failed.id)).status, 'failed')
})

test('a delivered report is answer without entering the review or merge path', async () => {
  const facts = await setupRepo()
  const report = recordFor(facts, {
    id: 'c'.repeat(16),
    mode: 'report',
    status: 'review-required',
    report: { message: '结论与证据', at: '2026-11-24T00:00:00.000Z' },
  })
  const store = taskStore([report])
  const view = (await managerFor(store).list([report], signal)).get(report.id)
  assert.equal(view.status, 'answer')
  assert.equal(view.git, undefined)
  assert.equal((await store.readTask(report.id)).status, 'completed')
})

test('a closed pull request is failed and a merged pull request is completed', async () => {
  const facts = await setupRepo()
  const closed = recordFor(facts, { id: 'e'.repeat(16), prUrl, status: 'awaiting-ci' })
  const merged = recordFor(facts, { id: 'f'.repeat(16), prUrl, status: 'awaiting-ci' })
  const ghClosed = async args => {
    assert.equal(args[0], 'pr')
    assert.equal(args[1], 'view')
    return JSON.stringify({
      state: 'CLOSED', headRefOid: facts.workerHead, headRefName: 'sl-feature', baseRefName: 'main',
      isCrossRepository: false, isDraft: false, author: { login: 'dsh' }, comments: 0, reviews: 0,
      statusCheckRollup: [], mergeable: 'MERGEABLE',
    })
  }
  const closedView = (await managerFor(taskStore([closed]), { gh: ghClosed }).list([closed], signal)).get(closed.id)
  assert.equal(closedView.status, 'failed')
  const mergedGh = async () => JSON.stringify({
    state: 'MERGED', headRefOid: facts.workerHead, headRefName: 'sl-feature', baseRefName: 'main',
    isCrossRepository: false, isDraft: false, author: { login: 'dsh' }, comments: 0, reviews: 0,
    statusCheckRollup: [], mergeable: 'MERGEABLE',
  })
  const mergedStore = taskStore([merged])
  const mergedView = (await managerFor(mergedStore, { gh: mergedGh }).list([merged], signal)).get(merged.id)
  assert.equal(mergedView.status, 'completed')
  assert.equal((await mergedStore.readTask(merged.id)).status, 'merged')
})

test('merge writes the reviewed head into the chosen local branch and returns to the checkout branch', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts)
  const store = taskStore([record])
  const manager = managerFor(store)
  const result = await manager.perform(taskId, 'merge', { target: 'release' }, signal)
  assert.equal(result.status, 'merged')
  assert.equal(result.target, 'release')
  assert.equal(result.view.status, 'completed')
  assert.equal(result.view.git.merged, true)
  assert.equal(result.view.git.canMerge, false)
  assert.equal(result.view.git.canDelete, true)
  const releaseHead = await git(['rev-parse', 'refs/heads/release'], facts.repo)
  const mergeBase = await git(['merge-base', '--is-ancestor', facts.workerHead, releaseHead], facts.repo)
  assert.equal(mergeBase, '')
  const parents = (await git(['log', '-1', '--format=%P', releaseHead], facts.repo)).split(' ')
  assert.deepEqual(parents, [facts.baseCommit, facts.workerHead])
  const mergeMessage = await git(['log', '-1', '--format=%B', releaseHead], facts.repo)
  assert.match(mergeMessage, /Merge branch 'sl-feature'/)
  assert.match(mergeMessage, /Change notes/)
  assert.match(mergeMessage, /change notes/)
  assert.equal(await git(['symbolic-ref', '--short', 'HEAD'], facts.repo), 'main')
  const stored = await store.readTask(taskId)
  assert.equal(stored.status, 'merged')
  assert.equal(stored.mergeTarget, 'release')
  assert.equal(result.updatedAt, stored.updatedAt)
})

test('merging a merge worker branch records the delivered commits in history', async () => {
  const facts = await setupRepo()
  await git(['branch', 'sl-delivered', facts.baseCommit], facts.repo)
  await git(['switch', '-q', 'sl-delivered'], facts.repo)
  await writeFile(join(facts.repo, 'delivered.txt'), 'delivered\n')
  await git(['add', 'delivered.txt'], facts.repo)
  await git(['commit', '-m', 'feat: delivered work'], facts.repo)
  const deliveredHead = await git(['rev-parse', 'HEAD'], facts.repo)
  await git(['switch', '-q', 'main'], facts.repo)
  await git(['merge', '--no-ff', '--no-edit', 'sl-delivered'], facts.worktree)
  const mergedHead = await git(['rev-parse', 'HEAD'], facts.worktree)
  const record = recordFor(facts, {
    title: 'Merge delivered branches',
    review: { head: mergedHead, reviewerSessionId: 'reviewer', approved: true },
  })
  const result = await managerFor(taskStore([record])).perform(taskId, 'merge', { target: 'main' }, signal)
  assert.equal(result.status, 'merged')
  const mainHead = await git(['rev-parse', 'refs/heads/main'], facts.repo)
  await git(['merge-base', '--is-ancestor', deliveredHead, mainHead], facts.repo)
  const parents = (await git(['log', '-1', '--format=%P', mainHead], facts.repo)).split(' ')
  assert.deepEqual(parents, [facts.baseCommit, mergedHead])
  const message = await git(['log', '-1', '--format=%B', mainHead], facts.repo)
  assert.match(message, /Merge branch 'sl-feature'/)
  assert.match(message, /Merge delivered branches/)
  assert.match(message, /feat: delivered work/)
})

test('merge refuses a task that has not finished its worker turn', async () => {
  const facts = await setupRepo()
  for (const status of ['resuming', 'running', 'publishing', 'merging', 'failed', 'delivery-blocked']) {
    const store = taskStore([recordFor(facts, { status })])
    await assert.rejects(
      managerFor(store).perform(taskId, 'merge', { target: 'release' }, signal),
      /Only a task that finished its worker turn can be delivered/,
    )
    assert.equal((await store.readTask(taskId)).status, status)
  }
  await assert.rejects(git(['merge-base', '--is-ancestor', facts.workerHead, 'refs/heads/release'], facts.repo))
})

test('a resumed task whose head did not move keeps its approval and can merge', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts)])
  await store.updateTask(taskId, { status: 'resuming' })
  assert.equal((await store.readTask(taskId)).review.head, facts.workerHead)
  await assert.rejects(
    managerFor(store).perform(taskId, 'merge', { target: 'release' }, signal),
    /Only a task that finished its worker turn can be delivered/,
  )
  // The worker turn ends without a new commit, so the saved review still covers HEAD.
  await store.updateTask(taskId, { status: 'awaiting-merge' })
  const result = await managerFor(store).perform(taskId, 'merge', { target: 'release' }, signal)
  assert.equal(result.status, 'merged')
  const stored = await store.readTask(taskId)
  assert.equal(stored.review.head, facts.workerHead)
  assert.equal(await git(['merge-base', '--is-ancestor', facts.workerHead, 'refs/heads/release'], facts.repo), '')
})

test('a resumed task whose head moved keeps its review but cannot merge it', async () => {
  const facts = await setupRepo()
  const review = { head: facts.baseCommit, reviewerSessionId: 'reviewer', approved: true }
  const store = taskStore([recordFor(facts, { review })])
  await store.updateTask(taskId, { status: 'resuming' })
  assert.deepEqual((await store.readTask(taskId)).review, review)
  // A stale settled record must not turn the old approval into a merge of the new HEAD.
  await store.updateTask(taskId, { status: 'awaiting-merge' })
  await assert.rejects(
    managerFor(store).perform(taskId, 'merge', { target: 'release' }, signal),
    /no longer matches its reviewed commit/,
  )
  assert.deepEqual((await store.readTask(taskId)).review, review)
  await assert.rejects(git(['merge-base', '--is-ancestor', facts.workerHead, 'refs/heads/release'], facts.repo))
})

test('merge stops when the task leaves its deliverable state during preparation', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts)])
  const stale = await store.readTask(taskId)
  await store.updateTask(taskId, { status: 'resuming' })
  await assert.rejects(
    mergeWorkerBranch(context(), stale, 'release', signal, store.updateTask),
    /left its deliverable state during preparation/,
  )
  assert.equal(await git(['symbolic-ref', '--short', 'HEAD'], facts.repo), 'main')
  await assert.rejects(git(['merge-base', '--is-ancestor', facts.workerHead, 'refs/heads/release'], facts.repo))
})

test('merge refuses an unknown target and a conflicting target', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts)])
  const manager = managerFor(store)
  await assert.rejects(manager.perform(taskId, 'merge', { target: 'missing' }, signal), /was not found/)
  await writeFile(join(facts.repo, 'notes.txt'), 'main change\n')
  await git(['commit', '-am', 'change main'], facts.repo)
  await assert.rejects(manager.perform(taskId, 'merge', { target: 'main' }, signal), /conflict/i)
})

test('deleting the worker branch removes its worktree and keeps the task completed', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts)
  const store = taskStore([record])
  const manager = managerFor(store)
  await manager.perform(taskId, 'merge', { target: 'release' }, signal)
  const removed = await manager.perform(taskId, 'delete-branch', {}, signal)
  assert.equal(removed.status, 'merged')
  assert.equal(removed.deleted, true)
  await assert.rejects(git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo))
  const stored = await store.readTask(taskId)
  assert.equal(stored.worktree, undefined)
  assert.equal(stored.branchDeletedAt.length > 0, true)
  const view = (await manager.list([stored], signal)).get(taskId)
  assert.equal(view.status, 'completed')
})

test('a branch deleted after a merged Pull request does not need to be an ancestor of the local base', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts, { status: 'merged', prState: 'MERGED' })
  const store = taskStore([record])
  const manager = managerFor(store)
  const removed = await manager.perform(taskId, 'delete-branch', {}, signal)
  assert.equal(removed.deleted, true)
  await assert.rejects(git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo))
})

test('a delivered branch with an open pull request can be deleted', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts, { status: 'awaiting-ci', prUrl })
  const store = taskStore([record])
  const gh = async () => JSON.stringify({
    state: 'OPEN', headRefOid: facts.workerHead, headRefName: 'sl-feature', baseRefName: 'main',
    isCrossRepository: false, isDraft: false, author: { login: 'dsh' }, comments: 0, reviews: 0,
    statusCheckRollup: [], mergeable: 'MERGEABLE',
  })
  const manager = managerFor(store, { gh })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'unmerged')
  assert.equal(view.git.pr.state, 'OPEN')
  assert.equal(view.git.canDelete, true)
  const removed = await manager.perform(taskId, 'delete-branch', {}, signal)
  assert.equal(removed.deleted, true)
  assert.equal(removed.view.status, 'completed')
  await assert.rejects(git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo))
})

test('deleting an unmerged worker branch removes its worktree and settles the row as completed', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts)
  const store = taskStore([record])
  const manager = managerFor(store)
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'unmerged')
  assert.equal(view.git.canDelete, true)
  assert.equal(view.git.deleteReason, undefined)

  const removed = await manager.perform(taskId, 'delete-branch', {}, signal)
  assert.equal(removed.deleted, true)
  assert.equal(removed.status, 'awaiting-merge')
  assert.equal(removed.view.status, 'completed')
  assert.equal(removed.view.git, undefined)
  await assert.rejects(git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo))
  assert.equal((await git(['worktree', 'list', '--porcelain'], facts.repo)).includes(facts.worktree), false)
  const stored = await store.readTask(taskId)
  assert.equal(stored.worktree, undefined)
  assert.equal(stored.branchDeletedAt.length > 0, true)
  assert.equal(stored.status, 'awaiting-merge')
})

test('deleting the branch of a running task is refused with a clear reason', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts, { status: 'running' })])
  const manager = managerFor(store)
  const view = (await manager.list([recordFor(facts, { status: 'running' })], signal)).get(taskId)
  assert.equal(view.status, 'running')
  assert.equal(view.git.canDelete, false)
  assert.equal(view.git.deleteReason, 'The task is still running; wait for it to finish before deleting the branch')
  await assert.rejects(
    manager.perform(taskId, 'delete-branch', {}, signal),
    /still running/,
  )
  assert.equal((await store.readTask(taskId)).worktree.branch, 'sl-feature')
  assert.ok((await git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo)).length > 0)
})

test('deleting a branch whose worktree has uncommitted changes is refused', async () => {
  const facts = await setupRepo()
  await writeFile(join(facts.worktree, 'notes.txt'), 'uncommitted\n')
  const store = taskStore([recordFor(facts)])
  await assert.rejects(
    managerFor(store).perform(taskId, 'delete-branch', {}, signal),
    /worktree has uncommitted changes/,
  )
  assert.equal((await store.readTask(taskId)).worktree.branch, 'sl-feature')
  assert.ok((await git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo)).length > 0)
})

test('deleting a branch checked out by another worktree is refused', async () => {
  const facts = await setupRepo()
  const other = join(facts.root, 'other-holder')
  await git(['worktree', 'add', '-b', 'sl-other', other, facts.baseCommit], facts.repo)
  const record = recordFor(facts, {
    worktree: { path: join(facts.root, 'missing-worktree'), branch: 'sl-other', baseCommit: facts.baseCommit },
  })
  const store = taskStore([record])
  await assert.rejects(
    managerFor(store).perform(taskId, 'delete-branch', {}, signal),
    /still checked out in the worktree at/,
  )
  assert.ok((await git(['rev-parse', '--verify', 'refs/heads/sl-other'], facts.repo)).length > 0)
})

test('deleting a branch refuses a worktree that survives removal', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts)
  const listing = `worktree ${facts.worktree}\nHEAD ${facts.workerHead}\nbranch refs/heads/sl-feature\n`
  const ctx = scriptedContext(command => {
    if (command[0] === 'rev-parse') return { stdout: facts.workerHead }
    if (command[0] === 'worktree' && command[1] === 'list') return { stdout: listing }
    if (command[0] === 'worktree' && command[1] === 'remove') return {}
    if (command[0] === 'status') return { stdout: '' }
    if (command[0] === 'branch') return {}
    throw new Error(`unexpected git ${command.join(' ')}`)
  })
  await assert.rejects(
    deleteWorkerBranch(ctx, record, signal, async () => {}),
    /still exists; remove it before deleting the branch/,
  )
  assert.deepEqual(ctx.calls.slice(0, 4), [
    ['rev-parse', '--verify', '--quiet', 'refs/heads/sl-feature^{commit}'],
    ['worktree', 'list', '--porcelain'],
    ['status', '--porcelain', '--untracked-files=all'],
    ['worktree', 'remove', facts.worktree],
  ])
})

test('a deleted worker branch keeps a failed task failed', async () => {
  const record = {
    id: taskId, title: 'Change', mode: 'change', parentSessionId: 'router', projectRoot: '/missing', baseCommit: 'a'.repeat(40),
    baseBranch: 'main', workerSessionId: 'worker', status: 'interrupted', review: undefined,
    worktree: undefined, branchDeletedAt: '2026-01-01T00:00:00.000Z',
  }
  const view = (await managerFor(taskStore([record])).list([record], signal)).get(taskId)
  assert.equal(view.status, 'failed')
  assert.equal(view.git, undefined)
})

test('merges for one Project root are serialized across tasks and restore the checkout', async () => {
  const facts = await setupRepo()
  const other = join(facts.root, 'worktree2')
  await git(['worktree', 'add', '-b', 'sl-other', other, facts.baseCommit], facts.repo)
  await writeFile(join(other, 'other.txt'), 'other\n')
  await git(['add', 'other.txt'], other)
  await git(['commit', '-m', 'other change'], other)
  const otherHead = await git(['rev-parse', 'HEAD'], other)
  const idA = '1'.repeat(16)
  const idB = '2'.repeat(16)
  const first = recordFor(facts, { id: idA })
  const second = recordFor(facts, {
    id: idB, review: { head: otherHead, reviewerSessionId: 'reviewer', approved: true },
    worktree: { path: other, branch: 'sl-other', baseCommit: facts.baseCommit, repositoryRoot: facts.repo, sourceBranch: 'main' },
  })
  const store = taskStore([first, second])
  let active = 0
  let maxActive = 0
  const base = context()
  base.subprocess = {
    async resolveExecutable(name) { return name },
    spawn(spec) {
      const merging = spec.argv.includes('--no-ff')
      if (merging) {
        active += 1
        maxActive = Math.max(maxActive, active)
      }
      const child = context().subprocess.spawn(spec)
      return {
        ...child,
        done: child.done.then(async outcome => {
          if (merging) {
            await new Promise(resolve => setTimeout(resolve, 60))
            active -= 1
          }
          return outcome
        }),
      }
    },
  }
  const manager = createGitManager(base, {
    store,
    git: (args, cwd) => git(args, cwd),
    gh: async () => { throw new Error('gh unavailable') },
    checkedHead: async task => git(['rev-parse', '--verify', 'HEAD^{commit}'], task.worktree.path),
    policy: () => ({ mode: 'danger-full-access' }),
  })
  const [mergedA, mergedB] = await Promise.all([
    manager.perform(idA, 'merge', { target: 'release' }, signal),
    manager.perform(idB, 'merge', { target: 'main' }, signal),
  ])
  assert.equal(mergedA.target, 'release')
  assert.equal(mergedB.target, 'main')
  assert.equal(maxActive, 1)
  const releaseHead = await git(['rev-parse', 'refs/heads/release'], facts.repo)
  assert.equal(await git(['merge-base', '--is-ancestor', facts.workerHead, releaseHead], facts.repo), '')
  assert.equal(await git(['merge-base', '--is-ancestor', otherHead, 'refs/heads/main'], facts.repo), '')
  await assert.rejects(git(['merge-base', '--is-ancestor', facts.workerHead, 'refs/heads/main'], facts.repo))
  assert.equal(await git(['symbolic-ref', '--short', 'HEAD'], facts.repo), 'main')
  assert.equal((await store.readTask(idA)).mergeTarget, 'release')
  assert.equal((await store.readTask(idB)).mergeTarget, 'main')
})

test('publish pushes to the selected remote and records the pull request', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts)
  const store = taskStore([record])
  const calls = []
  const manager = managerFor(store, {
    gh: async args => {
      if (args[0] !== 'auth') throw new Error('unexpected gh')
      return 'Logged in to github.com account tester'
    },
    publish: async (task, origin, _signal, write) => {
      calls.push(origin)
      await write({ status: 'awaiting-ci', prUrl, prState: 'OPEN' })
      return { url: prUrl, state: 'OPEN', number: '7', adopted: false }
    },
  })
  const result = await manager.perform(taskId, 'publish', { remote: 'origin' }, signal)
  assert.equal(result.status, 'awaiting-ci')
  assert.equal(result.prUrl, prUrl)
  assert.deepEqual(calls, [{ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }])
  const stored = await store.readTask(taskId)
  assert.equal(stored.prUrl, prUrl)
})

test('publish requires a configured GitHub remote and a reviewed head', async () => {
  const facts = await setupRepo({ remote: false })
  const store = taskStore([recordFor(facts)])
  const manager = managerFor(store)
  await assert.rejects(manager.perform(taskId, 'publish', { remote: 'origin' }, signal), /not configured/)
  await git(['remote', 'add', 'origin', 'https://git.example.org/team/project.git'], facts.repo)
  await assert.rejects(manager.perform(taskId, 'publish', { remote: 'origin' }, signal), /not a single GitHub/)
  await git(['remote', 'set-url', 'origin', 'https://github.com/example/project.git'], facts.repo)
  const moved = recordFor(facts, { review: { head: facts.baseCommit, approved: true, reviewerSessionId: 'reviewer' } })
  store.records.set(taskId, moved)
  await assert.rejects(manager.perform(taskId, 'publish', { remote: 'origin' }, signal), /no longer matches its reviewed commit/)
})

test('publish refuses a task that has not finished its worker turn', async () => {
  const facts = await setupRepo()
  for (const status of ['resuming', 'running', 'publishing', 'merging', 'failed', 'delivery-blocked']) {
    let called = false
    const store = taskStore([recordFor(facts, { status })])
    const manager = managerFor(store, { publish: async () => { called = true } })
    await assert.rejects(
      manager.perform(taskId, 'publish', { remote: 'origin' }, signal),
      /Only a task that finished its worker turn can be delivered/,
    )
    assert.equal(called, false)
    assert.equal((await store.readTask(taskId)).status, status)
  }
})

test('publish during a resume cannot reuse the old reviewed head', async () => {
  const facts = await setupRepo()
  const review = { head: facts.baseCommit, reviewerSessionId: 'reviewer', approved: true }
  const store = taskStore([recordFor(facts, { status: 'resuming', review })])
  const manager = managerFor(store, { publish: async () => { throw new Error('publish must not run') } })
  await assert.rejects(
    manager.perform(taskId, 'publish', { remote: 'origin' }, signal),
    /Only a task that finished its worker turn can be delivered/,
  )
  assert.deepEqual((await store.readTask(taskId)).review, review)
})

test('merge and publish reject the same task states and stale reviews', async () => {
  const cases = [
    { status: 'resuming' },
    { status: 'running' },
    { status: 'publishing' },
    { status: 'merging' },
    { status: 'failed' },
    { status: 'delivery-blocked' },
    { status: 'awaiting-merge', review: 'missing' },
    { status: 'awaiting-merge', review: 'unapproved' },
    { status: 'awaiting-merge', review: 'stale' },
  ]
  for (const { status, review } of cases) {
    const facts = await setupRepo()
    const overrides = { status }
    if (review === 'missing') overrides.review = undefined
    if (review === 'unapproved') overrides.review = { head: facts.workerHead, reviewerSessionId: 'reviewer', approved: false }
    if (review === 'stale') overrides.review = { head: facts.baseCommit, reviewerSessionId: 'reviewer', approved: true }
    const store = taskStore([recordFor(facts, overrides)])
    const manager = managerFor(store, { publish: async () => { throw new Error('publish must not run') } })
    const failures = []
    for (const action of ['merge', 'publish']) {
      const failure = await manager.perform(taskId, action, action === 'merge' ? { target: 'release' } : { remote: 'origin' }, signal)
        .then(() => undefined, error => error.message)
      failures.push(failure)
    }
    assert.ok(failures[0], `${status} merge should fail`)
    assert.equal(failures[0], failures[1], `${status} merge and publish should agree`)
    assert.equal((await store.readTask(taskId)).status, status)
  }
})

test('merge and publish accept the same reviewed head while publishing alone checks GitHub', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts)])
  let called = false
  const manager = managerFor(store, {
    gh: async args => {
      if (args[0] !== 'auth') throw new Error('unexpected gh')
      return 'Logged in to github.com account tester'
    },
    publish: async (task, origin, _signal, write) => {
      called = true
      await write({ status: 'awaiting-ci', prUrl, prState: 'OPEN' })
      return { url: prUrl, state: 'OPEN', number: '7', adopted: false }
    },
  })
  const published = await manager.perform(taskId, 'publish', { remote: 'origin' }, signal)
  assert.equal(published.status, 'awaiting-ci')
  assert.equal(called, true)
  const merged = await manager.perform(taskId, 'merge', { target: 'release' }, signal)
  assert.equal(merged.status, 'merged')
})

test('publishing alone requires GitHub authentication', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts)])
  let called = false
  const manager = managerFor(store, {
    gh: async () => { throw new Error('gh is not logged in') },
    publish: async () => { called = true; throw new Error('publish must not run') },
  })
  await assert.rejects(
    manager.perform(taskId, 'publish', { remote: 'origin' }, signal),
    /GitHub authentication is required to publish/,
  )
  assert.equal(called, false)
  assert.equal((await store.readTask(taskId)).status, 'awaiting-merge')
  const merged = await manager.perform(taskId, 'merge', { target: 'release' }, signal)
  assert.equal(merged.status, 'merged')
})

test('publish stops when the task leaves its deliverable state during preparation', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts)])
  let called = false
  const manager = managerFor(store, {
    gh: async args => {
      if (args[0] !== 'auth') throw new Error('unexpected gh')
      await store.updateTask(taskId, { status: 'resuming' })
      return 'Logged in to github.com account tester'
    },
    publish: async () => { called = true; throw new Error('publish must not run') },
  })
  await assert.rejects(
    manager.perform(taskId, 'publish', { remote: 'origin' }, signal),
    /left its deliverable state during preparation/,
  )
  assert.equal(called, false)
  assert.equal((await store.readTask(taskId)).status, 'resuming')
})

test('a panel review records the verdict and moves the task to awaiting-merge', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts, { status: 'review-required', review: undefined })
  const store = taskStore([record])
  const manager = managerFor(store, {
    review: async (agent, task) => {
      assert.equal(agent.id, 'worker')
      assert.equal(task.id, taskId)
      return { head: facts.workerHead, approved: true, findings: '通过', reviewerSessionId: 'reviewer-2' }
    },
  })
  const result = await manager.perform(taskId, 'review', {}, signal)
  assert.equal(result.approved, true)
  assert.equal(result.status, 'awaiting-merge')
  const stored = await store.readTask(taskId)
  assert.deepEqual(stored.review, { head: facts.workerHead, reviewerSessionId: 'reviewer-2', approved: true })
  assert.equal(stored.status, 'awaiting-merge')
})

test('a panel review needs the worker Session and records requested changes', async () => {
  const facts = await setupRepo()
  const rejected = recordFor(facts, { status: 'review-required', review: undefined })
  const store = taskStore([rejected])
  const manager = managerFor(store, {
    review: async () => ({ head: facts.workerHead, approved: false, findings: 'Add a test', reviewerSessionId: 'reviewer-3' }),
  })
  const result = await manager.perform(taskId, 'review', {}, signal)
  assert.equal(result.status, 'review-required')
  assert.match(result.message, /Add a test/)
  const noAgent = createGitManager({ ...context(), agents: { get: () => undefined } }, {
    store,
    git: (args, cwd) => git(args, cwd),
    policy: () => ({ mode: 'danger-full-access' }),
  })
  await assert.rejects(noAgent.perform(taskId, 'review', {}, signal), /worker Session is not running/)
})

test('detail lists local branches, GitHub remotes and the gh account', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts)])
  const manager = managerFor(store, {
    gh: async args => {
      assert.deepEqual(args, ['auth', 'status', '--hostname', 'github.com'])
      return 'Logged in to github.com account octocat (keyring)'
    },
  })
  const detail = await manager.detail(taskId, signal)
  assert.deepEqual(detail.branches.map(branch => branch.name).sort(), ['main', 'release', 'sl-feature'])
  assert.deepEqual(detail.remotes, [{
    name: 'origin',
    fetchUrl: 'https://github.com/example/project.git',
    pushUrl: 'https://github.com/example/project.git',
    repository: 'example/project',
  }])
  assert.deepEqual(detail.gh, { ok: true, account: 'octocat' })
  assert.equal(detail.commits.length, 1)
  assert.equal(detail.commits[0].subject, 'change notes')
})

test('detail reports a missing gh account instead of failing', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts)])
  const detail = await managerFor(store).detail(taskId, signal)
  assert.equal(detail.gh.ok, false)
  assert.match(detail.gh.error, /gh unavailable/)
})

test('the manager refuses unknown actions and report-only tasks', async () => {
  const facts = await setupRepo()
  const store = taskStore([recordFor(facts, { mode: 'report', worktree: undefined, review: undefined })])
  const manager = managerFor(store)
  await assert.rejects(manager.perform(taskId, 'merge', { target: 'main' }, signal), /Report-only/)
  await assert.rejects(manager.perform(taskId, 'unknown', {}, signal), /Unknown Git action/)
})

function pluginRecordFor(facts, overrides = {}) {
  return recordFor({
    repo: facts.repo,
    worktree: facts.worktree,
    baseCommit: facts.baseCommit,
    workerHead: facts.workerHead,
  }, overrides)
}

test('the branch inventory lists only plugin Worktrees and sl-* branches with their task', async () => {
  const facts = await setupPluginRepo()
  const record = pluginRecordFor(facts)
  const rows = await managerFor(taskStore([record])).branches(signal)
  assert.deepEqual(rows.map(row => [row.branch, row.path ?? null, row.task?.id ?? null]), [
    ['sl-feature', facts.worktree, taskId],
    ['sl-orphan', null, null],
  ])
  assert.equal(rows[0].task.status, 'unmerged')
  assert.equal(rows[0].task.running, false)
  assert.equal(rows[0].canDeleteWorktree, true)
  assert.equal(rows[0].canDeleteBoth, true)
  assert.equal(rows[0].canDeleteBranch, false)
  assert.match(rows[0].branchReason, /Delete the worktree/)
  assert.equal(rows[1].canDeleteWorktree, false)
  assert.equal(rows[1].canDeleteBoth, false)
  assert.equal(rows[1].canDeleteBranch, true)
  assert.equal(rows[1].worktreeReason, 'This branch has no worktree to delete')
  assert.equal(rows[1].bothReason, 'This branch has no worktree to delete')
  for (const hidden of ['main', 'release', 'feature']) {
    assert.equal(rows.some(row => row.branch === hidden), false, hidden)
  }
  assert.equal(rows.some(row => row.path === facts.userWorktree), false)
})

test('a running task blocks deleting its Worktree and its branch', async () => {
  const facts = await setupPluginRepo()
  const store = taskStore([pluginRecordFor(facts, { status: 'running' })])
  const manager = managerFor(store)
  const rows = await manager.branches(signal)
  assert.equal(rows[0].task.status, 'running')
  assert.equal(rows[0].task.running, true)
  assert.equal(rows[0].canDeleteWorktree, false)
  assert.equal(rows[0].canDeleteBoth, false)
  assert.equal(rows[0].canDeleteBranch, false)
  assert.match(rows[0].worktreeReason, /still running/)
  assert.match(rows[0].bothReason, /still running/)
  assert.match(rows[0].branchReason, /still running/)
  await assert.rejects(
    manager.removeWorktree({ projectRoot: facts.repo, branch: 'sl-feature', path: facts.worktree }, signal),
    /still running/,
  )
  await assert.rejects(
    manager.removeWorktreeAndBranch({ projectRoot: facts.repo, branch: 'sl-feature', path: facts.worktree }, signal),
    /still running/,
  )
  await assert.rejects(
    manager.removeBranch({ projectRoot: facts.repo, branch: 'sl-feature' }, signal),
    /still running/,
  )
})

test('a plugin Worktree and its branch are deleted through separate actions', async () => {
  const facts = await setupPluginRepo()
  const store = taskStore([pluginRecordFor(facts)])
  const manager = managerFor(store)
  const removedWorktree = await manager.removeWorktree({
    projectRoot: facts.repo, branch: 'sl-feature', path: facts.worktree,
  }, signal)
  assert.equal(removedWorktree.deleted, true)
  assert.equal(removedWorktree.row.path, undefined)
  assert.equal(removedWorktree.row.canDeleteBranch, true)
  assert.equal((await git(['worktree', 'list', '--porcelain'], facts.repo)).includes(facts.worktree), false)
  assert.ok((await git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo)).length > 0)
  const removedBranch = await manager.removeBranch({ projectRoot: facts.repo, branch: 'sl-feature' }, signal)
  assert.equal(removedBranch.deleted, true)
  const stored = await store.readTask(taskId)
  assert.equal(stored.worktree, undefined)
  assert.equal(typeof stored.branchDeletedAt, 'string')
  await assert.rejects(git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo))
})

test('a plugin Worktree and its branch are deleted in one step', async () => {
  const facts = await setupPluginRepo()
  const store = taskStore([pluginRecordFor(facts)])
  const manager = managerFor(store)
  const removed = await manager.removeWorktreeAndBranch({
    projectRoot: facts.repo, branch: 'sl-feature', path: facts.worktree,
  }, signal)
  assert.equal(removed.worktreeDeleted, true)
  assert.equal(removed.branchDeleted, true)
  assert.equal(removed.deleted, true)
  assert.equal((await git(['worktree', 'list', '--porcelain'], facts.repo)).includes(facts.worktree), false)
  await assert.rejects(git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo))
  const stored = await store.readTask(taskId)
  assert.equal(stored.worktree, undefined)
  assert.equal(typeof stored.branchDeletedAt, 'string')
})

test('the one-step delete works for an orphan plugin Worktree without a task record', async () => {
  const facts = await setupPluginRepo()
  const orphan = join(facts.repo, '.agents', 'worktrees', 'sl-extra')
  await git(['worktree', 'add', '-b', 'sl-extra', orphan, facts.baseCommit], facts.repo)
  const store = taskStore([pluginRecordFor(facts)])
  const manager = managerFor(store)
  const row = (await manager.branches(signal)).find(candidate => candidate.branch === 'sl-extra')
  assert.ok(row)
  assert.equal(row.task, undefined)
  assert.equal(row.canDeleteBoth, true)
  const removed = await manager.removeWorktreeAndBranch({
    projectRoot: facts.repo, branch: 'sl-extra', path: orphan,
  }, signal)
  assert.equal(removed.worktreeDeleted, true)
  assert.equal(removed.branchDeleted, true)
  assert.equal((await git(['worktree', 'list', '--porcelain'], facts.repo)).includes(orphan), false)
  await assert.rejects(git(['rev-parse', '--verify', 'refs/heads/sl-extra'], facts.repo))
  assert.equal((await store.readTask(taskId)).branchDeletedAt, undefined)
})

test('the one-step delete refuses a dirty Worktree with the existing wording and keeps the branch', async () => {
  const facts = await setupPluginRepo()
  await writeFile(join(facts.worktree, 'dirty.txt'), 'dirty\n')
  const manager = managerFor(taskStore([pluginRecordFor(facts)]))
  await assert.rejects(
    manager.removeWorktreeAndBranch({ projectRoot: facts.repo, branch: 'sl-feature', path: facts.worktree }, signal),
    /The worker worktree has uncommitted changes; commit or remove them before deleting the branch/,
  )
  assert.ok((await git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo)).length > 0)
  assert.equal((await git(['worktree', 'list', '--porcelain'], facts.repo)).includes(facts.worktree), true)
})

test('the one-step delete reports a branch still held elsewhere after removing the worktree', async () => {
  const facts = await setupPluginRepo()
  const holder = join(facts.root, 'holder')
  await git(['worktree', 'add', '--force', holder, 'sl-feature'], facts.repo)
  const manager = managerFor(taskStore([pluginRecordFor(facts)]))
  await assert.rejects(
    manager.removeWorktreeAndBranch({ projectRoot: facts.repo, branch: 'sl-feature', path: facts.worktree }, signal),
    /The worktree at .* was removed, but the worker branch sl-feature is still checked out in the worktree at .*holder; remove it before deleting the branch/,
  )
  assert.ok((await git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo)).length > 0)
  assert.equal((await git(['worktree', 'list', '--porcelain'], facts.repo)).includes(facts.worktree), false)
})

test('a failed branch delete after removing the worktree reports the leftover branch', async () => {
  const path = '/repo/.agents/worktrees/sl-feature'
  const first = `worktree /repo\nHEAD ${'a'.repeat(40)}\nbranch refs/heads/main\n\nworktree ${path}\nHEAD ${'b'.repeat(40)}\nbranch refs/heads/sl-feature\n`
  const remaining = `worktree /repo\nHEAD ${'a'.repeat(40)}\nbranch refs/heads/main\n`
  let listed = 0
  const updates = []
  const ctx = scriptedContext(command => {
    const key = command.join(' ')
    if (key === 'worktree list --porcelain') {
      listed += 1
      return { stdout: listed === 1 ? first : remaining }
    }
    if (key === `worktree remove ${path}`) return {}
    if (key.startsWith('status --porcelain')) return {}
    if (key.startsWith('rev-parse --verify --quiet refs/heads/sl-feature')) return { stdout: 'b'.repeat(40) }
    if (key === 'branch -D sl-feature') return { exitCode: 1, stderr: 'error: cannot lock ref' }
    return {}
  })
  await assert.rejects(
    deleteWorkerWorktreeAndBranch(ctx, { projectRoot: '/repo', branch: 'sl-feature', path }, signal,
      async () => { updates.push(1) }),
    /The worktree at \/repo\/\.agents\/worktrees\/sl-feature was removed, but the worker branch sl-feature could not be deleted and still exists: git -c exited with status 1: error: cannot lock ref/,
  )
  assert.equal(updates.length, 0)
})

test('the branch inventory refuses user branches, master and user worktrees', async () => {
  const facts = await setupPluginRepo()
  const manager = managerFor(taskStore([pluginRecordFor(facts)]))
  for (const branch of ['main', 'release', 'feature']) {
    await assert.rejects(
      manager.removeBranch({ projectRoot: facts.repo, branch }, signal),
      /not created by this plugin/,
    )
  }
  await assert.rejects(
    manager.removeWorktree({ projectRoot: facts.repo, branch: 'feature', path: facts.userWorktree }, signal),
    /not created by this plugin/,
  )
  await assert.rejects(
    manager.removeWorktreeAndBranch({ projectRoot: facts.repo, branch: 'feature', path: facts.userWorktree }, signal),
    /not created by this plugin/,
  )
  await assert.rejects(
    manager.removeBranch({ projectRoot: facts.repo, branch: 'sl-feature' }, signal),
    /Delete the worktree/,
  )
  await assert.rejects(
    manager.removeWorktree({ projectRoot: facts.repo, branch: 'sl-orphan', path: facts.worktree }, signal),
    /not created by this plugin/,
  )
  assert.ok((await git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo)).length > 0)
  assert.ok((await git(['rev-parse', '--verify', 'refs/heads/feature'], facts.repo)).length > 0)
})

test('deleting a dirty plugin Worktree is refused and keeps its branch', async () => {
  const facts = await setupPluginRepo()
  await writeFile(join(facts.worktree, 'dirty.txt'), 'dirty\n')
  const manager = managerFor(taskStore([pluginRecordFor(facts)]))
  await assert.rejects(
    manager.removeWorktree({ projectRoot: facts.repo, branch: 'sl-feature', path: facts.worktree }, signal),
    /uncommitted changes/,
  )
  assert.ok((await git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo)).length > 0)
  assert.equal((await git(['worktree', 'list', '--porcelain'], facts.repo)).includes(facts.worktree), true)
})

test('a plugin branch without a matching task record can still be deleted', async () => {
  const facts = await setupPluginRepo()
  const store = taskStore([pluginRecordFor(facts, { id: 'f'.repeat(16), worktree: undefined, review: undefined })])
  const manager = managerFor(store)
  const rows = await manager.branches(signal)
  assert.deepEqual(rows.map(row => row.branch), ['sl-feature', 'sl-orphan'])
  assert.equal(rows.every(row => row.task === undefined), true)
  const removed = await manager.removeBranch({ projectRoot: facts.repo, branch: 'sl-orphan' }, signal)
  assert.equal(removed.deleted, true)
  await assert.rejects(git(['rev-parse', '--verify', 'refs/heads/sl-orphan'], facts.repo))
})
