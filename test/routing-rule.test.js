import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createContinueTool } from '../src/continue.js'
import { createDispatchTool } from '../src/dispatch.js'
import { createWorkerStatusTool } from '../src/worker-status.js'

const dispatch = createDispatchTool({})
const followUp = createContinueTool({})
const status = createWorkerStatusTool()

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
  assert.match(dispatch.description, /when a merge worker is already running for this project, dispatch appends the request to it instead of starting a second merge worker/)
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
  assert.match(persona, /when a merge worker is already running for this project, dispatch_worker appends the request to it instead of starting a second one/)
  assert.match(persona, /Never continue the task that owns a branch in order to merge it/)
  assert.match(persona, /continue_worker land=true authorizes only pushing or a pull request, not merging/)
})

test('worker_status names every router-visible task state and one optional task', () => {
  assert.equal(status.name, 'worker_status')
  assert.match(status.description, /queued, running, delivered, cancelled, and failed/)
  assert.match(status.description, /pass taskId to inspect one task/)
  assert.match(status.description, /status question instead of dispatching/)
  assert.match(status.description, /background worker-status notices/)
  assert.deepEqual(Object.keys(status.parameters.properties), ['taskId'])
  assert.equal(status.parameters.required, undefined)
  assert.match(status.parameters.properties.taskId.description, /16-character task ID/)
})

test('the router persona routes status questions to worker_status and treats notices as background', async () => {
  const persona = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(persona, /or worker_status when the input only asks about worker or task state/)
  assert.match(persona, /Call worker_status when the input asks whether a task is queued, running, delivered, or cancelled/)
  assert.match(persona, /A queued task cancelled from the panel or a queued worker that starts arrives as a background worker-status notice, not a new request/)
})
