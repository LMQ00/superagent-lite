import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { createMemoryStore } from '../src/memory-store.js'

const tmp = resolve(import.meta.dirname, '../../tmp')
const router = { role: 'router' }
const origin = { sessionId: 'session/a', seq: 12 }

async function fixture(t) {
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, 'memory-store-'))
  t.after(async () => {
    assert.equal(dirname(root), tmp)
    assert.match(basename(root), /^memory-store-[a-zA-Z0-9]+$/)
    await rm(root, { recursive: true })
  })
  const directory = join(root, 'memory')
  return { ...createMemoryStore(directory), root, directory }
}

test('creates, reads, updates, and deletes public and profile records across store instances', async t => {
  const { memory, directory } = await fixture(t)
  assert.deepEqual(await memory.list(router, 'public'), [])
  const record = await memory.create(router, { category: 'public', content: '  Objective conclusion. ', source: origin })
  assert.equal(record.content, 'Objective conclusion.')
  const worker = { role: 'worker' }
  const { memory: reopened } = createMemoryStore(directory)
  assert.deepEqual(await reopened.read(worker, 'public', record.id), record)
  assert.equal(await reopened.read(worker, 'profile', record.id), undefined)
  const profile = await memory.create(router, { category: 'profile', content: 'Prefers short replies.', source: origin })
  assert.deepEqual(await reopened.list(worker, 'profile'), [profile])
  const source = { ...origin, seq: 13 }
  const updated = await reopened.update(router, 'public', record.id, { content: 'Updated conclusion.', source })
  assert.equal(updated.createdAt, record.createdAt)
  assert.equal(updated.content, 'Updated conclusion.')
  assert.deepEqual(updated.source, source)
  assert.equal(await reopened.delete(router, 'public', record.id), true)
  assert.equal(await memory.delete(router, 'public', record.id), false)
  assert.equal(await memory.update(router, 'public', record.id, { content: 'Missing' }), undefined)
  assert.deepEqual(await reopened.list(router, 'public'), [])
})

test('isolates team records by trusted role, team, and project; rejects caller fields in payload', async t => {
  const { memory, root } = await fixture(t)
  const projectRoot = join(root, 'project-a')
  const worker = { role: 'worker', teamId: 'core', projectRoot }
  const input = { category: 'team', source: origin, content: 'Use the project conventions.' }
  const entry = await memory.create(worker, input)
  assert.deepEqual(await memory.read({ ...worker, projectRoot: `${projectRoot}/.` }, 'team', entry.id), entry)
  for (const outsider of [{ ...worker, teamId: 'other' }, { ...worker, projectRoot: join(root, 'project-b') }]) {
    assert.deepEqual(await memory.list(outsider, 'team'), [])
    assert.equal(await memory.read(outsider, 'team', entry.id), undefined)
    assert.equal(await memory.update(outsider, 'team', entry.id, { content: 'Never applied' }), undefined)
    assert.equal(await memory.delete(outsider, 'team', entry.id), false)
  }
  for (const caller of [{ ...worker, role: 'router' }, { ...worker, role: 'memory' }, { ...worker, projectRoot: '.' }]) {
    await assert.rejects(memory.read(caller, 'team', entry.id), /trusted worker/)
  }
  await assert.rejects(memory.create(worker, { ...input, teamId: 'other' }), /Invalid memory fields/)
  await assert.rejects(memory.read(worker, 'team', '../archive/raw'), /Invalid memory record id/)
  assert.equal(await memory.delete(worker, 'team', entry.id), true)
})

test('private entries accept only credential references or explicit non-secret content', async t => {
  const { memory, directory } = await fixture(t)
  const input = { category: 'private', source: origin }
  await assert.rejects(memory.create(router, { ...input, content: 'Not classified' }), /nonSecret/)
  await assert.rejects(memory.create(router, { ...input, content: 'API_KEY=fixture1234', nonSecret: true }), /contain a secret/)
  await assert.rejects(memory.create(router, { ...input, credentialRef: 'TOKEN=fixture1234' }), /reference name/)
  await assert.rejects(memory.create(router, { ...input, credentialRef: 'DEEPSEEK_API_KEY', content: 'Extra value' }), /reference name/)
  const ref = await memory.create(router, { ...input, credentialRef: 'DEEPSEEK_API_KEY' })
  assert.equal(ref.credentialRef, 'DEEPSEEK_API_KEY')
  assert.equal(ref.content, undefined)
  await assert.rejects(memory.update(router, 'private', ref.id, { content: 'Not attested' }), /nonSecret/)
  await assert.rejects(memory.update(router, 'private', ref.id, { credentialRef: `ghp_${'x'.repeat(36)}` }), /reference name/)
  const fact = await memory.update(router, 'private', ref.id, { content: '  Internal nickname. ', nonSecret: true })
  assert.equal(fact.content, 'Internal nickname.')
  assert.equal(fact.credentialRef, undefined)
  if (process.platform !== 'win32') {
    assert.equal((await stat(join(directory, 'private', `${ref.id}.json`))).mode & 0o777, 0o600)
  }
})

