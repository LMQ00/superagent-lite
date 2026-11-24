import { randomUUID } from 'node:crypto'

const ROUTER_PRESET = 'superagent-lite'
const DECISION_TOOLS = new Set(['dispatch_worker', 'continue_worker', 'worker_status'])
const MAX_REMINDERS = 2
const REMINDER_SOURCE = 'superagent-lite-reminder'
const REMINDER = '[superagent-lite] 系统提醒，不是新的用户输入：这轮输入还没有调度决定。现在调用 dispatch_worker 并写明 mode=change（改项目文件）、mode=report（只查证并交回结论）、mode=answer（直接回答、不派 worker）或 mode=merge（用新 worker 合并已交付分支），或对既有未发布任务调用 continue_worker；只询问 worker 或任务状态时调用 worker_status。给出最终回答前必须先决定。'

export function createDispatchGuard(ctx) {
  const calls = new Map()
  const decisions = new Map()
  const pending = new Map()
  const missing = new Set()
  const reminders = new Map()
  const deferred = new Map()

  function dropCalls(sessionId, turn) {
    for (const [callId, call] of calls) {
      if (call.sessionId === sessionId && (turn === undefined || call.turn === turn)) calls.delete(callId)
    }
  }

  function forget(sessionId) {
    pending.delete(sessionId)
    missing.delete(sessionId)
    decisions.delete(sessionId)
    reminders.delete(sessionId)
    for (const handle of deferred.get(sessionId) ?? []) clearImmediate(handle)
    deferred.delete(sessionId)
    dropCalls(sessionId)
  }

  function deliver(sessionId) {
    if (!missing.has(sessionId)) return
    const agent = ctx.agents.get(sessionId)
    if (!agent) return
    missing.delete(sessionId)
    const sent = (reminders.get(sessionId) ?? 0) + 1
    reminders.set(sessionId, sent)
    try {
      agent.followup({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: REMINDER }],
        source: { kind: REMINDER_SOURCE },
      })
    } catch (error) {
      reminders.delete(sessionId)
      ctx.logger?.warn(`superagent-lite dispatch reminder: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    onEvent(session, event) {
      if (event.type === 'user/message') {
        // DSH user-role message sources are merge-extensible and consumers fall
        // through unknown kinds, so this marker cannot be mistaken for input.
        if (event.data.source?.kind === REMINDER_SOURCE) {
          // A reminder reopens the requirement until its retry budget runs out.
          if ((reminders.get(session.id) ?? 0) < MAX_REMINDERS) {
            pending.set(session.id, (pending.get(session.id) ?? 0) + 1)
            missing.delete(session.id)
          }
          return
        }
        if (event.data.source?.kind === 'user') {
          pending.set(session.id, (pending.get(session.id) ?? 0) + 1)
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
          let counts = decisions.get(session.id)
          if (!counts) decisions.set(session.id, counts = new Map())
          counts.set(call.turn, (counts.get(call.turn) ?? 0) + 1)
        }
        return
      }
      if (event.type !== 'turn/end') return
      const agent = ctx.agents.get(session.id)
      if (!agent || ctx.agentPresets.composedPreset(agent.ctx) !== ROUTER_PRESET) {
        forget(session.id)
        return
      }
      dropCalls(session.id, event.data.turn)
      if (event.data.reason.kind !== 'completed') {
        forget(session.id)
        return
      }
      const counts = decisions.get(session.id)
      const decided = counts?.get(event.data.turn) ?? 0
      counts?.delete(event.data.turn)
      const required = pending.get(session.id) ?? 0
      pending.delete(session.id)
      if (required > 0) {
        if (decided >= required) {
          missing.delete(session.id)
          reminders.delete(session.id)
          return
        }
        missing.add(session.id)
        // Cover a host that announces idle before turn/end, or does not announce
        // the transition for this turn: settle on the next macrotask if idle.
        const handle = setImmediate(() => {
          deferred.get(session.id)?.delete(handle)
          if (ctx.agents.get(session.id)?.status === 'idle') deliver(session.id)
        })
        let handles = deferred.get(session.id)
        if (!handles) deferred.set(session.id, handles = new Set())
        handles.add(handle)
      }
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
