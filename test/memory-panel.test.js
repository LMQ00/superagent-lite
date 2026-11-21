import assert from 'node:assert/strict'
import test from 'node:test'
import { createMemoryPanelHandler } from '../src/memory-panel.js'

const owner = { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }
const record = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  category: 'public', content: 'Saved fact', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

async function request(handler, method = 'GET', url = '/') {
  const result = {}
  const response = {
    writeHead(status, headers) { Object.assign(result, { status, headers }); return this },
    end(body) { result.body = body },
  }
  await handler({ method, headers: {}, url }, response)
  return result
}

async function post(handler, body, headers = { 'content-type': 'application/json' }) {
  const result = {}
  const incoming = {
    method: 'POST', headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    },
  }
  const response = {
    writeHead(status, values) { Object.assign(result, { status, headers: values }); return this },
    end(value) { result.body = value },
  }
  await handler(incoming, response)
  return result
}

test('memory panel refuses non-owners and non-GET/POST methods without touching the store', async () => {
  const panel = { list: () => assert.fail('must not list'), update: () => assert.fail('must not update'), delete: () => assert.fail('must not delete') }
  assert.equal((await request(createMemoryPanelHandler({ admit: () => ({ rejection: 401 }) }, panel))).status, 401)
  assert.equal((await request(createMemoryPanelHandler({
    admit: () => ({ peer: { principal: { kind: 'guest' } } }),
  }, panel))).status, 403)
  assert.equal((await request(createMemoryPanelHandler(owner, panel), 'PUT')).status, 405)
  assert.equal((await request(createMemoryPanelHandler(owner, panel), 'PUT')).headers.allow, 'GET, POST')
})

test('memory panel lists the owner view and rejects malformed writes before the store', async () => {
  const asked = []
  const handler = createMemoryPanelHandler(owner, {
    async list() { asked.push('list'); return { records: [record], injection: { profile: { everyChat: true, limit: 6, maxChars: 500, recordIds: [record.id] } } } },
    update: async () => assert.fail('must not update'),
    delete: async () => assert.fail('must not delete'),
  })
  const result = await request(handler)
  assert.equal(result.status, 200)
  assert.equal(result.headers['x-content-type-options'], 'nosniff')
  assert.deepEqual(asked, ['list'])
  assert.equal(JSON.parse(result.body).total, 1)
  assert.equal(JSON.parse(result.body).records[0].content, 'Saved fact')
  assert.deepEqual(JSON.parse(result.body).injection.profile.recordIds, [record.id])

  for (const body of [
    {},
    { action: 'create', category: 'public', id: record.id },
    { action: 'update', category: 'archive', id: record.id, content: 'x' },
    { action: 'update', category: 'public', id: 'not-an-id', content: 'x' },
    { action: 'update', category: 'public', id: record.id },
    { action: 'update', category: 'private', id: record.id, content: 'x' },
    { action: 'delete', category: 'team', id: record.id },
  ]) {
    assert.equal((await post(handler, body)).status, 400)
  }
  assert.equal((await post(handler, { action: 'delete', category: 'public', id: record.id }, { 'content-type': 'text/plain' })).status, 415)
  assert.equal((await post(handler, '{')).status, 400)
  assert.equal((await post(handler, { action: 'delete', category: 'public', id: record.id, padding: 'x'.repeat(40_000) })).status, 413)
})

test('memory panel updates public, profile and team records and deletes any record', async () => {
  const writes = []
  const missingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const handler = createMemoryPanelHandler(owner, {
    list: async () => ({ records: [], injection: { profile: { everyChat: true, limit: 6, maxChars: 500, recordIds: [] } } }),
    async update(input) {
      writes.push(input)
      if (input.id === missingId) return undefined
      return { ...record, ...input, category: input.category }
    },
    async delete(input) {
      writes.push(input)
      return input.id !== missingId
    },
  })
  const profile = await post(handler, { action: 'update', category: 'profile', id: record.id, content: 'New fact' })
  assert.equal(profile.status, 200)
  assert.equal(JSON.parse(profile.body).record.content, 'New fact')
  assert.deepEqual(writes[0], { action: 'update', category: 'profile', id: record.id, content: 'New fact' })

  const team = await post(handler, {
    action: 'update', category: 'team', id: record.id, teamId: 'core', projectRoot: '/repo', content: 'Team fact',
  })
  assert.equal(team.status, 200)
  assert.deepEqual(writes[1], {
    action: 'update', category: 'team', id: record.id, teamId: 'core', projectRoot: '/repo', content: 'Team fact',
  })

  const privateRef = await post(handler, {
    action: 'update', category: 'private', id: record.id, credentialRef: 'DEEPSEEK_API_KEY',
  })
  assert.equal(privateRef.status, 200)
  assert.deepEqual(writes[2], {
    action: 'update', category: 'private', id: record.id, credentialRef: 'DEEPSEEK_API_KEY',
  })

  const removed = await post(handler, { action: 'delete', category: 'team', id: record.id, teamId: 'core', projectRoot: '/repo' })
  assert.equal(removed.status, 200)
  assert.deepEqual(JSON.parse(removed.body), { deleted: record.id })

  assert.equal((await post(handler, { action: 'update', category: 'public', id: missingId, content: 'x' })).status, 404)
  assert.equal((await post(handler, { action: 'delete', category: 'public', id: missingId })).status, 404)
})

test('memory panel maps store validation to 400 and other store failures to 409', async () => {
  const invalid = createMemoryPanelHandler(owner, {
    list: async () => ({ records: [], injection: { profile: { everyChat: true, limit: 6, maxChars: 500, recordIds: [] } } }),
    update: async () => { throw new TypeError('Memory content must contain 1–16000 characters') },
    delete: async () => { throw new Error('Invalid or unsupported memory storage record') },
  })
  assert.equal((await post(invalid, { action: 'update', category: 'public', id: record.id, content: 'x' })).status, 400)
  assert.equal((await post(invalid, { action: 'delete', category: 'public', id: record.id })).status, 409)

  const broken = createMemoryPanelHandler(owner, {
    list: async () => { throw new Error('Memory storage unavailable') },
    update: async () => undefined,
    delete: async () => false,
  })
  assert.equal((await request(broken)).status, 409)
  assert.deepEqual(JSON.parse((await request(broken)).body), { error: 'Memory storage unavailable' })
})
