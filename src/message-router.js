import { taskForSession } from './task-store.js'

export function createMessageRouterTool(ctx, agent, taskId, onReported) {
  return {
    name: 'message_router',
    description: 'Send the router one final conclusion when the work ends, or a concrete BLOCKED report that needs a person. Do not send routine progress. Include the outcome, checks actually run, reviewed commit when one exists, remaining risk, and any unapplied follow-up. Report COMPLETED only for a reviewed implementation with relevant checks passed; do not report COMPLETED while a job whose result you need runs.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        message: { type: 'string', description: 'Final conclusion or concrete blocker: status, branch, reviewed commit when one exists, checks actually run, remaining risk, and any unapplied follow-up.' },
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
      const extracted = await onReported?.(text, exec)
      const saved = Array.isArray(extracted) ? extracted.length : extracted ? 1 : 0
      return `Message delivered to the router for ${taskId}.${saved ? ` ${saved} memory field${saved === 1 ? '' : 's'} updated.` : ''}`
    },
  }
}
