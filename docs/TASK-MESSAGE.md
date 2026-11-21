# Task messages

A task message is the DSH chat card that shows a non-human message opening a turn: a source icon, a localized label, a timestamp, and a collapsible body. This note records how the Host builds and delivers that card, why `superagent-lite` can match it for follow-ups but not for the first dispatch prompt, and what a host-side change would need.

The references below were checked against the installed `@deepseek-ai/dsh` **0.2.2-rc.3** (`/home/LMQ/.npm_global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`). Line numbers belong to that install.

## What the Host renders

- `@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts`: `start` takes the `source.kind !== 'user'` branch (around line 96), and `buildViewNode` renders `waking ? 'turn-trigger'` (around lines 144–155). A `user/message` with `source.kind === 'user'` stays an ordinary user row even when it opens the turn.
- `src/client/chat/turn-trigger.ts` lines 53–56 map `source.kind === 'agent-message'` to `message.trigger.agent`.
- `src/client/locale.ts` line 56 renders that key as “收到任务消息” (Chinese); the English table at line 270 is “Task message received”.
- `src/client/chat/TurnTriggerNodeView.tsx` lines 15–27 select `IconPaperPlaneOutlineRegular` for the `agent` icon, and lines 44–54 draw the icon, label, time, and chevron-backed collapsible body.
- A steer delivered to an idle worker opens Step 1 with that message claimed by the next-step inbox, so the same idle-steer path also renders a card.

## How the Host produces and delivers the source

- `@deepseek-ai/dsh-subagent/src/continuation-messages.ts` lines 49–76: `createAgentMessage` returns a message whose source is `{ kind: 'agent-message', form: 'relay', senderSessionId }` and whose first text block is `Agent <name> sent a message: `.
- `src/manager.ts` `sendMessage` (around lines 567–575) calls `createAgentMessage` and delivers it with steer delivery. Because the source is `agent-message`, an idle worker wakes into a card.
- `src/manager.ts` `startActivation` submits the creation prompt through `submitMaterialized` with the hard-coded source `{ kind: 'user' }` (line 411). `src/types.ts` `SubagentStartRequest` (lines 144–191) has no prompt-source field. Plugin code therefore cannot turn the first dispatch prompt into a card.
- The `Agent <name> sent a message: ` prefix is added by the Host for every `sendMessage`, so a follow-up card body starts with that line and then the task message below.

## What superagent-lite does now

- `dispatch_worker` starts the worker with `subagents.startActivation` and a prompt from `buildWorkerPrompt`. The text already has `Project team`, `Base branch`, `Task`, `Requirements`, and the `Before` / `During` / `After` / `Reporting` sections, but the Host stores it with the user source, so it renders as an ordinary user row.
- `continue_worker` delivers through `subagents.sendMessage` and reuses `buildWorkerPrompt` for every follow-up, so the fields and sections cannot drift from the dispatch message. The follow-up text and the state-specific instruction are appended inside `Requirements`. The original instruction sentences are kept; the running case only adds one worktree-state clarification that covers both a worker that already created its worktree and one that has not:
  - A running worker: “Requirements update for the same task. Apply it to your current work; restart only if the change requires it. If you have not created your worktree yet, call create_worktree once; otherwise it re-enters the existing checkout instead of creating another. Do not push or merge.”
  - A settled worker: “Continue the same task in your assigned worktree. After committing changes, call review_worker_commit again. Do not push or merge.”
- A running worker receives the follow-up as steering inside its current turn, not as a turn-opening card. A settled worker wakes into the `收到任务消息` card. That difference is Host inbox behavior, not message text; `sendMessage` has no queue mode, and the plugin API cannot turn a running steer into a turn trigger.

## Options for a creation card

1. **Host change (small).** Add an optional prompt source to `SubagentStartRequest`, pass it through the activation manager where `{ kind: 'user' }` is hard-coded, and have `dispatch_worker` pass `{ kind: 'agent-message', form: 'relay', senderSessionId: parent.id }`. The creation prompt then renders as the same card.
2. **Own the worker Session (large).** Create the worker with `sessionController.create` and `resolveAgent`, then deliver a frozen message with a non-user source through `agent.followup`, following the `AgentDelivery` pattern used by the official `dsh-superagent` plugin (`src/app/delivery.ts` lines 66–85; `src/app/sessions.ts` line 170 creates a Session this way). That plugin uses its own `dsh-superagent` source kind, which still yields a turn-trigger card but with the generic “Execution requested” label. This path bypasses the subagent lifecycle that `superagent-lite` relies on for worktrees, review, and router reports.
3. **Keep the creation row (current).** Accept the ordinary user row for creation and use task-message cards for follow-ups only.

## Concurrent prompt work

`src/continue.js` is also edited by another worker that is tightening the scope-judgement wording for follow-ups. This change only replaces the message envelope and keeps the original running and settled instruction sentences, adding one worktree-state clarification to the running sentence. Expect a merge conflict on those two instruction strings in `src/continue.js`; the envelope should wrap whichever wording that worker lands.
