import { readTask, updateTask } from './task-store.js'
import { buildWorkerPrompt } from './worker-prompt.js'

/**
 * A settled worker resumes from rest, so it receives the same task message as a
 * fresh dispatch, with the current follow-up inside Requirements.
 */
function resumingPrompt(record, text) {
  return buildWorkerPrompt({
    title: record.title,
    teamId: record.teamId,
    baseBranch: record.baseBranch,
    task: `${record.task}\n\nFollow-up:\n${text}\n\nContinue the same task in your assigned worktree. Resume from where you stopped; do not redo completed work or repeat the dispatch setup phases. After committing changes, call review_worker_commit again. Do not push or merge.`,
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
          text: `Requirements update for the same task. Apply it to your current work; restart only if the change requires it. Do not push or merge.\n\nUpdate:\n${text}`,
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
          text: resumingPrompt(record, text),
        }], { signal: exec.signal })
      } catch (error) {
        await updateTask(taskId, current => ['resuming', 'running'].includes(current.status) ? { status: 'failed' } : {})
        throw error
      }
      return `Follow-up accepted by worker ${record.workerSessionId} for ${taskId}.`
    },
  }
}
