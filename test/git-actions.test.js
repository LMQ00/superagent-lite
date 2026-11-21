import assert from 'node:assert/strict'
import test from 'node:test'
import { createGitManager, pullRequestUrl } from '../src/git-actions.js'

const head = 'b'.repeat(40)
const baseTip = 'a'.repeat(40)
const baseHead = 'e'.repeat(40)
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
      const record = records.get(id)
      const next = { ...record, ...(typeof changes === 'function' ? changes(record) : changes) }
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

function gitFixture({ worktreeHead = head, dirty = '', targetDirty = '', merged = false, conflict = false } = {}) {
  const calls = []
  async function git(args, cwd) {
    calls.push({ args, cwd })
    const key = args.join(' ')
    if (cwd === '/wt') {
      if (key === 'rev-parse --verify HEAD^{commit}') return worktreeHead
      if (key === 'status --porcelain --untracked-files=all') return dirty
      if (key === 'symbolic-ref --quiet HEAD') return 'refs/heads/sl-feature'
    }
    if (cwd === '/repo') {
      if (key === 'rev-parse --show-toplevel') return '/repo'
      if (key === 'symbolic-ref --quiet HEAD') return 'refs/heads/main'
      if (key === 'rev-parse --verify refs/heads/main^{commit}') return baseTip
      if (key === 'rev-parse --verify HEAD^{commit}') return baseHead
      if (key === 'status --porcelain --untracked-files=all') return targetDirty
      if (key === 'pull --ff-only origin main') return 'Already up to date.'
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

test('a GitHub project offers both publication and merge for a reviewed branch', async () => {
  const record = task()
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store: memoryStore([record]), git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async () => { throw new Error('gh unavailable') },
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.git.repository, 'example/project')
  assert.equal(view.git.canMerge, true)
  assert.equal(view.git.mergeReason, undefined)
  assert.equal(view.git.canPublish, true)
  assert.equal(view.git.publishReason, undefined)
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

test('the publish action pushes the reviewed commit and records the pull request', async () => {
  const record = task()
  const store = memoryStore([record])
  const delivered = []
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    publish: async (_task, origin, _signal, publish) => {
      delivered.push({ origin, head })
      await publish({ status: 'awaiting-ci', prUrl, prState: 'OPEN' })
      return { url: prUrl, state: 'OPEN', number: '7', adopted: false }
    },
  })
  const result = await manager.perform(taskId, 'publish', signal)
  assert.equal(result.status, 'awaiting-ci')
  assert.equal(result.prUrl, prUrl)
  assert.equal(result.prState, 'OPEN')
  assert.equal(delivered[0].origin.repo, 'example/project')
  assert.equal(delivered[0].head, head)
  assert.equal((await store.readTask(taskId)).status, 'awaiting-ci')
  assert.equal((await store.readTask(taskId)).prUrl, prUrl)
})

test('a failed publication is recorded as delivery-blocked while keeping the PR link', async () => {
  const record = task({ status: 'delivery-blocked' })
  const store = memoryStore([record])
  const { git } = gitFixture()
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    publish: async (_task, _origin, _signal, publish) => {
      await publish({ status: 'awaiting-ci', prUrl, prState: 'OPEN' })
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
      return JSON.stringify({ state: 'MERGED', headRefOid: head, headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false })
    },
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.status, 'merged')
  assert.equal(view.git.merged, true)
  assert.equal(view.git.unmerged, false)
  assert.equal(view.git.pr.state, 'MERGED')
  assert.equal((await store.readTask(taskId)).status, 'merged')
  assert.equal(ghCalls.length, 1)
  assert.deepEqual(ghCalls[0].slice(0, 3), ['pr', 'view', prUrl])
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

test('GitHub delivery works without a running router but a read-only live router blocks it', async () => {
  const record = task()
  const { git } = gitFixture()
  const origin = async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' })
  const withoutRouter = createGitManager(context({ agent: false }), {
    store: memoryStore([record]), git, checkedHead: async () => head, originOf: origin,
    publish: async () => assert.fail('must not publish'),
  })
  let view = (await withoutRouter.list([record], signal)).get(taskId)
  assert.deepEqual([view.git.canMerge, view.git.canPublish], [true, true])
  const readOnly = createGitManager(context({ full: false }), {
    store: memoryStore([record]), git, checkedHead: async () => head, originOf: origin,
    publish: async () => assert.fail('must not publish'),
  })
  view = (await readOnly.list([record], signal)).get(taskId)
  assert.deepEqual([view.git.canMerge, view.git.canPublish], [false, false])
  assert.match(view.git.mergeReason, /file policy/)
  assert.match(view.git.publishReason, /file policy/)
  await assert.rejects(readOnly.perform(taskId, 'publish', signal), /file policy/)
})

test('local merge still requires a running router session', async () => {
  const record = task()
  const manager = createGitManager(context({ agent: false }), {
    store: memoryStore([record]), git: gitFixture().git, checkedHead: async () => head,
    originOf: async () => undefined,
    merge: { handler: async () => assert.fail('merge must not run') },
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.equal(view.git.canMerge, false)
  assert.match(view.git.mergeReason, /router Session is not running/)
  await assert.rejects(manager.perform(taskId, 'merge', signal), /router Session is not running/)
})

test('a stale review-required GitHub task heals to awaiting-merge and lands in one merge action', async () => {
  const record = task({ status: 'review-required' })
  const store = memoryStore([record])
  const { git, calls } = gitFixture()
  const steps = []
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async () => JSON.stringify({ state: 'OPEN', headRefOid: head, headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false }),
    publish: async (_task, _origin, _signal, publish) => {
      steps.push('publish')
      await publish({ status: 'awaiting-ci', prUrl, prState: 'OPEN' })
      return { url: prUrl, state: 'OPEN', number: '7', adopted: false }
    },
    mergeRemote: async (_task, _origin, _signal, publish) => {
      steps.push('merge')
      await publish({ status: 'merged', prUrl, prState: 'MERGED' })
      return { url: prUrl, state: 'MERGED', number: '7' }
    },
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.deepEqual([view.status, view.git.canPublish, view.git.canMerge], ['awaiting-merge', true, true])
  assert.equal((await store.readTask(taskId)).status, 'awaiting-merge')
  const result = await manager.perform(taskId, 'merge', signal)
  assert.deepEqual([result.status, result.prUrl, result.baseHead, ...steps], ['merged', prUrl, baseHead, 'publish', 'merge'])
  assert.ok(calls.some(({ args }) => args.join(' ') === 'pull --ff-only origin main'))
})

test('an existing PR and an already merged task keep repeated actions idempotent', async () => {
  const store = memoryStore([task({ status: 'awaiting-merge', prUrl })])
  const { git, calls } = gitFixture()
  let remoteMerges = 0
  const manager = createGitManager(context(), {
    store, git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async () => JSON.stringify({ state: 'OPEN', headRefOid: head, headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false }),
    publish: async () => assert.fail('must not publish again'),
    mergeRemote: async (_task, _origin, _signal, publish) => {
      ++remoteMerges
      await publish({ status: 'merged', prUrl, prState: 'MERGED' })
      return { url: prUrl, state: 'MERGED', number: '7' }
    },
  })
  assert.match((await manager.perform(taskId, 'publish', signal)).message, /already exists/)
  assert.equal((await store.readTask(taskId)).status, 'awaiting-ci')
  assert.equal((await manager.perform(taskId, 'merge', signal)).status, 'merged')
  const repeated = await manager.perform(taskId, 'merge', signal)
  assert.equal(repeated.status, 'merged')
  assert.match(repeated.message, /already merged/)
  assert.equal(remoteMerges, 1)
  assert.equal(calls.filter(({ args }) => args.join(' ') === 'pull --ff-only origin main').length, 2)
})

test('recovery keeps report tasks and branches with no commits of their own out of delivery states', async () => {
  const untouchedStore = memoryStore([task({ status: 'review-required', review: undefined, baseCommit: baseTip, worktree: { path: '/wt', branch: 'sl-feature', baseCommit: baseTip } })])
  const untouched = createGitManager(context(), {
    store: untouchedStore, git: gitFixture({ worktreeHead: baseTip, merged: true }).git,
    checkedHead: async () => baseTip, originOf: async () => undefined,
  })
  assert.equal((await untouched.list([untouchedStore.records.get(taskId)], signal)).get(taskId).status, 'review-required')

  const reportStore = memoryStore([task({ mode: 'report', status: 'review-required', review: undefined, worktree: undefined })])
  const report = createGitManager(context(), { store: reportStore, originOf: async () => undefined })
  const reportView = (await report.list([reportStore.records.get(taskId)], signal)).get(taskId)
  assert.deepEqual([reportView.status, reportView.git], ['completed', undefined])
  assert.equal((await reportStore.readTask(taskId)).status, 'completed')
})

test('a delivery-blocked task whose PR merged past its reviewed head settles as merged', async () => {
  const record = task({ status: 'delivery-blocked', prUrl, review: { head: 'c'.repeat(40), approved: true } })
  const store = memoryStore([record])
  const manager = createGitManager(context(), {
    store, git: gitFixture({ merged: true }).git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async () => JSON.stringify({ state: 'MERGED', headRefOid: head, headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false }),
  })
  const view = (await manager.list([record], signal)).get(taskId)
  assert.deepEqual([view.status, view.git.merged, view.git.pr.state, view.git.pr.exact], ['merged', true, 'MERGED', false])
  assert.equal((await store.readTask(taskId)).status, 'merged')
})

test('a dirty target or a conflicting PR reports why merge is unavailable', async () => {
  const dirty = createGitManager(context(), {
    store: memoryStore([task()]), git: gitFixture({ targetDirty: ' M file.txt' }).git,
    checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
  })
  let view = (await dirty.list([task()], signal)).get(taskId)
  assert.equal(view.git.canMerge, false)
  assert.match(view.git.mergeReason, /uncommitted changes/)
  await assert.rejects(dirty.perform(taskId, 'merge', signal), /uncommitted changes/)
  const conflict = createGitManager(context(), {
    store: memoryStore([task({ prUrl })]), git: gitFixture().git, checkedHead: async () => head,
    originOf: async () => ({ repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }),
    gh: async () => JSON.stringify({ state: 'OPEN', headRefOid: head, headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false, mergeable: 'CONFLICTING' }),
  })
  view = (await conflict.list([task({ prUrl })], signal)).get(taskId)
  assert.equal(view.git.canMerge, false)
  assert.match(view.git.mergeReason, /merge conflicts/)
})
