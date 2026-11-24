import assert from 'node:assert/strict'
import test from 'node:test'
import { createBoardHandler, createGitActionHandler } from '../src/board.js'

async function request(handler, method = 'GET', url = '/') {
  const result = {}
  const response = {
    writeHead(status, headers) { Object.assign(result, { status, headers }); return this },
    end(body) { result.body = body },
  }
  await handler({ method, headers: {}, url }, response)
  return result
}

async function post(handler, body, { method = 'POST', headers = { 'content-type': 'application/json' } } = {}) {
  const result = {}
  const request = {
    method, headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    },
  }
  const response = {
    writeHead(status, values) { Object.assign(result, { status, headers: values }); return this },
    end(value) { result.body = value },
  }
  await handler(request, response)
  return result
}

test('board refuses unauthenticated and non-owner readers without reading disk', async () => {
  for (const admission of [{ rejection: 401 }, { peer: { principal: { kind: 'guest' } } }]) {
    const handler = createBoardHandler({ admit: () => admission }, {}, () => assert.fail('must not list records'))
    const result = await request(handler)
    assert.equal(result.status, admission.rejection ?? 403)
    assert.equal(result.headers['cache-control'], 'no-store')
    assert.equal((await request(handler, 'DELETE', `/superagent-lite/tasks?taskId=${'a'.repeat(16)}`)).status,
      admission.rejection ?? 403)
  }
})

