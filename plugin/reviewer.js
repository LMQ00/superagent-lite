export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.guard(execution => execution.name === 'structured_output' ? undefined : 'This reviewer may only return its review verdict.')
}
