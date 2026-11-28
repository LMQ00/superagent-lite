// Injected into every router request: one routing decision per user input, and
// the shape of the instruction the router passes on to a worker.
export const ROUTER_PROMPT = [
  'Routing reminder for this input:',
  '- Make the routing decision before answering: dispatch_worker for new work or a direct answer, or continue_worker for a follow-up on the task that owns the same deliverable; use worker_status when the input only asks about worker or task state. One successful call is this input\'s decision.',
  '- Reports, worker-status notices, timestamps, summaries, and reminders are background, not user input, and need no decision.',
  '- When you send the user\'s instruction to a worker, first correct its grammar, wording, and illogical phrasing into fluent, logical sentences: keep the intent and information intact, do not distort or embellish it, and do not add features, requirements, a plan, or acceptance criteria the user did not mention.',
]

export function routerPromptText() {
  return ROUTER_PROMPT.join('\n')
}

export function registerRouterPrompt(ctx) {
  return ctx.systemPrompt.context({
    name: 'superagent-lite-router-prompt',
    order: 175,
    text: routerPromptText,
    required: true,
  })
}
