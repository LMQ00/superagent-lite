# Task messages

A task message is the DSH chat card that shows a non-human message opening a turn: a source icon, a localized label, a timestamp, and a collapsible body. This note records how the Host builds and delivers that card, and why `superagent-lite` can match it for follow-ups but not for the first dispatch prompt.

## What the Host renders

- `@deepseek-ai/dsh-client-ui-chat` turns a waking `user/message` whose `source.kind` is not `user` into a `turn-trigger` node (`src/client/conversation-nodes/message.ts`). `turn-trigger.ts` maps `source.kind === 'agent-message'` to `message.trigger.agent`, which is “收到任务消息” in Chinese and “Task message received” in English. `TurnTriggerNodeView.tsx` draws the paper-plane icon, the label, the time, and the collapsible body.
- A message with `source.kind === 'user'` stays an ordinary user row even when it opens the turn. The card is therefore selected by the message source, not by its text.
- A steer delivered to an idle worker opens Step 1 with that message claimed by the next-step inbox; the same `turn-trigger` classification also covers that idle-steer case.

## How the Host produces the source

- `@deepseek-ai/dsh-subagent` builds agent messages in `src/continuation-messages.ts`: `createAgentMessage` returns a message with `{ kind: 'agent-message', form: 'relay', senderSessionId }` and prefixes the content with `Agent <name> sent a message:`.
- `subagents.sendMessage` delivers that message through `manager.ts` with steer delivery. The message carries the `agent-message` source, so an idle worker wakes into a card.
- `subagents.startActivation` submits the creation prompt with a hard-coded `{ kind: 'user' }` source (`manager.ts`, the `submitMaterialized` call). `SubagentStartRequest` in `types.ts` has no prompt-source field. Plugin code cannot turn the first dispatch prompt into a card.

## What superagent-lite does now

- `dispatch_worker` starts the worker with `subagents.startActivation` and a prompt from `buildWorkerPrompt`. The text already has `Project team`, `Base branch`, `Task`, `Requirements`, and the `Before` / `During` / `After` / `Reporting` sections, but the Host renders the prompt as an ordinary user row.
- `continue_worker` delivers through `subagents.sendMessage` and now reuses the same task-message shape:
  - A running worker gets the header, the original requirements, the follow-up, and continuation-specific `Before` / `During` / `After` sections without the dispatch setup phase.
  - A settled worker gets the full `buildWorkerPrompt` task message with the follow-up inside `Requirements`, because it resumes from rest and must re-enter its worktree and review.
- A running worker receives the message as steering inside its current turn rather than as a turn-opening card; a settled worker wakes into the `收到任务消息` card. This difference is Host inbox behavior, not text.

## Options for a creation card

1. **Host change (small).** Add an optional prompt source to `SubagentStartRequest`, pass it through the activation manager where `{ kind: 'user' }` is hard-coded, and have `dispatch_worker` pass `{ kind: 'agent-message', form: 'relay', senderSessionId: parent.id }`. The creation prompt then renders as the same card.
2. **Own the worker Session (large).** Create the worker with `sessionController.create` and `resolveAgent`, then deliver a frozen message with a non-user source through `agent.followup`, following the `AgentDelivery` pattern used by the official `dsh-superagent` plugin. This bypasses the subagent lifecycle that `superagent-lite` relies on for worktrees, review, and router reports.
3. **Keep the creation row (current).** Accept the ordinary user row for creation and use task-message cards for follow-ups only.
