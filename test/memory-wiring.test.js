import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'memory-wiring-'))
const originalHome = process.env.HOME
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

async function taskForWorker(taskId, workerId, mode = 'change', { worktree = true } = {}) {
  const { createTask, linkWorkerSession } = await import('../src/task-store.js')
  const projectRoot = join(home, 'project-core')
  await createTask({
    id: taskId, title: `Task ${taskId}`, teamId: 'core', projectRoot, task: 'Change it',
    mode, parentSessionId: 'router', workerSessionId: workerId, status: 'running',
    baseBranch: 'main', baseCommit: 'b'.repeat(40),
    ...(mode === 'report' || !worktree ? {} : { worktree: { path: projectRoot, branch: 'sl-core' } }),
    createdAt: new Date().toISOString(),
  })
  await linkWorkerSession(taskId, workerId)
  return projectRoot
}

async function workerWiring(workerId, projectRoot, structured, { fail = false, beforeCreate } = {}) {
  const { apply } = await import('../index.js')
  const listeners = new Map()
  const activations = []
  const registered = []
  const warnings = []
  const contexts = []
  const skillProviders = []
  const skills = {
    registerProvider(create) {
      skillProviders.push(create({ invalidate() {} }))
      return () => {}
    },
  }
  const events = [
    { seq: 2, type: 'turn/start', data: { turn: 1 } },
    { seq: 3, type: 'user/message', data: { source: { kind: 'user' }, text: 'Implement it.' } },
    { seq: 4, type: 'turn/end', data: { turn: 1 } },
  ]
  const globalTools = []
  const ctx = {
    logger: { warn: message => warnings.push(message) },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get() {}, list: () => [] },
    agentPresets: { composedPreset: () => 'superagent-lite-worker' },
    tools: { register(tool, options) { globalTools.push({ tool, options }); return () => {} } },
    workingDirectory: { get: () => projectRoot },
    worktrees: {
      async create(_agent, { name }) {
        return { path: projectRoot, branch: name, baseCommit: 'b'.repeat(40), repositoryRoot: projectRoot }
      },
    },
    subagents: {
      async startActivation(spec) {
        activations.push(spec)
        if (fail) throw new Error('extractor unavailable')
        return { childId: 'extractor', result: Promise.resolve({ stopReason: 'completed', structured }) }
      },
      async sendMessage() {},
    },
  }
  await apply(ctx)
  await beforeCreate?.()
  let guard
  const agent = {
    id: workerId,
    session: {
      id: workerId, seq: 5, firstLiveSeq: 2,
      header: { origin: 'subagent', parentSession: 'router' },
      deriveMessages: () => [
        { role: 'user', content: [{ type: 'text', text: 'Implement the change.' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Done. Review approved; tests pass.' }] },
      ],
      eventAt: index => events.find(event => event.seq === index),
      snapshotEvents: (start, end) => events.filter(event => event.seq >= start && event.seq < end),
    },
    ctx: {
      get: name => name === 'skills' ? skills : undefined,
      tools: {
        guard(callback) { guard = callback; return () => {} },
        register(tool) { registered.push(tool); return () => {} },
      },
      systemPrompt: { context(entry) { contexts.push(entry); return () => {} } },
    },
  }
  await listeners.get('agent/created')({ agent })
  return {
    agent, activations, registered, warnings, contexts, listeners, events, skillProviders, globalTools,
    message: () => registered.find(tool => tool.name === 'message_router'),
    guard: args => guard(args),
  }
}

const memoryFields = values => ({
  userProfile: '',
  responsibilities: '',
  positioning: '',
  sharedSkills: [],
  projectSkills: [],
  ...values,
})

test('the final report triggers the memory role, saves memory and writes skills', async () => {
  const workerId = 'worker-a'
  const projectRoot = await taskForWorker('a'.repeat(16), workerId)
  const wiring = await workerWiring(workerId, projectRoot, memoryFields({
    userProfile: 'Prefers terse reports.',
    responsibilities: 'Keep the notes accurate.',
    sharedSkills: [{
      name: 'superagent-shared-memory',
      description: 'Inspect before changing.',
      content: 'Read the repository first.',
    }],
    projectSkills: [{
      name: 'superagent-project-memory',
      description: 'Run the project tests.',
      content: 'Run npm test before reporting.',
    }],
  }))
  const result = await wiring.message().execute({
    message: 'Done. Review approved; tests pass.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.match(result, /Message delivered to the router/)
  assert.doesNotMatch(result, /memory field/)
  assert.equal(wiring.activations.length, 1)
  assert.equal(wiring.activations[0].label, 'Distill memory')
  assert.equal(wiring.activations[0].delivery, 'caller')
  assert.equal(wiring.activations[0].maxDepth, 2)
  assert.deepEqual(wiring.activations[0].promptSource, {
    kind: 'agent-message', form: 'relay', senderSessionId: wiring.agent.id,
  })
  assert.match(wiring.activations[0].prompt[0].text, /You are the memory role/)
  assert.match(wiring.activations[0].prompt[0].text, /- Role: worker/)
  assert.match(wiring.activations[0].prompt[0].text, /- Branch: sl-core/)
  assert.doesNotMatch(wiring.activations[0].prompt[0].text, /Implement the change\./)
  assert.doesNotMatch(wiring.activations[0].prompt[0].text, /Done\. Review approved; tests pass\./)
  const recordPath = /^- Record path: (.+)$/m.exec(wiring.activations[0].prompt[0].text)?.[1]
  assert.ok(recordPath, wiring.activations[0].prompt[0].text)
  const record = await readFile(recordPath, 'utf8')
  assert.match(record, /\[user\] Implement the change\./)
  assert.match(record, /\[assistant\] Done\. Review approved; tests pass\./)

  const repeated = await wiring.message().execute({
    message: 'Done again.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.doesNotMatch(repeated, /memory field/)
  assert.equal(wiring.activations.length, 1)

  const { createMemoryStore } = await import('../src/memory.js')
  const store = createMemoryStore()
  const saved = await store.readMemory(projectRoot)
  assert.equal(saved.global.userProfile, 'Prefers terse reports.')
  assert.equal(saved.project.responsibilities, 'Keep the notes accurate.')
  assert.deepEqual(await store.readSkill('global', projectRoot), {
    description: 'Inspect before changing.', content: 'Read the repository first.', author: 'memory',
  })
  assert.deepEqual(await store.readSkill('project', projectRoot), {
    description: 'Run the project tests.', content: 'Run npm test before reporting.', author: 'memory',
  })
})

test('the memory request reads the worker branch written after agent creation', async () => {
  const workerId = 'worker-late-branch'
  const taskId = 'ad'.repeat(8)
  const projectRoot = await taskForWorker(taskId, workerId, 'change', { worktree: false })
  const wiring = await workerWiring(workerId, projectRoot, memoryFields())
  const worktree = wiring.registered.find(tool => tool.name === 'create_worktree')
  assert.ok(worktree)
  const created = await worktree.execute({}, { agent: wiring.agent, signal: new AbortController().signal })
  assert.match(created.branch, /^sl-core-/)
  const result = await wiring.message().execute({
    message: 'Done. Review approved; tests pass.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.match(result, /Message delivered to the router/)
  const prompt = wiring.activations[0].prompt[0].text
  assert.match(prompt, new RegExp(`- Branch: ${created.branch}`))
  assert.doesNotMatch(prompt, /- Branch: main/)
})

test('a finished worker is not shown a catalog update caused by its own memory skill write', async () => {
  const workerId = 'worker-catalog'
  const projectRoot = await taskForWorker('ab'.repeat(8), workerId)
  const wiring = await workerWiring(workerId, projectRoot, memoryFields({
    projectSkills: [{
      name: 'superagent-project-memory',
      description: 'Run the project tests.',
      content: 'Run npm test before reporting.',
    }],
  }))
  const catalog = (entries, update = false) => ({
    id: 'catalog',
    source: { kind: 'skill-catalog', form: 'catalog', ...update ? { update: true } : {}, entries },
  })
  const preStep = wiring.listeners.get('agent/pre-step')
  const initial = catalog([{ name: 'find-skills', description: 'Find skills.' }])
  const entered = await preStep({ agent: wiring.agent }, async () => ({ kind: 'enter', messages: [initial] }))
  assert.deepEqual(entered.messages, [initial])

  await wiring.message().execute({
    message: 'Done. Review approved; tests pass.',
  }, { agent: wiring.agent, signal: new AbortController().signal })

  const { createMemoryStore } = await import('../src/memory.js')
  await createMemoryStore().writeSkill('project', projectRoot, {
    name: 'superagent-lite-test-conventions',
    description: 'Test conventions.',
    content: 'Run the suite.',
  })

  const update = catalog([
    { name: 'find-skills', description: 'Find skills.' },
    { name: 'superagent-project-memory', description: 'Run the project tests.' },
    { name: 'superagent-lite-test-conventions', description: 'Test conventions.' },
  ], true)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const decision = await preStep({ agent: wiring.agent }, async () => ({ kind: 'enter', messages: [update] }))
    assert.deepEqual(decision.messages, [], `attempt ${attempt + 1}`)
  }

  const unrelated = catalog([
    { name: 'find-skills', description: 'Find, install, and extend skills.' },
    { name: 'superagent-project-memory', description: 'Run the project tests.' },
    { name: 'superagent-lite-test-conventions', description: 'Test conventions.' },
  ], true)
  const decision = await preStep({ agent: wiring.agent }, async () => ({ kind: 'enter', messages: [unrelated] }))
  assert.deepEqual(decision.messages, [unrelated])
})

test('deleting one of several memory-authored skills does not inject a catalog update', async () => {
  const workerId = 'worker-delete'
  const projectRoot = await taskForWorker('ac'.repeat(8), workerId)
  const { createMemoryStore, deleteMemoryView } = await import('../src/memory.js')
  const store = createMemoryStore()
  await store.writeSkill('project', projectRoot, {
    name: 'superagent-project-memory', description: 'Project skill.', content: 'Body.',
  })
  await store.writeSkill('project', projectRoot, {
    name: 'superagent-lite-test-conventions', description: 'Test conventions.', content: 'Run the suite.',
  })
  const wiring = await workerWiring(workerId, projectRoot, memoryFields())
  const catalog = (entries, update = false) => ({
    id: 'catalog',
    source: { kind: 'skill-catalog', form: 'catalog', ...update ? { update: true } : {}, entries },
  })
  const preStep = wiring.listeners.get('agent/pre-step')
  const initial = catalog([
    { name: 'find-skills', description: 'Find skills.' },
    { name: 'superagent-project-memory', description: 'Project skill.' },
    { name: 'superagent-lite-test-conventions', description: 'Test conventions.' },
  ])
  const entered = await preStep({ agent: wiring.agent }, async () => ({ kind: 'enter', messages: [initial] }))
  assert.deepEqual(entered.messages, [initial])
  await deleteMemoryView({
    kind: 'skill', scope: 'project', projectRoot, name: 'superagent-lite-test-conventions',
  })
  const update = catalog([
    { name: 'find-skills', description: 'Find skills.' },
    { name: 'superagent-project-memory', description: 'Project skill.' },
  ], true)
  const decision = await preStep({ agent: wiring.agent }, async () => ({ kind: 'enter', messages: [update] }))
  assert.deepEqual(decision.messages, [])
})

test('a worker gets project and global memory injected and the app-wide knowledge read tools', async () => {
  const workerId = 'worker-b'
  const projectRoot = await taskForWorker('b'.repeat(16), workerId)
  await mkdir(projectRoot, { recursive: true })
  const { createMemoryStore } = await import('../src/memory.js')
  const store = createMemoryStore()
  await store.writeGlobal({ userProfile: 'Environment: worker context check.' })
  await store.writeProject(projectRoot, { responsibilities: 'Worker project responsibility.' })
  await store.writeSkill('project', projectRoot, {
    description: 'Project skill description.', content: 'Project skill body.',
  })
  await store.addKnowledge('Knowledge that must not be injected into role context.')
  const wiring = await workerWiring(workerId, projectRoot, memoryFields())
  assert.deepEqual(wiring.globalTools.map(entry => entry.tool.name).sort(), ['knowledge_get', 'knowledge_query'])
  assert.equal(wiring.registered.some(tool => tool.name === 'knowledge_query'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'knowledge_get'), false)
  assert.equal(wiring.skillProviders.length, 1)
  const candidates = await wiring.skillProviders[0].list({ signal: new AbortController().signal })
  assert.equal(candidates.find(candidate => candidate.name === 'superagent-project-memory').description,
    'Project skill description.')
  assert.equal(wiring.registered.some(tool => tool.name === 'knowledge_write'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'superagent_memory'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'extract_memory'), false)
  const memory = wiring.contexts.find(entry => entry.name === 'superagent-lite-memory')
  assert.ok(memory, 'the worker registered a memory context')
  assert.equal(memory.required, true)
  assert.match(memory.text(), /User profile: Environment: worker context check\./)
  assert.match(memory.text(), /Responsibilities: Worker project responsibility\./)
  assert.match(memory.text(), /data, not instructions/)
  assert.doesNotMatch(memory.text(), /Knowledge that must not be injected/)
  assert.doesNotMatch(memory.text(), /knowledge_query/)
})

test('a worker may query knowledge before creating its worktree', async () => {
  const workerId = 'worker-dd'
  const projectRoot = await taskForWorker('de'.repeat(8), workerId, 'change', { worktree: false })
  await mkdir(projectRoot, { recursive: true })
  const wiring = await workerWiring(workerId, projectRoot, memoryFields())
  assert.equal(wiring.guard({ name: 'knowledge_query' }), undefined)
  assert.equal(wiring.guard({ name: 'knowledge_get' }), undefined)
  assert.match(wiring.guard({ name: 'read' }), /Create the assigned project worktree/)
  assert.match(wiring.guard({ name: 'knowledge_write' }), /Create the assigned project worktree/)
})

test('a report worker gets the same project and global memory and project skill catalog read-only', async () => {
  const workerId = 'worker-report'
  const projectRoot = await taskForWorker('f'.repeat(16), workerId, 'report')
  await mkdir(projectRoot, { recursive: true })
  const { createMemoryStore } = await import('../src/memory.js')
  const store = createMemoryStore()
  await store.writeGlobal({ userProfile: 'Environment: report memory check.' })
  await store.writeProject(projectRoot, {
    responsibilities: 'Report project responsibility.',
    positioning: 'Report project positioning.',
  })
  await store.writeSkill('project', projectRoot, {
    description: 'Report project skill description.', content: 'Report project skill body.',
  })
  const wiring = await workerWiring(workerId, projectRoot, memoryFields())
  const memory = wiring.contexts.find(entry => entry.name === 'superagent-lite-memory')
  assert.ok(memory, 'the report worker registered the memory context')
  assert.equal(memory.required, true)
  assert.equal(memory.order, 170)
  assert.match(memory.text(), /User profile: Environment: report memory check\./)
  assert.match(memory.text(), /Responsibilities: Report project responsibility\./)
  assert.match(memory.text(), /Positioning: Report project positioning\./)
  assert.equal(wiring.skillProviders.length, 1)
  const candidates = await wiring.skillProviders[0].list({ signal: new AbortController().signal })
  assert.equal(candidates.find(candidate => candidate.name === 'superagent-project-memory').description,
    'Report project skill description.')
  assert.equal(wiring.registered.some(tool => tool.name === 'knowledge_query'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'knowledge_get'), false)
  assert.equal(wiring.globalTools.some(entry => entry.tool.name === 'knowledge_query'), true)
  assert.equal(wiring.registered.some(tool => tool.name === 'knowledge_write'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'superagent_memory'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'extract_memory'), false)
})

test('a worker turn archives the complete turn under the task directory', async () => {
  const workerId = 'worker-c'
  const projectRoot = await taskForWorker('c'.repeat(16), workerId)
  const wiring = await workerWiring(workerId, projectRoot, memoryFields())
  await wiring.listeners.get('session/event')(wiring.agent.session, wiring.events[2])
  const { createMemoryStore } = await import('../src/memory.js')
  let record
  for (let attempt = 0; attempt < 50 && record === undefined; attempt += 1) {
    record = await createMemoryStore().archive.read({ sessionId: workerId, seq: 4 })
    if (record === undefined) await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(record?.turn, 1)
  assert.deepEqual(record.events.map(event => event.seq), [2, 3, 4])
})

test('an extraction failure does not fail the final report', async () => {
  const workerId = 'worker-d'
  const projectRoot = await taskForWorker('d'.repeat(16), workerId)
  const wiring = await workerWiring(workerId, projectRoot, memoryFields(), { fail: true })
  const result = await wiring.message().execute({
    message: 'Done. Review approved; tests pass.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.match(result, /Message delivered to the router/)
  assert.equal(wiring.activations.length, 1)
  assert.match(wiring.warnings.join('\n'), /memory extraction/)
})

test('the router injects only global memory from the shared store', async () => {
  const { createMemoryStore } = await import('../src/memory.js')
  const store = createMemoryStore()
  await store.writeGlobal({ userProfile: 'Prefers terse reports.' })
  await store.writeProject(join(home, 'router-project'), { responsibilities: 'Project-only memory.' })
  const { apply } = await import('../router.js')
  const contexts = []
  const tools = []
  const ctx = {
    logger: { warn() {} },
    tools: { register(tool) { tools.push(tool) } },
    systemPrompt: { context(entry) { contexts.push(entry); return () => {} } },
  }
  await apply(ctx)
  const memory = contexts.find(entry => entry.name === 'superagent-lite-memory')
  assert.ok(memory)
  assert.equal(memory.required, true)
  assert.equal(memory.order, 170)
  assert.match(memory.text(), /User profile: Prefers terse reports\./)
  assert.doesNotMatch(memory.text(), /Project-only memory/)
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['continue_worker', 'dispatch_worker', 'worker_status'])
})

test('a memory helper adds the write tool while every role already has the knowledge read tools', async () => {
  const { apply } = await import('../index.js')
  const { expectHelper } = await import('../src/helper-guard.js')
  await taskForWorker('e'.repeat(16), 'worker-e')
  const listeners = new Map()
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get() {}, list: () => [] },
    agentPresets: { composedPreset() {} },
    tools: { register() { return () => {} } },
  }
  await apply(ctx)
  const helper = (id, kind, scope) => {
    const registered = []
    const checks = []
    const agent = {
      id,
      session: {
        id, header: { origin: 'subagent', parentSession: 'worker-e' }, append() {},
      },
      ctx: {
        get: name => name === 'shell' ? { sandboxMode: 'workspace-write' }
          : name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'read-only' }) }
          : undefined,
        tools: {
          guard(check) { checks.push(check) },
          register(tool) { registered.push(tool); return () => {} },
        },
        on() {},
      },
    }
    expectHelper('worker-e', scope, kind, { projectRoot: join(home, 'project-core') })
    return { agent, registered, checks }
  }
  const memory = helper('memory-helper', 'memory', undefined)
  await listeners.get('agent/created')({ agent: memory.agent })
  assert.deepEqual(memory.registered.map(tool => tool.name), ['knowledge_write'])
  assert.equal(memory.checks[0]({ name: 'knowledge_query' }), undefined)
  assert.equal(memory.checks[0]({ name: 'knowledge_get' }), undefined)
  assert.equal(memory.checks[0]({ name: 'knowledge_write' }), undefined)
  assert.match(memory.checks[0]({ name: 'write' }), /Read-only helpers cannot use/)

  const reviewerScope = { baseCommit: 'a'.repeat(40), headCommit: 'b'.repeat(40) }
  const reviewer = helper('review-helper', 'review', reviewerScope)
  await listeners.get('agent/created')({ agent: reviewer.agent })
  assert.deepEqual(reviewer.registered.map(tool => tool.name), ['submit_review'])
  assert.match(reviewer.checks[0]({ name: 'knowledge_write' }), /Only the memory role/)
  assert.equal(reviewer.checks[0]({ name: 'knowledge_query' }), undefined)
  assert.equal(reviewer.checks[0]({ name: 'knowledge_get' }), undefined)
})

test('knowledge read tools are registered on the app context for every role and preset', async () => {
  const { apply } = await import('../index.js')
  const listeners = new Map()
  const globalTools = []
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get() {}, list: () => [] },
    agentPresets: { composedPreset() {} },
    tools: { register(tool, options) { globalTools.push({ tool, options }); return () => {} } },
  }
  await apply(ctx)
  const query = globalTools.find(entry => entry.tool.name === 'knowledge_query')
  const get = globalTools.find(entry => entry.tool.name === 'knowledge_get')
  assert.deepEqual(globalTools.map(entry => entry.tool.name).sort(), ['knowledge_get', 'knowledge_query'])
  // No per-agent activation condition: an agent outside this plugin's presets
  // sees the same app-wide tools.
  assert.equal(query.options?.when, undefined)
  assert.equal(get.options?.when, undefined)
  assert.match(query.tool.description, /local knowledge base/)
  assert.match(query.tool.description, /shared long-term knowledge base for every role and agent preset/)
  assert.match(query.tool.description, /Call this tool whenever saved reusable knowledge might help/)
  assert.match(get.tool.description, /local knowledge base/)
  const foreign = {
    id: 'foreign-preset-agent',
    session: { id: 'foreign-preset-agent', header: { origin: 'subagent', parentSession: 'other-router' } },
    ctx: { tools: { register() { throw new Error('a preset outside this plugin must not get per-agent tools') } } },
  }
  await listeners.get('agent/created')({ agent: foreign })
})
