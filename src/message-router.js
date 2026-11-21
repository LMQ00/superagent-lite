import { taskForSession } from './task-store.js'

export function createMessageRouterTool(ctx, agent, taskId) {
  return {
    name: 'message_router',
    description: 'Send the router a progress note or final conclusion when a requirement blocks progress and when the work is finished.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        message: { type: 'string', description: 'Concise note or conclusion: branch, reviewed commit, tests, and remaining risk.' },
      },
      required: ['message'],
    },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute({ message }, exec) {
      const task = await taskForSession(taskId, agent.id)
      if (exec.agent !== agent || !task || task.status !== 'running') throw new Error('Only the active worker for this task can message its router')
      const text = message.trim()
      if (!text || text.length > 4000) throw new Error('Message must contain 1-4000 characters')
      await ctx.subagents.sendMessage(agent, task.parentSessionId, [{ type: 'text', text }], { signal: exec.signal })
      return `Message delivered to the router for ${taskId}.`
    },
  }
}
