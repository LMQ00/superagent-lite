import assert from 'node:assert/strict'
import test from 'node:test'
import { createBoardHandler } from '../src/board.js'

async function request(handler, method = 'GET') {
  const result = {}
  const response = {
    writeHead(status, headers) { Object.assign(result, { status, headers }); return this },
    end(body) { result.body = body },
  }
  await handler({ method, headers: {} }, response)
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
