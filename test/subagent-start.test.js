import assert from 'node:assert/strict'
import test from 'node:test'
import { activationSpec } from '../src/subagent-start.js'

const spec = {
  provider: 'spawn',
  parent: { id: 'router' },
  cwd: '/repo',
  label: 'worker',
  childId: 'worker',
  prompt: [{ type: 'text', text: 'task' }],
  promptSource: { kind: 'agent-message', form: 'relay', senderSessionId: 'router' },
  agentOptions: { model: 'm' },
  maxDepth: 1,
  signal: new AbortController().signal,
  delivery: 'parent',
}

test('0.2.2-rc.2 and later receive the flat activation spec unchanged', () => {
  const subagents = { startActivation: async () => {}, namesOf() {} }
  assert.equal(activationSpec(subagents, spec), spec)
  assert.equal(activationSpec(undefined, spec), spec)
})

test('0.2.2-rc.1 receives the nested request shape', () => {
  const subagents = { startActivation: async () => {}, drainChildren: async () => {} }
  const { provider, label, childId, signal, delivery, ...request } = spec
  assert.deepEqual(activationSpec(subagents, spec), { provider, label, childId, signal, delivery, request })
})
