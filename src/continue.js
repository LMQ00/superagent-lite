import { readTask, updateTask } from './task-store.js'

function withFollowUp(task, followUp) {
  const combined = `${task}\n\nFollow-up:\n${followUp}`
  return combined.length > 20000 ? combined.slice(-20000) : combined
}

export function createContinueTool(ctx) {
  return {
    name: 'continue_worker',
    description: 'Send a follow-up on the same task to its worker, even while it runs. It is this input\'s routing decision; do not also dispatch. Use a new dispatch for a different task or after publication.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string' },
        task: { type: 'string', description: 'New instructions for this same task.' },
      },
      required: ['taskId', 'task'],
    },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute({ taskId, task }, exec) {
      const parent = exec.agent
      const text = task.trim()
      if (!parent || !/^[a-f0-9]{16}$/.test(taskId) || !text || text.length > 20000) throw new Error('A task ID and follow-up text are required')
      const record = await readTask(taskId)
      if (!record || record.parentSessionId !== parent.id) throw new Error('Task does not belong to this router Session')
      if (record.status === 'running') {
        await ctx.subagents.sendMessage(parent, record.workerSessionId, [{
          type: 'text',
          text: `Follow-up for the same task. First decide whether it belongs to this task. Apply an addition or change within the task's goal; if it is a different task or conflicts with an existing constraint, do not apply it and report the mismatch with message_router as BLOCKED. Otherwise apply it to your current work; restart only if the change requires it. Do not push or merge.\n\nFollow-up:\n${text}`,
        }], { signal: exec.signal })
        await updateTask(taskId, current => ({ task: withFollowUp(current.task, text) }))
        return `Follow-up delivered to running worker ${record.workerSessionId} for ${taskId}.`
      }
      await updateTask(taskId, current => {
        if (!current.worktree || !['awaiting-merge', 'review-required', 'failed'].includes(current.status)) {
          throw new Error('Only settled, unpublished worktrees can be resumed')
        }
        return { status: 'resuming', review: undefined, task: withFollowUp(current.task, text) }
      })
      try {
        await ctx.subagents.sendMessage(parent, record.workerSessionId, [{
          type: 'text',
          text: `Continue the same task in your assigned worktree. Decide whether this follow-up belongs to the task; apply it if it stays within the task's goal, and if it is a different task or conflicts with an existing constraint, report the mismatch with message_router as BLOCKED instead of applying it. After committing changes, call review_worker_commit again. Do not push or merge.\n\nFollow-up:\n${text}`,
        }], { signal: exec.signal })
      } catch (error) {
        await updateTask(taskId, current => ['resuming', 'running'].includes(current.status) ? { status: 'failed' } : {})
        throw error
      }
      return `Follow-up accepted by worker ${record.workerSessionId} for ${taskId}.`
    },
  }
}
