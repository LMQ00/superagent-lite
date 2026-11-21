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
