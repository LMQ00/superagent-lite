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

test('dispatch_worker relays the request without losing information', () => {
  assert.match(dispatch.description, /without rewriting or paraphrasing it/)
  assert.match(dispatch.description, /do not omit or compress its information/)
  assert.match(dispatch.parameters.properties.task.description, /without omitting, rewriting or compressing its information/)
})

test('dispatch_worker makes answer, report, change, and merge first-class modes', () => {
  assert.deepEqual(dispatch.parameters.properties.mode.enum, ['change', 'report', 'answer', 'merge'])
  assert.deepEqual(dispatch.parameters.required, ['mode'])
  assert.match(dispatch.description, /mode=change when the request needs project files changed/)
  assert.match(dispatch.description, /mode=report when answering requires a worker to inspect the repository/)
  assert.match(dispatch.description, /mode=answer when the input only asks something you can answer/)
  assert.match(dispatch.description, /mode=merge when the user explicitly authorizes merging delivered worker branches/)
  assert.match(dispatch.description, /no worker, worktree, or task is created/)
  assert.match(dispatch.description, /Merge requests are new work/)
  assert.equal(dispatch.parameters.properties.delegate, undefined)
  assert.equal(dispatch.parameters.properties.reason, undefined)
})

test('the router persona names all four modes and defaults merges to a new worker', async () => {
  const persona = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(persona, /Set dispatch_worker mode by need: answer/)
  assert.match(persona, /answer when the user only asks and the conversation already answers it/)
  assert.match(persona, /report when the answer needs read-only repository inspection or commands/)
  assert.match(persona, /change when project files must change/)
  assert.match(persona, /merge when the user explicitly authorizes merging delivered worker branches/)
  assert.match(persona, /A merge request defaults to a newly dispatched merge worker/)
  assert.match(persona, /Never continue the task that owns a branch in order to merge it/)
  assert.match(persona, /continue_worker land=true authorizes only pushing or a pull request, not merging/)
})
