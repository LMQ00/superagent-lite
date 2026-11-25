import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const anchor = process.env.DSH_INSTALL_DIR
let installed

async function dsh() {
  if (installed) return installed
  const require = createRequire(join(anchor, 'package.json'))
  const load = specifier => import(pathToFileURL(require.resolve(specifier)).href)
  const [cordis, tools, projections, policy, session, scope, sandbox] = await Promise.all([
    load('@deepseek-ai/cordis'),
    load('@deepseek-ai/dsh-tools'),
    load('@deepseek-ai/dsh-session-projection'),
    load('@deepseek-ai/dsh-sandbox-policy'),
    load('@deepseek-ai/dsh-session'),
    load('@deepseek-ai/dsh-scope'),
    load('@deepseek-ai/dsh-sandbox-local'),
  ])
  return installed = {
    Context: cordis.Context,
    ToolsService: tools.ToolsService,
    SessionProjectionRegistry: projections.SessionProjectionRegistry,
    SandboxPolicyService: policy.SandboxPolicyService,
    Session: session.Session,
    createScope: scope.createScope,
    LocalSandboxProvider: sandbox.LocalSandboxProvider,
  }
}

test('installed tool, scope and sandbox services enforce the helper boundary', { skip: !anchor }, async (t) => {
  const { Context, ToolsService, SessionProjectionRegistry, SandboxPolicyService, Session, createScope } = await dsh()
  const { registerReadOnlyGuard } = await import('../src/helper-guard.js')

  const ctx = new Context()
  ctx.provide('systemPrompt', {
    tools() {},
    section() { return () => {} },
    getSectionOrder() { return 0 },
  })
  ctx.provide('shell', { sandboxMode: 'workspace-write' })
  await ctx.plugin(ToolsService, {}).await()
  await ctx.plugin(SessionProjectionRegistry).await()
  await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write' }).await()

  const helperKey = { id: 'helper' }
  const scope = createScope(ctx, helperKey)
  t.after(() => scope.dispose())
  const session = Session.create('helper')
  const fiber = scope.ctx.inject(['tools'], injected => registerReadOnlyGuard({ session, ctx: injected }))
  await fiber.await()
  t.after(() => fiber.dispose())

  assert.equal(ctx.sandboxPolicy.resolve({ session }).mode, 'read-only')
  // 0.2.2-rc.1 returns the denial text; rc.2 and later wrap it as `{ reason }`.
  const denial = exec => {
    const result = ctx.tools.checkGuards(exec)
    return typeof result === 'string' ? result : result?.reason
  }
  assert.equal(ctx.tools.checkGuards({ agent: helperKey, name: 'read' }), undefined)
  assert.equal(ctx.tools.checkGuards({ agent: helperKey, name: 'glob' }), undefined)
  assert.equal(ctx.tools.checkGuards({ agent: helperKey, name: 'grep' }), undefined)
  assert.equal(ctx.tools.checkGuards({ agent: helperKey, name: 'bash' }), undefined)
  assert.match(denial({ agent: helperKey, name: 'bash', arguments: { command: 'pwd', sandbox_permissions: 'danger-full-access' } }), /widen the sandbox/)
  assert.match(denial({ agent: helperKey, name: 'write' }), /Read-only helpers cannot use/)
  assert.match(denial({ agent: helperKey, name: 'edit' }), /Read-only helpers cannot use/)
  assert.match(denial({ agent: helperKey, name: 'subagent' }), /Read-only helpers cannot use/)
})

test('the read-only sandbox permits git inspection and denies writes', {
  skip: !anchor || process.platform === 'win32',
}, async (t) => {
  const { Context, LocalSandboxProvider } = await dsh()
  const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
  await mkdir(tmp, { recursive: true })
  const repo = await mkdtemp(join(tmp, 'helper-sandbox-'))
  t.after(() => rm(repo, { recursive: true, force: true }))
  const git = args => {
    const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git(['init', '-q'])
  await writeFile(join(repo, 'a.txt'), 'one\n')
  git(['add', 'a.txt'])
  git(['commit', '-qm', 'one'])

  const ctx = new Context()
  await ctx.plugin(LocalSandboxProvider, {}).await()
  const policy = { mode: 'read-only', workspaceRoot: repo, sessionId: 'helper' }
  let inspected
  try {
    inspected = await ctx.sandbox.confine(['bash', '-c', 'git status --porcelain && git log --oneline -1 && git diff --stat'], policy)
  } catch (error) {
    if (error.code === 'SANDBOX_UNAVAILABLE') return t.skip(`no sandbox backend: ${error.message}`)
    throw error
  }
  const read = spawnSync(inspected.argv[0], inspected.argv.slice(1), { cwd: repo, encoding: 'utf8' })
  assert.equal(read.status, 0, read.stderr)
  assert.match(read.stdout, /one/)

  const write = await ctx.sandbox.confine(['bash', '-c', 'printf x > b.txt'], policy)
  const written = spawnSync(write.argv[0], write.argv.slice(1), { cwd: repo, encoding: 'utf8' })
  assert.notEqual(written.status, 0)
  await assert.rejects(access(join(repo, 'b.txt')))
})
