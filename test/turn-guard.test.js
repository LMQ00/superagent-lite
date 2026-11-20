import assert from 'node:assert/strict'
import test from 'node:test'
import { createDispatchGuard } from '../src/turn-guard.js'

function fixture(preset = 'superagent-lite') {
  const session = { id: 'session-1' }
  const followups = []
  const agent = { id: session.id, followup: message => followups.push(message) }
  const ctx = {
    agents: { get: id => id === session.id ? agent : undefined },
    agentPresets: { composedPreset: () => preset },
  }
  const guard = createDispatchGuard(ctx)
  const event = (type, data) => ({ type, data })
  return { guard, session, followups, event }
}

const input = { type: 'user/message', data: { id: 'input-1', source: { kind: 'user' } } }
const call = (turn, name = 'dispatch_worker') => ({ type: 'tool/call', data: { turn, step: 1, callId: `${name}-${turn}`, name, arguments: '{}' } })
const result = (turn, name = 'dispatch_worker', isError = false) => ({ type: 'tool/result', data: { turn, step: 1, message: { role: 'tool', toolCallId: `${name}-${turn}`, isError } } })
const end = (turn, kind = 'completed') => ({ type: 'turn/end', data: { turn, reason: { kind } } })

test('a user input followed by a successful dispatch decision is accepted', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, call(1))
  guard.onEvent(session, result(1))
  guard.onEvent(session, end(1))
  guard.onIdle(session.id)
  assert.equal(followups.length, 0)
})

test('a follow-up continued on an existing task is a decision too', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, call(1, 'continue_worker'))
  guard.onEvent(session, result(1, 'continue_worker'))
  guard.onEvent(session, end(1))
  guard.onIdle(session.id)
  assert.equal(followups.length, 0)
})

test('a completed turn without a decision is reopened once the agent is idle', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, end(1))
  assert.equal(followups.length, 0, 'the reminder must not append inside the turn/end publication')
  guard.onIdle(session.id)
  assert.equal(followups.length, 1)
  assert.equal(followups[0].role, 'user')
  assert.match(followups[0].content[0].text, /dispatch_worker/)
  assert.match(followups[0].content[0].text, /continue_worker/)
  assert.equal(followups[0].source.kind, 'user')
})

test('the reminder is delivered once and does not arm itself again', () => {
  const { guard, session, followups, event } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, end(1))
  guard.onIdle(session.id)
  guard.onEvent(session, event('user/message', { id: followups[0].id, source: { kind: 'user' } }))
  guard.onEvent(session, end(2))
  guard.onIdle(session.id)
  assert.equal(followups.length, 1)
})

test('each new user input needs its own decision', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, call(1))
  guard.onEvent(session, result(1))
  guard.onEvent(session, end(1))
  guard.onIdle(session.id)
  guard.onEvent(session, input)
  guard.onEvent(session, end(2))
  guard.onIdle(session.id)
  assert.equal(followups.length, 1)
})

test('a failed decision does not satisfy the requirement', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, call(2))
  guard.onEvent(session, result(2, 'dispatch_worker', true))
  guard.onEvent(session, end(2))
  guard.onIdle(session.id)
  assert.equal(followups.length, 1)
})

test('a failed continue_worker does not satisfy a follow-up either', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, call(3, 'continue_worker'))
  guard.onEvent(session, result(3, 'continue_worker', true))
  guard.onEvent(session, end(3))
  guard.onIdle(session.id)
  assert.equal(followups.length, 1)
})

test('a turn without user input, an aborted turn, and another preset are left alone', () => {
  const unarmed = fixture()
  unarmed.guard.onEvent(unarmed.session, end(1))
  unarmed.guard.onIdle(unarmed.session.id)
  assert.equal(unarmed.followups.length, 0)
  const aborted = fixture()
  aborted.guard.onEvent(aborted.session, input)
  aborted.guard.onEvent(aborted.session, end(1, 'aborted'))
  aborted.guard.onIdle(aborted.session.id)
  assert.equal(aborted.followups.length, 0)
  const other = fixture('standard')
  other.guard.onEvent(other.session, input)
  other.guard.onEvent(other.session, end(1))
  other.guard.onIdle(other.session.id)
  assert.equal(other.followups.length, 0)
})

test('disposal drops the pending requirement and calls', () => {
  const { guard, session, followups } = fixture()
  guard.onEvent(session, input)
  guard.onEvent(session, call(1))
  guard.dispose(session.id)
  guard.onEvent(session, result(1))
  guard.onEvent(session, end(1))
  guard.onIdle(session.id)
  assert.equal(followups.length, 0)
})
