import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const anchor = process.env.DSH_INSTALL_DIR

test('installed tool, scope and sandbox services enforce the helper boundary', { skip: !anchor }, async (t) => {
  const require = createRequire(join(anchor, 'package.json'))
  const load = specifier => import(pathToFileURL(require.resolve(specifier)).href)
  const { Context } = await load('@deepseek-ai/cordis')
  const { ToolsService } = await load('@deepseek-ai/dsh-tools')
  const { SessionProjectionRegistry } = await load('@deepseek-ai/dsh-session-projection')
  const { SandboxPolicyService } = await load('@deepseek-ai/dsh-sandbox-policy')
  const { Session } = await load('@deepseek-ai/dsh-session')
  const { createScope } = await load('@deepseek-ai/dsh-scope')
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
  assert.equal(ctx.tools.checkGuards({ agent: helperKey, name: 'read' }), undefined)
  assert.equal(ctx.tools.checkGuards({ agent: helperKey, name: 'glob' }), undefined)
  assert.equal(ctx.tools.checkGuards({ agent: helperKey, name: 'grep' }), undefined)
  assert.equal(ctx.tools.checkGuards({ agent: helperKey, name: 'bash' }), undefined)
  assert.match(ctx.tools.checkGuards({ agent: helperKey, name: 'write' }).reason, /Read-only helpers cannot use/)
  assert.match(ctx.tools.checkGuards({ agent: helperKey, name: 'edit' }).reason, /Read-only helpers cannot use/)
  assert.match(ctx.tools.checkGuards({ agent: helperKey, name: 'subagent' }).reason, /Read-only helpers cannot use/)
})
