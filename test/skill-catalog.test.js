import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkerSkillCatalogGuard, WORKER_PRESET } from '../src/skill-catalog.js'

const projectSkill = description => ({ name: 'superagent-project-memory', description })
const sharedSkill = description => ({ name: 'superagent-shared-memory', description })
const otherSkill = description => ({ name: 'find-skills', description })

function catalogMessage(entries, update = false) {
  return {
    id: update ? 'catalog-update' : 'catalog',
    source: { kind: 'skill-catalog', form: 'catalog', ...update ? { update: true } : {}, entries },
  }
}

function guardFor(preset = () => WORKER_PRESET) {
  return createWorkerSkillCatalogGuard({ agentPresets: { composedPreset: preset } })
}

const agent = { id: 'worker-a', ctx: { scope: 'worker-a' } }

function step(guard, messages, target = agent) {
  return guard.preStep({ agent: target }, async () => ({ kind: 'enter', messages }))
}

test('a new worker session publishes the catalog containing the saved memory skills', async () => {
  const guard = guardFor()
  const catalog = catalogMessage([otherSkill('find skills'), projectSkill('Old project skill.')])
  const decision = await step(guard, [catalog, { id: 'task', content: [] }])
  assert.deepEqual(decision.messages, [catalog, { id: 'task', content: [] }])
})

test('a memory-owned skill change is not injected into a running worker session', async () => {
  const guard = guardFor()
  await step(guard, [catalogMessage([otherSkill('find skills'), projectSkill('Old project skill.')])])
  const update = catalogMessage([
    otherSkill('find skills'), projectSkill('New project skill.'),
  ], true)
  const decision = await step(guard, [update])
  assert.deepEqual(decision.messages, [])
})

test('a newly created global memory skill is not injected into a running worker session', async () => {
  const guard = guardFor()
  await step(guard, [catalogMessage([otherSkill('find skills'), projectSkill('Project skill.')])])
  const update = catalogMessage([
    otherSkill('find skills'), projectSkill('Project skill.'), sharedSkill('Shared skill.'),
  ], true)
  const decision = await step(guard, [update])
  assert.deepEqual(decision.messages, [])
})

test('the same memory-only update stays filtered on every later step', async () => {
  const guard = guardFor()
  await step(guard, [catalogMessage([otherSkill('find skills'), projectSkill('Old project skill.')])])
  const update = catalogMessage([
    otherSkill('find skills'), projectSkill('New project skill.'), sharedSkill('Shared skill.'),
  ], true)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const decision = await step(guard, [update])
    assert.deepEqual(decision.messages, [], `attempt ${attempt + 1}`)
  }
  const later = catalogMessage([
    otherSkill('Find, install, and extend skills.'), projectSkill('New project skill.'), sharedSkill('Shared skill.'),
  ], true)
  const decision = await step(guard, [later])
  assert.deepEqual(decision.messages, [later])
})

test('a catalog change that includes another skill is still delivered', async () => {
  const guard = guardFor()
  await step(guard, [catalogMessage([otherSkill('Find and install skills.')])])
  const update = catalogMessage([
    otherSkill('Find, install, and extend skills.'), sharedSkill('Shared skill.'),
  ], true)
  const decision = await step(guard, [update])
  assert.deepEqual(decision.messages, [update])
})

test('a session that never published a catalog in this process keeps its existing catalog', async () => {
  const guard = guardFor()
  const update = catalogMessage([otherSkill('Find and install skills.')], true)
  const decision = await step(guard, [update])
  assert.deepEqual(decision.messages, [])
})

test('only the worker preset catalog is stabilized', async () => {
  const guard = guardFor(scope => scope?.scope === agent.ctx.scope ? WORKER_PRESET : 'superagent-lite')
  await step(guard, [catalogMessage([otherSkill('Find and install skills.')])])
  const update = catalogMessage([otherSkill('Find, install, and extend skills.')], true)
  const decision = await step(guard, [update], { id: 'router', ctx: { scope: 'router' } })
  assert.deepEqual(decision.messages, [update])
})

test('the guard ignores rejected steps', async () => {
  const guard = guardFor()
  const rejected = await guard.preStep({ agent }, async () => ({ kind: 'reject' }))
  assert.deepEqual(rejected, { kind: 'reject' })
})

test('a forgotten agent drops catalog updates until it publishes one', async () => {
  const guard = guardFor()
  await step(guard, [catalogMessage([otherSkill('Find and install skills.')])])
  guard.forget(agent.id)
  const update = catalogMessage([otherSkill('Find, install, and extend skills.')], true)
  const decision = await step(guard, [update])
  assert.deepEqual(decision.messages, [])
})
