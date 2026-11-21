# DSH host patch: agent-message task card

`superagent-lite` reports reach the router as DSH `agent-message` messages
(`message_router` / `report_task` call `ctx.subagents.sendMessage`). The Host
already has a task-message card, but it only uses it when the message opens the
Turn. A report steered into a running router Turn renders as the plain
`上下文注入 · agent-message` row instead. The patch below, applied to the
installed Chat client, makes every `agent-message` use the existing card chrome.
The patch is idempotent and can be reverted.

The earlier creation-card work carries its own host patch and note
(`scripts/dsh-subagent-0.2.2-rc.3-prompt-source.patch` and `docs/HOST-PATCH.md`)
on its branch. This note covers only the separate Chat client change.

## Affected versions

- DSH CLI: `@deepseek-ai/dsh` **0.2.2-rc.3** (`dsh --version`).
- Patched package: `@deepseek-ai/dsh-client-ui-chat` **0.2.2-rc.3**, installed as
  `<dsh-package>/node_modules/@deepseek-ai/dsh-client-ui-chat`.
- The plugin's `engines.dsh` is `0.2.2-rc.3`, so this is the supported pairing.
  Any other DSH version must be re-checked; the script refuses to run when the
  package version differs.

## Why the report was a plain row

- `dsh-client-ui-chat/src/client/conversation-nodes/message.ts` matches
  `user/message` events. For a non-`user` source it builds a `context` state and
  computes `waking` from the inbox: the message was claimed by the waking Turn
  (`next-turn`), or it is an idle steer opening Step 1.
- `buildViewNode` then picks the node kind: `waking ? 'turn-trigger' : 'context'`.
- A `context` node renders through `ContextInjectionRow`: header `上下文注入`,
  the source `kind` beside it, and a form-specific body. For
  `source = { kind: 'agent-message', form: 'relay', senderSessionId }`, the body
  starts with `来自会话 <sender>` and then the raw message text.
- A worker reports while the router is in an active Turn (a normal `sendMessage`
  steer). That message is claimed into `next-step`, not `next-turn`, so
  `waking` is false: source and body are already correct, only the card
  classification is missing.
- The card itself is `TurnTriggerNodeView`: agent icon, `收到任务消息`, timestamp,
  chevron, and an expandable body. `turn-trigger.ts` already maps
  `source.kind === 'agent-message'` to that label and icon, so no new visual is
  needed.

## What the patch changes

| File | Change |
| --- | --- |
| `src/client/conversation-nodes/message.ts` | A non-waking `agent-message` context also selects `turn-trigger`; the `turn-trigger` data type keeps the optional `waking` flag. |
| `src/client/chat/TurnTriggerNodeView.tsx` | The `这条通知触发了本轮回复。` explanation is shown only when `waking !== false`, because a steered report did not open the Turn. |
| `lib/client.js` | The same two edits in the runtime bundle the browser actually loads. |

No delivery semantics change: the message still arrives at the same point and
the model sees the same content. Omitted sources (anything other than
`agent-message`) keep their previous rendering, including the `context` row.
`agent-message` that actually wakes a Turn already rendered as a card and keeps
the explanation.

## Apply

The `--check` pass writes nothing and fails on a version or snippet mismatch.
The runtime file is one minified line, so the applier is an idempotent script
rather than a unified diff; it still fails closed when a target snippet or the
package version differs.

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
grep -n "agentCard" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js"
grep -n "node.data.waking !== false\|node.data.waking!==false" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/chat/TurnTriggerNodeView.tsx" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js"
```

At runtime, an `agent-message` claimed into `next-step` while the router Turn is
running must render the `收到任务消息` card. Expanding it shows the message body
but not the `这条通知触发了本轮回复。` line. Other context rows, such as
`subagent-settled` notices, keep their old presentation.

## Upgrade and rollback

- An npm upgrade replaces the package, including `lib/client.js`, so the patch is
  lost. Re-apply it after every upgrade, against the new version, after a
  `--check`.
- Without the patch, the plugin still works: the report is delivered exactly as
  before and renders as the plain context row.
- Roll back with
  `node scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs --revert`
  and restart the Host. The script restores both source files and the bundle.
