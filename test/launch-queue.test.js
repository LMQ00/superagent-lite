import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'launch-queue-'))
process.env.HOME = home

const { createTask, listTasks, readTask, removeTask } = await import('../src/task-store.js')
const { defaultWorkerSettings, saveWorkerSettings } = await import('../src/worker-settings.js')
const { occupiedSlots, pumpWorkers, reclaimStaleWorkers, STALE_ACTIVE_MS } = await import('../src/launch-queue.js')

after(() => rm(home, { recursive: true, force: true }))
beforeEach(async () => {
  for (const task of await listTasks()) await removeTask(task.id)
  await saveWorkerSettings(defaultWorkerSettings())
})

const staleAt = () => new Date(Date.now() - STALE_ACTIVE_MS - 1_000).toISOString()
let sequence = 0

function task({ status = 'queued', updatedAt = new Date().toISOString(), parentSessionId = 'router', ...rest } = {}) {
  const suffix = (++sequence).toString(16).padStart(16, '0')
  return {
    id: suffix,
    title: `Task ${suffix}`,
    teamId: 'team',
    task: 'Do the work',
    mode: 'change',
    parentSessionId,
    projectRoot: home,
    baseBranch: 'main',
    workerSessionId: `worker-${suffix}`,
    status,
    createdAt: updatedAt,
    updatedAt,
    ...rest,
  }
}

function context(activations) {
  const parent = { id: 'router', session: { id: 'router' } }
  return {
    logger: { warn() {} },
    agents: { get: id => id === 'router' ? parent : undefined },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) { activations.push(spec); return { childId: spec.childId } },
    },
  }
}

test('a stale starting or resuming task without a worker no longer reserves a slot', () => {
  const ctx = { agents: { get: id => id === 'live-worker' ? {} : undefined } }
  const now = Date.now()
  assert.equal(occupiedSlots(ctx, [
    { status: 'starting', workerSessionId: 'dead-starting', updatedAt: staleAt() },
    { status: 'resuming', workerSessionId: 'dead-resuming', updatedAt: staleAt() },
    { status: 'starting', workerSessionId: 'fresh-starting', updatedAt: new Date(now).toISOString() },
    { status: 'resuming', workerSessionId: 'live-worker', updatedAt: staleAt() },
    { status: 'running', workerSessionId: 'live-worker' },
    { status: 'running', workerSessionId: 'dead-running' },
  ], now), 3)
})

test('pumping reclaims a stuck resuming task and gives its slot to the queue', async () => {
  const stuck = task({ status: 'resuming', updatedAt: staleAt(), title: 'Stuck resume' })
  const queued = task({ status: 'queued', title: 'Waiting for a slot' })
  for (const record of [stuck, queued]) assert.equal(await createTask(record), true)
  await saveWorkerSettings({ workerModel: null, maxWorkers: 1 })
  const activations = []

  await pumpWorkers(context(activations))

  const reclaimed = await readTask(stuck.id)
  assert.equal(reclaimed.status, 'failed')
  assert.match(reclaimed.failure, /worker Session is no longer running/)
  assert.match(reclaimed.failure, /reclaimed from resuming/)
  assert.equal(typeof reclaimed.finishedAt, 'string')
  assert.equal((await readTask(queued.id)).status, 'starting')
  assert.equal(activations.length, 1)
})

test('reclaiming is idempotent and leaves a live or fresh worker alone', async () => {
  const live = task({ status: 'resuming', updatedAt: staleAt(), workerSessionId: 'live-worker' })
  const fresh = task({ status: 'resuming', title: 'Fresh resume' })
  const stale = task({ status: 'starting', updatedAt: staleAt(), title: 'Stale start' })
  for (const record of [live, fresh, stale]) assert.equal(await createTask(record), true)
  const ctx = context([])
  ctx.agents.get = id => id === 'live-worker' ? {} : id === 'router' ? { id: 'router', session: { id: 'router' } } : undefined

  assert.equal(await reclaimStaleWorkers(ctx, await listTasks()), true)
  assert.equal(await reclaimStaleWorkers(ctx, await listTasks()), false)
  assert.equal((await readTask(live.id)).status, 'resuming')
  assert.equal((await readTask(fresh.id)).status, 'resuming')
  assert.equal((await readTask(stale.id)).status, 'failed')
})

test('a fresh resuming task keeps its slot while the worker starts', async () => {
  const resuming = task({ status: 'resuming', title: 'Just resumed' })
  const queued = task({ status: 'queued', title: 'Waiting behind it' })
  for (const record of [resuming, queued]) assert.equal(await createTask(record), true)
  await saveWorkerSettings({ workerModel: null, maxWorkers: 1 })
  const activations = []

  await pumpWorkers(context(activations))

  assert.equal((await readTask(resuming.id)).status, 'resuming')
  assert.equal((await readTask(queued.id)).status, 'queued')
  assert.equal(activations.length, 0)
})
