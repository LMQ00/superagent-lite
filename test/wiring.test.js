import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-wiring-'))
process.env.HOME = home

test('apply wires turn/end into a reminder delivered on agent idle', async (t) => {
  t.after(() => rm(home, { recursive: true, force: true }))
  const { apply } = await import('../index.js')
  const listeners = new Map()
  const followups = []
  const agent = {
    id: 'router',
    session: { id: 'router' },
    followup: message => followups.push(message),
  }
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get: id => id === agent.id ? agent : undefined },
    agentPresets: { composedPreset: () => 'superagent-lite' },
  }
  await apply(ctx)
  const emit = (name, ...args) => listeners.get(name)(...args)

  emit('session/event', agent.session, { type: 'user/message', data: { id: 'input', source: { kind: 'user' } } })
  emit('session/event', agent.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  assert.equal(followups.length, 0)
  emit('agent/status', { agent, status: 'running' })
  assert.equal(followups.length, 0)
  emit('agent/status', { agent, status: 'idle' })
  assert.equal(followups.length, 1)
  assert.match(followups[0].content[0].text, /dispatch_worker/)
})

test('apply reclaims a stale running record without a live worker', async () => {
  const { createTask, listTasks, readTask } = await import('../src/task-store.js')
  const { STALE_ACTIVE_MS } = await import('../src/launch-queue.js')
  const stale = new Date(Date.now() - STALE_ACTIVE_MS - 60_000).toISOString()
  const task = {
    id: 'abcdefabcdefabcd', title: 'Lost worker', teamId: 'team', task: 'Do the work',
    mode: 'change', git: false, parentSessionId: 'router', projectRoot: home,
    workerSessionId: 'lost-worker', status: 'running', createdAt: stale, updatedAt: stale,
  }
  assert.equal(await createTask(task), true)
  const { apply } = await import('../index.js')
  const listeners = new Map()
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get: () => undefined },
    agentPresets: { composedPreset: () => 'superagent-lite' },
  }

  await apply(ctx)

  let record
  for (let attempt = 0; attempt < 100; attempt += 1) {
    record = await readTask(task.id)
    if (record.status !== 'running') break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(record.status, 'failed')
  assert.match(record.failure, /without a turn\/end/)
  assert.equal((await listTasks()).length, 1)
})
