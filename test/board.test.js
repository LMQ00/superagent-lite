import assert from 'node:assert/strict'
import test from 'node:test'
import { createBoardHandler, createGitActionHandler } from '../src/board.js'

async function request(handler, method = 'GET') {
  const result = {}
  const response = {
    writeHead(status, headers) { Object.assign(result, { status, headers }); return this },
    end(body) { result.body = body },
  }
  await handler({ method, headers: {} }, response)
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
  }
})

test('board lists only its public view fields to the owner and flags unrecovered tasks', async () => {
  const rows = [{ id: 'a', task: 'private details', teamId: 'a', status: 'running', workerSessionId: 'w1' }, { id: 'b', status: 'running', workerSessionId: 'w2' }]
  const handler = createBoardHandler({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, { get: id => id === 'w1' }, () => rows)
  assert.equal((await request(handler, 'POST')).status, 405)
  const result = await request(handler)
  assert.equal(result.status, 200)
  assert.deepEqual(JSON.parse(result.body).tasks.map(row => [row.id, row.status, row.task]), [['a', 'running', undefined], ['b', 'unconfirmed', undefined]])
})

test('board overlays the Git branch view and reconciled status', async () => {
  const rows = [
    { id: 'a', status: 'delivery-blocked', workerSessionId: 'w1', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', status: 'running', workerSessionId: 'w2', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]
  const git = {
    async list() {
      return new Map([
        ['a', { status: 'merged', git: { branch: 'sl-a', unmerged: false } }],
        ['b', { status: 'running', git: { branch: 'sl-b', unmerged: true } }],
      ])
    },
  }
  const handler = createBoardHandler({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, { get: () => undefined }, () => rows, git)
  const tasks = JSON.parse((await request(handler)).body).tasks
  assert.equal(tasks[0].status, 'merged')
  assert.deepEqual(tasks[0].git, { branch: 'sl-a', unmerged: false })
  assert.equal(tasks[1].status, 'unconfirmed')
  assert.equal(tasks[1].git.branch, 'sl-b')
})

test('board shows merged, completed and review-required states from the reconciled Git view', async () => {
  const rows = ['merged', 'completed', 'pending'].map(id => ({ id, status: 'review-required' }))
  const git = {
    async list() {
      return new Map([
        ['merged', { status: 'merged', git: { branch: 'sl-merged' } }],
        ['completed', { status: 'completed', git: undefined }],
        ['pending', { status: 'review-required', git: { branch: 'sl-pending', unmerged: true } }],
      ])
    },
  }
  const handler = createBoardHandler({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, {}, () => rows, git)
  const tasks = JSON.parse((await request(handler)).body).tasks
  assert.deepEqual(tasks.map(row => row.status), ['merged', 'completed', 'review-required'])
})

test('board keeps listing tasks when the Git branch view is unavailable', async () => {
  const handler = createBoardHandler(
    { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, {},
    () => [{ id: 'a', status: 'awaiting-merge' }],
    { async list() { throw new Error('git unavailable') } },
  )
  const tasks = JSON.parse((await request(handler)).body).tasks
  assert.equal(tasks[0].status, 'awaiting-merge')
  assert.equal(tasks[0].git, undefined)
})

test('Git action handler refuses non-owners, wrong methods and non-JSON bodies', async () => {
  const fail = { perform: async () => assert.fail('must not perform') }
  assert.equal((await post(createGitActionHandler({ admit: () => ({ rejection: 401 }) }, fail), {})).status, 401)
  assert.equal((await post(createGitActionHandler({ admit: () => ({ peer: { principal: { kind: 'guest' } } }) }, fail), {})).status, 403)
  const owner = { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }
  assert.equal((await post(createGitActionHandler(owner, fail), {}, { method: 'GET' })).status, 405)
  assert.equal((await post(createGitActionHandler(owner, fail), {}, { headers: { 'content-type': 'text/plain' } })).status, 415)
  assert.equal((await post(createGitActionHandler(owner, fail), '{')).status, 400)
  assert.equal((await post(createGitActionHandler(owner, fail), { taskId: 'a'.repeat(16), action: 'delete' })).status, 400)
  assert.equal((await post(createGitActionHandler(owner, fail), { taskId: 'not-a-task', action: 'merge' })).status, 400)
  assert.equal((await post(createGitActionHandler(owner, fail), { taskId: 'a'.repeat(16), action: 'merge', padding: 'x'.repeat(5000) })).status, 413)
})

test('Git action handler performs the chosen action and reports failures as conflict', async () => {
  const owner = { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }
  const performed = []
  const handler = createGitActionHandler(owner, {
    async perform(taskId, action) {
      performed.push([taskId, action])
      return { taskId, action, status: 'merged', message: `Published ${taskId}.` }
    },
  })
  const taskId = 'a'.repeat(16)
  const result = await post(handler, { taskId, action: 'publish' })
  assert.equal(result.status, 200)
  assert.deepEqual(JSON.parse(result.body), { taskId, action: 'publish', status: 'merged', message: `Published ${taskId}.` })
  assert.deepEqual(performed, [[taskId, 'publish']])

  const refused = createGitActionHandler(owner, { async perform() { throw new Error('Merge would conflict') } })
  const failure = await post(refused, { taskId, action: 'merge' })
  assert.equal(failure.status, 409)
  assert.deepEqual(JSON.parse(failure.body), { error: 'Merge would conflict' })
})
