import assert from 'node:assert/strict'
import test from 'node:test'
import { checksRollup, createGitManager, pullRequestUrl } from '../src/git-actions.js'

const head = 'b'.repeat(40)
const baseTip = 'a'.repeat(40)
const signal = new AbortController().signal
const taskId = 'abcdef0123456789'
const prUrl = 'https://github.com/example/project/pull/7'

function task(overrides = {}) {
  return {
    id: taskId,
    title: 'Change',
    parentSessionId: 'router',
    projectRoot: '/repo',
    baseBranch: 'main',
    status: 'awaiting-merge',
    worktree: { path: '/wt', branch: 'sl-feature', baseCommit: baseTip },
    review: { head, approved: true },
    ...overrides,
  }
}

function memoryStore(initial) {
  const records = new Map(initial.map(record => [record.id, { ...record }]))
  return {
    records,
    async readTask(id) {
      const record = records.get(id)
      return record && { ...record }
    },
    async updateTask(id, changes) {
      const next = { ...records.get(id), ...changes }
      records.set(id, next)
      return next
    },
  }
}

function context({ full = true, agent = true } = {}) {
  return {
    agents: { get: id => agent && id === 'router' ? { id, session: { id } } : undefined },
    sandboxPolicy: { resolve: () => ({ mode: full ? 'danger-full-access' : 'read-only' }) },
  }
}

function gitFixture({
  worktreeHead = head, dirty = '', targetDirty = '', merged = false, conflict = false,
  commits = '', numstat = '',
} = {}) {
  const calls = []
  async function git(args, cwd) {
    calls.push({ args, cwd })
    const key = args.join(' ')
    if (cwd === '/wt') {
      if (key === 'rev-parse --verify HEAD^{commit}') return worktreeHead
      if (key === 'status --porcelain --untracked-files=all') return dirty
      if (key === 'symbolic-ref --quiet HEAD') return 'refs/heads/sl-feature'
      if (key.startsWith('log -1 --format=%an ')) return 'dsh'
    }
    if (cwd === '/repo') {
      if (key === 'rev-parse --show-toplevel') return '/repo'
      if (key === 'symbolic-ref --quiet HEAD') return 'refs/heads/main'
      if (key === 'rev-parse --verify refs/heads/main^{commit}') return baseTip
      if (key === 'status --porcelain --untracked-files=all') return targetDirty
      if (key.startsWith('log --reverse --format=%H%x1f%an%x1f%aI%x1f%s ')) return commits
      if (key.startsWith('diff --numstat ')) return numstat
      if (key === 'rev-parse --verify --quiet MERGE_HEAD') {
        const error = new Error('missing MERGE_HEAD')
        error.exitCode = 1
        throw error
      }
      if (key.startsWith('merge-tree --write-tree HEAD ')) {
        if (conflict) {
          const error = new Error('conflict')
          error.exitCode = 1
          throw error
        }
        return ''
      }
      if (key.startsWith('merge-base --is-ancestor ')) {
        if (merged) return ''
        const error = new Error('not an ancestor')
        error.exitCode = 1
        throw error
      }
    }
    throw new Error(`unexpected git command: ${cwd} ${key}`)
  }
  return { git, calls }
}

test('pull request URLs are restricted to GitHub pull requests', () => {
  assert.equal(pullRequestUrl(prUrl), prUrl)
  for (const value of [undefined, 'javascript:alert(1)', 'https://github.com.evil.test/example/project/pull/7', 'https://github.com/example/project/issues/7']) {
    assert.equal(pullRequestUrl(value), undefined)
  }
})

test('lists a reviewed worker branch with its unmerged commits and local merge action', async () => {
  const record = task()
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store: memoryStore([record]), git, checkedHead: async () => head,
    originOf: async () => undefined, gh: async () => { throw new Error('gh unavailable') },
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'awaiting-merge')
  assert.equal(view.git.branch, 'sl-feature')
  assert.equal(view.git.baseBranch, 'main')
  assert.equal(view.git.author, 'dsh')
  assert.equal(view.git.approved, true)
  assert.equal(view.git.unmerged, true)
  assert.equal(view.git.merged, false)
  assert.equal(view.git.canMerge, true)
  assert.equal(view.git.canPublish, false)
  assert.match(view.git.publishReason, /no GitHub origin/)
})

