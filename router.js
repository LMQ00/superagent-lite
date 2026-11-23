import { createDispatchTool } from './src/dispatch.js'
import { createContinueTool } from './src/continue.js'
import { refreshGlobalMemory, registerGlobalMemoryContext } from './src/memory.js'

export const inject = ['tools', 'subagents', 'workingDirectory', 'subprocess', 'worktrees', 'systemPrompt', 'agentPresets']

export async function apply(ctx) {
  await refreshGlobalMemory().catch(error => ctx.logger.warn(`superagent-lite global memory: ${error.message}`))
  ctx.tools.register(createDispatchTool(ctx))
  ctx.tools.register(createContinueTool(ctx))
  registerGlobalMemoryContext(ctx)
}
