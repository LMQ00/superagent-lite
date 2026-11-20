import { createDispatchTool } from './src/dispatch.js'

export const inject = ['tools', 'subagents', 'workingDirectory', 'subprocess', 'worktrees']

export function apply(ctx) {
  ctx.tools.register(createDispatchTool(ctx))
}
