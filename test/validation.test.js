import assert from 'node:assert/strict'
import test from 'node:test'
import { validateDispatchArguments } from '../src/validation.js'

test('mode=answer answers directly and needs no title, team, task, or reason', () => {
  assert.deepEqual(validateDispatchArguments({ mode: 'answer' }), { delegate: false, mode: 'answer' })
  assert.deepEqual(validateDispatchArguments({ mode: 'answer', title: 'ignored' }), { delegate: false, mode: 'answer' })
})

test('mode is required and limited to change, report, answer, and merge', () => {
  assert.throws(() => validateDispatchArguments({}), /mode/)
  assert.throws(() => validateDispatchArguments({ delegate: false, reason: 'old interface' }), /mode/)
  assert.throws(() => validateDispatchArguments({ mode: 'docs' }), /mode/)
})

test('change and report require title, team and task', () => {
  for (const mode of ['change', 'report']) {
    assert.throws(() => validateDispatchArguments({ mode, teamId: 'team', task: 'do it' }), /title/)
    assert.throws(() => validateDispatchArguments({ mode, title: 't', task: 'do it' }), /teamId/)
    assert.throws(() => validateDispatchArguments({ mode, teamId: 'bad team', title: 't', task: 'do it' }), /teamId/)
    assert.throws(() => validateDispatchArguments({ mode, teamId: 'team', title: 't' }), /task/)
  }
})

test('change and report keep their mode and trim the task text', () => {
  const args = { teamId: 'team', title: ' t ', task: ' do it ' }
  assert.deepEqual(validateDispatchArguments({ ...args, mode: 'change', worktreeName: ' fix-plan-color ' }), {
    delegate: true,
    title: 't',
    teamId: 'team',
    task: 'do it',
    mode: 'change',
    land: false,
    worktreeName: 'fix-plan-color',
  })
  assert.equal(validateDispatchArguments({ ...args, mode: 'report' }).mode, 'report')
})

test('change and merge require a readable English worktree name', () => {
  const args = { teamId: 'team', title: 't', task: 'do it' }
  for (const mode of ['change', 'merge']) {
    assert.throws(() => validateDispatchArguments({ ...args, mode }), /worktreeName is required/)
    assert.throws(() => validateDispatchArguments({ ...args, mode, worktreeName: '' }), /worktreeName must be/)
    assert.throws(() => validateDispatchArguments({ ...args, mode, worktreeName: 'Fix Plan' }), /worktreeName must be/)
    assert.throws(() => validateDispatchArguments({ ...args, mode, worktreeName: 'fix--plan' }), /worktreeName must be/)
    assert.throws(() => validateDispatchArguments({ ...args, mode, worktreeName: '修复计划' }), /worktreeName must be/)
    assert.throws(() => validateDispatchArguments({ ...args, mode, worktreeName: 'fix-plan-color-and-more' }), /worktreeName must be/)
    assert.throws(() => validateDispatchArguments({ ...args, mode, worktreeName: 'a'.repeat(33) }), /worktreeName must be/)
  }
  assert.equal(validateDispatchArguments({ ...args, mode: 'merge', land: true, worktreeName: 'merge-branches', branches: ['sl-one'] }).worktreeName, 'merge-branches')
  assert.throws(
    () => validateDispatchArguments({ ...args, mode: 'report', worktreeName: 'fix-plan-color' }),
    /worktreeName is only accepted for change and merge/,
  )
})

test('land defaults to false, accepts true, and rejects other values or report tasks', () => {
  const args = { mode: 'change', worktreeName: 'change-notes', teamId: 'team', title: 't', task: 'do it' }
  assert.equal(validateDispatchArguments(args).land, false)
  assert.equal(validateDispatchArguments({ ...args, land: true }).land, true)
  assert.throws(() => validateDispatchArguments({ ...args, land: 'yes' }), /land/)
  assert.throws(
    () => validateDispatchArguments({ mode: 'report', teamId: 'team', title: 't', task: 'do it', land: true }),
    /report-only tasks cannot be authorized to land/,
  )
})

test('merge dispatches require land, targets, and keep branches in order without duplicates', () => {
  const args = { mode: 'merge', teamId: 'team', title: 'Merge branches', worktreeName: 'merge-branches', task: 'merge these', land: true }
  assert.throws(() => validateDispatchArguments({ ...args, land: false }), /merge tasks require land=true/)
  assert.throws(() => validateDispatchArguments({ ...args, branches: [] }), /branches/)
  assert.throws(() => validateDispatchArguments({ ...args, branches: ['bad branch'] }), /merge target/)
  assert.throws(() => validateDispatchArguments({ ...args, branches: ['-bad'] }), /merge target/)
  assert.deepEqual(validateDispatchArguments({
    ...args,
    branches: ['sl-one', 'a4939a132f499bb4', 'sl-one'],
  }).branches, ['sl-one', 'a4939a132f499bb4'])
  assert.throws(() => validateDispatchArguments({ ...args, mode: 'change', branches: ['sl-one'] }), /only accepted for merge/)
})