test('a moved worker head is no longer mergeable and its review record is stale', async () => {
  const record = task()
  const { git } = gitFixture({ worktreeHead: 'c'.repeat(40) })
  const manager = createGitManager(context(), {
    store: memoryStore([record]), git, checkedHead: async () => 'c'.repeat(40),
    originOf: async () => undefined, gh: async () => { throw new Error('gh unavailable') },
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.git.approved, true)
  assert.equal(view.git.reviewed, false)
  assert.equal(view.git.canMerge, false)
  assert.match(view.git.mergeReason, /no longer matches its reviewed commit/)
})

test('a GitHub project refuses the local merge action and offers publication', async () => {
  const record = task()
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store: memoryStore([record]), git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async () => { throw new Error('gh unavailable') },
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.git.repository, 'example/project')
  assert.equal(view.git.canMerge, false)
  assert.match(view.git.mergeReason, /must merge through a pull request/)
  assert.equal(view.git.canPublish, true)
})

test('the merge action delegates to the existing merge command with the router agent', async () => {
  const record = task()
  const store = memoryStore([record])
  const calls = []
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head, originOf: async () => undefined,
    merge: { async handler(invocation) {
      calls.push(invocation)
      await store.updateTask(taskId, { status: 'merged' })
      return { kind: 'success', text: `Merged ${taskId} into main.` }
    } },
  })
  const result = await manager.perform(taskId, 'merge', signal)
  assert.equal(result.status, 'merged')
  assert.equal(calls[0].agent.id, 'router')
  assert.equal(calls[0].rawInput, taskId)
})

test('the merge action reports command refusals and unpublishable tasks', async () => {
  const store = memoryStore([task({ review: { head, approved: false } })])
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head, originOf: async () => undefined,
    merge: { handler: async () => { throw new Error('must not run') } },
  })
  await assert.rejects(manager.perform(taskId, 'merge', signal), /has not approved/)
  const refused = createGitManager(context(), {
    store: memoryStore([task()]), git, checkedHead: async () => head, originOf: async () => undefined,
    merge: { handler: async () => ({ kind: 'error', text: 'Merge would conflict' }) },
  })
  await assert.rejects(refused.perform(taskId, 'merge', signal), /Merge would conflict/)
})

test('the publish action uses the GitHub delivery path and records its status', async () => {
  const record = task()
  const store = memoryStore([record])
  const delivered = []
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    deliver: async (_ctx, current, origin, _signal, publish) => {
      delivered.push({ origin, head: current.review.head })
      await publish({ status: 'awaiting-ci', prUrl })
      await publish({ status: 'merged' })
    },
  })
  const result = await manager.perform(taskId, 'publish', signal)
  assert.equal(result.status, 'merged')
  assert.equal(result.prUrl, prUrl)
  assert.equal(delivered[0].origin.repo, 'example/project')
  assert.equal(delivered[0].head, head)
  assert.equal((await store.readTask(taskId)).status, 'merged')
})

test('a failed publication is recorded as delivery-blocked while keeping the PR link', async () => {
  const record = task({ status: 'delivery-blocked' })
  const store = memoryStore([record])
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    deliver: async (_ctx, _task, _origin, _signal, publish) => {
      await publish({ status: 'awaiting-ci', prUrl })
      throw new Error('All required CI checks must pass')
    },
  })
  await assert.rejects(manager.perform(taskId, 'publish', signal), /required CI checks/)
  const stored = await store.readTask(taskId)
  assert.equal(stored.status, 'delivery-blocked')
  assert.equal(stored.prUrl, prUrl)
  assert.equal(stored.failure, 'All required CI checks must pass')
})

test('a stale delivery state is reconciled from the real pull request state', async () => {
  const record = task({ status: 'delivery-blocked', prUrl })
  const store = memoryStore([record])
  const { git } = gitFixture({ merged: true })
  const ghCalls = []
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async (args) => {
      ghCalls.push(args)
      return JSON.stringify({
        state: 'MERGED', headRefOid: head, headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false,
        isDraft: false, author: { login: 'octocat' },
        comments: [{ body: 'Looks good' }], reviews: [{ body: 'Approved' }, { body: ' ' }],
        statusCheckRollup: [
          { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { __typename: 'StatusContext', state: 'PENDING' },
        ],
      })
    },
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'merged')
  assert.equal(view.git.merged, true)
  assert.equal(view.git.unmerged, false)
  assert.equal(view.git.pr.state, 'MERGED')
  assert.equal(view.git.pr.draft, false)
  assert.equal(view.git.pr.author, 'octocat')
  assert.equal(view.git.pr.comments, 2)
  assert.deepEqual(view.git.pr.checks, { state: 'pending', total: 2 })
  assert.equal((await store.readTask(taskId)).status, 'merged')
  assert.equal(ghCalls.length, 1)
  assert.deepEqual(ghCalls[0].slice(0, 3), ['pr', 'view', prUrl])
  assert.match(ghCalls[0].join(','), /isDraft,author,comments,reviews,statusCheckRollup/)
  assert.equal(ghCalls[0].at(-2), '--jq')
  assert.match(ghCalls[0].at(-1), /comments:\(\.comments\|length\)/)
})

