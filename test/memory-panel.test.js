import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'memory-panel-'))
const originalHome = process.env.HOME
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

const { createMemoryPanelHandler } = await import('../src/memory-panel.js')
const { createMemoryStore } = await import('../src/memory.js')

const owner = () => ({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) })

async function request(handler, method = 'GET', url = '/superagent-lite/memory') {
  const result = {}
  const response = {
    writeHead(status, headers) { Object.assign(result, { status, headers }); return this },
    end(body) { result.body = body },
  }
  await handler({ method, headers: {}, url }, response)
  return result
}

test('the memory panel refuses non-owner requests without reading memory', async () => {
  for (const admission of [{ rejection: 401 }, { peer: { principal: { kind: 'guest' } } }]) {
    const handler = createMemoryPanelHandler({ admit: () => admission }, {
      read: async () => assert.fail('must not read memory'),
    })
    const result = await request(handler)
    assert.equal(result.status, admission.rejection ?? 403)
    assert.equal(result.headers['cache-control'], 'no-store')
  }
})

test('the memory panel reads the memory and knowledge of the requested project', async () => {
  const reads = []
  const handler = createMemoryPanelHandler(owner(), {
    read: async projectRoot => {
      reads.push(projectRoot)
      return {
        global: { userProfile: 'Prefers terse reports.' },
        project: { projectRoot, responsibilities: 'Keep notes accurate.', positioning: 'Local tooling.' },
        knowledge: [{ id: 'k1', text: 'Run tests.', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }],
      }
    },
  })
  const projectRoot = '/work/project with space'
  const result = await request(handler, 'GET', `/superagent-lite/memory?projectRoot=${encodeURIComponent(projectRoot)}`)
  assert.equal(result.status, 200)
  assert.equal(result.headers['content-type'], 'application/json; charset=utf-8')
  assert.deepEqual(reads, [projectRoot])
  assert.deepEqual(JSON.parse(result.body), {
    global: { userProfile: 'Prefers terse reports.' },
    project: { projectRoot, responsibilities: 'Keep notes accurate.', positioning: 'Local tooling.' },
    knowledge: [{ id: 'k1', text: 'Run tests.', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }],
  })
})

test('the memory panel serves the global scope when no project is given', async () => {
  const reads = []
  const handler = createMemoryPanelHandler(owner(), {
    read: async projectRoot => {
      reads.push(projectRoot)
      return { global: { userProfile: 'Global only.' }, knowledge: [] }
    },
  })
  const result = await request(handler)
  assert.equal(result.status, 200)
  assert.deepEqual(reads, [undefined])
  assert.deepEqual(JSON.parse(result.body), { global: { userProfile: 'Global only.' }, knowledge: [] })
})

test('the memory panel rejects invalid project roots and unsupported methods', async () => {
  const reads = []
  const handler = createMemoryPanelHandler(owner(), { read: async projectRoot => { reads.push(projectRoot); return {} } })
  for (const url of ['/superagent-lite/memory?projectRoot=relative/path', '/superagent-lite/memory?projectRoot=']) {
    const result = await request(handler, 'GET', url)
    assert.equal(result.status, 400)
    assert.match(JSON.parse(result.body).error, /absolute project root/)
  }
  assert.deepEqual(reads, [])
  const post = await request(handler, 'POST')
  assert.equal(post.status, 405)
  assert.equal(post.headers.allow, 'GET, DELETE')
})

test('the memory panel reports unreadable memory as a conflict', async () => {
  const handler = createMemoryPanelHandler(owner(), {
    read: async () => { throw new Error('Invalid memory storage JSON') },
  })
  const result = await request(handler, 'GET', `/superagent-lite/memory?projectRoot=${encodeURIComponent('/work/project')}`)
  assert.equal(result.status, 409)
  assert.equal(JSON.parse(result.body).error, 'Invalid memory storage JSON')
})

test('the memory panel reads the default store without exposing write paths', async () => {
  const projectRoot = join(home, 'project-default-store')
  const store = createMemoryStore()
  await store.writeMemory(projectRoot, {
    global: { userProfile: 'Prefers concise answers.' },
    project: { responsibilities: 'Keep the panel accurate.', positioning: 'Small local plugin.' },
  })
  await store.addKnowledge('Run npm test before reporting.')
  const handler = createMemoryPanelHandler(owner())
  const result = await request(handler, 'GET', `/superagent-lite/memory?projectRoot=${encodeURIComponent(projectRoot)}`)
  const body = JSON.parse(result.body)
  assert.equal(result.status, 200)
  assert.deepEqual(body.global, { userProfile: 'Prefers concise answers.' })
  assert.deepEqual(body.project, {
    projectRoot, responsibilities: 'Keep the panel accurate.', positioning: 'Small local plugin.',
  })
  assert.equal(body.knowledge.length, 1)
  assert.equal(body.knowledge[0].text, 'Run npm test before reporting.')

  const globalOnly = JSON.parse((await request(handler)).body)
  assert.deepEqual(globalOnly.global, { userProfile: 'Prefers concise answers.' })
  assert.deepEqual(globalOnly.knowledge, body.knowledge)
})

