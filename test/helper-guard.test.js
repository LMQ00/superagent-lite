import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { claimHelper, clearHelperExpectation, expectHelper, registerReadOnlyGuard } from '../src/helper-guard.js'

const anchor = process.env.DSH_INSTALL_DIR

function registerHelper({ shell = { sandboxMode: 'workspace-write' }, policy } = {}) {
  const appends = []
  let mode = 'danger-full-access'
  let check
  const session = {
    append(type, data) {
      appends.push([type, data])
      if (type === 'sandbox/mode') mode = data.mode
    },
  }
  registerReadOnlyGuard({
    session,
    ctx: {
      get: name => name === 'shell' ? shell
        : name === 'sandboxPolicy' ? (policy ?? { resolve: () => ({ mode }) })
        : undefined,
      tools: { guard(fn) { check = fn } },
    },
  })
  return {
    appends,
    check: execution => check(execution),
    setMode: next => { mode = next },
  }
}

test('only an expected child is claimed as a helper', () => {
  assert.equal(claimHelper('parent'), false)
  expectHelper('parent')
  assert.deepEqual(claimHelper('parent'), { scope: undefined })
  assert.equal(claimHelper('parent'), false)
})

test('nested expectations survive one claim and clear together', () => {
  expectHelper('parent')
  expectHelper('parent')
  assert.deepEqual(claimHelper('parent'), { scope: undefined })
  assert.deepEqual(claimHelper('parent'), { scope: undefined })
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
    'read_page', 'web_fetch', 'web_search', 'x_search', 'job_output', 'job_list',
  ]) {
    assert.equal(check({ name }), undefined, name)
  }
  for (const name of [
    'write', 'edit', 'create_worktree', 'review_worker_commit', 'message_router',
    'superagent_memory', 'extract_team_memory', 'subagent', 'job_kill', 'present',
    'skill', 'todo_write', 'working_directory',
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

test('the helper guard denies shell commands when the read-only override is not effective', () => {
  const { check } = registerHelper({
    policy: { resolve: () => ({ mode: 'workspace-write' }) },
  })
  assert.equal(check({ name: 'read' }), undefined)
  assert.match(check({ name: 'bash' }), /does not confine shell file writes/)
})

test('the helper guard rechecks shell confinement for every call', () => {
  const { check, setMode } = registerHelper()
  assert.equal(check({ name: 'bash' }), undefined)
  setMode('danger-full-access')
  assert.match(check({ name: 'bash' }), /does not confine shell file writes/)
  assert.equal(check({ name: 'read' }), undefined)
})

test('the helper guard refuses sandbox escalation from a shell call', () => {
  const { check } = registerHelper()
  assert.match(check({ name: 'bash', arguments: { command: 'pwd', sandbox_permissions: 'danger-full-access' } }), /widen the sandbox/)
  assert.equal(check({ name: 'bash', arguments: { command: 'pwd' } }), undefined)
})

test('a real Session log accepts the helper read-only override', { skip: !anchor }, async () => {
  const require = createRequire(join(anchor, 'package.json'))
  const { Session } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session')).href)
  const session = Session.create('helper')
  let check
  registerReadOnlyGuard({
    session,
    ctx: {
      get: name => name === 'shell' ? { sandboxMode: 'workspace-write' }
        : name === 'sandboxPolicy' ? {
            resolve({ session }) {
              const events = session.snapshotEvents()
              return { mode: events.findLast(event => event.type === 'sandbox/mode')?.data.mode ?? 'danger-full-access' }
            },
          }
        : undefined,
      tools: { guard(fn) { check = fn } },
    },
  })
  assert.deepEqual(session.eventAt(0)?.data, { mode: 'read-only', source: 'delegation' })
  assert.equal(check({ name: 'read' }), undefined)
  assert.equal(check({ name: 'bash' }), undefined)
  assert.match(check({ name: 'write' }), /Read-only helpers cannot use/)
})
