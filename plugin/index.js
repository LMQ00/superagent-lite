import { taskForSession, updateTask } from './src/task-store.js'
import { createWorktreeTool } from './src/worktree-tool.js'

export const inject = ['subagents', 'tools', 'worktrees', 'subprocess']

export function apply(ctx) {
  const disposers = new Map()

  ctx.on('agent/created', async ({ agent }) => {
    if (agent.session.header.origin !== 'subagent') return
    const task = await taskForSession(undefined, agent.id)
    if (!task || task.parentSessionId !== agent.session.header.parentSession) return
    const taskId = task.id
    if (task.status === 'starting') await updateTask(taskId, { status: 'running' })
    let releaseGuard = () => {}
    releaseGuard = agent.ctx.tools.guard((execution) => {
      if (task.status !== 'starting' && task.status !== 'running') return 'This worker is frozen.'
      if (execution.name === 'create_worktree') return undefined
      return 'Create the assigned project worktree before using any other tool.'
    })
    const disposeWorktreeTool = agent.ctx.tools.register(createWorktreeTool(ctx, agent, taskId, () => {
      releaseGuard()
      releaseGuard = () => {}
    }))
    disposers.set(agent.id, () => {
      releaseGuard()
      disposeWorktreeTool()
    })
  })

  ctx.on('agent/disposed', ({ agent }) => {
    disposers.get(agent.id)?.()
    disposers.delete(agent.id)
  })

  ctx.on('subagent/end', async (info) => {
    const task = await taskForSession(undefined, info.id)
    if (!task || task.parentSessionId !== info.parentSessionId) return
    const status = info.stopReason !== 'completed'
      ? 'failed'
      : task.worktree === undefined ? 'failed'
        : 'worker-finished'
    await updateTask(task.id, {
      status,
      stopReason: info.stopReason,
      finishedAt: new Date().toISOString(),
    })
  })

  ctx.effect(() => () => {
    for (const dispose of disposers.values()) dispose()
    disposers.clear()
  }, 'superagent-lite: worker tool registrations')
}
