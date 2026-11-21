import { taskForSession, updateTask } from './task-store.js'
import { runCommand } from './process.js'

export const reportToolName = 'report_task'

export function createReportTool(ctx, agent, taskId, admit, onReported) {
  return {
    name: reportToolName,
    description: 'Finish a report-only task: send the router the conclusion and evidence of a diagnosis, analysis, lookup, or read-only inspection. Use it instead of creating a worktree, committing, or requesting review; it ends the task without a branch, commit, review, or pull request.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        report: { type: 'string', description: 'Conclusion and evidence: findings, the files or checks actually inspected, and remaining risk.' },
      },
      required: ['report'],
    },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute({ report }, exec) {
      const task = await taskForSession(taskId, agent.id)
      if (exec.agent !== agent || !admit() || !task || task.status !== 'running') throw new Error('No active report-only worker')
      if (task.mode !== 'report') throw new Error('This task is not report-only')
      if (task.worktree) throw new Error('Report-only tasks cannot create a worktree')
      const text = report.trim()
      if (!text || text.length > 20000) throw new Error('Report must contain 1-20000 characters')
      const head = await runCommand(ctx, ['rev-parse', '--verify', 'HEAD^{commit}'], task.projectRoot, exec.signal)
      if (head !== task.baseCommit) throw new Error('Report-only tasks must not commit or move HEAD')
      const dirty = await runCommand(ctx, ['status', '--porcelain', '--untracked-files=all'], task.projectRoot, exec.signal)
      if (dirty.split('\n').some(line => line && line !== '?? .agents/worktrees/.gitignore')) {
        throw new Error('Report-only tasks must leave the project checkout unchanged')
      }
      const message = `Report-only task ${taskId} (no branch, commit, review, or pull request):\n${text}`
      await ctx.subagents.sendMessage(agent, task.parentSessionId, [{ type: 'text', text: message }], { signal: exec.signal })
      await updateTask(taskId, {
        status: 'completed',
        report: { message: text, at: new Date().toISOString() },
        finishedAt: new Date().toISOString(),
        stopReason: 'completed',
      })
      onReported?.()
      return `Report delivered to the router for ${taskId}. This task ends without a branch, commit, review, or pull request.`
    },
  }
}
