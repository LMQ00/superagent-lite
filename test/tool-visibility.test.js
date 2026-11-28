import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-visibility-'))
const originalHome = process.env.HOME
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

const { apply } = await import('../index.js')
const { createTask, linkWorkerSession, removeTask } = await import('../src/task-store.js')

const projectRoot = join(home, 'project')
const taskId = 'bbbbbbbbbbbbbbb1'

function harness() {
  const listeners = new Map()
  const sends = []
  let guard
  const tools = []
  const agent = {
    id: 'merge-worker',
    status: 'running',
    session: { id: 'merge-worker', header: { origin: 'subagent', parentSession: 'router' } },
    ctx: {
      systemPrompt: { context: () => () => {} },
      tools: {
        guard(check) { guard = check; return () => {} },
        register(tool, options) {
          tools.push({ tool, when: options?.when })
          return () => {}
        },
      },
    },
  }
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get: id => id === agent.id ? agent : undefined, list: () => [] },
    agentPresets: { composedPreset: () => 'superagent-lite-worker' },
    workingDirectory: { get: () => projectRoot, async set() {} },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    subprocess: { async resolveExecutable(name) { return name }, spawn() { throw new Error('not used') } },
    worktrees: { async create() { throw new Error('not used') } },
    tools: { register() { return () => {} } },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) { return { childId: spec.childId } },
      async sendMessage(sender, targetId, content) { sends.push({ sender: sender.id, targetId, content }) },
    },
  }
  return { ctx, listeners, agent, tools, sends, guard: input => guard(input) }
}

const exec = agent => ({ agent, callId: 'call-1', signal: new AbortController().signal })

test('merge and review tools appear before the worktree and refuse the call explicitly', async () => {
  await createTask({
    id: taskId,
    title: 'Merge delivered branches',
    teamId: 'team-visibility',
    task: 'Merge the delivered branches.',
    mode: 'merge',
    land: true,
    mergeBranches: ['sl-delivered'],
    parentSessionId: 'router',
    projectRoot,
    baseCommit: 'a'.repeat(40),
    baseBranch: 'main',
    workerSessionId: 'merge-worker',
    status: 'running',
    createdAt: new Date().toISOString(),
  })
  await linkWorkerSession(taskId, 'merge-worker')
  try {
    const { ctx, listeners, agent, tools, sends, guard } = harness()
    await apply(ctx)
    await listeners.get('agent/created')({ agent })

    const visible = name => tools.find(entry => entry.tool.name === name)?.when({ agent })
    assert.equal(visible('create_worktree'), true)
    assert.equal(visible('merge_branch'), true)
    assert.equal(visible('review_worker_commit'), true)
    assert.equal(visible('message_router'), true)

    const merge = tools.find(entry => entry.tool.name === 'merge_branch').tool
    await assert.rejects(merge.execute({ branch: 'sl-delivered' }, exec(agent)),
      /No active merge worktree/)
    const review = tools.find(entry => entry.tool.name === 'review_worker_commit').tool
    await assert.rejects(review.execute({}, exec(agent)), /No active worker worktree/)

    const message = tools.find(entry => entry.tool.name === 'message_router').tool
    const reported = await message.execute({ message: 'BLOCKED: worktree creation failed' }, exec(agent))
    assert.match(reported, /Message delivered/)
    assert.equal(sends.length, 1)
    assert.equal(sends[0].sender, 'merge-worker')
    assert.equal(sends[0].targetId, 'router')
    assert.equal(sends[0].content[0].text, 'BLOCKED: worktree creation failed')

    assert.equal(guard({ name: 'message_router' }), undefined)
    assert.match(guard({ name: 'merge_branch' }), /Create the assigned project worktree/)
    assert.match(guard({ name: 'review_worker_commit' }), /Create the assigned project worktree/)
    assert.match(guard({ name: 'read' }), /Create the assigned project worktree/)
  } finally {
    await removeTask(taskId)
  }
})
