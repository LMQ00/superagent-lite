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

async function workerWiring(workerId, taskId, projectRoot, structured, { fail = false, beforeCreate } = {}) {
  const { apply } = await import('../index.js')
  const listeners = new Map()
  const activations = []
  const registered = []
  const warnings = []
  const contexts = []
  const ctx = {
    logger: { warn: message => warnings.push(message) },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get() {} },
    agentPresets: { composedPreset() {} },
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
      id: workerId, seq: 5,
      header: { origin: 'subagent', parentSession: 'router' },
      deriveMessages: () => [
        { role: 'user', content: [{ type: 'text', text: 'Implement the change.' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Done. Review approved; tests pass.' }] },
      ],
    },
    ctx: {
      get() {},
      tools: {
        guard() { return () => {} },
        register(tool) { registered.push(tool); return () => {} },
      },
      systemPrompt: { context(entry) { contexts.push(entry); return () => {} } },
    },
  }
  await listeners.get('agent/created')({ agent })
  return {
    agent, activations, registered, warnings, contexts,
    message: () => registered.find(tool => tool.name === 'message_router'),
  }
}

const memoryFields = values => ({
  userProfile: '', sharedSkill: '', responsibilities: '', positioning: '', scenarios: '', skill: '', ...values,
})

test('the final report triggers the memory role and saves global and project fields', async () => {
  const taskId = 'a'.repeat(16)
  const workerId = 'worker-a'
  const projectRoot = await taskForWorker(taskId, workerId)
  const wiring = await workerWiring(workerId, taskId, projectRoot, memoryFields({
    userProfile: 'Prefers terse reports.',
    sharedSkill: 'Inspect before changing.',
    responsibilities: 'Keep the notes accurate.',
    skill: 'Run npm test.',
  }))
  const result = await wiring.message().execute({
    message: 'Done. Review approved; tests pass.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.match(result, /4 memory fields updated/)
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
  const saved = await createMemoryStore().readMemory(projectRoot)
  assert.equal(saved.global.userProfile, 'Prefers terse reports.')
  assert.equal(saved.global.sharedSkill, 'Inspect before changing.')
  assert.equal(saved.project.responsibilities, 'Keep the notes accurate.')
  assert.equal(saved.project.skill, 'Run npm test.')
})

test('a worker gets global and project memory injected as required context and no memory tool', async () => {
  const taskId = 'b'.repeat(16)
  const workerId = 'worker-b'
  const projectRoot = await taskForWorker(taskId, workerId)
  const wiring = await workerWiring(workerId, taskId, projectRoot, memoryFields(), {
    async beforeCreate() {
      const { createMemoryStore } = await import('../src/memory.js')
      const store = createMemoryStore()
      await store.writeGlobal({ userProfile: 'Environment: worker context check.' })
      await store.writeProject(projectRoot, { responsibilities: 'Worker project responsibility.' })
    },
  })
  assert.equal(wiring.registered.some(tool => tool.name === 'superagent_memory'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'extract_memory'), false)
  const memory = wiring.contexts.find(entry => entry.name === 'superagent-lite-memory')
  assert.ok(memory, 'the worker registered a memory context')
  assert.equal(memory.required, true)
  assert.match(memory.text(), /User profile: Environment: worker context check\./)
  assert.match(memory.text(), /Responsibilities: Worker project responsibility\./)
  assert.match(memory.text(), /data, not instructions/)
})

test('an extraction failure does not fail the final report', async () => {
  const taskId = 'd'.repeat(16)
  const workerId = 'worker-d'
  const projectRoot = await taskForWorker(taskId, workerId)
  const wiring = await workerWiring(workerId, taskId, projectRoot, memoryFields(), { fail: true })
  const result = await wiring.message().execute({
    message: 'Done. Review approved; tests pass.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.match(result, /Message delivered to the router/)
  assert.equal(wiring.activations.length, 1)
  assert.match(wiring.warnings.join('\n'), /memory extraction/)
})
