import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkerSkillCatalogGuard, WORKER_PRESET } from '../src/skill-catalog.js'

const projectSkill = description => ({ name: 'superagent-project-memory', description })
const sharedSkill = description => ({ name: 'superagent-shared-memory', description })
const projectConventions = description => ({ name: 'superagent-project-conventions', description })
const trackedProjectSkill = description => ({ name: 'superagent-lite-test-conventions', description })
const otherSkill = description => ({ name: 'find-skills', description })

const MEMORY_SKILLS = new Set([
  projectSkill('').name, sharedSkill('').name, projectConventions('').name,
])

function catalogMessage(entries, update = false) {
  return {
    id: update ? 'catalog-update' : 'catalog',
    source: { kind: 'skill-catalog', form: 'catalog', ...update ? { update: true } : {}, entries },
  }
}

function guardFor(preset = () => WORKER_PRESET, authoredSkills = async () => MEMORY_SKILLS) {
  return createWorkerSkillCatalogGuard(
    { agentPresets: { composedPreset: preset } },
    { authoredSkills },
  )
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

test('a second memory-owned project skill is not injected into a running worker session', async () => {
  const guard = guardFor()
  await step(guard, [catalogMessage([otherSkill('find skills'), projectSkill('Project skill.')])])
  const update = catalogMessage([
    otherSkill('find skills'), projectSkill('Project skill.'), projectConventions('Test conventions.'),
  ], true)
  const decision = await step(guard, [update])
  assert.deepEqual(decision.messages, [])
})

test('a second tracked project skill does not weaken the memory-only filter', async () => {
  const guard = guardFor()
  const baseline = [
    otherSkill('find skills'), projectSkill('Project skill.'), trackedProjectSkill('Test guidance.'),
  ]
  await step(guard, [catalogMessage(baseline)])
  const memoryOnly = catalogMessage([
    otherSkill('find skills'), projectSkill('Edited project skill.'), trackedProjectSkill('Test guidance.'),
  ], true)
  assert.deepEqual((await step(guard, [memoryOnly])).messages, [])
  const edited = catalogMessage([
    otherSkill('find skills'), projectSkill('Edited project skill.'), trackedProjectSkill('Edited test guidance.'),
  ], true)
  assert.deepEqual((await step(guard, [edited])).messages, [edited])
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

test('a skill outside the memory-owned set is delivered even when a memory skill appears', async () => {
  const guard = guardFor()
  await step(guard, [catalogMessage([projectSkill('Project skill.')])])
  const update = catalogMessage([
    projectSkill('Project skill.'), projectConventions('Test conventions.'), otherSkill('Find and install skills.'),
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

test('the author source receives the guarded agent', async () => {
  const seen = []
  const guard = guardFor(() => WORKER_PRESET, async target => {
    seen.push(target)
    return MEMORY_SKILLS
  })
  await step(guard, [catalogMessage([projectSkill('Project skill.')])])
  await step(guard, [catalogMessage([projectSkill('Changed project skill.')], true)])
  assert.deepEqual(seen, [agent, agent])
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

test('a deleted memory-authored skill is not injected into a running worker session', async () => {
  const guard = guardFor()
  await step(guard, [catalogMessage([otherSkill('find skills'), projectSkill('Project skill.')])])
  const update = catalogMessage([otherSkill('find skills')], true)
  assert.deepEqual((await step(guard, [update])).messages, [])
})

test('a deleted skill without the memory author keeps normal catalog behavior', async () => {
  const manual = { name: 'project-notes', description: 'Local notes.' }
  const guard = guardFor()
  await step(guard, [catalogMessage([otherSkill('find skills'), manual])])
  const update = catalogMessage([otherSkill('find skills')], true)
  assert.deepEqual((await step(guard, [update])).messages, [update])
})

test('a skill without the memory author still publishes its change', async () => {
  const guard = guardFor(() => WORKER_PRESET, async () => new Set())
  await step(guard, [catalogMessage([projectSkill('Old project skill.')])])
  const update = catalogMessage([projectSkill('Changed project skill.')], true)
  assert.deepEqual((await step(guard, [update])).messages, [update])
})
