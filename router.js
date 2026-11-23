import { createDispatchTool } from './src/dispatch.js'
import { createContinueTool } from './src/continue.js'
import { createMemoryTool, refreshProfile, registerProfileContext, routerMemoryCaller } from './src/memory.js'

export const inject = ['tools', 'subagents', 'workingDirectory', 'subprocess', 'worktrees', 'systemPrompt', 'agentPresets']

export async function apply(ctx) {
  await refreshProfile().catch(error => ctx.logger.warn(`superagent-lite profile: ${error.message}`))
  ctx.tools.register(createDispatchTool(ctx))
  ctx.tools.register(createContinueTool(ctx))
  registerProfileContext(ctx)
  ctx.tools.register(createMemoryTool(routerMemoryCaller, agent => ctx.agentPresets.composedPreset(agent.ctx) === 'superagent-lite'))
}
