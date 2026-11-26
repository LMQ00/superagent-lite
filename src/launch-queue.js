import { dataRoot, listTasks, readTask, updateTask } from './task-store.js'
import { buildWorkerPrompt } from './worker-prompt.js'
import { forgetLanding } from './landing.js'
import { notifyWorkerStatus } from './worker-status.js'
import { readWorkerSettings, workerAgentOptions } from './worker-settings.js'
import { interruptWorker } from './worker-control.js'
import { imageBlocksFromReferences } from './message-images.js'
import { runCommand } from './process.js'
import { startActivation } from './subagent-start.js'

// Worker launches beyond the configured limit wait as `queued` Task records.
// The queue is serialized per data root so two dispatches cannot claim the same slot.
const pumps = new Map()
const parents = new Map()
const lifetimes = new Map()

// A Task can stay in `starting`, `running` or `resuming` after its Session is
// gone; a lost `subagent/end` never moves it to a terminal state. The active
// states survive this window without a live agent only when no terminal event
// can arrive, so they are reclaimed by the next scan.
export const STALE_ACTIVE_MS = 2 * 60_000

const ACTIVE_STATUSES = new Set(['starting', 'running', 'resuming'])
function lifetime() {
  let controller = lifetimes.get(dataRoot)
  if (!controller) {
    controller = new AbortController()
    lifetimes.set(dataRoot, controller)
  }
  return controller.signal
}

function parentFor(ctx, task) {
  return parents.get(task.id) ?? ctx.agents?.get?.(task.parentSessionId)
}

function runningAgent(ctx, task) {
  const agents = ctx.agents
  if (!agents?.get) return true
  return Boolean(agents.get(task.workerSessionId))
}

function lastUpdate(task) {
  const time = Date.parse(task.updatedAt ?? task.createdAt ?? '')
  return Number.isFinite(time) ? time : 0
}

function reservesSlot(task, now) {
  return now - lastUpdate(task) <= STALE_ACTIVE_MS
}

function staleActiveTask(task, now) {
  return ACTIVE_STATUSES.has(task.status) && !reservesSlot(task, now)
}

function reclaimedFailure(task) {
  const reason = task.status === 'running'
    ? 'The worker Session ended without a turn/end'
    : `The worker Session ended before the task ${task.status === 'resuming' ? 'resumed' : 'started'}`
  return `${reason}; the stale ${task.status} record was reclaimed and no longer occupies a worker slot`
}

