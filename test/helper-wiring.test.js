import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const originalHome = process.env.HOME
const home = await mkdtemp(join(tmpdir(), 'superagent-lite-helper-wiring-'))
process.env.HOME = home

test('agent/created installs the read-only helper guard', async (t) => {
  t.after(async () => {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    await rm(home, { recursive: true, force: true })
  })
  const { apply } = await import('../index.js')
  const { expectHelper } = await import('../src/helper-guard.js')
  const listeners = new Map()
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get() {} },
    agentPresets: { composedPreset() {} },
  }
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
