import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'worktree-tool-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))

const { createTask, readTask } = await import('../src/task-store.js')
const { createWorktreeTool } = await import('../src/worktree-tool.js')

const baseCommit = 'a'.repeat(40)

async function runningTask(id, fields = {}) {
  await createTask({
    id,
    title: 'Readable worktree names',
    worktreeName: 'readable-worktree-names',
    teamId: 'Core Team',
    task: 'make names readable',
    mode: 'change',
    land: false,
    parentSessionId: 'router',
    projectRoot: '/project',
    baseCommit,
    baseBranch: 'master',
    workerSessionId: 'worker',
    status: 'running',
    createdAt: new Date().toISOString(),
    ...fields,
  })
}

function harness(agent) {
  const created = []
  const entered = []
  const released = []
  const ctx = {
    worktrees: {
      async create(caller, options) {
        assert.equal(caller, agent)
        created.push(options)
        return {
          path: join(home, '.agents/worktrees', options.name),
          branch: options.name,
          baseCommit: options.from,
          repositoryRoot: '/project',
        }
      },
    },
    workingDirectory: {
      async set(caller, path) {
        assert.equal(caller, agent)
        entered.push(path)
      },
    },
  }
  return { ctx, created, entered, released }
}

const signal = new AbortController().signal

test('a new task gets a readable scoped branch and worktree name with a stable task suffix', async () => {
  const taskId = '0123456789abcdef'
  const agent = { id: 'worker', session: { id: 'session' } }
  await runningTask(taskId)
  const { ctx, created, entered, released } = harness(agent)
  const tool = createWorktreeTool(ctx, agent, taskId, path => released.push(path))

  const result = await tool.execute({}, { agent, signal })

  assert.equal(created.length, 1)
  assert.deepEqual(created[0], { name: 'sl-readable-worktree-names-0123456789ab', from: baseCommit })
  assert.deepEqual(result, {
    path: join(home, '.agents/worktrees', 'sl-readable-worktree-names-0123456789ab'),
    branch: 'sl-readable-worktree-names-0123456789ab',
    baseCommit,
    projectRoot: '/project',
    teamId: 'Core Team',
  })
  assert.deepEqual(entered, [])
  assert.deepEqual(released, [result.path])
  const saved = await readTask(taskId)
  assert.equal(saved.status, 'running')
  assert.deepEqual(saved.worktree, {
    path: result.path,
    branch: result.branch,
    baseCommit,
    repositoryRoot: '/project',
    sourceBranch: 'master',
  })
})

test('calling create_worktree again re-enters the recorded worktree without creating another', async () => {
  const taskId = 'fedcba9876543210'
  const agent = { id: 'worker', session: { id: 'session' } }
  await runningTask(taskId)
  const { ctx, created, entered } = harness(agent)
  const tool = createWorktreeTool(ctx, agent, taskId, () => {})

  const first = await tool.execute({}, { agent, signal })
  const second = await tool.execute({}, { agent, signal })

  assert.equal(created.length, 1)
  assert.deepEqual(entered, [first.path])
  assert.deepEqual(second, first)
})

test('a task recorded before readable names keeps the previous name when its worktree is first created', async () => {
  const taskId = '0011223344556677'
  const agent = { id: 'worker', session: { id: 'session' } }
  await runningTask(taskId, { worktreeName: undefined })
  const { ctx, created } = harness(agent)
  const tool = createWorktreeTool(ctx, agent, taskId, () => {})

  await tool.execute({}, { agent, signal })

  assert.equal(created[0].name, `sl-core-team-${taskId}`)
})
