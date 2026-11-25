export const WORKER_STOP_TIMEOUT_MS = 10_000

// Interrupt the live worker turn without deleting its Session: the task record
// stays, and the worker may be resumed later by continue_worker.
export function interruptWorker(ctx, sessionId) {
  if (!sessionId) return false
  const agent = ctx.agents?.get?.(sessionId)
  if (!agent) return false
  if (typeof ctx.subagents?.interrupt === 'function') {
    ctx.subagents.interrupt(sessionId, { kind: 'user' })
  }
  // The subagent interrupt preserves a parked inbox; a stopped task must not
  // start its queued prompt later, so also clear the local agent's inbox.
  if (typeof agent.cancel === 'function') {
    agent.cancel({ kind: 'user' }, { keepInbox: false })
    return true
  }
  if (typeof ctx.subagents?.interrupt === 'function') return true
  throw new Error('The Host cannot interrupt the worker Session')
}

// A delete must not remove the record while the worker can still write files.
export async function waitForWorkerStop(agents, sessionId, timeoutMs = WORKER_STOP_TIMEOUT_MS) {
  if (!sessionId) return true
  const agent = agents?.get?.(sessionId)
  if (!agent || agent.status !== 'running') return true
  if (typeof agent.whenIdle !== 'function') return false
  let timer
  try {
    await Promise.race([
      agent.whenIdle(),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('The worker did not stop in time')), timeoutMs)
      }),
    ])
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
  return agents?.get?.(sessionId)?.status !== 'running'
}
