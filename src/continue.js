import { readTask, updateTask } from './task-store.js'
import { buildWorkerPrompt } from './worker-prompt.js'

/**
 * A follow-up that opens a new turn gets the dispatch task message plus a
 * resume note, so the worker does not repeat the setup phases.
 */
function resumingPrompt(record, text) {
  return [
    buildWorkerPrompt({
      title: record.title,
      teamId: record.teamId,
      baseBranch: record.baseBranch,
      task: `${record.task}\n\nFollow-up:\n${text}\n\nApply this follow-up within the existing task. Do not push or merge.`,
    }),
    '',
    'Resume:',
    '- If you have not created your worktree yet, call create_worktree once; otherwise re-enter the existing checkout instead of creating another.',
    '- Do not redo completed work or repeat the dispatch setup phases. Apply the follow-up, commit, and call review_worker_commit. Do not push or merge.',
  ].join('\n')
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
      const worker = ctx.agents?.get(record.workerSessionId)
      if (record.status === 'running' && worker?.status === 'running') {
        await ctx.subagents.sendMessage(parent, record.workerSessionId, [{
          type: 'text',
          text: `Requirements update for the same task. Apply it to your current work; restart only if the change requires it. Do not push or merge.\n\nUpdate:\n${text}`,
        }], { signal: exec.signal })
        return `Update delivered to running worker ${record.workerSessionId} for ${taskId}.`
      }
      if (record.status !== 'running') {
        await updateTask(taskId, current => {
          if (!current.worktree || !['awaiting-merge', 'review-required', 'failed'].includes(current.status)) {
            throw new Error('Only settled, unpublished worktrees can be resumed')
          }
          return { status: 'resuming', review: undefined }
        })
      }
      try {
        await ctx.subagents.sendMessage(parent, record.workerSessionId, [{
          type: 'text',
          text: resumingPrompt(record, text),
        }], { signal: exec.signal })
      } catch (error) {
        if (record.status !== 'running') {
          await updateTask(taskId, current => ['resuming', 'running'].includes(current.status) ? { status: 'failed' } : {})
        }
        throw error
      }
      return `Follow-up accepted by worker ${record.workerSessionId} for ${taskId}.`
    },
  }
}
