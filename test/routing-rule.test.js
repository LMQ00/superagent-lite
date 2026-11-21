import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createContinueTool } from '../src/continue.js'
import { createDispatchTool } from '../src/dispatch.js'

const dispatch = createDispatchTool({})
const followUp = createContinueTool({})

test('both routing tools keep a different business goal out of continue_worker', () => {
  for (const description of [dispatch.description, followUp.description]) {
    assert.match(description, /same deliverable and goal/)
    assert.match(description, /just adds to or corrects it/)
    assert.match(description, /different business goal/)
    assert.match(description, /looks related/)
  }
})

test('the router persona states the new-work rule with both examples', async () => {
  const persona = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(persona, /same deliverable and goal/)
  assert.match(persona, /a different business goal is new work even if it looks related/)
  assert.match(persona, /another prompt-wording change continues that task/)
  assert.match(persona, /changing how dispatch messages are shaped is a new task/)
})

test('dispatch_worker sends overlapping work to its own worker instead of folding it in', () => {
  assert.match(dispatch.description, /files a running worker is changing/)
  assert.match(dispatch.description, /worktrees keep the edits separate/)
})
