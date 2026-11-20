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
