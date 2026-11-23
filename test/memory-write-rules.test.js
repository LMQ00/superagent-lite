import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { createMemoryStore } from '../src/memory-store.js'

const tmp = resolve(import.meta.dirname, '../../tmp')
const router = { role: 'router' }
const origin = { sessionId: 'session/write-rules', seq: 12 }
const nextOrigin = { ...origin, seq: 13 }

async function fixture(t) {
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, 'memory-write-rules-'))
  t.after(async () => {
    assert.equal(dirname(root), tmp)
    assert.match(basename(root), /^memory-write-rules-[a-zA-Z0-9]+$/)
    await rm(root, { recursive: true })
  })
  return createMemoryStore(join(root, 'memory')).memory
}

test('an identical write reuses the record and keeps its original evidence', async t => {
  const memory = await fixture(t)
  const first = await memory.create(router, {
    category: 'public', content: 'Use npm test for unit tests', source: origin,
  })
  const duplicate = await memory.create(router, {
    category: 'public', content: '  use   NPM test for unit tests. ', source: nextOrigin,
  })
  assert.equal(duplicate.id, first.id)
  assert.equal(duplicate.content, first.content)
  assert.deepEqual(duplicate.source, origin)
  assert.equal(duplicate.updatedAt, first.updatedAt)
  assert.deepEqual(await memory.list(router, 'public'), [first])
})

test('an equivalent rewrite updates the matching record instead of appending', async t => {
  const memory = await fixture(t)
  const first = await memory.create(router, {
    category: 'profile', content: 'Prefers concise replies', source: origin,
  })
  const rewritten = await memory.create(router, {
    category: 'profile', content: 'The user prefers concise replies.', source: nextOrigin,
  })
  assert.equal(rewritten.id, first.id)
  assert.equal(rewritten.content, 'The user prefers concise replies.')
  assert.deepEqual(rewritten.source, nextOrigin)
  assert.equal(rewritten.createdAt, first.createdAt)
  assert.deepEqual(await memory.list(router, 'profile'), [rewritten])
})

test('an incorrect memory is overwritten in place rather than appended', async t => {
  const memory = await fixture(t)
  const first = await memory.create(router, {
    category: 'public', content: 'Project uses Node 20', source: origin,
  })
  const corrected = await memory.create(router, {
    category: 'public', content: 'Project uses Node 22', source: nextOrigin,
  })
  assert.equal(corrected.id, first.id)
  assert.equal(corrected.content, 'Project uses Node 22')
  assert.deepEqual(corrected.source, nextOrigin)
  assert.equal(corrected.createdAt, first.createdAt)
  assert.ok(corrected.updatedAt >= first.updatedAt)
  assert.deepEqual(await memory.list(router, 'public'), [corrected])
})

test('genuinely new content creates a second record and leaves the first intact', async t => {
  const memory = await fixture(t)
  const deploy = await memory.create(router, {
    category: 'public', content: 'Deploy with npm run deploy', source: origin,
  })
  const testCommand = await memory.create(router, {
    category: 'public', content: 'Test command: npm test', source: nextOrigin,
  })
  assert.notEqual(testCommand.id, deploy.id)
  const records = await memory.list(router, 'public')
  assert.deepEqual(records.map(record => record.content).sort(), [
    'Deploy with npm run deploy',
    'Test command: npm test',
  ])
})

test('concurrent identical writes still produce one record', async t => {
  const memory = await fixture(t)
  const records = await Promise.all(Array.from({ length: 4 }, (_, index) => memory.create(router, {
    category: 'public', content: 'Concurrent fact', source: { ...origin, seq: index },
  })))
  assert.equal(new Set(records.map(record => record.id)).size, 1)
  assert.deepEqual(await memory.list(router, 'public'), [records[0]])
})

test('deduplication and corrections stay inside the matching category and scope', async t => {
  const memory = await fixture(t)
  const core = { role: 'worker', teamId: 'core', projectRoot: join(tmp, 'project-core') }
  const other = { role: 'worker', teamId: 'other', projectRoot: join(tmp, 'project-other') }
  const first = await memory.create(core, {
    category: 'team', content: 'Run tests with npm test', source: origin,
  })
  const sameScope = await memory.create(core, {
    category: 'team', content: 'Run tests with npm test', source: nextOrigin,
  })
  const otherScope = await memory.create(other, {
    category: 'team', content: 'Run tests with npm test', source: nextOrigin,
  })
  const otherCategory = await memory.create(router, {
    category: 'public', content: 'Run tests with npm test', source: nextOrigin,
  })
  assert.equal(sameScope.id, first.id)
  assert.notEqual(otherScope.id, first.id)
  assert.notEqual(otherCategory.id, first.id)
  assert.equal((await memory.list(core, 'team')).length, 1)
  assert.equal((await memory.list(other, 'team')).length, 1)
  assert.equal((await memory.list(router, 'public')).length, 1)
})
