import assert from 'node:assert/strict'
import test from 'node:test'
import { claimHelper, clearHelperExpectation, expectHelper, registerReadOnlyGuard } from '../src/helper-guard.js'

function registerHelper({ shell = { sandboxMode: 'workspace-write' } } = {}) {
  const appends = []
  let check
  registerReadOnlyGuard({
    session: { append: (...args) => { appends.push(args) } },
    ctx: {
      get: name => name === 'shell' ? shell : undefined,
      tools: { guard(fn) { check = fn } },
    },
  })
  return { appends, check: execution => check(execution) }
}

test('only an expected child is claimed as a helper', () => {
  assert.equal(claimHelper('parent'), false)
  expectHelper('parent')
  assert.equal(claimHelper('parent'), true)
  assert.equal(claimHelper('parent'), false)
})

test('nested expectations survive one claim and clear together', () => {
  expectHelper('parent')
  expectHelper('parent')
  assert.equal(claimHelper('parent'), true)
  assert.equal(claimHelper('parent'), true)
  assert.equal(claimHelper('parent'), false)
  expectHelper('parent')
  clearHelperExpectation('parent')
  assert.equal(claimHelper('parent'), false)
})

test('the helper guard allows read-only inspection and confines its shell', () => {
  const { appends, check } = registerHelper()
  assert.deepEqual(appends, [['sandbox/mode', { mode: 'read-only', source: 'delegation' }]])
  for (const name of [
    'structured_output', 'read', 'read_image', 'glob', 'grep', 'bash', 'pwsh',
    'read_page', 'web_fetch', 'web_search', 'x_search', 'skill', 'todo_write',
    'working_directory', 'job_output', 'job_list',
  ]) {
    assert.equal(check({ name }), undefined, name)
  }
  for (const name of [
    'write', 'edit', 'create_worktree', 'review_worker_commit', 'message_router',
    'superagent_memory', 'extract_team_memory', 'subagent', 'job_kill', 'present',
  ]) {
    assert.match(check({ name }), /Read-only helpers cannot use/, name)
  }
})

test('the helper guard denies shell commands when nothing confines them', () => {
  const { appends, check } = registerHelper({ shell: null })
  assert.deepEqual(appends, [['sandbox/mode', { mode: 'read-only', source: 'delegation' }]])
  assert.equal(check({ name: 'read' }), undefined)
  assert.equal(check({ name: 'glob' }), undefined)
  assert.match(check({ name: 'bash' }), /does not confine shell file writes/)
  assert.match(check({ name: 'pwsh' }), /does not confine shell file writes/)
  assert.match(check({ name: 'write' }), /Read-only helpers cannot use/)
})
