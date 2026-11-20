import { randomUUID } from 'node:crypto'

const ROUTER_PRESET = 'superagent-lite'
const DECISION_TOOLS = new Set(['dispatch_worker', 'continue_worker'])
const MAX_REMINDERS = 2
const REMINDER = '[superagent-lite] 这轮用户输入还没有调度决定。现在必须调用 dispatch_worker（项目工作用 delegate=true；不派 worker 则用 delegate=false 并写明理由），或对既有未发布任务调用 continue_worker。没有决定之前不要给出最终回答。'

export function createDispatchGuard(ctx) {
  const calls = new Map()
  const decided = new Map()
  const armed = new Set()
  const missing = new Set()
  const reminders = new Map()

  return {
    onEvent(session, event) {
      if (event.type === 'user/message') {
        const reminder = reminders.get(session.id)
        if (reminder?.id === event.data.id) {
          // Re-arm a bounded number of retries; the reminder itself must not
          // count as a fresh user input beyond that.
          if (reminder.sent < MAX_REMINDERS) armed.add(session.id)
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
        armed.delete(session.id)
        missing.delete(session.id)
        decided.delete(session.id)
        reminders.delete(session.id)
        return
      }
      if (event.data.reason.kind !== 'completed') {
        armed.delete(session.id)
        missing.delete(session.id)
        decided.delete(session.id)
        reminders.delete(session.id)
        return
      }
      const turns = decided.get(session.id)
      if (turns?.delete(event.data.turn)) {
        armed.delete(session.id)
        missing.delete(session.id)
        return
      }
      if (!armed.has(session.id)) return
      missing.add(session.id)
    },
    // Delivering the reminder inside the turn/end publication would make the
    // inbox append reenter the open Session append, which the Session rejects
    // and the observer containment swallows. The dispatcher calls this after
    // the agent has settled to idle, where a follow-up can wake a fresh turn.
    onIdle(sessionId) {
      if (!missing.delete(sessionId)) return
      const agent = ctx.agents.get(sessionId)
      if (!agent) return
      if (!armed.delete(sessionId)) return
      const sent = (reminders.get(sessionId)?.sent ?? 0) + 1
      const id = randomUUID()
      reminders.set(sessionId, { id, sent })
      agent.followup({
        id,
        role: 'user',
        content: [{ type: 'text', text: REMINDER }],
        source: { kind: 'user' },
      })
    },
    dispose(sessionId) {
      decided.delete(sessionId)
      armed.delete(sessionId)
      missing.delete(sessionId)
      reminders.delete(sessionId)
      for (const [callId, call] of calls) if (call.sessionId === sessionId) calls.delete(callId)
    },
  }
}