test('the memory panel deletes one of several project skills without touching the others', async () => {
  const projectRoot = join(home, 'project-delete-skills')
  const store = createMemoryStore()
  await store.writeSkill('project', projectRoot, {
    name: 'superagent-project-memory', description: 'First project skill.', content: 'First body.',
  })
  await store.writeSkill('project', projectRoot, {
    name: 'superagent-lite-test-conventions', description: 'Test conventions.', content: 'Run node --test.',
  })
  await store.writeSkill('global', projectRoot, {
    description: 'Shared skill.', content: 'Inspect first.',
  })
  const handler = createMemoryPanelHandler(owner())
  const before = JSON.parse((await request(handler, 'GET',
    `/superagent-lite/memory?projectRoot=${encodeURIComponent(projectRoot)}`)).body)
  assert.deepEqual(before.skills.project.map(skill => skill.name), [
    'superagent-lite-test-conventions', 'superagent-project-memory',
  ])
  assert.deepEqual(before.skills.global.map(skill => skill.name), ['superagent-shared-memory'])
  const removed = await request(handler, 'DELETE',
    `/superagent-lite/memory?kind=skill&scope=project&projectRoot=${encodeURIComponent(projectRoot)}&name=superagent-lite-test-conventions`)
  assert.equal(removed.status, 200)
  assert.deepEqual(JSON.parse(removed.body), {
    deleted: { kind: 'skill', scope: 'project', name: 'superagent-lite-test-conventions' },
    existed: true,
  })
  const after = JSON.parse((await request(handler, 'GET',
    `/superagent-lite/memory?projectRoot=${encodeURIComponent(projectRoot)}`)).body)
  assert.deepEqual(after.skills.project.map(skill => skill.name), ['superagent-project-memory'])
  assert.deepEqual(after.skills.global.map(skill => skill.name), ['superagent-shared-memory'])
  assert.equal(await store.readSkill('project', projectRoot, 'superagent-lite-test-conventions'), undefined)
})

test('the memory panel validates skill deletes and maps storage failures', async () => {
  const ownerConnection = owner()
  const removals = []
  const handler = createMemoryPanelHandler(ownerConnection, {
    remove: async target => {
      removals.push(target)
      if (target.name === 'broken') throw new Error('Skill storage is unreadable')
      return { deleted: { kind: 'skill', scope: target.scope, name: target.name }, existed: true }
    },
  })
  for (const target of [
    'kind=other&scope=project&projectRoot=%2Fwork%2Fproject&name=x',
    'kind=skill&scope=other&projectRoot=%2Fwork%2Fproject&name=x',
    'kind=skill&scope=project&name=x',
    'kind=skill&scope=project&projectRoot=%2Fwork%2Fproject',
    'kind=skill&scope=global',
  ]) {
    const result = await request(handler, 'DELETE', `/superagent-lite/memory?${target}`)
    assert.equal(result.status, 400, target)
  }
  assert.deepEqual(removals, [])
  const failed = await request(handler, 'DELETE', '/superagent-lite/memory?kind=skill&scope=global&name=broken')
  assert.equal(failed.status, 409)
  assert.equal(JSON.parse(failed.body).error, 'Skill storage is unreadable')
  const ok = await request(handler, 'DELETE', '/superagent-lite/memory?kind=skill&scope=global&name=shared')
  assert.equal(ok.status, 200)
  assert.deepEqual(removals, [{ kind: 'skill', scope: 'global', projectRoot: undefined, name: 'broken' },
    { kind: 'skill', scope: 'global', projectRoot: undefined, name: 'shared' }])
  const denied = createMemoryPanelHandler({ admit: () => ({ peer: { principal: { kind: 'guest' } } }) }, {
    remove: async () => assert.fail('must not delete for a non-owner'),
  })
  assert.equal((await request(denied, 'DELETE', '/superagent-lite/memory?kind=skill&scope=global&name=x')).status, 403)
})

test('the memory panel deletes a global skill', async () => {
  const projectRoot = join(home, 'project-delete-global-skill')
  const store = createMemoryStore()
  await store.writeSkill('global', projectRoot, {
    name: 'superagent-extra-skill', description: 'Extra shared skill.', content: 'Body.',
  })
  const handler = createMemoryPanelHandler(owner())
  const removed = await request(handler, 'DELETE',
    '/superagent-lite/memory?kind=skill&scope=global&name=superagent-extra-skill')
  assert.equal(removed.status, 200)
  assert.equal(await store.readSkill('global', projectRoot, 'superagent-extra-skill'), undefined)
})
