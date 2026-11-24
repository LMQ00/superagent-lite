import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'worker-status-'))
process.env.HOME = home

const {
  cancelQueuedWorker, createWorkerStatusTool, notifyWorkerStatus, workerCategory, workerStatusReport,
} = await import('../src/worker-status.js')
const {
  createTask, dataRoot, listCancelledTasks, listTasks, readTask, removeTask,
} = await import('../src/task-store.js')
const { pumpWorkers } = await import('../src/launch-queue.js')

after(() => rm(home, { recursive: true, force: true }))
beforeEach(async () => {
  for (const task of await listTasks()) await removeTask(task.id)
  await rm(join(dataRoot, 'tasks', 'cancelled'), { recursive: true, force: true })
})

let sequence = 0
function task({ id, status = 'queued', parentSessionId = 'router', ...rest } = {}) {
  const suffix = (++sequence).toString(16).padStart(16, '0')
  return {
    id: id ?? suffix,
    title: `Task ${suffix}`,
    teamId: 'team',
    task: 'Do the work',
    mode: 'change',
    parentSessionId,
    workerSessionId: `worker-${suffix}`,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...rest,
  }
}

const exec = (routerSessionId = 'router') => ({
  agent: { id: routerSessionId, session: { id: routerSessionId } },
  signal: new AbortController().signal,
})

test('worker status categories cover queued, running, delivered, cancelled and failed', () => {
  assert.equal(workerCategory({ status: 'queued' }), 'queued')
  for (const status of ['starting', 'running', 'resuming']) assert.equal(workerCategory({ status }), 'running')
  for (const status of ['review-required', 'awaiting-merge', 'awaiting-ci', 'merge-queued', 'publishing', 'merging', 'merged', 'completed']) {
    assert.equal(workerCategory({ status }), 'delivered')
  }
  assert.equal(workerCategory({ status: 'cancelled' }), 'cancelled')
  for (const status of ['failed', 'delivery-blocked', 'merge-conflict', 'interrupted']) {
    assert.equal(workerCategory({ status }), 'failed')
  }
})

test('worker_status reports this router task categories and ignores another router', async () => {
  const queued = task({ title: 'Waiting task' })
  const stillQueued = task({ title: 'Still waiting task' })
  const running = task({ status: 'running', title: 'Running task' })
  const delivered = task({ status: 'awaiting-merge', title: 'Delivered task' })
  const merged = task({ status: 'merged', title: 'Merged task' })
  const foreign = task({ parentSessionId: 'other-router', title: 'Foreign task' })
  for (const record of [queued, stillQueued, running, delivered, merged, foreign]) assert.equal(await createTask(record), true)
  assert.equal(await cancelQueuedWorker({ logger: { warn() {} } }, queued.id), true)

  const report = await createWorkerStatusTool().execute({}, exec())
  assert.match(report, /1 queued, 1 running, 2 delivered, 1 cancelled, 0 failed/)
  for (const title of ['Running task', 'Delivered task', 'Merged task']) assert.match(report, new RegExp(title))
  assert.match(report, new RegExp(queued.id))
  assert.match(report, /Cancelled \(1\):\n- /)
  assert.doesNotMatch(report, /Foreign task/)
  assert.doesNotMatch(report, new RegExp(foreign.id))

  const single = await createWorkerStatusTool().execute({ taskId: delivered.id }, exec())
  assert.match(single, /Delivered:/)
  assert.match(single, /Delivered task/)
  await assert.rejects(
    createWorkerStatusTool().execute({ taskId: foreign.id }, exec()),
    /does not belong to this Router Session/,
  )
  await assert.rejects(
    createWorkerStatusTool().execute({ taskId: 'not-a-task' }, exec()),
    /16-character lowercase hexadecimal/,
  )
  await assert.rejects(
    createWorkerStatusTool().execute({}, { agent: undefined, signal: new AbortController().signal }),
    /requires a Router Session/,
  )
})

test('workerStatusReport handles an empty router and a supplied task list without a store', () => {
  assert.equal(workerStatusReport([], []), 'No tasks were dispatched by this Router Session.')
  const text = workerStatusReport([task({ id: 'a'.repeat(16), status: 'failed', title: 'Broken' })])
  assert.match(text, /0 queued, 0 running, 0 delivered, 0 cancelled, 1 failed/)
  assert.match(text, /Broken/)
})

test('cancelling a queued task leaves a cancelled record and notifies its router', async () => {
  const notices = []
  const parent = { inject(message) { notices.push(message) } }
  const ctx = { logger: { warn() {} }, agents: { get: id => id === 'router' ? parent : undefined } }
  const queued = task({ status: 'queued', title: 'Cancel me' })
  const running = task({ status: 'running' })
  assert.equal(await createTask(queued), true)
  assert.equal(await createTask(running), true)

  assert.equal(await cancelQueuedWorker(ctx, queued.id), true)
  assert.equal(await readTask(queued.id), undefined)
  const cancelled = (await listCancelledTasks()).find(record => record.id === queued.id)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(typeof cancelled.cancelledAt, 'string')
  assert.equal(notices.length, 1)
  assert.match(notices[0].content[0].text, /was cancelled before starting and will not run/)
  assert.match(notices[0].content[0].text, new RegExp(queued.id))
  assert.notEqual(notices[0].source.kind, 'user')
  assert.equal(notices[0].role, 'user')

  assert.equal(await cancelQueuedWorker(ctx, queued.id), false)
  assert.equal(notices.length, 1)
  await assert.rejects(cancelQueuedWorker(ctx, running.id), /no longer queued/)
  assert.equal((await readTask(running.id)).status, 'running')
})

test('a queued worker that starts notifies its router through the launch queue', async () => {
  const notices = []
  const activations = []
  const parent = { id: 'router-start', session: { id: 'router-start' }, inject(message) { notices.push(message) } }
  const queued = task({ status: 'queued', parentSessionId: 'router-start', title: 'Start me' })
  assert.equal(await createTask(queued), true)
  const ctx = {
    logger: { warn() {} },
    agents: { get: id => id === 'router-start' ? parent : undefined },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) { activations.push(spec); return { childId: spec.childId } },
    },
  }

  await pumpWorkers(ctx)
  assert.equal(activations.length, 1)
  assert.equal((await readTask(queued.id)).status, 'starting')
  assert.equal(notices.length, 1)
  assert.match(notices[0].content[0].text, /started and is no longer waiting for a slot/)
  assert.match(notices[0].content[0].text, new RegExp(queued.id))
  assert.equal(notices[0].source.kind, 'superagent-lite-worker-status')
})

test('a status notice without a live injector is skipped', () => {
  assert.equal(notifyWorkerStatus({ agents: { get: () => ({}) } }, task(), 'starting'), false)
  const failing = {
    logger: { warn() {} },
    agents: { get: () => ({ inject() { throw new Error('inbox closed') } }) },
  }
  assert.equal(notifyWorkerStatus(failing, task(), 'cancelled'), false)
})

test('a cancelled tombstone is hidden when the same task ID is active again', async () => {
  const retried = task({ status: 'queued', title: 'Retried task' })
  assert.equal(await createTask(retried), true)
  assert.equal(await cancelQueuedWorker({ logger: { warn() {} } }, retried.id), true)
  assert.equal(await createTask({ ...retried, status: 'running' }), true)
  const report = await createWorkerStatusTool().execute({}, exec())
  assert.match(report, /0 queued, 1 running, 0 delivered, 0 cancelled, 0 failed/)
  assert.equal((await createWorkerStatusTool().execute({ taskId: retried.id }, exec())).startsWith('Running:'), true)
})
