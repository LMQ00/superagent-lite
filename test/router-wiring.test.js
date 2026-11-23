import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'router-wiring-'))
const originalHome = process.env.HOME
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

test('the router injects global memory, including facts written after startup', async () => {
  const { createMemoryStore, refreshGlobalMemory } = await import('../src/memory.js')
  const store = createMemoryStore()
  await store.writeGlobal({ userProfile: 'Environment: router context check.' })

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

  const memory = contexts.find(entry => entry.name === 'superagent-lite-memory')
  assert.ok(memory, 'the router registered a global memory context')
  assert.equal(memory.required, true)
  assert.match(memory.text(), /User profile: Environment: router context check\./)
  assert.doesNotMatch(memory.text(), /Project:/)

  await store.writeGlobal({ sharedSkill: 'Written after startup.' })
  await refreshGlobalMemory()
  assert.match(memory.text(), /Shared skill: Written after startup\./)
})
