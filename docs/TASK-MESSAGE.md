# Task messages

A task message is the DSH chat card that shows a non-human message opening a turn: a source icon, a localized label, a timestamp, and a collapsible body. This note records how the Host builds and delivers that card and how `superagent-lite` uses it for both a settled follow-up and the initial `dispatch_worker` creation. The creation card needs a small Host patch because DSH 0.2.2-rc.3 hard-codes the creation prompt's source; see [HOST-PATCH](HOST-PATCH.md).

The references below were checked against `@deepseek-ai/dsh` **0.2.2-rc.3** in the installed checkout (`node_modules/@deepseek-ai/`). Line numbers belong to that version.

## What the Host renders

- `@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts`: `start` takes the `source.kind !== 'user'` branch (around line 96), and `buildViewNode` renders `waking ? 'turn-trigger'` (around lines 144–155). A `user/message` with `source.kind === 'user'` stays an ordinary user row even when it opens the turn.
- `src/client/chat/turn-trigger.ts` lines 53–56 map `source.kind === 'agent-message'` to `message.trigger.agent`.
- `src/client/locale.ts` line 56 renders that key as “收到任务消息” (Chinese); the English table at line 270 is “Task message received”.
- `src/client/chat/TurnTriggerNodeView.tsx` lines 15–27 select `IconPaperPlaneOutlineRegular` for the `agent` icon, and lines 44–54 draw the icon, label, time, and chevron-backed collapsible body.
- A steer delivered to an idle worker opens Step 1 with that message claimed by the next-step inbox, so the same idle-steer path also renders a card.

## How the Host produces and delivers the source

- `@deepseek-ai/dsh-subagent/src/continuation-messages.ts` lines 49–76: `createAgentMessage` returns a message whose source is `{ kind: 'agent-message', form: 'relay', senderSessionId }` and whose first text block is `Agent <name> sent a message: `.
- `src/manager.ts` `sendMessage` (around lines 567–575) calls `createAgentMessage` and delivers it with steer delivery. Because the source is `agent-message`, an idle worker wakes into a card.
- `src/manager.ts` `startActivation` submits the creation prompt through `submitMaterialized` with the hard-coded source `{ kind: 'user' }` (line 411) in unpatched 0.2.2-rc.3. `src/types.ts` `SubagentStartRequest` has no prompt-source field, so plugin code cannot turn the first dispatch prompt into a card as shipped.
- The [Host patch](HOST-PATCH.md) adds optional `SubagentStartRequest.promptSource?: MessageSource` and uses `spec.promptSource ?? { kind: 'user' }` at that call site, including the runtime bundle `lib/index.js`. Omitting it preserves the old plain-user row. With a non-`user` source the creation prompt is claimed by the waking turn, so the same `turn-trigger` path renders the card.
- The `Agent <name> sent a message: ` prefix is added by the Host for every `sendMessage`, so a follow-up card body starts with that line and then the task message below. The creation path does not add that prefix: its card body starts directly with `Project team: …`.

## What superagent-lite does now

- `dispatch_worker` starts the worker with `subagents.startActivation` and a prompt from `buildWorkerPrompt`. The text has `Project team`, `Base branch`, `Task`, `Requirements`, and the `Before` / `During` / `After` / `Reporting` sections, and the call passes `promptSource: { kind: 'agent-message', form: 'relay', senderSessionId }` so the creation prompt renders as a `收到任务消息` card. `dispatch.js` calls `buildWorkerPrompt` with exactly `title`, `teamId`, `task`, and `baseBranch`; the continuation path passes the same four fields. Without the [Host patch](HOST-PATCH.md) the field is ignored and the creation row is a plain user message again.
- `continue_worker` checks the live worker Agent first (`ctx.agents.get(workerSessionId)?.status`), then the stored task status:
  - **Active turn** (`worker.status === 'running'`): the concise steering update (`Requirements update for the same task…`), whatever the stored task status says. It asks the worker to judge whether the follow-up belongs to the task and to report an unapplied one. It rides in the active turn, cannot become a turn trigger, and must not reset a settled record's `review`; resending the full dispatch message would repeat setup and reporting phases mid-work.
  - **Idle worker**: the full `buildWorkerPrompt` task message with the current follow-up inside `Requirements`, followed by a `Resume` section. An idle worker opens a new turn from this message, so it renders the `收到任务消息` card. A settled task (`awaiting-merge`, `review-required`, or `failed`) is first validated and marked `resuming`; a task whose stored status is still `running` stays `running`. The `Resume` section says to create the worktree once only if it is still missing, otherwise re-enter the existing checkout, not to redo completed work or repeat the dispatch setup phases, and to report `BLOCKED` with the mismatch instead of requesting another review when the follow-up does not belong. This covers a worker whose task status is still `running` but whose turn already ended.
- `Task` stays the task title; the follow-up is not a new task. Earlier follow-ups remain in the worker's Session history; the resumed card repeats the original requirements and the current follow-up, not every past update.
- `src/continue.js` records each delivered follow-up in `task.followUps` before sending it, so `src/review.js` can pass the recorded texts to the reviewer as context; approval is still judged against the original requirements. A failed delivery drops the recorded entry.
- The follow-up card's body starts with the Host's `Agent <name> sent a message: ` prefix, followed by the task message. The creation card's body starts with the task message itself. The follow-up card path covers `awaiting-merge`, `review-required`, and `failed`; a delivery failure marks a settled task `failed`, while a running delivery failure leaves it `running`.

## Verification

Unit tests assert the delivered text, the `sendMessage` target, and the `promptSource` passed by `dispatch_worker` (`test/host.test.js` with `DSH_INSTALL_DIR`). The card itself is rendered by the Host client from the message source; `node --test` cannot assert that. Manual check against DSH 0.2.2-rc.3 with the Host patch applied: a fresh `dsh web --port 3099` (plugin restarted) dispatched a new worker. Its Session recorded `source: { kind: 'agent-message', form: 'relay', senderSessionId: <router> }` on the first `user/message`, that message id was inserted into the `next-turn` inbox and removed by the waking turn, and the chat showed the `收到任务消息` card with its timestamp and collapsible chevron. A settled follow-up likewise opens as a card.

## Creation-card options

1. **Host seam (implemented).** Add an optional prompt source to `SubagentStartRequest`, pass it through the activation manager where `{ kind: 'user' }` is hard-coded, and have `dispatch_worker` pass `{ kind: 'agent-message', form: 'relay', senderSessionId: agent.id }`. The creation prompt then renders as the same card. The exact diff, application steps, and upgrade caveat are in [HOST-PATCH](HOST-PATCH.md).
2. **Own the worker Session (large, not used).** Create the worker with `sessionController.create` and `resolveAgent`, then deliver a frozen message with a non-user source through `agent.followup`, following the `AgentDelivery` pattern used by the official `dsh-superagent` plugin (`src/app/delivery.ts` lines 66–85; `src/app/sessions.ts` line 170 creates a Session this way). That plugin uses its own `dsh-superagent` source kind, which still yields a turn-trigger card but with the generic “Execution requested” label. This path bypasses the subagent lifecycle that `superagent-lite` relies on for worktrees, review, and router reports.
3. **Keep the creation row (previous behavior).** Accept the ordinary user row for creation and use task-message cards for settled follow-ups only; this is what runs when the Host patch is absent.

## Follow-up paths

The follow-up scope check now appears on both paths: the running instruction stays concise, while the resumed card repeats the full dispatch text and adds the `Resume` section. Both record the follow-up before delivery, so the reviewer receives it as context.
