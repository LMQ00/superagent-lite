const pending = new Map()

const READ_ONLY_TOOLS = new Set([
  'structured_output',
  'read',
  'read_image',
  'glob',
  'grep',
  'read_page',
  'web_fetch',
  'web_search',
  'x_search',
  'skill',
  'todo_write',
  'working_directory',
  'job_output',
  'job_list',
])

const SHELL_TOOLS = ['bash', 'pwsh']

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
  // The helper inherits the worker composition, so its shell could write. A
  // session-level override confines every shell call to file reads.
  agent.session.append('sandbox/mode', { mode: 'read-only', source: 'delegation' })
  const confinesShell = agent.ctx.get('shell')?.sandboxMode !== undefined
  const allowed = new Set(READ_ONLY_TOOLS)
  if (confinesShell) for (const name of SHELL_TOOLS) allowed.add(name)
  agent.ctx.tools.guard(({ name }) => {
    if (allowed.has(name)) return undefined
    if (!confinesShell && SHELL_TOOLS.includes(name)) {
      return `Read-only helpers cannot run "${name}" because this composition does not confine shell file writes.`
    }
    return `Read-only helpers cannot use "${name}"; inspect the evidence with read, glob, and grep instead.`
  })
}
