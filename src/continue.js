import { randomUUID } from 'node:crypto'
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
      task: `${record.task}\n\nFollow-up:\n${text}\n\nTreat this as a follow-up within the existing task; apply it only if it stays within the task's goal. Do not push. Merge only after the user explicitly authorizes it.`,
    }),
    '',
    'Resume:',
    '- If you have not created your worktree yet, call create_worktree once; otherwise re-enter the existing checkout instead of creating another.',
    '- Decide whether the follow-up belongs to this task. If it is a different task or conflicts with an existing constraint, do not apply it and report BLOCKED with the mismatch instead of requesting another review.',
    '- Do not redo completed work or repeat the dispatch setup phases. If the follow-up applies, commit and call review_worker_commit. Do not push; merge only after the user explicitly authorizes it.',
  ].join('\n')
}

function withFollowUp(task, followUp) {
  return [...(task.followUps ?? []), followUp]
}

async function recordFollowUp(ctx, taskId, text) {
  const entry = { id: randomUUID(), text, at: new Date().toISOString() }
  try {
    await updateTask(taskId, current => ({ followUps: withFollowUp(current, entry) }))
    return entry.id
  } catch (error) {
    ctx.logger?.warn(`superagent-lite follow-up record failed: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

async function dropFollowUp(ctx, taskId, id) {
  try {
    await updateTask(taskId, current => ({ followUps: (current.followUps ?? []).filter(item => item.id !== id) }))
  } catch (error) {
    ctx.logger?.warn(`superagent-lite follow-up rollback failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function createContinueTool(ctx) {
  return {
    name: 'continue_worker',
    description: 'Send a follow-up on the same task to its worker, even while it runs. It is this input\'s routing decision; do not also dispatch. Continue only when the task owns the same deliverable and goal and this input just adds to or corrects it. Use a new dispatch for a different business goal, a different task, or after publication, even when the goal looks related.',
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
      if (worker?.status === 'running') {
        const followUpId = await recordFollowUp(ctx, taskId, text)
        try {
          await ctx.subagents.sendMessage(parent, record.workerSessionId, [{
            type: 'text',
            text: `Requirements update for the same task. First decide whether it belongs to this task. Apply an addition or change within the task's goal; if it is a different task or conflicts with an existing constraint, do not apply it; keep working on the current task and include the unapplied follow-up in your final report. Otherwise apply it to your current work; restart only if the change requires it. Do not push; merge only after the user explicitly authorizes it.\n\nUpdate:\n${text}`,
          }], { signal: exec.signal })
        } catch (error) {
          if (followUpId) await dropFollowUp(ctx, taskId, followUpId)
          throw error
        }
        return `Follow-up delivered to running worker ${record.workerSessionId} for ${taskId}${followUpId ? '' : '; it could not be recorded for review'}.`
      }
      const settled = record.status !== 'running'
      if (settled) {
        await updateTask(taskId, current => {
          if (!current.worktree || !['awaiting-merge', 'review-required', 'failed'].includes(current.status)) {
            throw new Error('Only settled, unpublished worktrees can be resumed')
          }
          return { status: 'resuming', review: undefined }
        })
      }
      const followUpId = await recordFollowUp(ctx, taskId, text)
      try {
        await ctx.subagents.sendMessage(parent, record.workerSessionId, [{
          type: 'text',
          text: resumingPrompt(record, text),
        }], { signal: exec.signal })
      } catch (error) {
        if (followUpId) await dropFollowUp(ctx, taskId, followUpId)
        if (settled) {
          await updateTask(taskId, current => ['resuming', 'running'].includes(current.status) ? { status: 'failed' } : {})
        }
        throw error
      }
      return `Follow-up delivered to worker ${record.workerSessionId} for ${taskId}; the worker decides whether it belongs${followUpId ? '' : '; the follow-up could not be recorded for review'}.`
    },
  }
}
