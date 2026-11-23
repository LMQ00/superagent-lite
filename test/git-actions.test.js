import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { checksRollup, createGitManager, pullRequestUrl } from '../src/git-actions.js'
import { mergeWorkerBranch } from '../src/merge.js'

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

function memoryStore(initial) {
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
  const store = memoryStore([record])
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
  const store = memoryStore([record])
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
  const view = (await managerFor(memoryStore([record])).list([record], signal)).get(taskId)
  assert.equal(view.git.canMerge, false)
  assert.equal(view.git.mergeReason, 'The project checkout is not on a branch')
})

test('a branch whose head moved after approval is unreviewed and not mergeable', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts, { review: { head: facts.baseCommit, reviewerSessionId: 'reviewer', approved: true } })
  const store = memoryStore([record])
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
  const store = memoryStore([record])
  const view = (await managerFor(store).list([record], signal)).get(taskId)
  assert.equal(view.status, 'unmerged')
  assert.equal((await store.readTask(taskId)).status, 'awaiting-merge')
})

test('an approved review for the same commit is adopted across tasks', async () => {
  const facts = await setupRepo()
  const donor = recordFor(facts, { id: 'a'.repeat(16) })
  const recipient = recordFor(facts, { id: 'b'.repeat(16), status: 'review-required', review: undefined })
  const store = memoryStore([donor, recipient])
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
  const store = memoryStore([record])
  const view = (await managerFor(store).list([record], signal)).get(taskId)
  assert.equal(view.status, 'completed')
  assert.equal(view.git.merged, true)
  assert.equal(view.git.canMerge, false)
  assert.equal(view.git.canDelete, true)
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
  const store = memoryStore([record])
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
    store: memoryStore([record]),
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
  const store = memoryStore([report, failed])
  const manager = managerFor(store)
  const views = await manager.list([report, failed], signal)
  assert.equal(views.get(report.id).status, 'answer')
  assert.equal(views.get(failed.id).status, 'failed')
  assert.equal((await store.readTask(report.id)).status, 'completed')
  assert.equal((await store.readTask(failed.id)).status, 'failed')
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
  const closedView = (await managerFor(memoryStore([closed]), { gh: ghClosed }).list([closed], signal)).get(closed.id)
  assert.equal(closedView.status, 'failed')
  const mergedGh = async () => JSON.stringify({
    state: 'MERGED', headRefOid: facts.workerHead, headRefName: 'sl-feature', baseRefName: 'main',
    isCrossRepository: false, isDraft: false, author: { login: 'dsh' }, comments: 0, reviews: 0,
    statusCheckRollup: [], mergeable: 'MERGEABLE',
  })
  const mergedStore = memoryStore([merged])
  const mergedView = (await managerFor(mergedStore, { gh: mergedGh }).list([merged], signal)).get(merged.id)
  assert.equal(mergedView.status, 'completed')
  assert.equal((await mergedStore.readTask(merged.id)).status, 'merged')
})

test('merge writes the reviewed head into the chosen local branch and returns to the checkout branch', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts)
  const store = memoryStore([record])
  const manager = managerFor(store)
  const result = await manager.perform(taskId, 'merge', { target: 'release' }, signal)
  assert.equal(result.status, 'merged')
  assert.equal(result.target, 'release')
  const releaseHead = await git(['rev-parse', 'refs/heads/release'], facts.repo)
  const mergeBase = await git(['merge-base', '--is-ancestor', facts.workerHead, releaseHead], facts.repo)
  assert.equal(mergeBase, '')
  assert.equal(await git(['symbolic-ref', '--short', 'HEAD'], facts.repo), 'main')
  const stored = await store.readTask(taskId)
  assert.equal(stored.status, 'merged')
  assert.equal(stored.mergeTarget, 'release')
})

test('merge refuses a task that has not finished its worker turn', async () => {
  const facts = await setupRepo()
  for (const status of ['resuming', 'running', 'publishing', 'merging', 'failed', 'delivery-blocked']) {
    const store = memoryStore([recordFor(facts, { status })])
    await assert.rejects(
      managerFor(store).perform(taskId, 'merge', { target: 'release' }, signal),
      /Only a task that finished its worker turn can be merged/,
    )
    assert.equal((await store.readTask(taskId)).status, status)
  }
  await assert.rejects(git(['merge-base', '--is-ancestor', facts.workerHead, 'refs/heads/release'], facts.repo))
})

