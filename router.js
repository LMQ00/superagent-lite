import { createDispatchTool } from './src/dispatch.js'
import { createContinueTool } from './src/continue.js'
import { createWorkerStatusTool } from './src/worker-status.js'
import { refreshGlobalMemory, registerGlobalMemoryContext } from './src/memory.js'
import { registerRouterPrompt } from './src/router-prompt.js'

export const inject = ['tools', 'subagents', 'workingDirectory', 'subprocess', 'worktrees', 'systemPrompt', 'agentPresets']

export async function apply(ctx) {
  await refreshGlobalMemory().catch(error => ctx.logger.warn(`superagent-lite global memory: ${error.message}`))
  ctx.tools.register(createDispatchTool(ctx))
  ctx.tools.register(createContinueTool(ctx))
  ctx.tools.register(createWorkerStatusTool(ctx))
  registerGlobalMemoryContext(ctx)
  registerRouterPrompt(ctx)
}
