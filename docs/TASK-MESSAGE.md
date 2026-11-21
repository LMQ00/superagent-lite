# Task messages

A task message is the DSH chat card that shows a non-human message opening a turn: a source icon, a localized label, a timestamp, and a collapsible body. This note records how the Host builds and delivers that card, why `superagent-lite` can match it for follow-ups but not for the first dispatch prompt, and what a host-side change would need.

## What the Host renders

- `@deepseek-ai/dsh-client-ui-chat` classifies an input in `src/client/conversation-nodes/message.ts`. A `user/message` whose `source.kind` is not `user` becomes a context message; when it wakes a turn it is rendered as `turn-trigger` (`start`, around the `source.kind !== 'user'` branch; `buildViewNode`, `waking ? 'turn-trigger'`). A message with `source.kind === 'user'` stays an ordinary user row even when it opens the turn.
- `src/client/chat/turn-trigger.ts` maps `source.kind === 'agent-message'` to `message.trigger.agent`.
- `src/client/locale.ts` renders `message.trigger.agent` as “收到任务消息” (Chinese) and “Task message received” (English).
- `src/client/chat/TurnTriggerNodeView.tsx` draws the paper-plane icon, the label, the time, and the chevron-backed collapsible body (`agent: IconPaperPlaneOutlineRegular`).
- A steer delivered to an idle worker opens Step 1 with that message claimed by the next-step inbox, so the same idle-steer path also renders a card.

## How the Host produces and delivers the source

- `@deepseek-ai/dsh-subagent` builds agent messages in `src/continuation-messages.ts`. `createAgentMessage` returns `{ kind: 'agent-message', form: 'relay', senderSessionId }` and prefixes the content with `Agent <name> sent a message: ` before the supplied blocks.
- `subagents.sendMessage` calls `createAgentMessage` and delivers it with steer delivery (`src/manager.ts`, `sendMessage`). Because the source is `agent-message`, an idle worker wakes into a card.
- `subagents.startActivation` submits the creation prompt with a hard-coded `{ kind: 'user' }` source (`src/manager.ts`, the `submitMaterialized` call near `source: { kind: 'user' }`). `SubagentStartRequest` in `src/types.ts` has no prompt-source field. Plugin code cannot turn the first dispatch prompt into a card.
- The `Agent <name> sent a message: ` prefix is added by the Host for every `sendMessage`, so a follow-up card body starts with that line, followed by the task message below.

## What superagent-lite does now

- `dispatch_worker` starts the worker with `subagents.startActivation` and a prompt from `buildWorkerPrompt`. The text already has `Project team`, `Base branch`, `Task`, `Requirements`, and the `Before` / `During` / `After` / `Reporting` sections, but the Host stores it with the user source, so it renders as an ordinary user row.
- `continue_worker` delivers through `subagents.sendMessage` and reuses `buildWorkerPrompt` for every follow-up, so the fields and sections cannot drift from the dispatch message. The follow-up text and one state-specific instruction are appended inside `Requirements`:
  - A running worker is told it already has its worktree, that `create_worktree` only re-enters it, and not to push or merge.
  - A settled worker is told to continue in its assigned worktree, call `review_worker_commit` again, and not push or merge.
- A running worker receives the follow-up as steering inside its current turn, not as a turn-opening card. A settled worker wakes into the `收到任务消息` card. That difference is Host inbox behavior, not message text.

## Options for a creation card

1. **Host change (small).** Add an optional prompt source to `SubagentStartRequest`, pass it through the activation manager where `{ kind: 'user' }` is hard-coded, and have `dispatch_worker` pass `{ kind: 'agent-message', form: 'relay', senderSessionId: parent.id }`. The creation prompt then renders as the same card.
2. **Own the worker Session (large).** Create the worker with `sessionController.create` and `resolveAgent`, then deliver a frozen message with a non-user source through `agent.followup`, following the `AgentDelivery` pattern used by the official `dsh-superagent` plugin (`src/app/delivery.ts`, which uses its own `dsh-superagent` source kind rather than `agent-message`). This bypasses the subagent lifecycle that `superagent-lite` relies on for worktrees, review, and router reports.
3. **Keep the creation row (current).** Accept the ordinary user row for creation and use task-message cards for follow-ups only.

## Concurrent prompt work

`src/continue.js` is also edited by another worker that is tightening the scope-judgement wording for follow-ups. This change only replaces the message envelope: it keeps the existing instruction semantics and sends the text through `buildWorkerPrompt`. Expect a merge conflict on the instruction lines in `src/continue.js`; the envelope should wrap whichever wording that worker lands.