test('a resumed task whose head did not move keeps its approval and can merge', async () => {
  const facts = await setupRepo()
  const store = memoryStore([recordFor(facts)])
  await store.updateTask(taskId, { status: 'resuming' })
  assert.equal((await store.readTask(taskId)).review.head, facts.workerHead)
  await assert.rejects(
    managerFor(store).perform(taskId, 'merge', { target: 'release' }, signal),
    /Only a task that finished its worker turn can be merged/,
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
  const store = memoryStore([recordFor(facts, { review })])
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

test('merge stops when the task leaves its mergeable state during preparation', async () => {
  const facts = await setupRepo()
  const store = memoryStore([recordFor(facts)])
  const stale = await store.readTask(taskId)
  await store.updateTask(taskId, { status: 'resuming' })
  await assert.rejects(
    mergeWorkerBranch(context(), stale, 'release', signal, store.updateTask),
    /left its mergeable state during merge preparation/,
  )
  assert.equal(await git(['symbolic-ref', '--short', 'HEAD'], facts.repo), 'main')
  await assert.rejects(git(['merge-base', '--is-ancestor', facts.workerHead, 'refs/heads/release'], facts.repo))
})

test('merge refuses an unknown target and a conflicting target', async () => {
  const facts = await setupRepo()
  const store = memoryStore([recordFor(facts)])
  const manager = managerFor(store)
  await assert.rejects(manager.perform(taskId, 'merge', { target: 'missing' }, signal), /was not found/)
  await writeFile(join(facts.repo, 'notes.txt'), 'main change\n')
  await git(['commit', '-am', 'change main'], facts.repo)
  await assert.rejects(manager.perform(taskId, 'merge', { target: 'main' }, signal), /conflict/i)
})

test('deleting the worker branch removes its worktree and keeps the task completed', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts)
  const store = memoryStore([record])
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
  const store = memoryStore([record])
  const manager = managerFor(store)
  const removed = await manager.perform(taskId, 'delete-branch', {}, signal)
  assert.equal(removed.deleted, true)
  await assert.rejects(git(['rev-parse', '--verify', 'refs/heads/sl-feature'], facts.repo))
})

test('deleting a branch before the merge is refused', async () => {
  const facts = await setupRepo()
  const store = memoryStore([recordFor(facts, { status: 'awaiting-merge' })])
  await assert.rejects(managerFor(store).perform(taskId, 'delete-branch', {}, signal), /only after the task is merged/)
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
  const store = memoryStore([first, second])
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
  const store = memoryStore([record])
  const calls = []
  const manager = managerFor(store, {
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
  const store = memoryStore([recordFor(facts)])
  const manager = managerFor(store)
  await assert.rejects(manager.perform(taskId, 'publish', { remote: 'origin' }, signal), /not configured/)
  await git(['remote', 'add', 'origin', 'https://git.example.org/team/project.git'], facts.repo)
  await assert.rejects(manager.perform(taskId, 'publish', { remote: 'origin' }, signal), /not a single GitHub/)
  await git(['remote', 'set-url', 'origin', 'https://github.com/example/project.git'], facts.repo)
  const moved = recordFor(facts, { review: { head: facts.baseCommit, approved: true, reviewerSessionId: 'reviewer' } })
  store.records.set(taskId, moved)
  await assert.rejects(manager.perform(taskId, 'publish', { remote: 'origin' }, signal), /no longer matches its reviewed commit/)
})

test('a panel review records the verdict and moves the task to awaiting-merge', async () => {
  const facts = await setupRepo()
  const record = recordFor(facts, { status: 'review-required', review: undefined })
  const store = memoryStore([record])
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
  const store = memoryStore([rejected])
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
  const store = memoryStore([recordFor(facts)])
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
  const store = memoryStore([recordFor(facts)])
  const detail = await managerFor(store).detail(taskId, signal)
  assert.equal(detail.gh.ok, false)
  assert.match(detail.gh.error, /gh unavailable/)
})

test('the manager refuses unknown actions and report-only tasks', async () => {
  const facts = await setupRepo()
  const store = memoryStore([recordFor(facts, { mode: 'report', worktree: undefined, review: undefined })])
  const manager = managerFor(store)
  await assert.rejects(manager.perform(taskId, 'merge', { target: 'main' }, signal), /Report-only/)
  await assert.rejects(manager.perform(taskId, 'unknown', {}, signal), /Unknown Git action/)
})
