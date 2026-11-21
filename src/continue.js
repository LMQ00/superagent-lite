import { readTask, updateTask } from './task-store.js'

function withFollowUp(task, followUp) {
  return [...(task.followUps ?? []), followUp]
}

async function recordFollowUp(ctx, taskId, text) {
  try {
    await updateTask(taskId, current => ({ followUps: withFollowUp(current, text) }))
    return true
  } catch (error) {
    ctx.logger?.warn(`superagent-lite follow-up record failed: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
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
          text: `Follow-up for the same task. First decide whether it belongs to this task. Apply an addition or change within the task's goal; if it is a different task or conflicts with an existing constraint, do not apply it; keep working on the current task and include the unapplied follow-up in your final report. Otherwise apply it to your current work; restart only if the change requires it. Do not push or merge.\n\nFollow-up:\n${text}`,
        }], { signal: exec.signal })
        const recorded = await recordFollowUp(ctx, taskId, text)
        return `Follow-up delivered to running worker ${record.workerSessionId} for ${taskId}${recorded ? '' : '; it could not be recorded for review'}.`
      }
      await updateTask(taskId, current => {
        if (!current.worktree || !['awaiting-merge', 'review-required', 'failed'].includes(current.status)) {
          throw new Error('Only settled, unpublished worktrees can be resumed')
        }
        return { status: 'resuming', review: undefined }
      })
      try {
        await ctx.subagents.sendMessage(parent, record.workerSessionId, [{
          type: 'text',
          text: `Continue the same task in your assigned worktree. Decide whether this follow-up belongs to the task; apply it if it stays within the task's goal, and if it is a different task or conflicts with an existing constraint, do not apply it; report that in your final conclusion and do not request another review. If it applies, after committing changes call review_worker_commit again. Do not push or merge.\n\nFollow-up:\n${text}`,
        }], { signal: exec.signal })
      } catch (error) {
        await updateTask(taskId, current => ['resuming', 'running'].includes(current.status) ? { status: 'failed' } : {})
        throw error
      }
      const recorded = await recordFollowUp(ctx, taskId, text)
      return `Follow-up delivered to worker ${record.workerSessionId} for ${taskId}; the worker decides whether it belongs${recorded ? '' : '; the follow-up could not be recorded for review'}.`
    },
  }
}
