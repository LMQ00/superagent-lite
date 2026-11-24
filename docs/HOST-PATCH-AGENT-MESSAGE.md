# DSH host patch: role-message task cards

`superagent-lite` reaches the router as DSH `user/message` records, and the
installed Chat client renders a card only for records that open the Turn. A
record steered into a running router Turn falls back to the plain
`上下文注入 · <kind>` context row. The patch below makes every role message,
settled-role status notification and plugin-owned notice use the existing
task-card chrome, whether it woke the Turn or was steered into it. The patch is
idempotent, upgrades the earlier agent-message-only patch, and can be reverted.

The earlier creation-card work carries its own host patch and note
(`scripts/dsh-subagent-0.2.2-rc.3-prompt-source.patch` and `docs/HOST-PATCH.md`).
This note covers only the Chat client change.

## Affected versions

- DSH CLI: `@deepseek-ai/dsh` **0.2.2-rc.3** (`dsh --version`).
- Patched package: `@deepseek-ai/dsh-client-ui-chat` **0.2.2-rc.3**, installed as
  `<dsh-package>/node_modules/@deepseek-ai/dsh-client-ui-chat`.
- The plugin's `engines.dsh` is `0.2.2-rc.3`, so this is the supported pairing.
  Any other DSH version must be re-checked; the script refuses to run when the
  package version differs.

## Which message forms exist

| Family | Durable `user/message` source | Written by |
| --- | --- | --- |
| Role message / report | `{ kind: 'agent-message', form: 'relay', senderSessionId }` | `ctx.subagents.sendMessage` for worker reports, follow-ups and appended merge requests; `promptSource` for the initial dispatch and for the worker's review and memory requests |
| Status notification | `{ kind: 'subagent-settled', form: 'notice', summary, stopReason, senderSessionId }` | the DSH subagent runtime when a spawned worker settles |
| System reminder | `{ kind: 'superagent-lite-reminder' }` | `src/turn-guard.js` through `agent.followup` when a completed router Turn made no routing decision |
| Reviewer / memory helper result | no chat message | helpers run with `delivery: 'caller'`; their structured result returns to the worker as a tool result |

`agent-message` text from `sendMessage` carries the host's
`Agent <name> sent a message: ` prefix; the dispatch prompt does not. The patch
does not touch any of these contents.

## Which node renders the card

- `messageDefinition` matches `user/message`. For a non-`user` source it builds a
  `context` state and computes `waking` from the inbox: the record was claimed by
  the waking Turn (`next-turn`), or it is an idle steer opening Step 1.
- `buildViewNode` picks the node kind: `waking ? 'turn-trigger' : 'context'`.
- `turn-trigger` renders through `TurnTriggerNodeView`: source-family icon, title,
  timestamp, chevron, and an expandable body. `turnTriggerDetails` maps
  `agent-message` to `收到任务消息`, `subagent-settled` to the matching
  completed/aborted/error/token/refusal title, and an unrecognized source such as
  the plugin's `superagent-lite-*` reminder to the generic `收到执行请求`.
- `context` renders through `ContextInjectionRow`: the `上下文注入` header, the
  source kind beside it, and a form-specific body.
- A record that wakes the Turn already became a card. The missing case is a
  steered report or notice: its source and body were already correct, only the
  card classification was missing.
- The `这条通知触发了本轮回复。` explanation belongs to waking cards; it is
  suppressed when the record was steered into the Turn.

## What the patch changes

| File | Change |
| --- | --- |
| `src/client/conversation-nodes/message.ts` | `agent-message`, `subagent-settled` and every `superagent-lite-*` notice also select `turn-trigger` when they did not wake the Turn; the `turn-trigger` data type keeps the optional `waking` flag. |
| `src/client/chat/TurnTriggerNodeView.tsx` | The `这条通知触发了本轮回复。` explanation is shown only when `waking !== false`, because a steered message did not open the Turn. |
| `lib/client.js` | The same three edits in the runtime bundle the browser actually loads. |

No delivery semantics change: every message still arrives at the same point and
the model sees the same content. The only source change is the helper prompt,
which records the worker as the `agent-message` sender instead of plain `user`
input; its text is untouched. The reminder keeps its `superagent-lite-reminder`
source, so the dispatch guard still does not count it as user input; the
`superagent-lite-*` rule would also card a later plugin-owned status notice
without another Chat patch. Other
injected context (`runtime-context`, `skill-catalog`, `working-directory`,
`agent-instructions`, ...) keeps its compact context row, and a `subagent-settled`
notice keeps its own card title. A review or memory helper's result is a tool
result, not a chat message; only its request is a role message.

The patch depends on the installed Chat client bundle, not on a public plugin
API: the Chat package owns message classification and has no extension point for
reclassifying an existing `user/message` node. The dispatch, review and memory
requests additionally need the `promptSource` patch in
[HOST-PATCH](HOST-PATCH.md); without it the Host records those prompts as ordinary
`user` messages, which the Chat patch deliberately leaves alone. Without either
patch the plugin still works and the affected messages render as before.

## Apply

The `--check` pass writes nothing and fails on a version or snippet mismatch.
The runtime file is one minified line, so the applier is an idempotent script
rather than a unified diff; it still fails closed when a target snippet or the
package version differs. Applying over a Host that still carries the earlier
agent-message-only patch upgrades that snippet in place.

```sh
node scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs --check
node scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs
```

The script resolves the installed package from the `dsh` executable. To target a
specific installation, pass `--dsh <installed @deepseek-ai/dsh>` or
`--package <installed dsh-client-ui-chat>`. Applying twice is a no-op.

Restart the DSH Host (`dsh web ...`). The running Host has already imported
`lib/client.js`; a page refresh alone is not enough.

## Verify

```sh
node scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs --check
grep -n "cardedNotice" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js"
grep -n "node.data.waking !== false\|node.data.waking!==false" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/chat/TurnTriggerNodeView.tsx" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js"
```

At runtime:

- a worker report or settled notice steered into a running router Turn renders
  the task card (title `收到任务消息` or the settled-role title) instead of a
  context row; expanding it shows the body but not the explanation line;
- the dispatch guard's reminder renders the same card chrome with the generic
  `收到执行请求` title;
- a message that actually wakes the Turn keeps the `这条通知触发了本轮回复。`
  explanation;
- other context rows keep their old presentation.

## Upgrade and rollback

- An npm upgrade replaces the package, including `lib/client.js`, so the patch is
  lost. Re-apply it after every upgrade, against the new version, after a
  `--check`.
- Without the patch, the plugin still works: the affected messages are delivered
  exactly as before and render as the plain context row.
- Roll back with
  `node scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs --revert`
  and restart the Host. The script restores both source files and the bundle,
  including when the Host only carries the earlier agent-message-only patch.