test('checks rollups summarize check runs and commit statuses', () => {
  assert.equal(checksRollup(undefined), undefined)
  assert.equal(checksRollup([]), undefined)
  assert.deepEqual(checksRollup([
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'StatusContext', state: 'SUCCESS' },
  ]), { state: 'success', total: 2 })
  assert.deepEqual(checksRollup([
    { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: null },
  ]), { state: 'pending', total: 1 })
  assert.deepEqual(checksRollup([
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
  ]), { state: 'failure', total: 2 })
})

test('branch detail returns its commits and changed files', async () => {
  const record = task()
  const store = memoryStore([record])
  const { git, calls } = gitFixture({
    commits: [
      `${'a'.repeat(40)}\x1fdsh\x1f2026-01-01T00:00:00.000Z\x1fAdd the change`,
      `${head}\x1fOcto Cat\x1f2026-01-02T00:00:00.000Z\x1fFix the change`,
    ].join('\n'),
    numstat: '3\t1\tsrc/change.js\n-\t-\tassets/logo.png',
  })
  const manager = createGitManager(context(), { store, git, checkedHead: async () => head, originOf: async () => undefined })
  const value = await manager.detail(taskId, signal)
  assert.equal(value.branch, 'sl-feature')
  assert.equal(value.baseBranch, 'main')
  assert.deepEqual(value.commits, [
    { hash: 'a'.repeat(40), author: 'dsh', date: '2026-01-01T00:00:00.000Z', subject: 'Add the change' },
    { hash: head, author: 'Octo Cat', date: '2026-01-02T00:00:00.000Z', subject: 'Fix the change' },
  ])
  assert.deepEqual(value.files, [
    { path: 'src/change.js', additions: 3, deletions: 1 },
    { path: 'assets/logo.png', additions: undefined, deletions: undefined },
  ])
  assert.ok(calls.some(call => call.args[0] === 'log' && call.args.at(-1) === `${baseTip}..${head}`))
})

test('branch detail rejects unknown tasks and reports history failures', async () => {
  const { git } = gitFixture()
  const manager = createGitManager(context(), { store: memoryStore([]), git, checkedHead: async () => head })
  await assert.rejects(manager.detail(taskId, signal), error => error.status === 404 && /not found/.test(error.message))
  const broken = createGitManager(context(), {
    store: memoryStore([task()]),
    git: async () => { throw new Error('bad object') },
  })
  await assert.rejects(broken.detail(taskId, signal), /Could not read the branch history/)
})

test('a pull request for a different head does not change the stored status', async () => {
  const record = task({ status: 'delivery-blocked', prUrl })
  const store = memoryStore([record])
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async () => JSON.stringify({ state: 'MERGED', headRefOid: 'd'.repeat(40), headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false }),
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'delivery-blocked')
  assert.equal(view.git.merged, false)
  assert.equal(view.git.pr.exact, false)
  assert.equal((await store.readTask(taskId)).status, 'delivery-blocked')
})

test('a closed pull request settles an in-flight task as delivery-blocked', async () => {
  const record = task({ status: 'awaiting-ci', prUrl })
  const store = memoryStore([record])
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async () => JSON.stringify({ state: 'CLOSED', headRefOid: head, headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false }),
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'delivery-blocked')
  assert.equal(view.git.pr.state, 'CLOSED')
})

test('actions require a live router session with full access', async () => {
  const record = task()
  const { git } = gitFixture()
  for (const [ctx, pattern] of [
    [context({ agent: false }), /router Session is not running/],
    [context({ full: false }), /file policy/],
  ]) {
    const manager = createGitManager(ctx, {
      store: memoryStore([record]), git, checkedHead: async () => head, originOf: async () => undefined,
      merge: { handler: async () => assert.fail('merge must not run') },
    })
    const view = (await manager.list([record], signal)).get(taskId)
    assert.equal(view.git.canMerge, false)
    assert.match(view.git.mergeReason, pattern)
    await assert.rejects(manager.perform(taskId, 'merge', signal), pattern)
  }
})

test('merged pull requests keep their author, comment and check indicators', async () => {
  const record = task({ status: 'merged', prUrl })
  const { git } = gitFixture({ merged: true })
  const manager = createGitManager(context(), {
    store: memoryStore([record]), git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async () => JSON.stringify({
      state: 'MERGED', headRefOid: head, headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false,
      isDraft: false, author: { login: 'octocat' }, comments: 0, reviews: 1,
      statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    }),
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'merged')
  assert.equal(view.git.pr.state, 'MERGED')
  assert.equal(view.git.pr.author, 'octocat')
  assert.equal(view.git.pr.comments, 1)
  assert.deepEqual(view.git.pr.checks, { state: 'success', total: 1 })
})
