import { dataRoot, listTasks, updateTask } from './task-store.js'
import { buildWorkerPrompt } from './worker-prompt.js'
import { forgetLanding } from './landing.js'
import { notifyWorkerStatus } from './worker-status.js'
import { readWorkerSettings, workerAgentOptions } from './worker-settings.js'

// Worker launches beyond the configured limit wait as `queued` Task records.
// The queue is serialized per data root so two dispatches cannot claim the same slot.
const pumps = new Map()
const parents = new Map()
const lifetimes = new Map()

// `starting` and `resuming` reserve a slot while the Host brings a Session up,
// even before `agents.get` can see it. A Task that stays in either state without
// a live Session past this window has no recoverable worker and is reclaimed.
export const STALE_ACTIVE_MS = 2 * 60_000

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

function reclaimedFailure(status) {
  return `The worker Session is no longer running; the task was reclaimed from ${status} and no longer occupies a worker slot`
}

// A Task can enter `starting` or `resuming` and then lose its Session without a
// terminal event, for example when the Host accepts a follow-up but never
// resumes the Worker. Pumping reclaims such records so they stop showing as
// unconfirmed and stop reserving a slot. A fresh record or one with a live
// agent is left alone.
export async function reclaimStaleWorkers(ctx, tasks, now = Date.now()) {
  let reclaimed = false
  for (const task of tasks) {
    if (task.status !== 'starting' && task.status !== 'resuming') continue
    if (runningAgent(ctx, task) || reservesSlot(task, now)) continue
    try {
      const updated = await updateTask(task.id, current => {
        if ((current.status !== 'starting' && current.status !== 'resuming') ||
            runningAgent(ctx, current) || reservesSlot(current, now)) return {}
        return {
          status: 'failed',
          failure: reclaimedFailure(current.status),
          finishedAt: new Date(now).toISOString(),
        }
      })
      if (updated.status === 'failed') reclaimed = true
    } catch (error) {
      if (error.code === 'ENOENT') continue
      ctx.logger?.warn(`superagent-lite worker queue: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return reclaimed
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
  try {
    await ctx.subagents.startActivation({
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
      }],
      ...(agentOptions ? { agentOptions } : {}),
      promptSource: { kind: 'agent-message', form: 'relay', senderSessionId: parent.id },
      signal: lifetime(),
      delivery: 'parent',
      maxDepth: ctx.subagents.resolveMaxDepth(),
    })
    parents.delete(task.id)
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
