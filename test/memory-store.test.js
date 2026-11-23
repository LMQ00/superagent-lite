import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createMemoryStore, GLOBAL_FIELDS, PROJECT_FIELDS } from '../src/memory-store.js'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))

async function fixture(t) {
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, 'memory-store-'))
  t.after(() => rm(root, { recursive: true }))
  return { root, directory: join(root, 'memory') }
}

test('reads and writes global and project memory by scope', async t => {
  const { root, directory } = await fixture(t)
  const store = createMemoryStore(directory)
  assert.deepEqual(await store.readGlobal(), { userProfile: '', sharedSkill: '' })
  assert.deepEqual(await store.readProject(join(root, 'project-a')), {
    projectRoot: join(root, 'project-a'), responsibilities: '', positioning: '', scenarios: '', skill: '',
  })

  const global = await store.writeGlobal({ userProfile: '  Prefers terse reports. ', sharedSkill: 'Use Node test.' })
  assert.deepEqual(global, { userProfile: 'Prefers terse reports.', sharedSkill: 'Use Node test.' })
  const project = await store.writeProject(join(root, 'project-a'), {
    responsibilities: 'Keep the CLI honest.', positioning: 'Small DSH bundle.', scenarios: 'Tests fail.', skill: 'Run npm test.',
  })
  assert.equal(project.responsibilities, 'Keep the CLI honest.')

  const reopened = createMemoryStore(directory)
  assert.deepEqual(await reopened.readGlobal(), global)
  assert.deepEqual(await reopened.readProject(join(root, 'project-a')), project)
  assert.deepEqual(await reopened.readProject(join(root, 'project-b')), {
    projectRoot: join(root, 'project-b'), responsibilities: '', positioning: '', scenarios: '', skill: '',
  })
})

test('only changed fields are written and invalid fields are refused', async t => {
  const { directory } = await fixture(t)
  const store = createMemoryStore(directory)
  await store.writeGlobal({ userProfile: 'Old preference' })
  const same = await store.writeGlobal({ userProfile: 'Old preference' })
  assert.equal(same.userProfile, 'Old preference')
  await assert.rejects(store.writeGlobal({ content: 'x' }), /Unknown global memory field/)
  await assert.rejects(store.writeGlobal({ userProfile: 'x'.repeat(4_001) }), /at most 4000 characters/)
  await assert.rejects(store.writeGlobal({ userProfile: 3 }), /must be a string/)
  await assert.rejects(store.writeProject('relative', {}), /absolute project root/)
  await assert.rejects(store.writeProject(join(directory, '..', 'project'), { nope: 'x' }), /Unknown project memory field/)
  assert.deepEqual(GLOBAL_FIELDS, ['userProfile', 'sharedSkill'])
  assert.deepEqual(PROJECT_FIELDS, ['responsibilities', 'positioning', 'scenarios', 'skill'])
})

test('raw archives are stored by session and event sequence', async t => {
  const { directory } = await fixture(t)
  const store = createMemoryStore(directory)
  const source = { sessionId: 'session/a', seq: 12 }
  const value = { turn: 1, events: [{ type: 'user/message', data: { text: 'raw' } }] }
  await store.archive.write(source, value)
  assert.deepEqual(await store.archive.read(source), value)
  assert.equal(await store.archive.read({ ...source, seq: 13 }), undefined)
  await assert.rejects(store.archive.write({ sessionId: '', seq: 1 }, value), /Session id/)
  await assert.rejects(store.archive.write({ sessionId: 's', seq: -1 }, value), /non-negative/)
})

test('invalid stored documents fail closed instead of being overwritten', async t => {
  const { root, directory } = await fixture(t)
  const store = createMemoryStore(directory)
  await store.writeGlobal({ userProfile: 'Stored' })
  const globalPath = join(directory, 'global.json')
  await writeFile(globalPath, '{"version":99}')
  await assert.rejects(store.readGlobal(), /unsupported global memory/)
  await assert.rejects(store.writeGlobal({ userProfile: 'New' }), /unsupported global memory/)
  assert.equal(await readFile(globalPath, 'utf8'), '{"version":99}')
  const projectRoot = join(root, 'project')
  await store.writeProject(projectRoot, { responsibilities: 'Stored' })
  const projects = join(directory, 'projects')
  const { readdir } = await import('node:fs/promises')
  const [name] = await readdir(projects)
  await writeFile(join(projects, name), '{')
  await assert.rejects(store.readProject(projectRoot), /Invalid memory storage JSON/)
})
