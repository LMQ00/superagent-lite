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
  'knowledge_query',
  'knowledge_get',
])

const SHELL_TOOLS = ['bash', 'pwsh']

// A reviewer inherits the worker composition. Its only tool limits are the file
// write/edit tools; everything else it needs to inspect the change stays open.
const WRITE_TOOLS = new Set(['write', 'edit', 'apply_patch', 'str_replace_editor'])

export function expectHelper(parentSessionId, reviewScope, kind = reviewScope ? 'review' : 'memory', context = {}) {
  const queue = pending.get(parentSessionId) ?? []
  queue.push({ scope: reviewScope, kind, ...context })
  pending.set(parentSessionId, queue)
}

export function claimHelper(parentSessionId) {
  const queue = pending.get(parentSessionId)
  if (!queue || queue.length === 0) return false
  const helper = queue.shift()
  if (queue.length === 0) pending.delete(parentSessionId)
  return helper
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

// The memory helper has no review scope: it keeps the inherited composition
// read-only so distilling memory cannot change the repository. It owns the only
// knowledge write tool.
export function registerReadOnlyGuard(agent) {
  agent.session.append('sandbox/mode', { mode: 'read-only', source: 'delegation' })
  // sandboxMode marks a mounted executor that can confine; the effective mode
  // is resolved per call so a later sandbox switch fails closed.
  const shellConfined = session => agent.ctx.get('shell')?.sandboxMode !== undefined &&
    agent.ctx.get('sandboxPolicy')?.resolve({ session })?.mode === 'read-only'
  agent.ctx.tools.guard(({ name, arguments: input, agent: caller }) => {
    if (name === 'knowledge_write') return undefined
    if (name === 'submit_review') {
      return 'Read-only helpers cannot use "submit_review"; only a reviewer records a verdict.'
    }
    if (READ_ONLY_TOOLS.has(name)) return undefined
    if (SHELL_TOOLS.includes(name)) {
      if (input?.sandbox_permissions !== undefined) {
        return `Read-only helpers cannot widen the sandbox for "${name}".`
      }
      if (!shellConfined(caller?.session ?? agent.session)) {
        return `Read-only helpers cannot run "${name}" because this composition does not confine shell file writes.`
      }
      return undefined
    }
    return `Read-only helpers cannot use "${name}"; inspect the evidence with read, glob, and grep instead.`
  })
}

// A reviewer may inspect the repository and run commands as it sees fit. The
// only limits are file write/edit tools and git commands that move branches or
// history; the change evidence recorded here gates the verdict. The global
// knowledge base stays read-only for reviewers.
export function registerReviewGuard(agent, reviewScope) {
  agent.ctx.tools.guard(({ name, arguments: input }) => {
    if (WRITE_TOOLS.has(name)) {
      return `Reviewers may not use the "${name}" tool.`
    }
    if (name === 'knowledge_write') {
      return 'Only the memory role may write knowledge.'
    }
    if (!SHELL_TOOLS.includes(name)) return undefined
    return reviewScope.checkCommand(input?.command)
  })
  observeReviewEvidence(agent, reviewScope)
}
