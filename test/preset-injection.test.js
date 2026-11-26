import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const config = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

function presetBlock(id) {
  const marker = new RegExp(`^    - id: ${id}$`, 'm').exec(config)
  assert.ok(marker, `preset ${id} is missing`)
  const next = /^    - id: /gm
  next.lastIndex = marker.index + marker[0].length
  const following = next.exec(config)
  return config.slice(marker.index, following?.index)
}

function agentInstructionBudgets(block) {
  return [...block.matchAll(
    /^ +- id: agent-instructions\n +name: '@deepseek-ai\/dsh-agent-instructions'\n +config:\n +maxBytes: (\d+)$/gm,
  )].map(match => Number(match[1]))
}

test('the router preset mounts agent instructions and the worker preset keeps its own', () => {
  const worker = agentInstructionBudgets(presetBlock('preset-superagent-lite-worker'))
  assert.deepEqual(worker, [65536])
  assert.deepEqual(agentInstructionBudgets(presetBlock('preset-superagent-lite')), worker)
})

test('the router preset keeps skill discovery to global roots while the worker keeps project roots', () => {
  const router = presetBlock('preset-superagent-lite')
  assert.match(router, /- id: skill-filesystem\n +name: '@deepseek-ai\/dsh-skill-filesystem'\n +config:\n +includeDefaultRoots: false\n +customSkillDirs:/)
  assert.match(router, /DSH_AGENTS_HOME/)
  const worker = presetBlock('preset-superagent-lite-worker')
  assert.match(worker, /- id: skill-filesystem\n +name: '@deepseek-ai\/dsh-skill-filesystem'/)
  assert.doesNotMatch(worker, /includeDefaultRoots: false/)
})

test('the worker preset mounts the skill tool and catalog that the memory helper inherits', () => {
  const worker = presetBlock('preset-superagent-lite-worker')
  assert.match(worker, /- id: tool-skill\n +name: '@deepseek-ai\/dsh-tool-skill'/)
  assert.match(worker, /- id: skill-filesystem\n +name: '@deepseek-ai\/dsh-skill-filesystem'/)
})
