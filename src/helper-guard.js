const pending = new Map()
const helpers = new Map()

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
  'job_output',
  'job_list',
])

const SHELL_TOOLS = ['bash', 'pwsh']

// A reviewer gets no patch in its prompt; it must read base..head and the
// worktree itself. Everything else the inherited read-only composition offers
// is outside that scope.
const REVIEW_TOOLS = new Set(['structured_output', 'read', 'read_image', 'glob', 'grep', 'bash', 'pwsh'])

export function expectHelper(parentSessionId, reviewScope) {
  const queue = pending.get(parentSessionId) ?? []
  queue.push(reviewScope)
  pending.set(parentSessionId, queue)
}

export function claimHelper(parentSessionId) {
  const queue = pending.get(parentSessionId)
  if (!queue || queue.length === 0) return false
  const scope = queue.shift()
  if (queue.length === 0) pending.delete(parentSessionId)
  return { scope }
}

export function clearHelperExpectation(parentSessionId) {
  pending.delete(parentSessionId)
}

function observeReviewEvidence(agent, reviewScope) {
  const calls = new Map()
  helpers.set(agent.session.id, { scope: reviewScope, calls })
  agent.ctx.on('session/event', (session, event) => {
    if (session.id !== agent.session.id) return
    if (event.type === 'tool/call') {
      let input
      try {
        input = JSON.parse(event.data.arguments)
      } catch {
        return
      }
      calls.set(event.data.callId, { name: event.data.name, input })
      return
    }
    if (event.type !== 'tool/result') return
    const message = event.data.message
    const call = calls.get(message.toolCallId)
    if (!call) return
    calls.delete(message.toolCallId)
    if (!message.isError) reviewScope.record(call.name, call.input)
  })
}

export function takeHelperEvidence(sessionId) {
  const entry = helpers.get(sessionId)
  helpers.delete(sessionId)
  return entry?.scope.hasEvidence() ?? false
}

export function registerReadOnlyGuard(agent, reviewScope) {
  // index.js claims the child expected by review.js and installs this guard.
  // The helper inherits the worker composition, so its shell could write; a
  // session-level override confines every shell call to read-only file effects.
  agent.session.append('sandbox/mode', { mode: 'read-only', source: 'delegation' })
  // sandboxMode marks a mounted executor that can confine; the effective mode
  // is resolved per call so a later sandbox switch fails closed.
  const shellConfined = session => agent.ctx.get('shell')?.sandboxMode !== undefined &&
    agent.ctx.get('sandboxPolicy')?.resolve({ session })?.mode === 'read-only'
  agent.ctx.tools.guard(({ name, arguments: input, agent: caller }) => {
    if (reviewScope && !REVIEW_TOOLS.has(name)) {
      return `Review scope: the reviewer may only inspect the worker worktree and ${reviewScope.baseCommit}..${reviewScope.headCommit}; "${name}" is not available.`
    }
    if (READ_ONLY_TOOLS.has(name)) {
      return reviewScope ? reviewScope.checkFileTool(name, input) : undefined
    }
    if (SHELL_TOOLS.includes(name)) {
      if (input?.sandbox_permissions !== undefined) {
        return `Read-only helpers cannot widen the sandbox for "${name}".`
      }
      if (!shellConfined(caller?.session ?? agent.session)) {
        return `Read-only helpers cannot run "${name}" because this composition does not confine shell file writes.`
      }
      if (!reviewScope) return undefined
      const workdirProblem = reviewScope.checkWorkdir(input?.workdir)
      if (workdirProblem) return workdirProblem
      return reviewScope.checkCommand(input?.command)
    }
    return `Read-only helpers cannot use "${name}"; inspect the evidence with read, glob, and grep instead.`
  })
  if (reviewScope) observeReviewEvidence(agent, reviewScope)
}
