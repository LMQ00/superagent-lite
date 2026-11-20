const pending = new Map()

export function expectHelper(parentSessionId) {
  pending.set(parentSessionId, (pending.get(parentSessionId) ?? 0) + 1)
}

export function claimHelper(parentSessionId) {
  const count = pending.get(parentSessionId) ?? 0
  if (count === 0) return false
  if (count === 1) pending.delete(parentSessionId)
  else pending.set(parentSessionId, count - 1)
  return true
}

export function clearHelperExpectation(parentSessionId) {
  pending.delete(parentSessionId)
}

export function registerReadOnlyGuard(agent) {
  agent.ctx.tools.guard(({ name }) => name === 'structured_output' ? undefined : 'This read-only helper may only return its structured result.')
}
