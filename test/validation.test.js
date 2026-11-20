import assert from 'node:assert/strict'
import test from 'node:test'
import { validateDispatchArguments } from '../src/validation.js'

test('delegate=false requires a non-empty reason', () => {
  assert.throws(() => validateDispatchArguments({ delegate: false }), /reason/)
  assert.throws(() => validateDispatchArguments({ delegate: false, reason: '   ' }), /reason/)
  assert.deepEqual(validateDispatchArguments({ delegate: false, reason: ' read-only question ' }), {
    delegate: false,
    reason: 'read-only question',
  })
})

test('delegate=true requires title, team and task', () => {
  assert.throws(() => validateDispatchArguments({ delegate: true, teamId: 'team', task: 'do it' }), /title/)
  assert.throws(() => validateDispatchArguments({ delegate: true, teamId: 'bad team', title: 't', task: 'do it' }), /teamId/)
})
