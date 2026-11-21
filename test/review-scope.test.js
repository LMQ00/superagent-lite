import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createReviewScope } from '../src/review-scope.js'
import { registerReadOnlyGuard, takeHelperEvidence } from '../src/helper-guard.js'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const root = await mkdtemp(join(tmp, 'review-scope-'))
const worktree = join(root, 'worktree')
await mkdir(join(worktree, '.git'), { recursive: true })
await writeFile(join(worktree, 'changed.js'), 'export const value = 1\n')
await writeFile(join(worktree, 'README.md'), 'notes\n')
await writeFile(join(worktree, '.git', 'config'), '[core]\n')
await writeFile(join(root, 'outside.txt'), 'outside\n')
if (process.platform !== 'win32') await symlink(join(root, 'outside.txt'), join(worktree, 'link.txt'))

after(() => rm(root, { recursive: true, force: true }))

const base = 'a'.repeat(40)
const head = 'b'.repeat(40)

function scope(changedFiles = ['changed.js']) {
  return createReviewScope({ worktree, baseCommit: base, headCommit: head, changedFiles })
}

function helper(reviewScope, id = 'reviewer') {
  let check
  const listeners = []
  const agent = {
    session: { id, append() {} },
    ctx: {
      get: name => name === 'shell' ? { sandboxMode: 'workspace-write' }
        : name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'read-only' }) }
        : undefined,
      tools: { guard(fn) { check = fn } },
      on(name, fn) { if (name === 'session/event') listeners.push(fn) },
    },
  }
  registerReadOnlyGuard(agent, reviewScope)
  const emit = event => { for (const listener of listeners) listener(agent.session, event) }
  return { agent, check, emit }
}

function toolCall(callId, name, input) {
  return { type: 'tool/call', data: { callId, name, arguments: JSON.stringify(input) } }
}

function toolResult(callId, isError = false) {
  return { type: 'tool/result', data: { message: { toolCallId: callId, isError } } }
}

test('file reads are confined to the worker worktree', () => {
  const reviewScope = scope()
  assert.equal(reviewScope.checkPath('changed.js'), undefined)
  assert.equal(reviewScope.checkPath(join(worktree, 'changed.js')), undefined)
  assert.match(reviewScope.checkPath('../outside.txt'), /outside the worker worktree/)
  assert.match(reviewScope.checkPath(join(root, 'outside.txt')), /outside the worker worktree/)
  assert.match(reviewScope.checkPath('.git/config'), /\.git/)
  assert.match(reviewScope.checkPath('/etc/passwd'), /outside the worker worktree/)
  assert.equal(reviewScope.checkFileTool('glob', {}), undefined)
  assert.match(reviewScope.checkFileTool('grep', { path: '../outside.txt' }), /outside the worker worktree/)
  assert.equal(reviewScope.checkFileTool('structured_output', {}), undefined)
})

test('a symlink cannot carry a read outside the worker worktree', { skip: process.platform === 'win32' }, () => {
  assert.match(scope().checkPath('link.txt'), /resolves outside the worker worktree/)
})

test('git inspection stays inside base..head', () => {
  const reviewScope = scope()
  for (const command of [
    `git diff ${base}..${head}`,
    `git diff --stat ${base} ${head}`,
    `git diff ${head}..${base}`,
    `git show ${head}`,
    `git show ${head}:changed.js`,
    `git show ${base}:changed.js`,
    `git log --oneline ${base}..${head}`,
    'git status --porcelain',
  ]) {
    assert.equal(reviewScope.checkCommand(command), undefined, command)
  }
  const refusals = [
    ['git log --all', /widen/],
    [`git log ${head}`, /must use/],
    [`git show ${'c'.repeat(40)}:changed.js`, /may only read/],
    [`git diff ${head}`, /must stay within/],
    ['git -C ../repo diff', /not an allowed inspection command/],
    [`git diff ${base}..${head} | head`, /shell operators/],
    [`git diff --output=${join(root, 'out.patch')} ${base}..${head}`, /widen/],
    ['cat changed.js', /only git diff/],
    [`git show ${head}~1:changed.js`, /shell operators/],
    [`git diff ${base}..${head} -- ../outside.txt`, /outside the worker worktree/],
    ['git diff', /must name the base and head/],
    ['git status changed.js', /takes flags only/],
  ]
  for (const [command, expected] of refusals) {
    assert.match(reviewScope.checkCommand(command), expected, command)
  }
  assert.equal(reviewScope.checkWorkdir(undefined), undefined)
  assert.equal(reviewScope.checkWorkdir(worktree), undefined)
  assert.match(reviewScope.checkWorkdir(root), /omit workdir/)
})

