import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { claimHelper, clearHelperExpectation, expectHelper, registerReadOnlyGuard, registerReviewGuard } from '../src/helper-guard.js'

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
      on() {},
    },
  })
  return {
    appends,
    check: execution => check(execution),
    setMode: next => { mode = next },
  }
}

function registerReviewer(scope) {
  const calls = []
  const listeners = []
  const appends = []
  registerReviewGuard({
    session: {
      id: 'reviewer',
      append(type, data) { appends.push([type, data]) },
    },
    ctx: {
      get: () => undefined,
      tools: { guard(fn) { calls.push(fn) } },
      on(name, fn) { if (name === 'session/event') listeners.push(fn) },
    },
  }, scope)
  return {
    appends,
    check: execution => calls[0](execution),
    emit: event => { for (const listener of listeners) listener({ id: 'reviewer' }, event) },
  }
}

test('only an expected child is claimed as a helper', () => {
  assert.equal(claimHelper('parent'), false)
  expectHelper('parent')
  assert.deepEqual(claimHelper('parent'), { scope: undefined, kind: 'memory' })
  assert.equal(claimHelper('parent'), false)
})

test('nested expectations survive one claim and clear together', () => {
  expectHelper('parent')
  expectHelper('parent')
  assert.deepEqual(claimHelper('parent'), { scope: undefined, kind: 'memory' })
  assert.deepEqual(claimHelper('parent'), { scope: undefined, kind: 'memory' })
  assert.equal(claimHelper('parent'), false)
  expectHelper('parent')
  clearHelperExpectation('parent')
  assert.equal(claimHelper('parent'), false)
})

test('only the memory role may write knowledge', () => {
  const memory = registerHelper()
  assert.equal(memory.check({ name: 'knowledge_query' }), undefined)
  assert.equal(memory.check({ name: 'knowledge_write' }), undefined)
  const reviewer = registerReviewer({
    checkCommand: () => undefined,
    record() {},
    hasEvidence: () => false,
  })
  assert.equal(reviewer.check({ name: 'knowledge_query' }), undefined)
  assert.match(reviewer.check({ name: 'knowledge_write' }), /Only the memory role/)
})

test('the memory helper guard allows read-only inspection and confines its shell', () => {
  const { appends, check } = registerHelper()
  assert.deepEqual(appends, [['sandbox/mode', { mode: 'read-only', source: 'delegation' }]])
  for (const name of [
    'structured_output', 'read', 'read_image', 'glob', 'grep', 'skill', 'bash', 'pwsh',
    'read_page', 'web_fetch', 'web_search', 'x_search', 'job_output', 'job_list',
    'knowledge_query', 'knowledge_get',
  ]) {
    assert.equal(check({ name }), undefined, name)
  }
  for (const name of [
    'write', 'edit', 'create_worktree', 'review_worker_commit', 'message_router',
    'superagent_memory', 'extract_memory', 'subagent', 'job_kill', 'present',
    'todo_write', 'working_directory', 'submit_review',
  ]) {
    assert.match(check({ name }), /Read-only helpers cannot use/, name)
  }
})

test('the memory helper guard denies shell commands when nothing confines them', () => {
  const { appends, check } = registerHelper({ shell: null })
  assert.deepEqual(appends, [['sandbox/mode', { mode: 'read-only', source: 'delegation' }]])
  assert.equal(check({ name: 'read' }), undefined)
  assert.equal(check({ name: 'glob' }), undefined)
  assert.match(check({ name: 'bash' }), /does not confine shell file writes/)
  assert.match(check({ name: 'pwsh' }), /does not confine shell file writes/)
  assert.match(check({ name: 'write' }), /Read-only helpers cannot use/)
})

test('the memory helper guard denies shell commands when the read-only override is not effective', () => {
  const { check } = registerHelper({
    policy: { resolve: () => ({ mode: 'workspace-write' }) },
  })
  assert.equal(check({ name: 'read' }), undefined)
  assert.match(check({ name: 'bash' }), /does not confine shell file writes/)
})

test('the memory helper guard rechecks shell confinement for every call', () => {
  const { check, setMode } = registerHelper()
  assert.equal(check({ name: 'bash' }), undefined)
  setMode('danger-full-access')
  assert.match(check({ name: 'bash' }), /does not confine shell file writes/)
  assert.equal(check({ name: 'read' }), undefined)
})

test('the memory helper guard refuses sandbox escalation from a shell call', () => {
  const { check } = registerHelper()
  assert.match(check({ name: 'bash', arguments: { command: 'pwd', sandbox_permissions: 'danger-full-access' } }), /widen the sandbox/)
  assert.equal(check({ name: 'bash', arguments: { command: 'pwd' } }), undefined)
})

test('a real Session log accepts the memory helper read-only override', { skip: !anchor }, async () => {
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

test('the reviewer guard only refuses write/edit tools', () => {
  const scope = {
    commands: [],
    checkCommand(command) {
      this.commands.push(command)
      return command.includes('git commit') ? 'git commit refused' : undefined
    },
    record() {},
    hasEvidence: () => false,
  }
  const { appends, check } = registerReviewer(scope)
  assert.deepEqual(appends, [], 'the reviewer keeps the inherited sandbox')
  for (const name of ['write', 'edit', 'apply_patch', 'str_replace_editor']) {
    assert.match(check({ name }), /may not use/, name)
  }
  for (const name of [
    'read', 'read_image', 'glob', 'grep', 'read_page', 'web_fetch', 'web_search',
    'x_search', 'job_output', 'job_list', 'job_kill', 'present', 'skill',
    'todo_write', 'working_directory', 'create_worktree', 'review_worker_commit',
    'message_router', 'submit_review', 'knowledge_query', 'knowledge_get',
  ]) {
    assert.equal(check({ name }), undefined, name)
  }
  assert.match(check({ name: 'knowledge_write' }), /Only the memory role/)
  assert.equal(check({ name: 'bash', arguments: { command: 'git diff base..head', run_in_background: true } }), undefined)
  assert.equal(check({ name: 'bash', arguments: { command: 'git diff base..head', workdir: '/tmp' } }), undefined)
  assert.equal(check({ name: 'bash', arguments: { command: 'npm test', sandbox_permissions: 'danger-full-access' } }), undefined)
  assert.equal(check({ name: 'bash', arguments: { command: 'git commit -m x' } }), 'git commit refused')
  assert.equal(check({ name: 'read', arguments: { file_path: '/etc/hosts' } }), undefined)
  assert.deepEqual(scope.commands, ['git diff base..head', 'git diff base..head', 'npm test', 'git commit -m x'])
})

test('the reviewer guard records evidence from inspected calls', () => {
  let recorded = 0
  const scope = {
    checkCommand: () => undefined,
    record() { recorded += 1 },
    hasEvidence: () => true,
  }
  const { emit } = registerReviewer(scope)
  emit({ type: 'tool/call', data: { callId: 'diff', name: 'bash', arguments: '{"command":"git diff a..b"}' } })
  emit({ type: 'tool/result', data: { message: { toolCallId: 'diff', isError: false } } })
  assert.equal(recorded, 1)
})
