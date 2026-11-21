# Task messages

A task message is the DSH chat card that shows a non-human message opening a turn: a source icon, a localized label, a timestamp, and a collapsible body. This note records how the Host builds and delivers that card, why `superagent-lite` can match it only for a settled follow-up, and what a host-side change would need.

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
- `src/manager.ts` `startActivation` submits the creation prompt through `submitMaterialized` with the hard-coded source `{ kind: 'user' }` (line 411). `src/types.ts` `SubagentStartRequest` (lines 144–191) has no prompt-source field. Plugin code therefore cannot turn the first dispatch prompt into a card.
- The `Agent <name> sent a message: ` prefix is added by the Host for every `sendMessage`, so a follow-up card body starts with that line and then the task message below.

## What superagent-lite does now

- `dispatch_worker` starts the worker with `subagents.startActivation` and a prompt from `buildWorkerPrompt`. The text already has `Project team`, `Base branch`, `Task`, `Requirements`, and the `Before` / `During` / `After` / `Reporting` sections, but the Host stores it with the user source, so it renders as an ordinary user row. `dispatch.js` calls `buildWorkerPrompt` with exactly `title`, `teamId`, `task`, and `baseBranch`; the continuation path passes the same four fields.
- A running worker still receives the existing concise steering update (`Requirements update for the same task…`). That message rides in the active turn, cannot become a turn trigger, and resending the full dispatch message would repeat setup and reporting phases mid-work, so this path keeps its original text.
- A settled worker is the only continuation path that opens a new turn. It receives the full `buildWorkerPrompt` task message with the current follow-up appended inside `Requirements`, so a settled resume renders the `收到任务消息` card once the worker wakes. The earlier follow-ups remain in the worker's Session history; the resumed card repeats the original requirements and the current follow-up, not every past update.
- The card's body starts with the Host's `Agent <name> sent a message: ` prefix, followed by the task message.

## Verification limits

Unit tests assert the delivered text and the `sendMessage` target. The card itself is rendered by the Host client from the message source; this bundle cannot assert that in `node --test`. Manual check: open a settled worker, run `continue_worker`, and confirm the follow-up opens as a “收到任务消息” card; a fresh `dispatch_worker` still shows an ordinary user row.

## Options for a creation card

1. **Host change (small).** Add an optional prompt source to `SubagentStartRequest`, pass it through the activation manager where `{ kind: 'user' }` is hard-coded, and have `dispatch_worker` pass `{ kind: 'agent-message', form: 'relay', senderSessionId: parent.id }`. The creation prompt then renders as the same card.
2. **Own the worker Session (large).** Create the worker with `sessionController.create` and `resolveAgent`, then deliver a frozen message with a non-user source through `agent.followup`, following the `AgentDelivery` pattern used by the official `dsh-superagent` plugin (`src/app/delivery.ts` lines 66–85; `src/app/sessions.ts` line 170 creates a Session this way). That plugin uses its own `dsh-superagent` source kind, which still yields a turn-trigger card but with the generic “Execution requested” label. This path bypasses the subagent lifecycle that `superagent-lite` relies on for worktrees, review, and router reports.
3. **Keep the creation row (current).** Accept the ordinary user row for creation and use task-message cards for settled follow-ups only.

## Concurrent prompt work

`src/continue.js` is also edited by another worker that is tightening the scope-judgement wording for running follow-ups. The running instruction is left exactly as it was; this change only adds the `resumingPrompt` for the settled branch and imports `buildWorkerPrompt`. Expect a small merge conflict around the settled-branch message construction, not around the running instruction.
