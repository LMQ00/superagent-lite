import assert from 'node:assert/strict'
import test from 'node:test'
import { createDispatchGuard } from '../src/turn-guard.js'

function fixture(preset = 'superagent-lite') {
  const session = { id: 'session-1' }
  const followups = []
  const agent = { followup: message => followups.push(message) }
  const ctx = {
    agents: { get: id => id === session.id ? agent : undefined },
    agentPresets: { composedPreset: () => preset },
  }
  const guard = createDispatchGuard(ctx)
  const event = (type, data) => ({ type, data })
  return { guard, session, followups, event }
}

const input = { type: 'user/message', data: { source: { kind: 'user' } } }
const call = turn => ({ type: 'tool/call', data: { turn, step: 1, callId: `call-${turn}`, name: 'dispatch_worker', arguments: '{}' } })
const result = (turn, isError = false) => ({ type: 'tool/result', data: { turn, step: 1, message: { role: 'tool', toolCallId: `call-${turn}`, isError } } })
const end = (turn, kind = 'completed') => ({ type: 'turn/end', data: { turn, reason: { kind } } })

test('a user input followed by a successful dispatch decision is accepted', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, call(1))
  guard.onEvent(session, result(1))
  guard.onEvent(session, end(1))
  assert.equal(followups.length, 0)
})

test('a user input answered without a decision is reopened with one reminder', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, end(1))
  assert.equal(followups.length, 1)
  assert.equal(followups[0].role, 'user')
  assert.match(followups[0].content[0].text, /dispatch_worker/)
})

test('a failed dispatch call does not satisfy the requirement', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, call(2))
  guard.onEvent(session, result(2, true))
  guard.onEvent(session, end(2))
  assert.equal(followups.length, 1)
})

test('a turn without user input, an aborted turn, and another preset are left alone', () => {
  const unarmed = fixture()
  unarmed.guard.onEvent(unarmed.session, end(1))
  assert.equal(unarmed.followups.length, 0)
  const aborted = fixture()
  aborted.guard.onEvent(aborted.session, input)
  aborted.guard.onEvent(aborted.session, end(1, 'aborted'))
  assert.equal(aborted.followups.length, 0)
  const other = fixture('standard')
  other.guard.onEvent(other.session, input)
  other.guard.onEvent(other.session, end(1))
  assert.equal(other.followups.length, 0)
})

test('disposal drops the pending requirement and calls', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, call(1))
  guard.dispose(session.id)
  guard.onEvent(session, result(1))
  guard.onEvent(session, end(1))
  assert.equal(followups.length, 0)
})