test('panel lists the saved team scopes without exposing them to the memory facade', async t => {
  const { memory, panel, root } = await fixture(t)
  assert.deepEqual(await panel.teams(), [])
  const core = { role: 'worker', teamId: 'core', projectRoot: join(root, 'project-a') }
  const other = { role: 'worker', teamId: 'other', projectRoot: join(root, 'project-b') }
  await memory.create(core, { category: 'team', source: origin, content: 'Core convention.' })
  await memory.create(other, { category: 'team', source: origin, content: 'Other convention.' })
  assert.deepEqual(await panel.teams(), [
    { teamId: 'core', projectRoot: resolve(core.projectRoot) },
    { teamId: 'other', projectRoot: resolve(other.projectRoot) },
  ])
  assert.deepEqual(Object.keys(memory).sort(), ['create', 'delete', 'list', 'read', 'update'])
})

test('raw archive is a separate immutable host capability keyed by the source coordinate', async t => {
  const { memory, archive, directory } = await fixture(t)
  const value = { type: 'assistant/message', data: { text: '\n raw text ' } }
  assert.equal(await archive.read(origin), undefined)
  await Promise.all([archive.write(origin, value), archive.write(origin, value)])
  assert.deepEqual(await createMemoryStore(directory).archive.read(origin), value)
  assert.equal(await archive.read({ ...origin, seq: 999 }), undefined)
  await assert.rejects(archive.write(origin, { other: true }), /already recorded with different data/)
  await assert.rejects(archive.write({ ...origin, seq: 15 }, { lossy: undefined }), /lossless JSON/)
  assert.deepEqual(await archive.read(origin), value)
  assert.deepEqual(Object.keys(memory).sort(), ['create', 'delete', 'list', 'read', 'update'])
  await assert.rejects(memory.read(router, 'archive', 'bogus'), /Invalid memory category/)
  assert.equal((await readdir(join(directory, 'archive'))).length, 1)
})

test('fails closed without overwriting an invalid record and refuses a symlinked partition', async t => {
  const { memory, directory, root } = await fixture(t)
  const record = await memory.create(router, { category: 'public', source: origin, content: 'Conclusion' })
  await writeFile(join(directory, 'public', `${record.id}.json`), '{"version":99}')
  await assert.rejects(memory.update(router, 'public', record.id, { content: 'New' }), /unsupported memory storage record/)
  await assert.rejects(memory.delete(router, 'public', record.id), /unsupported memory storage record/)
  assert.deepEqual(await readdir(join(directory, 'public')), [`${record.id}.json`])
  if (process.platform !== 'win32') {
    const external = join(root, 'external')
    await mkdir(external)
    await symlink(external, join(directory, 'team'), 'dir')
    await assert.rejects(memory.create({ role: 'worker', teamId: 'core', projectRoot: root }, {
      category: 'team', source: origin, content: 'Must not escape.',
    }), /real directory/)
    assert.deepEqual(await readdir(external), [])
  }
})

test('serializes concurrent source-only and content updates without losing either field', async t => {
  const { memory, directory } = await fixture(t)
  const item = await memory.create(router, { category: 'profile', source: origin, content: 'Old' })
  const reopened = createMemoryStore(directory).memory
  const newSource = { ...origin, seq: 14 }
  await Promise.all([
    memory.update(router, 'profile', item.id, { content: 'New' }),
    reopened.update(router, 'profile', item.id, { source: newSource }),
  ])
  const result = await reopened.read(router, 'profile', item.id)
  assert.equal(result.content, 'New')
  assert.deepEqual(result.source, newSource)
  assert.deepEqual(await readdir(join(directory, 'profile')), [`${item.id}.json`])
})
