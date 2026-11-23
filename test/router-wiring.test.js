import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const originalHome = process.env.HOME
const home = await mkdtemp(join(tmpdir(), 'superagent-lite-router-wiring-'))
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

test('the router injects profile facts written after plugin startup', async () => {
  const { createMemoryStore } = await import('../src/memory-store.js')
  await createMemoryStore().memory.create({ role: 'router' }, {
    category: 'profile',
    content: 'Environment: router profile refresh check.',
    source: { sessionId: 'router', seq: 1 },
  })

  const { apply } = await import('../router.js')
  const contexts = []
  const ctx = {
    logger: { warn() {} },
    tools: { register() { return () => {} } },
    commands: { register() { return () => {} } },
    agentPresets: { composedPreset() {} },
    systemPrompt: { context(entry) { contexts.push(entry); return () => {} } },
  }
  await apply(ctx)

  const profile = contexts.find(entry => entry.name === 'superagent-lite-profile')
  assert.ok(profile, 'the router registered a profile context')
  assert.equal(profile.required, true)
  assert.match(profile.text(), /router profile refresh check/)
})