test('board lists only its public view fields to the owner and flags unrecovered tasks', async () => {
  const rows = [
    { id: 'a', task: 'private details', mode: 'report', teamId: 'a', status: 'running', workerSessionId: 'w1', land: true, landAuthorizedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', status: 'running', workerSessionId: 'w2' },
  ]
  const handler = createBoardHandler({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, { get: id => id === 'w1' }, () => rows)
  assert.equal((await request(handler, 'POST')).status, 405)
  assert.equal((await request(handler, 'POST')).headers.allow, 'GET, DELETE')
  const result = await request(handler)
  assert.equal(result.status, 200)
  const tasks = JSON.parse(result.body).tasks
  assert.deepEqual(tasks.map(row => [row.id, row.mode, row.status, row.task]),
    [['a', 'report', 'running', undefined], ['b', undefined, 'running', undefined]])
  assert.deepEqual(tasks.map(row => row.unconfirmed), [undefined, true])
  assert.deepEqual(tasks.map(row => row.land), [true, false])
  assert.equal(tasks[0].landAuthorizedAt, '2026-01-01T00:00:00.000Z')
  assert.equal(tasks[1].landAuthorizedAt, undefined)
})

test('board marks a task waiting for a concurrency slot as queued instead of unconfirmed', async () => {
  const rows = [
    { id: 'a', status: 'queued', workerSessionId: 'w1' },
    { id: 'b', status: 'starting', workerSessionId: 'w2' },
  ]
  const handler = createBoardHandler(
    { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
    { get: () => undefined },
    () => rows,
  )
  const tasks = JSON.parse((await request(handler)).body).tasks
  assert.deepEqual(tasks.map(row => [row.status, row.queued, row.unconfirmed]),
    [['running', true, undefined], ['running', undefined, true]])
})

test('board overlays the panel status from the Git branch view', async () => {
  const rows = [
    { id: 'a', status: 'delivery-blocked', workerSessionId: 'w1', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', status: 'running', workerSessionId: 'w2', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]
  const git = {
    async list() {
      return new Map([
        ['a', { status: 'completed', git: { branch: 'sl-a', unmerged: false } }],
        ['b', { status: 'running', git: { branch: 'sl-b', unmerged: true } }],
      ])
    },
  }
  const handler = createBoardHandler({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, { get: () => undefined }, () => rows, git)
  const tasks = JSON.parse((await request(handler)).body).tasks
  assert.equal(tasks[0].status, 'completed')
  assert.deepEqual(tasks[0].git, { branch: 'sl-a', unmerged: false })
  assert.equal(tasks[1].status, 'running')
  assert.equal(tasks[1].unconfirmed, true)
  assert.equal(tasks[1].git.branch, 'sl-b')
})

test('board keeps the failure text and the six panel statuses from the reconciled view', async () => {
  const rows = ['unmerged', 'running', 'unreviewed', 'completed', 'failed', 'answer']
    .map(id => ({ id, status: 'review-required', failure: id === 'failed' ? 'turn failed' : undefined }))
  const git = {
    async list() {
      return new Map(rows.map(row => [row.id, { status: row.id, git: { branch: `sl-${row.id}` } }]))
    },
  }
  const handler = createBoardHandler({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, {}, () => rows, git)
  const tasks = JSON.parse((await request(handler)).body).tasks
  assert.deepEqual(tasks.map(row => row.status), ['unmerged', 'running', 'unreviewed', 'completed', 'failed', 'answer'])
  assert.equal(tasks[4].failure, 'turn failed')
})

test('board keeps listing tasks when the Git branch view is unavailable', async () => {
  const handler = createBoardHandler(
    { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, {},
    () => [
      { id: 'a', status: 'awaiting-merge' },
      { id: 'b', status: 'completed', mode: 'report' },
      { id: 'c', status: 'review-required', review: { head: 'a'.repeat(40), approved: true } },
      { id: 'd', status: 'review-required', mode: 'report', report: { message: '结论' } },
    ],
    { async list() { throw new Error('git unavailable') } },
  )
  const tasks = JSON.parse((await request(handler)).body).tasks
  assert.deepEqual(tasks.map(row => row.status), ['unmerged', 'answer', 'unmerged', 'answer'])
  assert.equal(tasks[0].git, undefined)
})

test('board deletes a settled task for the owner and removes its session link', async () => {
  const taskId = 'a'.repeat(16)
  const removed = []
  const handler = createBoardHandler(
    { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
    { get: () => undefined },
    () => [{ id: taskId, status: 'completed', workerSessionId: 'worker' }],
    undefined,
    async id => { removed.push(id); return true },
  )
  const result = await request(handler, 'DELETE', `/superagent-lite/tasks?taskId=${taskId}`)
  assert.equal(result.status, 200)
  assert.equal(result.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(result.body), { deleted: taskId })
  assert.deepEqual(removed, [taskId])
})

test('board refuses task deletion while the worker or delivery is running', async () => {
  const taskId = 'a'.repeat(16)
  const rows = [
    { id: taskId, status: 'running', workerSessionId: 'worker' },
    { id: 'b'.repeat(16), status: 'merging', workerSessionId: 'other' },
  ]
  const removed = []
  const handler = createBoardHandler(
    { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
    { get: id => id === 'worker' ? { id } : undefined },
    () => rows,
    undefined,
    async id => { removed.push(id); return true },
  )
  const running = await request(handler, 'DELETE', `/superagent-lite/tasks?taskId=${taskId}`)
  assert.equal(running.status, 409)
  assert.match(JSON.parse(running.body).error, /still running/)
  const merging = await request(handler, 'DELETE', `/superagent-lite/tasks?taskId=${'b'.repeat(16)}`)
  assert.equal(merging.status, 409)
  assert.match(JSON.parse(merging.body).error, /merge or publication/)
  assert.deepEqual(removed, [])
})

test('board cancels a queued task through the cancel path instead of deleting it', async () => {
  const taskId = 'a'.repeat(16)
  const calls = []
  const handler = createBoardHandler(
    { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
    { get: () => undefined },
    () => [{ id: taskId, status: 'queued', workerSessionId: 'worker' }],
    undefined,
    async id => { calls.push(['remove', id]); return true },
    async id => { calls.push(['cancel', id]); return true },
  )
  const result = await request(handler, 'DELETE', `/superagent-lite/tasks?taskId=${taskId}`)
  assert.equal(result.status, 200)
  assert.deepEqual(JSON.parse(result.body), { deleted: taskId })
  assert.deepEqual(calls, [['cancel', taskId]])
})

test('board refuses to cancel a task that already left the queue', async () => {
  const taskId = 'a'.repeat(16)
  const handler = createBoardHandler(
    { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
    { get: () => undefined },
    () => [{ id: taskId, status: 'queued', workerSessionId: 'worker' }],
    undefined,
    async () => assert.fail('must not remove a task that started'),
    async () => { throw new Error('The task is no longer queued') },
  )
  const result = await request(handler, 'DELETE', `/superagent-lite/tasks?taskId=${taskId}`)
  assert.equal(result.status, 409)
  assert.deepEqual(JSON.parse(result.body), { error: 'The task is no longer queued' })
})

test('board validates task deletion requests and reports missing records', async () => {
  const taskId = 'a'.repeat(16)
  let called = false
  const handler = createBoardHandler(
    { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
    { get: () => undefined },
    () => [],
    undefined,
    async () => { called = true; return true },
  )
  assert.equal((await request(handler, 'DELETE', '/superagent-lite/tasks')).status, 400)
  assert.equal((await request(handler, 'DELETE', '/superagent-lite/tasks?taskId=not-a-task')).status, 400)
  const missing = await request(handler, 'DELETE', `/superagent-lite/tasks?taskId=${taskId}`)
  assert.equal(missing.status, 404)
  assert.deepEqual(JSON.parse(missing.body), { error: 'Task not found' })
  assert.equal(called, false)
})

test('Git action handler refuses non-owners, wrong methods and non-JSON bodies', async () => {
  const fail = { perform: async () => assert.fail('must not perform') }
  assert.equal((await post(createGitActionHandler({ admit: () => ({ rejection: 401 }) }, fail), {})).status, 401)
  assert.equal((await post(createGitActionHandler({ admit: () => ({ peer: { principal: { kind: 'guest' } } }) }, fail), {})).status, 403)
  const owner = { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }
  assert.equal((await request(createGitActionHandler(owner, fail), 'GET')).status, 400)
  assert.equal((await request(createGitActionHandler(owner, fail), 'PUT')).status, 405)
  assert.equal((await request(createGitActionHandler(owner, fail), 'PUT')).headers.allow, 'GET, POST')
  assert.equal((await request(createGitActionHandler(owner, fail), 'GET', '/superagent-lite/git?taskId=not-a-task')).status, 400)
  assert.equal((await post(createGitActionHandler(owner, fail), {}, { headers: { 'content-type': 'text/plain' } })).status, 415)
  assert.equal((await post(createGitActionHandler(owner, fail), '{')).status, 400)
  assert.equal((await post(createGitActionHandler(owner, fail), { taskId: 'a'.repeat(16), action: 'delete' })).status, 400)
  assert.equal((await post(createGitActionHandler(owner, fail), { taskId: 'not-a-task', action: 'merge', target: 'main' })).status, 400)
  assert.match(JSON.parse((await post(createGitActionHandler(owner, fail), { taskId: 'a'.repeat(16), action: 'merge' })).body).error, /merge target/)
  assert.match(JSON.parse((await post(createGitActionHandler(owner, fail), { taskId: 'a'.repeat(16), action: 'publish' })).body).error, /remote/)
  assert.equal((await post(createGitActionHandler(owner, fail), { taskId: 'a'.repeat(16), action: 'merge', target: 'main', padding: 'x'.repeat(5000) })).status, 413)
})

test('Git action handler returns branch detail to the owner', async () => {
  const owner = { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }
  const taskId = 'a'.repeat(16)
  const asked = []
  const handler = createGitActionHandler(owner, {
    async detail(id) {
      asked.push(id)
      return { taskId: id, commits: [{ hash: 'b'.repeat(40), subject: 'Change' }], files: [{ path: 'src/a.js', additions: 1, deletions: 0 }], branches: [{ name: 'main', current: true }], remotes: [], gh: { ok: false, error: 'not logged in' } }
    },
  })
  const result = await request(handler, 'GET', `/superagent-lite/git?taskId=${taskId}`)
  assert.equal(result.status, 200)
  assert.equal(result.headers['cache-control'], 'no-store')
  assert.deepEqual(asked, [taskId])
  const value = JSON.parse(result.body)
  assert.equal(value.commits[0].subject, 'Change')
  assert.deepEqual(value.branches, [{ name: 'main', current: true }])
  assert.equal(value.gh.ok, false)

  const missing = createGitActionHandler(owner, { async detail() {
    const error = new Error('Task not found')
    error.status = 404
    throw error
  } })
  const notFound = await request(missing, 'GET', `/superagent-lite/git?taskId=${taskId}`)
  assert.equal(notFound.status, 404)
  assert.deepEqual(JSON.parse(notFound.body), { error: 'Task not found' })

  const broken = createGitActionHandler(owner, { async detail() { throw new Error('Could not read the branch history') } })
  const failed = await request(broken, 'GET', `/superagent-lite/git?taskId=${taskId}`)
  assert.equal(failed.status, 409)
  assert.deepEqual(JSON.parse(failed.body), { error: 'Could not read the branch history' })
})

test('Git action handler passes the chosen merge target or PR remote and reports failures', async () => {
  const owner = { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }
  const performed = []
  const handler = createGitActionHandler(owner, {
    async perform(taskId, action, options) {
      performed.push([taskId, action, options])
      return { taskId, action, status: 'merged', message: `Published ${taskId}.` }
    },
  })
  const taskId = 'a'.repeat(16)
  const merge = await post(handler, { taskId, action: 'merge', target: 'release' })
  assert.equal(merge.status, 200)
  assert.deepEqual(JSON.parse(merge.body), { taskId, action: 'merge', status: 'merged', message: `Published ${taskId}.` })
  const publish = await post(handler, { taskId, action: 'publish', remote: 'origin' })
  assert.equal(publish.status, 200)
  const review = await post(handler, { taskId, action: 'review' })
  assert.equal(review.status, 200)
  const removed = await post(handler, { taskId, action: 'delete-branch' })
  assert.equal(removed.status, 200)
  assert.deepEqual(performed.map(([, action]) => action), ['merge', 'publish', 'review', 'delete-branch'])
  assert.deepEqual(performed[0][2], { target: 'release', remote: undefined })
  assert.deepEqual(performed[1][2], { target: undefined, remote: 'origin' })

  const refused = createGitActionHandler(owner, { async perform() { throw new Error('Merge would conflict') } })
  const failure = await post(refused, { taskId, action: 'merge', target: 'main' })
  assert.equal(failure.status, 409)
  assert.deepEqual(JSON.parse(failure.body), { error: 'Merge would conflict' })
})
