import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createDispatchTool } from '../src/dispatch.js'
import { ROUTER_PROMPT, registerRouterPrompt, routerPromptText } from '../src/router-prompt.js'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'router-prompt-'))
const originalHome = process.env.HOME
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

test('the router prompt asks for one routing decision and treats reports as background', () => {
  const text = routerPromptText()
  assert.match(text, /Before answering, make the routing decision for this input/)
  assert.match(text, /dispatch_worker: new work, or a direct answer/)
  assert.match(text, /continue_worker: a follow-up on the task that owns the same deliverable/)
  assert.match(text, /worker_status: the input only asks about worker or task state/)
  assert.match(text, /One successful call is this input's decision/)
  assert.match(text, /Reports, worker-status notices, timestamps, summaries, and reminders are background: they are not user input and need no decision/)
})

test('the router prompt shapes the worker instruction without distorting or adding to it', () => {
  const text = routerPromptText()
  assert.match(text, /first correct its grammar, wording, and illogical phrasing into fluent, logical sentences/)
  assert.match(text, /Keep the intent and information intact: do not distort or embellish it/)
  assert.match(text, /Do not add features, requirements, a plan, or acceptance criteria the user did not mention/)

  const dispatch = createDispatchTool({})
  assert.match(dispatch.description, /correct grammar, wording, and illogical phrasing into fluent, logical sentences/)
  assert.match(dispatch.description, /keep the intent and information intact/)
  assert.match(dispatch.parameters.properties.task.description, /in fluent, logical sentences/)
  assert.doesNotMatch(dispatch.description, /without rewriting or paraphrasing it/)
})

test('the router prompt marks its first assembly of a turn so the snapshot is written every turn', () => {
  const firstTurn = new AbortController().signal
  const secondTurn = new AbortController().signal
  const assembled = routerPromptText({ signal: firstTurn })
  assert.match(assembled, /^Routing reminder for this user input \(new for this turn, created at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\):\n/)
  assert.deepEqual(assembled.split('\n').slice(1), ROUTER_PROMPT)
  assert.equal(routerPromptText({ signal: firstTurn }), assembled, 'the reminder stays stable within one turn')
  assert.notEqual(routerPromptText({ signal: secondTurn }), assembled, 'each turn assembles a fresh reminder')
  assert.equal(routerPromptText(), 'Routing reminder for this user input:\n' + ROUTER_PROMPT.join('\n'))
})

test('the router prompt is a required runtime context so every request carries it', () => {
  const contexts = []
  const ctx = { systemPrompt: { context(entry) { contexts.push(entry); return () => {} } } }
  registerRouterPrompt(ctx)
  assert.equal(contexts.length, 1)
  const prompt = contexts[0]
  assert.equal(prompt.name, 'superagent-lite-router-prompt')
  assert.equal(prompt.order, 175)
  assert.equal(prompt.required, true)
  assert.equal(prompt.text, routerPromptText)
  assert.equal(prompt.text(), routerPromptText())
})

test('the router plugin registers the prompt for router sessions', async () => {
  const { apply } = await import('../router.js')
  const contexts = []
  const tools = []
  const ctx = {
    logger: { warn() {} },
    tools: { register(tool) { tools.push(tool) } },
    systemPrompt: { context(entry) { contexts.push(entry); return () => {} } },
  }
  await apply(ctx)
  const prompt = contexts.find(entry => entry.name === 'superagent-lite-router-prompt')
  assert.ok(prompt, 'the router plugin must register the routing prompt')
  assert.equal(prompt.required, true)
  assert.equal(typeof prompt.text, 'function')
  assert.match(prompt.text({ signal: new AbortController().signal }), /^Routing reminder for this user input \(new for this turn, created at /)
  assert.equal(prompt.text(), routerPromptText())
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['continue_worker', 'dispatch_worker', 'worker_status'])
  const source = await readFile(new URL('../router.js', import.meta.url), 'utf8')
  assert.match(source, /registerRouterPrompt\(ctx\)/)
})
