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

test('mode defaults to change and accepts report', () => {
  const args = { delegate: true, teamId: 'team', title: 't', task: 'do it' }
  assert.equal(validateDispatchArguments(args).mode, 'change')
  assert.equal(validateDispatchArguments({ ...args, mode: 'report' }).mode, 'report')
  assert.throws(() => validateDispatchArguments({ ...args, mode: 'docs' }), /mode/)
})

test('land defaults to false, accepts true, and rejects other values or report tasks', () => {
  const args = { delegate: true, teamId: 'team', title: 't', task: 'do it' }
  assert.equal(validateDispatchArguments(args).land, false)
  assert.equal(validateDispatchArguments({ ...args, land: true }).land, true)
  assert.throws(() => validateDispatchArguments({ ...args, land: 'yes' }), /land/)
  assert.throws(() => validateDispatchArguments({ ...args, land: true, mode: 'report' }), /report-only tasks cannot be authorized to land/)
})
