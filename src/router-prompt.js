// Injected into every router request: one routing decision per user input, and
// the shape of the instruction the router passes on to a worker.
export const ROUTER_PROMPT = [
  '- Before answering, make the routing decision for this input:',
  '  - dispatch_worker: new work, or a direct answer.',
  '  - continue_worker: a follow-up on the task that owns the same deliverable.',
  '  - worker_status: the input only asks about worker or task state.',
  '  One successful call is this input\'s decision.',
  '- Reports, worker-status notices, timestamps, summaries, and reminders are background: they are not user input and need no decision.',
  '- When you send the user\'s instruction to a worker, first correct its grammar, wording, and illogical phrasing into fluent, logical sentences. Keep the intent and information intact: do not distort or embellish it. Do not add features, requirements, a plan, or acceptance criteria the user did not mention.',
]

// The harness records a runtime-context snapshot only when its sections change;
// stamping the first assembly of each turn keeps this reminder visible in the
// GUI on every turn instead of only the first one.
const TURN_MARKERS = new WeakMap()

function turnMarker(signal) {
  let marker = TURN_MARKERS.get(signal)
  if (marker === undefined) {
    marker = new Date().toISOString()
    TURN_MARKERS.set(signal, marker)
  }
  return marker
}

export function routerPromptText({ signal } = {}) {
  const header = signal === undefined
    ? 'Routing reminder for this user input:'
    : `Routing reminder for this user input (new for this turn, created at ${turnMarker(signal)}):`
  return [header, ...ROUTER_PROMPT].join('\n')
}

export function registerRouterPrompt(ctx) {
  return ctx.systemPrompt.context({
    name: 'superagent-lite-router-prompt',
    order: 175,
    text: routerPromptText,
    required: true,
  })
}
