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

export function occupiedSlots(ctx, tasks) {
  return tasks.filter(task =>
    task.status === 'starting' || task.status === 'resuming' ||
    (task.status === 'running' && runningAgent(ctx, task))).length
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
    const tasks = await listTasks()
    const settings = await readWorkerSettings()
    if (occupiedSlots(ctx, tasks) >= settings.maxWorkers) return
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
