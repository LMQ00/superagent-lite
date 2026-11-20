export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.guard(execution => execution.name === 'structured_output' ? undefined : 'This read-only helper may only return its structured result.')
}
