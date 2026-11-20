import { createDispatchTool } from './src/dispatch.js'
import { createContinueTool } from './src/continue.js'
import { mergeCommand } from './src/merge.js'
import { createMemoryTool, registerProfileContext, routerMemoryCaller } from './src/memory.js'

export const inject = ['tools', 'subagents', 'workingDirectory', 'subprocess', 'worktrees', 'commands', 'sandboxPolicy', 'systemPrompt', 'agentPresets']

export function apply(ctx) {
  ctx.tools.register(createDispatchTool(ctx))
  ctx.tools.register(createContinueTool(ctx))
  ctx.commands.register(mergeCommand(ctx))
  registerProfileContext(ctx)
  ctx.tools.register(createMemoryTool(routerMemoryCaller, agent => ctx.agentPresets.composedPreset(agent.ctx) === 'superagent-lite'))
}
