import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const originalHome = process.env.HOME
const home = await mkdtemp(join(tmpdir(), 'superagent-lite-helper-wiring-'))
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

function context() {
  const listeners = new Map()
  return {
    listeners,
    ctx: {
      logger: { warn() {} },
      inject() {},
      effect() { return () => {} },
      on(name, handler) { listeners.set(name, handler) },
      agents: { get() {} },
      agentPresets: { composedPreset() {} },
    },
  }
}

test('agent/created installs the read-only helper guard', async () => {
  const { apply } = await import('../index.js')
  const { expectHelper } = await import('../src/helper-guard.js')
  const { ctx, listeners } = context()
  await apply(ctx)
  let mode
  let check
  const helper = {
    id: 'helper',
    session: {
      id: 'helper',
      header: { origin: 'subagent', parentSession: 'worker' },
      append(type, data) { if (type === 'sandbox/mode') mode = data.mode },
    },
    ctx: {
      get: name => name === 'shell' ? { sandboxMode: 'workspace-write' }
        : name === 'sandboxPolicy' ? { resolve: () => ({ mode }) }
        : undefined,
      tools: { guard(fn) { check = fn } },
    },
  }
  expectHelper('worker')
  await listeners.get('agent/created')({ agent: helper })
  assert.equal(mode, 'read-only')
  assert.equal(check({ name: 'read' }), undefined)
  assert.equal(check({ name: 'glob' }), undefined)
  assert.equal(check({ name: 'bash' }), undefined)
  assert.match(check({ name: 'write' }), /Read-only helpers cannot use/)
})

test('a subagent without an expectation is not treated as a read-only helper', async () => {
  const { apply } = await import('../index.js')
  const { ctx, listeners } = context()
  await apply(ctx)
  const agent = {
    id: 'other',
    session: { id: 'other', header: { origin: 'subagent', parentSession: 'worker' } },
    ctx: {
      get() { throw new Error('read-only helper setup must not run') },
      tools: { guard() { throw new Error('read-only helper setup must not run') } },
    },
  }
  await listeners.get('agent/created')({ agent })
})

test('agent/created registers submit_review for a claimed reviewer only', async () => {
  const { apply } = await import('../index.js')
  const { expectHelper } = await import('../src/helper-guard.js')
  const { ctx, listeners } = context()
  await apply(ctx)
  const tools = []
  const reviewer = {
    id: 'reviewer',
    session: { id: 'reviewer', header: { origin: 'subagent', parentSession: 'worker' }, append() {} },
    ctx: {
      get: name => name === 'shell' ? { sandboxMode: 'workspace-write' }
        : name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'read-only' }) }
        : undefined,
      tools: { guard() {}, register(tool) { tools.push(tool) } },
      on() {},
    },
  }
  expectHelper('worker', { baseCommit: 'a'.repeat(40), headCommit: 'b'.repeat(40) })
  await listeners.get('agent/created')({ agent: reviewer })
  assert.deepEqual(tools.map(tool => tool.name), ['submit_review'])
})
