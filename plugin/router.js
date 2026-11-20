import { createDispatchTool } from './src/dispatch.js'
import { createContinueTool } from './src/continue.js'
import { mergeCommand } from './src/merge.js'

export const inject = ['tools', 'subagents', 'workingDirectory', 'subprocess', 'worktrees', 'commands', 'sandboxPolicy']

export function apply(ctx) {
  ctx.tools.register(createDispatchTool(ctx))
  ctx.tools.register(createContinueTool(ctx))
  ctx.commands.register(mergeCommand(ctx))
}
