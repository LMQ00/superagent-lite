import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'worker-status-'))
process.env.HOME = home

const {
  createWorkerStatusTool, notifyWorkerStatus, workerCategory, workerStatusReport,
} = await import('../src/worker-status.js')
const {
  createTask, dataRoot, listTasks, readTask, removeTask, stopTask,
} = await import('../src/task-store.js')
const { stopWorker } = await import('../src/worker-stop.js')
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
  await stopTask(queued.id)

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

test('worker_status scopes tasks to the router current project as well as its session', async () => {
  const own = task({ title: 'Own project task', projectRoot: '/project-a', teamId: 'team-a' })
  const foreign = task({ title: 'Foreign project task', projectRoot: '/project-b', teamId: 'team-b' })
  for (const record of [own, foreign]) assert.equal(await createTask(record), true)

  const tool = createWorkerStatusTool({ workingDirectory: { get: () => '/project-a' } })
  const report = await tool.execute({}, exec())
  assert.match(report, /Own project task/)
  assert.doesNotMatch(report, /Foreign project task/)
  assert.match(await tool.execute({ taskId: own.id }, exec()), /Own project task/)
  await assert.rejects(
    tool.execute({ taskId: foreign.id }, exec()),
    /does not belong to this Router Session and project/,
  )

  const other = createWorkerStatusTool({ workingDirectory: { get: () => '/project-b' } })
  const otherReport = await other.execute({}, exec())
  assert.match(otherReport, /Foreign project task/)
  assert.doesNotMatch(otherReport, /Own project task/)
})

test('workerStatusReport handles an empty router and a supplied task list without a store', () => {
  assert.equal(workerStatusReport([], []), 'No tasks were dispatched by this Router Session.')
  const text = workerStatusReport([task({ id: 'a'.repeat(16), status: 'failed', title: 'Broken' })])
  assert.match(text, /0 queued, 0 running, 0 delivered, 0 cancelled, 1 failed/)
  assert.match(text, /Broken/)
})

test('stopping a task interrupts its worker, keeps a cancelled record and notifies its router', async () => {
  const notices = []
  const interrupted = []
  const parent = { inject(message) { notices.push(message) } }
  const running = task({ status: 'running', title: 'Stop me' })
  assert.equal(await createTask(running), true)
  const worker = { status: 'running', whenIdle: async () => { worker.status = 'idle' } }
  const ctx = {
    logger: { warn() {} },
    agents: { get: id => id === 'router' ? parent : id === running.workerSessionId ? worker : undefined },
    subagents: { interrupt(id, authority) { interrupted.push([id, authority]) } },
  }

  const stopped = await stopWorker(ctx, running.id)
  assert.equal(stopped.stopped, true)
  assert.equal(stopped.task.status, 'cancelled')
  assert.deepEqual(interrupted, [[running.workerSessionId, { kind: 'user' }]])
  const cancelled = await readTask(running.id)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(typeof cancelled.cancelledAt, 'string')
  assert.equal(notices.length, 1)
  assert.match(notices[0].content[0].text, /was cancelled; its worker was stopped and its concurrency slot is free/)
  assert.match(notices[0].content[0].text, new RegExp(running.id))
  assert.notEqual(notices[0].source.kind, 'user')
  assert.equal(notices[0].role, 'user')

  const again = await stopWorker(ctx, running.id)
  assert.equal(again.stopped, false)
  assert.equal(notices.length, 1)
  assert.equal(await stopWorker(ctx, 'ffffffffffffffff'), undefined)
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

test('a status notice is skipped when the router works in another project', () => {
  const parent = { session: { id: 'router' }, inject() { throw new Error('must not inject') } }
  const ctx = {
    logger: { warn() {} },
    agents: { get: () => parent },
    workingDirectory: { get: () => '/project-b' },
  }
  assert.equal(notifyWorkerStatus(ctx, task({ projectRoot: '/project-a' }), 'cancelled'), false)
})

test('a legacy cancelled tombstone is hidden when the same task ID is active again', async () => {
  const retried = task({ status: 'queued', title: 'Retried task' })
  await mkdir(join(dataRoot, 'tasks', 'cancelled'), { recursive: true })
  await writeFile(join(dataRoot, 'tasks', 'cancelled', `${retried.id}.json`), JSON.stringify({ ...retried, status: 'cancelled' }))
  assert.equal(await createTask({ ...retried, status: 'running' }), true)
  const report = await createWorkerStatusTool().execute({}, exec())
  assert.match(report, /0 queued, 1 running, 0 delivered, 0 cancelled, 0 failed/)
  assert.equal((await createWorkerStatusTool().execute({ taskId: retried.id }, exec())).startsWith('Running:'), true)
})
