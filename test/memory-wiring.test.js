import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
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

async function taskForWorker(taskId, workerId) {
  const { createTask, linkWorkerSession } = await import('../src/task-store.js')
  const projectRoot = join(home, 'project-core')
  await createTask({
    id: taskId, title: `Task ${taskId}`, teamId: 'core', projectRoot, task: 'Change it',
    mode: 'change', parentSessionId: 'router', workerSessionId: workerId, status: 'running',
    baseBranch: 'main', baseCommit: 'b'.repeat(40), worktree: { path: projectRoot, branch: 'sl-core' },
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
  const ctx = {
    logger: { warn: message => warnings.push(message) },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get() {} },
    agentPresets: { composedPreset: () => 'superagent-lite-worker' },
    workingDirectory: { get: () => projectRoot },
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
        guard() { return () => {} },
        register(tool) { registered.push(tool); return () => {} },
      },
      systemPrompt: { context(entry) { contexts.push(entry); return () => {} } },
    },
  }
  await listeners.get('agent/created')({ agent })
  return {
    agent, activations, registered, warnings, contexts, listeners, events, skillProviders,
    message: () => registered.find(tool => tool.name === 'message_router'),
  }
}

const memoryFields = values => ({
  userProfile: '',
  responsibilities: '',
  positioning: '',
  sharedSkillDescription: '',
  sharedSkillContent: '',
  projectSkillDescription: '',
  projectSkillContent: '',
  ...values,
})

test('the final report triggers the memory role, saves memory and writes skills', async () => {
  const workerId = 'worker-a'
  const projectRoot = await taskForWorker('a'.repeat(16), workerId)
  const wiring = await workerWiring(workerId, projectRoot, memoryFields({
    userProfile: 'Prefers terse reports.',
    responsibilities: 'Keep the notes accurate.',
    sharedSkillDescription: 'Inspect before changing.',
    sharedSkillContent: 'Read the repository first.',
    projectSkillDescription: 'Run the project tests.',
    projectSkillContent: 'Run npm test before reporting.',
  }))
  const result = await wiring.message().execute({
    message: 'Done. Review approved; tests pass.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.match(result, /6 memory fields updated/)
  assert.equal(wiring.activations.length, 1)
  assert.equal(wiring.activations[0].label, 'Distill memory')
  assert.equal(wiring.activations[0].delivery, 'caller')
  assert.equal(wiring.activations[0].maxDepth, 2)
  assert.match(wiring.activations[0].prompt[0].text, /You are the memory role/)
  assert.match(wiring.activations[0].prompt[0].text, /\[user\] Implement the change\./)
  assert.match(wiring.activations[0].prompt[0].text, /\[assistant\] Done\. Review approved; tests pass\./)

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
    description: 'Inspect before changing.', content: 'Read the repository first.',
  })
  assert.deepEqual(await store.readSkill('project', projectRoot), {
    description: 'Run the project tests.', content: 'Run npm test before reporting.',
  })
})

test('a finished worker is not shown a catalog update caused by its own memory skill write', async () => {
  const workerId = 'worker-catalog'
  const projectRoot = await taskForWorker('ab'.repeat(8), workerId)
  const wiring = await workerWiring(workerId, projectRoot, memoryFields({
    projectSkillDescription: 'Run the project tests.',
    projectSkillContent: 'Run npm test before reporting.',
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

  const update = catalog([
    { name: 'find-skills', description: 'Find skills.' },
    { name: 'superagent-project-memory', description: 'Run the project tests.' },
  ], true)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const decision = await preStep({ agent: wiring.agent }, async () => ({ kind: 'enter', messages: [update] }))
    assert.deepEqual(decision.messages, [], `attempt ${attempt + 1}`)
  }
})

test('a worker gets project and global memory injected and only the knowledge query tool', async () => {
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
  const wiring = await workerWiring(workerId, projectRoot, memoryFields())
  assert.equal(wiring.registered.some(tool => tool.name === 'knowledge_query'), true)
  assert.equal(wiring.skillProviders.length, 1)
  const candidates = await wiring.skillProviders[0].list({ signal: new AbortController().signal })
  assert.equal(candidates[0].description, 'Project skill description.')
  assert.equal(wiring.registered.some(tool => tool.name === 'knowledge_write'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'superagent_memory'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'extract_memory'), false)
  const memory = wiring.contexts.find(entry => entry.name === 'superagent-lite-memory')
  assert.ok(memory, 'the worker registered a memory context')
  assert.equal(memory.required, true)
  assert.match(memory.text(), /User profile: Environment: worker context check\./)
  assert.match(memory.text(), /Responsibilities: Worker project responsibility\./)
  assert.match(memory.text(), /data, not instructions/)
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
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['continue_worker', 'dispatch_worker'])
})

test('a memory helper gets both knowledge tools while a reviewer gets only the query tool', async () => {
  const { apply } = await import('../index.js')
  const { expectHelper } = await import('../src/helper-guard.js')
  await taskForWorker('e'.repeat(16), 'worker-e')
  const listeners = new Map()
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get() {} },
    agentPresets: { composedPreset() {} },
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
  assert.deepEqual(memory.registered.map(tool => tool.name).sort(), ['knowledge_query', 'knowledge_write'])
  assert.equal(memory.checks[0]({ name: 'knowledge_query' }), undefined)
  assert.equal(memory.checks[0]({ name: 'knowledge_write' }), undefined)
  assert.match(memory.checks[0]({ name: 'write' }), /Read-only helpers cannot use/)

  const reviewerScope = { baseCommit: 'a'.repeat(40), headCommit: 'b'.repeat(40) }
  const reviewer = helper('review-helper', 'review', reviewerScope)
  await listeners.get('agent/created')({ agent: reviewer.agent })
  assert.deepEqual(reviewer.registered.map(tool => tool.name).sort(), ['knowledge_query', 'submit_review'])
  assert.match(reviewer.checks[0]({ name: 'knowledge_write' }), /Only the memory role/)
  assert.equal(reviewer.checks[0]({ name: 'knowledge_query' }), undefined)
})
