import { randomUUID } from 'node:crypto'

const ROUTER_PRESET = 'superagent-lite'
const DECISION_TOOLS = new Set(['dispatch_worker', 'continue_worker'])
const MAX_REMINDERS = 2
const REMINDER_SOURCE = 'superagent-lite-reminder'
const REMINDER = '[superagent-lite] 这轮用户输入还没有调度决定。现在必须调用 dispatch_worker（项目工作用 delegate=true；不派 worker 则用 delegate=false 并写明理由），或对既有未发布任务调用 continue_worker。没有决定之前不要给出最终回答。'

export function createDispatchGuard(ctx) {
  const calls = new Map()
  const decided = new Map()
  const armed = new Set()
  const missing = new Set()
  const reminders = new Map()

  function dropCalls(sessionId, turn) {
    for (const [callId, call] of calls) {
      if (call.sessionId === sessionId && (turn === undefined || call.turn === turn)) calls.delete(callId)
    }
  }

  function forget(sessionId) {
    armed.delete(sessionId)
    missing.delete(sessionId)
    decided.delete(sessionId)
    reminders.delete(sessionId)
    dropCalls(sessionId)
  }

  function deliver(sessionId) {
    if (!missing.has(sessionId)) return
    const agent = ctx.agents.get(sessionId)
    if (!agent) return
    missing.delete(sessionId)
    if (!armed.delete(sessionId)) return
    const sent = (reminders.get(sessionId) ?? 0) + 1
    reminders.set(sessionId, sent)
    agent.followup({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: REMINDER }],
      source: { kind: REMINDER_SOURCE },
    })
  }

  return {
    onEvent(session, event) {
      if (event.type === 'user/message') {
        if (event.data.source?.kind === REMINDER_SOURCE) {
          // Re-arm a bounded number of retries; the reminder itself must not
          // count as a fresh user input beyond that.
          if ((reminders.get(session.id) ?? 0) < MAX_REMINDERS) armed.add(session.id)
          return
        }
        if (event.data.source?.kind === 'user') {
          armed.add(session.id)
          missing.delete(session.id)
          reminders.delete(session.id)
        }
        return
      }
      if (event.type === 'tool/call' && DECISION_TOOLS.has(event.data.name)) {
        calls.set(event.data.callId, { sessionId: session.id, turn: event.data.turn })
        return
      }
      if (event.type === 'tool/result') {
        const call = calls.get(event.data.message.toolCallId)
        if (!call || call.sessionId !== session.id) return
        calls.delete(event.data.message.toolCallId)
        if (!event.data.message.isError) {
          let turns = decided.get(session.id)
          if (!turns) decided.set(session.id, turns = new Set())
          turns.add(call.turn)
          missing.delete(session.id)
          reminders.delete(session.id)
        }
        return
      }
      if (event.type !== 'turn/end') return
      const agent = ctx.agents.get(session.id)
      if (!agent || ctx.agentPresets.composedPreset(agent.ctx) !== ROUTER_PRESET) {
        forget(session.id)
        return
      }
      if (event.data.reason.kind !== 'completed') {
        forget(session.id)
        return
      }
      const turns = decided.get(session.id)
      if (turns?.delete(event.data.turn)) {
        armed.delete(session.id)
        missing.delete(session.id)
        dropCalls(session.id, event.data.turn)
        return
      }
      if (!armed.has(session.id)) return
      missing.add(session.id)
      dropCalls(session.id, event.data.turn)
      // Cover a host that announces idle before turn/end, or does not announce
      // the transition for this turn: settle on the next macrotask if idle.
      setImmediate(() => {
        if (ctx.agents.get(session.id)?.status === 'idle') deliver(session.id)
      })
    },
    // Delivering the reminder inside the turn/end publication would make the
    // inbox append reenter the open Session append, which the Session rejects
    // and the observer containment swallows. The dispatcher calls this after
    // the agent has settled to idle, where a follow-up can wake a fresh turn.
    onIdle(sessionId) {
      deliver(sessionId)
    },
    dispose(sessionId) {
      forget(sessionId)
    },
  }
}
