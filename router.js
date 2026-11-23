import { createDispatchTool } from './src/dispatch.js'
import { createContinueTool } from './src/continue.js'

export const inject = ['tools', 'subagents', 'agents', 'workingDirectory', 'subprocess', 'worktrees', 'agentPresets']

export async function apply(ctx) {
  ctx.tools.register(createDispatchTool(ctx))
  ctx.tools.register(createContinueTool(ctx))
}
