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
  // index.js claims the child expected by review.js and installs this guard.
  // The helper inherits the worker composition, so its shell could write; a
  // session-level override confines every shell call to read-only file effects.
  agent.session.append('sandbox/mode', { mode: 'read-only', source: 'delegation' })
  const policy = agent.ctx.get('sandboxPolicy')?.resolve({ session: agent.session })
  const confinesShell = policy?.mode === 'read-only' && agent.ctx.get('shell')?.sandboxMode !== undefined
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
