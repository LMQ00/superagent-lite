import { randomUUID } from 'node:crypto'
import { listCancelledTasks, listTasks } from './task-store.js'

const TASK_ID = /^[a-f0-9]{16}$/
const STATUS_SOURCE = 'superagent-lite-worker-status'
const RUNNING = new Set(['starting', 'running', 'resuming'])
const DELIVERED = new Set([
  'review-required', 'awaiting-merge', 'awaiting-ci', 'merge-queued', 'publishing', 'merging', 'merged', 'completed',
])
const GROUPS = ['queued', 'running', 'delivered', 'cancelled', 'failed']
const LABELS = {
  queued: 'Queued',
  running: 'Running',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export function workerCategory(task) {
  if (task.status === 'queued') return 'queued'
  if (task.status === 'cancelled') return 'cancelled'
  if (RUNNING.has(task.status)) return 'running'
  if (DELIVERED.has(task.status)) return 'delivered'
  return 'failed'
}

function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function statusLine(task) {
  const fields = [`- ${task.id} [${task.status}] "${oneLine(task.title) || 'untitled'}"`]
  if (task.teamId) fields.push(`team ${task.teamId}`)
  if (task.mode) fields.push(`mode ${task.mode}`)
  if (task.workerSessionId) fields.push(`worker ${task.workerSessionId}`)
  const updated = task.updatedAt ?? task.cancelledAt ?? task.createdAt
  if (updated) fields.push(`updated ${updated}`)
  return fields.join('; ')
}

export function workerStatusReport(tasks, cancelled = []) {
  const all = [...tasks, ...cancelled]
  if (all.length === 0) return 'No tasks were dispatched by this Router Session.'
  const groups = new Map(GROUPS.map(category => [category, []]))
  for (const task of all) groups.get(workerCategory(task)).push(task)
  const summary = GROUPS.map(category => `${groups.get(category).length} ${category}`).join(', ')
  const lines = [`Worker and task status for this Router Session: ${summary}.`]
  for (const category of GROUPS) {
    lines.push('', `${LABELS[category]} (${groups.get(category).length}):`)
    const rows = groups.get(category)
    if (rows.length === 0) lines.push('- none')
    else lines.push(...rows.map(statusLine))
  }
  return lines.join('\n')
}

export function createWorkerStatusTool() {
  return {
    name: 'worker_status',
    description: 'Report the current workers and tasks dispatched by this Router Session. It lists queued, running, delivered, cancelled, and failed tasks with their task ID, title, team, mode, worker Session, and lifecycle status; pass taskId to inspect one task. Use it for a status question instead of dispatching. A task stopped from the panel and a queued worker that starts also arrive as background worker-status notices.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string', description: 'Optional 16-character task ID to inspect one task dispatched by this Router Session.' },
      },
    },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute({ taskId } = {}, exec) {
      exec.signal?.throwIfAborted()
      const routerSessionId = exec.agent?.session?.id
      if (!routerSessionId) throw new Error('worker_status requires a Router Session')
      if (taskId !== undefined && !TASK_ID.test(taskId)) {
        throw new TypeError('taskId must be a 16-character lowercase hexadecimal task ID')
      }
      const [tasks, cancelled] = await Promise.all([listTasks(), listCancelledTasks()])
      const active = tasks.filter(task => task.parentSessionId === routerSessionId)
      const currentIds = new Set(active.map(task => task.id))
      const stopped = cancelled.filter(task => task.parentSessionId === routerSessionId && !currentIds.has(task.id))
      if (taskId === undefined) return workerStatusReport(active, stopped)
      const task = active.find(record => record.id === taskId) ?? stopped.find(record => record.id === taskId)
      if (!task) throw new Error('Task does not belong to this Router Session')
      return `${LABELS[workerCategory(task)]}:\n${statusLine(task)}`
    },
  }
}

// Status notices use their own user-role source so the dispatch guard does not
// mistake them for a new user input. Injecting keeps the notice for the next
// model step without opening a turn of its own.
export function notifyWorkerStatus(ctx, task, status) {
  const parent = ctx?.agents?.get?.(task?.parentSessionId)
  if (!parent || typeof parent.inject !== 'function') return false
  const title = oneLine(task.title) || 'untitled'
  const outcome = status === 'cancelled'
    ? `task ${task.id} ("${title}") was cancelled; its worker was stopped and its concurrency slot is free`
    : `queued task ${task.id} ("${title}") started and is no longer waiting for a slot`
  const text = [
    `[superagent-lite] Worker status notice: ${outcome}.`,
    'This is background status, not a new user request; call worker_status for the current task state.',
  ].join('\n')
  try {
    parent.inject({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: STATUS_SOURCE },
    })
    return true
  } catch (error) {
    ctx.logger?.warn(`superagent-lite worker status notice: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}
