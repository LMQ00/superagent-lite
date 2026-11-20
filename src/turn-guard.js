import { randomUUID } from 'node:crypto'

const REMINDER = '[superagent-lite] 这次输入还没有派发决定。现在必须调用 dispatch_worker：项目工作用 delegate=true 并填写 title、teamId、task；不派 worker 时用 delegate=false 并写明理由。在此之前不要给出最终回答。'

export function createDispatchGuard(ctx) {
  const calls = new Map()
  const decided = new Map()
  const armed = new Set()

  return {
    onEvent(session, event) {
      if (event.type === 'user/message') {
        if (event.data.source?.kind === 'user') armed.add(session.id)
        return
      }
      if (event.type === 'tool/call' && event.data.name === 'dispatch_worker') {
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
        }
        return
      }
      if (event.type !== 'turn/end' || event.data.reason.kind !== 'completed') return
      const agent = ctx.agents.get(session.id)
      if (!agent || ctx.agentPresets.composedPreset(agent.ctx) !== 'superagent-lite') return
      const turns = decided.get(session.id)
      if (turns?.delete(event.data.turn)) {
        armed.delete(session.id)
        return
      }
      if (!armed.delete(session.id)) return
      agent.followup({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: REMINDER }],
        source: { kind: 'user' },
      })
    },
    dispose(sessionId) {
      decided.delete(sessionId)
      armed.delete(sessionId)
      for (const [callId, call] of calls) if (call.sessionId === sessionId) calls.delete(callId)
    },
  }
}
