import { taskForSession, updateTask } from './task-store.js'
import { setLandingWorktree } from './landing.js'

export function createWorktreeTool(ctx, agent, taskId, releaseGuard) {
  return {
    name: 'create_worktree',
    description: 'Create and enter the isolated checkout assigned to this worker before editing project files.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          branch: { type: 'string' },
          baseCommit: { type: 'string' },
          projectRoot: { type: 'string' },
          teamId: { type: 'string' },
        },
        required: ['path', 'branch', 'baseCommit', 'projectRoot', 'teamId'],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      exec.signal.throwIfAborted()
      const task = await taskForSession(taskId, agent.id)
      if (exec.agent !== agent || !task || task.workerSessionId !== agent.id || task.status !== 'running') throw new Error('This worker has no matching project task')
      if (task.worktree) {
        await ctx.workingDirectory.set(agent, task.worktree.path, exec.signal)
        releaseGuard(task.worktree.path)
        setLandingWorktree(taskId, task.worktree)
        return {
          path: task.worktree.path,
          branch: task.worktree.branch,
          baseCommit: task.worktree.baseCommit,
          projectRoot: task.worktree.repositoryRoot,
          teamId: task.teamId,
        }
      }

      // Tasks recorded before readable names were added keep their old name when a worktree is first created.
      const team = task.teamId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'project'
      const name = task.worktreeName
        ? `sl-${task.worktreeName}-${taskId.slice(0, 12)}`
        : `sl-${team}-${taskId}`
      const worktree = await ctx.worktrees.create(agent, { name, from: task.baseCommit }, exec.signal)
      try {
        const saved = {
          path: worktree.path,
          branch: worktree.branch,
          baseCommit: worktree.baseCommit,
          repositoryRoot: worktree.repositoryRoot,
          sourceBranch: task.baseBranch,
        }
        await updateTask(taskId, { worktree: saved, status: 'running' })
        releaseGuard(saved.path)
        setLandingWorktree(taskId, saved)
        return {
          path: saved.path,
          branch: saved.branch,
          baseCommit: saved.baseCommit,
          projectRoot: saved.repositoryRoot,
          teamId: task.teamId,
        }
      } catch (error) {
        throw new Error(`Worktree created at ${worktree.path}, but task metadata could not be saved: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  }
}
