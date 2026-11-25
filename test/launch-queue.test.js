import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

// Reclaims read the worker branch and HEAD through the Host subprocess service,
// so the fixture context mirrors `runCommand` from src/process.js.
function commandContext() {
  return {
    logger: { warn() {} },
    agents: { get: () => undefined },
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
}

async function reviewableFixture(name) {
  const repo = join(home, name)
  const worktree = join(home, `${name}-worktree`)
  await mkdir(repo, { recursive: true })
  git(repo, ['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'initial'])
  const baseCommit = git(repo, ['rev-parse', 'HEAD'])
  git(repo, ['worktree', 'add', '-b', 'sl-worker', worktree])
  await writeFile(join(worktree, 'notes.txt'), 'changed\n')
  git(worktree, ['add', '.'])
  git(worktree, ['commit', '-m', 'change'])
  return { repo, worktree, branch: 'sl-worker', baseCommit, head: git(worktree, ['rev-parse', 'HEAD']) }
}

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
  assert.match(reclaimed.failure, /ended before the task resumed/)
  assert.match(reclaimed.failure, /stale resuming record was reclaimed/)
  assert.equal(typeof reclaimed.finishedAt, 'string')
  assert.equal((await readTask(queued.id)).status, 'starting')
  assert.equal(activations.length, 1)
})

test('reclaiming is idempotent and leaves a live or fresh worker alone', async () => {
  const live = task({ status: 'resuming', updatedAt: staleAt(), workerSessionId: 'live-worker' })
  const liveRunning = task({ status: 'running', updatedAt: staleAt(), workerSessionId: 'live-worker' })
  const fresh = task({ status: 'resuming', title: 'Fresh resume' })
  const stale = task({ status: 'starting', updatedAt: staleAt(), title: 'Stale start' })
  const staleRunning = task({ status: 'running', updatedAt: staleAt(), title: 'Stale running' })
  for (const record of [live, liveRunning, fresh, stale, staleRunning]) assert.equal(await createTask(record), true)
  const ctx = context([])
  ctx.agents.get = id => id === 'live-worker' ? {} : id === 'router' ? { id: 'router', session: { id: 'router' } } : undefined

  assert.equal(await reclaimStaleWorkers(ctx, await listTasks()), true)
  assert.equal(await reclaimStaleWorkers(ctx, await listTasks()), false)
  assert.equal((await readTask(live.id)).status, 'resuming')
  assert.equal((await readTask(liveRunning.id)).status, 'running')
  assert.equal((await readTask(fresh.id)).status, 'resuming')
  assert.equal((await readTask(stale.id)).status, 'failed')
  assert.equal((await readTask(staleRunning.id)).status, 'failed')
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

test('a stale starting record is reclaimed with its own reason', async () => {
  const stale = task({ status: 'starting', updatedAt: staleAt(), title: 'Stale start' })
  assert.equal(await createTask(stale), true)

  assert.equal(await reclaimStaleWorkers(commandContext(), await listTasks()), true)

  const reclaimed = await readTask(stale.id)
  assert.equal(reclaimed.status, 'failed')
  assert.match(reclaimed.failure, /ended before the task started/)
})

test('a stale running record without a review is failed with the missing turn/end reason', async () => {
  const stale = task({ status: 'running', updatedAt: staleAt(), title: 'Stale running' })
  assert.equal(await createTask(stale), true)

  assert.equal(await reclaimStaleWorkers(commandContext(), await listTasks()), true)
  assert.equal(await reclaimStaleWorkers(commandContext(), await listTasks()), false)

  const reclaimed = await readTask(stale.id)
  assert.equal(reclaimed.status, 'failed')
  assert.match(reclaimed.failure, /without a turn\/end/)
  assert.match(reclaimed.failure, /stale running record was reclaimed/)
})

test('a stale running record with a reviewed matching HEAD lands in awaiting-merge', async () => {
  const fixture = await reviewableFixture('reviewed-zombie')
  const stale = task({
    status: 'running', updatedAt: staleAt(), title: 'Reviewed zombie',
    projectRoot: fixture.repo, teamId: 'git-team', baseCommit: fixture.baseCommit,
    worktree: { path: fixture.worktree, branch: fixture.branch },
    review: { approved: true, head: fixture.head },
  })
  assert.equal(await createTask(stale), true)

  assert.equal(await reclaimStaleWorkers(commandContext(), await listTasks()), true)
  assert.equal(await reclaimStaleWorkers(commandContext(), await listTasks()), false)

  const reclaimed = await readTask(stale.id)
  assert.equal(reclaimed.status, 'awaiting-merge')
  assert.equal(reclaimed.failure, undefined)
  assert.equal(typeof reclaimed.finishedAt, 'string')
})

test('a stale running record whose worktree HEAD moved past the review is failed', async () => {
  const fixture = await reviewableFixture('moved-zombie')
  const stale = task({
    status: 'running', updatedAt: staleAt(), title: 'Moved zombie',
    projectRoot: fixture.repo, teamId: 'git-team', baseCommit: fixture.baseCommit,
    worktree: { path: fixture.worktree, branch: fixture.branch },
    review: { approved: true, head: fixture.head },
  })
  assert.equal(await createTask(stale), true)
  await writeFile(join(fixture.worktree, 'notes.txt'), 'later\n')
  git(fixture.worktree, ['add', '.'])
  git(fixture.worktree, ['commit', '-m', 'later'])

  await reclaimStaleWorkers(commandContext(), await listTasks())

  const reclaimed = await readTask(stale.id)
  assert.equal(reclaimed.status, 'failed')
  assert.match(reclaimed.failure, /without a turn\/end/)
})

test('a stale running record whose worker branch is gone is failed', async () => {
  const fixture = await reviewableFixture('missing-branch-zombie')
  const stale = task({
    status: 'running', updatedAt: staleAt(), title: 'Missing branch zombie',
    projectRoot: fixture.repo, teamId: 'git-team', baseCommit: fixture.baseCommit,
    worktree: { path: fixture.worktree, branch: fixture.branch },
    review: { approved: true, head: fixture.head },
  })
  assert.equal(await createTask(stale), true)
  git(fixture.repo, ['worktree', 'remove', '--force', fixture.worktree])
  git(fixture.repo, ['branch', '-D', fixture.branch])

  await reclaimStaleWorkers(commandContext(), await listTasks())

  const reclaimed = await readTask(stale.id)
  assert.equal(reclaimed.status, 'failed')
  assert.match(reclaimed.failure, /stale running record was reclaimed/)
})