test('only a diff or changed-file read counts as evidence', () => {
  const diffScope = scope()
  assert.equal(diffScope.hasEvidence(), false)
  diffScope.record('bash', { command: `git diff ${base}..${head}` })
  assert.equal(diffScope.hasEvidence(), true)

  const fileScope = scope()
  fileScope.record('read', { file_path: 'README.md' })
  assert.equal(fileScope.hasEvidence(), false)
  fileScope.record('read', { file_path: 'changed.js' })
  assert.equal(fileScope.hasEvidence(), true)

  const weakScope = scope()
  weakScope.record('bash', { command: `git show ${base}` })
  weakScope.record('bash', { command: `git log --oneline ${base}..${head}` })
  weakScope.record('bash', { command: 'git status --porcelain' })
  assert.equal(weakScope.hasEvidence(), false)
  weakScope.record('bash', { command: `git show ${head}:changed.js` })
  assert.equal(weakScope.hasEvidence(), true)

  const logScope = scope()
  logScope.record('bash', { command: `git log --oneline ${base}..${head}` })
  assert.equal(logScope.hasEvidence(), false)
  logScope.record('bash', { command: `git log -p ${base}..${head}` })
  assert.equal(logScope.hasEvidence(), true)
})

test('the helper guard refuses out-of-scope reads and records admitted evidence', () => {
  const reviewScope = scope()
  const { check, emit } = helper(reviewScope, 'reviewer-scoped')
  assert.equal(check({ name: 'read', arguments: { file_path: 'changed.js' } }), undefined)
  assert.match(check({ name: 'read', arguments: { file_path: '../outside.txt' } }), /outside the worker worktree/)
  assert.match(check({ name: 'read_page' }), /only inspect the worker worktree/)
  assert.match(check({ name: 'write' }), /only inspect the worker worktree/)
  assert.equal(check({ name: 'bash', arguments: { command: `git diff ${base}..${head}` } }), undefined)
  assert.match(check({ name: 'bash', arguments: { command: 'git log --all' } }), /widen/)
  assert.match(check({
    name: 'bash',
    arguments: { command: `git diff ${base}..${head}`, workdir: root },
  }), /omit workdir/)

  emit(toolCall('read-outside', 'read', { file_path: '../outside.txt' }))
  emit(toolResult('read-outside'))
  emit(toolCall('diff', 'bash', { command: `git diff ${base}..${head}` }))
  emit(toolResult('diff'))
  assert.equal(takeHelperEvidence('reviewer-scoped'), true)
  assert.equal(takeHelperEvidence('reviewer-scoped'), false)
})

test('a failed or changed-file-less read is not evidence', () => {
  const failed = helper(scope(), 'reviewer-failed')
  failed.emit(toolCall('diff', 'bash', { command: `git diff ${base}..${head}` }))
  failed.emit(toolResult('diff', true))
  assert.equal(takeHelperEvidence('reviewer-failed'), false)

  const unrelated = helper(scope(), 'reviewer-unrelated')
  unrelated.emit(toolCall('read', 'read', { file_path: 'README.md' }))
  unrelated.emit(toolResult('read'))
  assert.equal(takeHelperEvidence('reviewer-unrelated'), false)
})