// A lost Session may have delivered its reviewed commit before it disappeared.
// Read the recorded review, the worker branch and the worktree HEAD so the
// reclaimed Task lands where `subagent/end` would have put it.
async function reclaimedOutcome(ctx, task) {
  const { path, branch } = task.worktree ?? {}
  if (task.git !== false && task.review?.approved === true && typeof task.review.head === 'string' &&
      typeof path === 'string' && typeof branch === 'string') {
    try {
      await runCommand(ctx, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`], path)
      if (await runCommand(ctx, ['rev-parse', '--verify', 'HEAD^{commit}'], path) === task.review.head) {
        return { status: 'awaiting-merge' }
      }
    } catch {
      // A missing branch or worktree has no reviewed HEAD left to deliver.
    }
  }
  return { status: 'failed', failure: reclaimedFailure(task) }
}

// A Task can lose its Session without a terminal event, for example when the
// Host restarts before a `turn/end` arrives. A scan reclaims such records so
// they stop showing as unconfirmed and stop reserving a slot. A fresh record or
// one with a live agent is left alone; the write re-checks both under the Task
// lock so a Worker that starts mid-scan is never touched.
export async function reclaimStaleWorkers(ctx, tasks, now = Date.now()) {
  let reclaimed = false
  for (const task of tasks) {
    if (!staleActiveTask(task, now) || runningAgent(ctx, task)) continue
    const outcome = await reclaimedOutcome(ctx, task)
    let wrote = false
    try {
      await updateTask(task.id, current => {
        if (!staleActiveTask(current, now) || runningAgent(ctx, current)) return {}
        wrote = true
        return { ...outcome, finishedAt: new Date(now).toISOString() }
      })
    } catch (error) {
      if (error.code === 'ENOENT') continue
      ctx.logger?.warn(`superagent-lite worker queue: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (wrote) reclaimed = true
  }
  return reclaimed
}

export async function reclaimStaleTasks(ctx, now = Date.now()) {
  return reclaimStaleWorkers(ctx, await listTasks(), now)
}
export function occupiedSlots(ctx, tasks, now = Date.now()) {
  return tasks.filter(task => {
    if (task.status === 'starting' || task.status === 'resuming') {
      return runningAgent(ctx, task) || reservesSlot(task, now)
    }
    return task.status === 'running' && runningAgent(ctx, task)
  }).length
}

async function launch(ctx, task) {
  const parent = parentFor(ctx, task)
  if (!parent) {
    forgetLanding(task.id)
    await updateTask(task.id, {
      status: 'failed',
      failure: 'The Router Session is no longer running; dispatch the task again',
      finishedAt: new Date().toISOString(),
    })
    return true
  }
  const settings = await readWorkerSettings()
  const agentOptions = workerAgentOptions(settings)
  // A stop can land between the queue claiming this slot and the activation.
  // Re-read the record so a cancelled Task never starts a worker.
  const latest = await readTask(task.id)
  if (!latest || (latest.status !== 'starting' && latest.status !== 'resuming')) return true
  task = latest
  try {
    await startActivation(ctx.subagents, {
      provider: 'spawn',
      parent,
      cwd: task.projectRoot,
      name: `sl-${task.id}`,
      childId: task.workerSessionId,
      label: `${task.teamId}: ${task.title}`,
      agentPreset: 'superagent-lite-worker',
      prompt: [{
        type: 'text',
        text: buildWorkerPrompt({
          title: task.title,
          teamId: task.teamId,
          task: task.task,
          baseBranch: task.baseBranch,
          git: task.git !== false,
          mode: task.mode,
          land: task.land === true,
          branches: task.mergeBranches ?? [],
        }),
      }, ...imageBlocksFromReferences(task.images)],
      ...(agentOptions ? { agentOptions } : {}),
      promptSource: { kind: 'agent-message', form: 'relay', senderSessionId: parent.id },
      signal: lifetime(),
      delivery: 'parent',
      maxDepth: ctx.subagents.resolveMaxDepth(),
    })
    parents.delete(task.id)
    // A stop or delete during activation must not leave a live worker behind.
    const settled = await readTask(task.id)
    if (!settled || settled.status === 'cancelled') {
      interruptWorker(ctx, task.workerSessionId)
      return true
    }
    notifyWorkerStatus(ctx, task, 'starting')
    return true
  } catch (error) {
    parents.delete(task.id)
    forgetLanding(task.id)
    const failure = error instanceof Error ? error.message : String(error)
    try {
      await updateTask(task.id, { status: 'failed', failure, finishedAt: new Date().toISOString() })
    } catch (saveError) {
      ctx.logger?.warn(`superagent-lite worker queue: ${saveError instanceof Error ? saveError.message : String(saveError)}`)
    }
    ctx.logger?.warn(`superagent-lite worker launch: ${failure}`)
    return false
  }
}

async function run(ctx) {
  for (;;) {
    let tasks = await listTasks()
    const now = Date.now()
    if (await reclaimStaleWorkers(ctx, tasks, now)) tasks = await listTasks()
    const settings = await readWorkerSettings()
    if (occupiedSlots(ctx, tasks, now) >= settings.maxWorkers) return
    const next = tasks
      .filter(task => task.status === 'queued')
      .sort((left, right) => (left.createdAt ?? '').localeCompare(right.createdAt ?? ''))[0]
    if (!next) return
    let task
    try {
      task = await updateTask(next.id, current => current.status === 'queued' ? { status: 'starting' } : {})
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (task.status !== 'starting') continue
    await launch(ctx, task)
  }
}

export async function pumpWorkers(ctx) {
  const previous = pumps.get(dataRoot) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(() => run(ctx))
  pumps.set(dataRoot, current)
  try {
    return await current
  } finally {
    if (pumps.get(dataRoot) === current) pumps.delete(dataRoot)
  }
}

export function enqueueWorker(ctx, task, parent) {
  parents.set(task.id, parent)
  return pumpWorkers(ctx)
}
