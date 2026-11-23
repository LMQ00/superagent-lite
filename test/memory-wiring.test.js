import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const originalHome = process.env.HOME
const home = await mkdtemp(join(tmpdir(), 'superagent-lite-memory-wiring-'))
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

async function workerWiring(workerId, taskId, projectRoot, structured, { fail = false } = {}) {
  const { apply } = await import('../index.js')
  const listeners = new Map()
  const activations = []
  const registered = []
  const warnings = []
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
      systemPrompt: { context() { return () => {} } },
    },
  }
  await listeners.get('agent/created')({ agent })
  return {
    agent, activations, registered, warnings,
    message: () => registered.find(tool => tool.name === 'message_router'),
  }
}

test('the final report triggers the extractor role with the worker conversation and writes the returned categories', async () => {
  const taskId = 'a'.repeat(16)
  const workerId = 'worker-a'
  const projectRoot = await taskForWorker(taskId, workerId)
  const wiring = await workerWiring(workerId, taskId, projectRoot, {
    private: [], public: ['Reusable public fact.'], profile: ['Prefers terse reports.'], team: ['Reusable team fact.'],
  })
  const result = await wiring.message().execute({
    message: 'Done. Review approved; tests pass.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.match(result, /3 memory records saved/)
  assert.equal(wiring.activations.length, 1)
  assert.equal(wiring.activations[0].label, 'Distill memory')
  assert.equal(wiring.activations[0].delivery, 'caller')
  const prompt = wiring.activations[0].prompt[0].text
  assert.match(prompt, /You are the memory conversation/)
  assert.match(prompt, /\[user\] Implement the change\./)
  assert.match(prompt, /\[assistant\] Done\. Review approved; tests pass\./)
  const repeated = await wiring.message().execute({
    message: 'Done again.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.doesNotMatch(repeated, /memory record/)
  assert.equal(wiring.activations.length, 1)
  const { createMemoryPanel } = await import('../src/memory.js')
  const { records, injection } = await createMemoryPanel().list()
  const team = records.find(record => record.category === 'team' && record.content === 'Reusable team fact.')
  assert.equal(team.projectRoot, projectRoot)
  assert.equal(team.teamId, 'core')
  assert.equal(records.some(record => record.category === 'public' && record.content === 'Reusable public fact.'), true)
  assert.equal(records.some(record => record.category === 'profile' && record.content === 'Prefers terse reports.'), true)
  assert.ok(injection.profile.recordIds.length > 0)
})

test('the worker no longer gets an extract_memory tool that supplies findings', async () => {
  const taskId = 'c'.repeat(16)
  const workerId = 'worker-c'
  const projectRoot = await taskForWorker(taskId, workerId)
  const wiring = await workerWiring(workerId, taskId, projectRoot, {
    private: [], public: [], profile: [], team: [],
  })
  assert.equal(wiring.registered.some(tool => tool.name === 'extract_memory'), false)
  assert.equal(wiring.registered.some(tool => tool.name === 'superagent_memory'), true)
})

test('an extraction failure does not fail the final report', async () => {
  const taskId = 'd'.repeat(16)
  const workerId = 'worker-d'
  const projectRoot = await taskForWorker(taskId, workerId)
  const wiring = await workerWiring(workerId, taskId, projectRoot, { private: [], public: [], profile: [], team: [] }, { fail: true })
  const result = await wiring.message().execute({
    message: 'Done. Review approved; tests pass.',
  }, { agent: wiring.agent, signal: new AbortController().signal })
  assert.match(result, /Message delivered to the router/)
  assert.equal(wiring.activations.length, 1)
  assert.match(wiring.warnings.join('\n'), /memory extraction/)
})
