import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-reactivate-'))
const originalHome = process.env.HOME
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

const { apply } = await import('../index.js')
const { expectHelper } = await import('../src/helper-guard.js')
const { createTask, linkWorkerSession, removeTask } = await import('../src/task-store.js')

const projectRoot = join(home, 'project')
const teamId = 'team-reactivate'
const taskIds = [
  'aaaaaaaaaaaaaaa1',
  'aaaaaaaaaaaaaaa2',
  'aaaaaaaaaaaaaaa3',
  'aaaaaaaaaaaaaaa4',
]

beforeEach(async () => {
  // Team and project stay one-to-one; each test starts from a clean record set.
  await Promise.all(taskIds.map(id => removeTask(id)))
})

function workerAgent(id, parentSession = 'router') {
  const tools = new Map()
  const prompts = []
  const checks = []
  const agent = {
    id,
    status: 'running',
    session: { id, header: { origin: 'subagent', parentSession } },
    ctx: {
      get: name => name === 'shell' ? { sandboxMode: 'workspace-write' }
        : name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'read-only' }) }
        : undefined,
      systemPrompt: { context: entry => { prompts.push(entry); return () => {} } },
      tools: {
        guard(check) { checks.push(check); return () => {} },
        register(tool, options) {
          tools.set(tool.name, { tool, options })
          return () => { tools.delete(tool.name) }
        },
        get: name => tools.get(name)?.tool,
      },
      on() {},
    },
  }
  return { agent, tools, prompts, checks }
}

function harness(agent, { listed = true } = {}) {
  const listeners = new Map()
  const effects = []
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect(setup) { effects.push(setup); return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get: id => id === agent.id ? agent : undefined, list: () => listed ? [agent] : [] },
    agentPresets: { composedPreset: () => 'superagent-lite-worker' },
    workingDirectory: { get: () => projectRoot, async set() {} },
    systemPrompt: { context: entry => { agent.ctx.systemPrompt.context(entry); return () => {} } },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    subprocess: { async resolveExecutable(name) { return name }, spawn() { throw new Error('not used') } },
    worktrees: { async create() { throw new Error('not used') } },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) { return { childId: spec.childId } },
      async sendMessage() {},
    },
    tools: { register() { return () => {} } },
  }
  return { ctx, listeners, effects }
}

async function runningTask(id, workerSessionId, { mode = 'change', worktree } = {}) {
  await createTask({
    id,
    title: 'Reactivation probe',
    teamId,
    task: 'Probe worker tool registration.',
    mode,
    parentSessionId: 'router',
    projectRoot,
    baseCommit: 'a'.repeat(40),
    baseBranch: 'main',
    workerSessionId,
    status: 'running',
    createdAt: new Date().toISOString(),
    ...(worktree ? { worktree } : {}),
  })
  await linkWorkerSession(id, workerSessionId)
}

const workerTools = [
  'create_worktree', 'merge_branch', 'message_router', 'report_task', 'review_worker_commit',
]

test('apply registers a live worker that predates this plugin instance', async () => {
  const { agent, tools, prompts } = workerAgent('surviving-worker')
  await runningTask(taskIds[0], 'surviving-worker', { mode: 'merge' })
  const { ctx } = harness(agent)
  await apply(ctx)

  assert.deepEqual([...tools.keys()].sort(), workerTools)
  // The memory context follows the same activation, so a reload restores it too.
  assert.ok(prompts.some(entry => entry.name === 'superagent-lite-memory'))
})

test('repeated apply and repeated agent/created registration do not double-register', async () => {
  const { agent, tools, prompts } = workerAgent('repeat-worker')
  await runningTask(taskIds[1], 'repeat-worker')
  const { ctx, listeners } = harness(agent)
  await apply(ctx)
  const registered = tools.size
  const contextCount = prompts.length
  await apply(ctx)
  await listeners.get('agent/created')({ agent })
  await listeners.get('agent/created')({ agent })

  assert.equal(tools.size, registered)
  assert.equal(prompts.length, contextCount)
})

test('a fiber reload re-applies on the same context and restores the surviving worker', async () => {
  const { agent, tools } = workerAgent('reloaded-worker')
  await runningTask(taskIds[3], 'reloaded-worker', { mode: 'merge' })
  const { ctx, effects } = harness(agent)
  await apply(ctx)
  assert.ok(tools.has('message_router'))

  // Cordis tears down the previous instance and re-applies on the same context.
  await effects[0]()()
  assert.equal(tools.size, 0)
  await apply(ctx)

  assert.deepEqual([...tools.keys()].sort(), workerTools)
})

test('a cleared registration is restored by the fallback session event', async () => {
  const { agent, tools } = workerAgent('recovered-worker')
  await runningTask(taskIds[2], 'recovered-worker', { mode: 'merge' })
  const { ctx, listeners } = harness(agent)
  await apply(ctx)
  assert.ok(tools.has('message_router'))

  // Drop every tool the way a plugin unload does, without touching the agent.
  for (const name of [...tools.keys()]) tools.delete(name)
  await listeners.get('session/event')(agent.session, { type: 'user/message', data: { source: { kind: 'other' } } })
  for (let attempt = 0; attempt < 100 && !tools.has('message_router'); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  assert.deepEqual([...tools.keys()].sort(), workerTools)
})

test('a live helper keeps its tools across a reload and is still recognized', async () => {
  const scope = { baseCommit: 'a'.repeat(40), headCommit: 'b'.repeat(40) }
  const { agent, tools } = workerAgent('replay-reviewer', 'replay-worker')
  await expectHelper('replay-worker', scope, 'review', { projectRoot })
  const first = harness(agent, { listed: false })
  await apply(first.ctx)
  await first.listeners.get('agent/created')({ agent })
  assert.deepEqual([...tools.keys()].sort(), ['submit_review'])
  const registered = [...tools.keys()].sort()

  // The reload builds a fresh instance whose creation listener never saw this
  // helper; the cached descriptor still identifies it and its tools stay put.
  const second = harness(agent)
  await apply(second.ctx)
  await second.listeners.get('agent/created')({ agent })

  assert.deepEqual([...tools.keys()].sort(), registered)
})
