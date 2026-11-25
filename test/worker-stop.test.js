import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'worker-stop-'))
process.env.HOME = home

const { createDispatchTool } = await import('../src/dispatch.js')
const { pumpWorkers } = await import('../src/launch-queue.js')
const { listTasks, readTask, removeTask } = await import('../src/task-store.js')
const { stopWorker } = await import('../src/worker-stop.js')
const { saveWorkerSettings, defaultWorkerSettings } = await import('../src/worker-settings.js')

after(() => rm(home, { recursive: true, force: true }))
beforeEach(async () => {
  for (const task of await listTasks()) await removeTask(task.id)
})

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

async function repoFixture(name) {
  const repo = join(home, name)
  await mkdir(repo)
  git(repo, ['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'initial'])
  return { repo }
}

const exec = callId => ({
  agent: { id: 'router', session: { id: 'router' } },
  callId,
  signal: new AbortController().signal,
})

test('stopping a running worker interrupts it and releases the slot for the next queued task', async () => {
  await saveWorkerSettings({ ...defaultWorkerSettings(), maxWorkers: 1 })
  const { repo } = await repoFixture('stop-releases-slot')
  const activations = []
  const interrupted = []
  const router = { id: 'router', session: { id: 'router' } }
  const agents = new Map([[router.id, router]])
  const ctx = {
    logger: { warn() {} },
    workingDirectory: { get: () => repo },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    agents: { get: id => agents.get(id) },
    subagents: {
      resolveMaxDepth: () => 1,
      interrupt(id, authority) { interrupted.push([id, authority]) },
      async startActivation(spec) { activations.push(spec); return { childId: spec.childId } },
    },
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv, cwd, env }) {
        const [command, ...args] = argv
        const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
        return {
          done: Promise.resolve({ exitCode: result.status }),
          collected: {
            stdout: { readFrom: () => ({ text: result.stdout ?? '', lossy: false }) },
            stderr: { readFrom: () => ({ text: result.stderr ?? '', lossy: false }) },
          },
        }
      },
    },
  }
  const dispatch = createDispatchTool(ctx)
  const first = await dispatch.execute({
    mode: 'change', title: 'First', teamId: 'team-stop', task: 'First change', worktreeName: 'first-stop',
  }, exec('first'))
  assert.equal(first.status, 'starting')
  agents.set(first.workerSessionId, {
    status: 'running',
    whenIdle: async () => { agents.get(first.workerSessionId).status = 'idle' },
  })

  const second = await dispatch.execute({
    mode: 'change', title: 'Second', teamId: 'team-stop', task: 'Second change', worktreeName: 'second-stop',
  }, exec('second'))
  assert.equal(second.status, 'queued')
  assert.equal((await readTask(second.taskId)).status, 'queued')

  const stopped = await stopWorker(ctx, first.taskId, { waitForStop: true })
  assert.equal(stopped.stopped, true)
  assert.equal(stopped.ready, true)
  assert.deepEqual(interrupted, [[first.workerSessionId, { kind: 'user' }]])
  assert.equal((await readTask(first.taskId)).status, 'cancelled')
  assert.equal((await readTask(second.taskId)).status, 'starting')
  assert.equal(activations.length, 2)
  assert.equal(activations[1].childId, second.workerSessionId)

  // The queued task that starts is unchanged; stopping again is an accepted no-op.
  const again = await stopWorker(ctx, first.taskId)
  assert.equal(again.stopped, false)
  assert.equal((await readTask(first.taskId)).status, 'cancelled')
  assert.equal(interrupted[0][0], first.workerSessionId)
})

test('stopping a queued task removes it from the launch queue without interrupting anyone', async () => {
  await saveWorkerSettings({ ...defaultWorkerSettings(), maxWorkers: 1 })
  const { repo } = await repoFixture('stop-queued')
  const activations = []
  const interrupted = []
  const router = { id: 'router', session: { id: 'router' } }
  const ctx = {
    logger: { warn() {} },
    workingDirectory: { get: () => repo },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    agents: { get: id => id === router.id ? router : undefined },
    subagents: {
      resolveMaxDepth: () => 1,
      interrupt(id, authority) { interrupted.push([id, authority]) },
      async startActivation(spec) { activations.push(spec); return { childId: spec.childId } },
    },
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv, cwd, env }) {
        const [command, ...args] = argv
        const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
        return {
          done: Promise.resolve({ exitCode: result.status }),
          collected: {
            stdout: { readFrom: () => ({ text: result.stdout ?? '', lossy: false }) },
            stderr: { readFrom: () => ({ text: result.stderr ?? '', lossy: false }) },
          },
        }
      },
    },
  }
  const dispatch = createDispatchTool(ctx)
  await dispatch.execute({
    mode: 'change', title: 'Occupies', teamId: 'team-stop-q', task: 'Occupies the slot', worktreeName: 'occupies',
  }, exec('occupies'))
  const queued = await dispatch.execute({
    mode: 'change', title: 'Waiting', teamId: 'team-stop-q', task: 'Waiting change', worktreeName: 'waiting',
  }, exec('waiting'))
  assert.equal(queued.status, 'queued')

  const stopped = await stopWorker(ctx, queued.taskId)
  assert.equal(stopped.stopped, true)
  assert.equal(stopped.task.status, 'cancelled')
  assert.deepEqual(interrupted, [])
  await pumpWorkers(ctx)
  assert.equal(activations.length, 1)
  assert.equal((await readTask(queued.taskId)).status, 'cancelled')
})
