import { readTask, updateTask } from './task-store.js'
import { buildWorkerPrompt } from './worker-prompt.js'

/**
 * Reuse the dispatch task message for every follow-up, so the fields and phase
 * sections can never drift from what a fresh worker receives.
 */
function followUpPrompt(record, text, instruction) {
  return buildWorkerPrompt({
    title: record.title,
    teamId: record.teamId,
    baseBranch: record.baseBranch,
    task: `${record.task}\n\nFollow-up:\n${text}\n\n${instruction}`,
  })
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
          text: followUpPrompt(record, text, 'Apply it to your current work; restart only if the change requires it. Your worktree already exists: create_worktree re-enters it and never creates a second checkout. Do not push or merge.'),
        }], { signal: exec.signal })
        return `Update delivered to running worker ${record.workerSessionId} for ${taskId}.`
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
          text: followUpPrompt(record, text, 'Continue the same task in your assigned worktree. After committing changes, call review_worker_commit again. Do not push or merge.'),
        }], { signal: exec.signal })
      } catch (error) {
        await updateTask(taskId, current => ['resuming', 'running'].includes(current.status) ? { status: 'failed' } : {})
        throw error
      }
      return `Follow-up accepted by worker ${record.workerSessionId} for ${taskId}.`
    },
  }
}
