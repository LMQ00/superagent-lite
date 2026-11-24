# DSH host patch: agent-message task card

`superagent-lite` reports reach the router as DSH `agent-message` messages
(`message_router` / `report_task` call `ctx.subagents.sendMessage`). The Host
already has a task-message card, but it only uses it when the message opens the
Turn. A report steered into a running router Turn renders as the plain
`上下文注入 · agent-message` row instead. The patch below, applied to the
installed Chat client, makes every `agent-message` use the existing card chrome.
The patch is version-aware, idempotent, and can be reverted.

The earlier creation-card work carries its own host patch and note
(`scripts/dsh-subagent-0.2.2-rc.3-prompt-source.patch` and `docs/HOST-PATCH.md`).
That source patch remains `0.2.2-rc.3`-only; this note covers only the separate
Chat client change.

## Supported installs

| Install | Detection | Files patched | Notes |
| --- | --- | --- | --- |
| dsh `0.2.2-rc.3` (npm) | `package.json` version, and `src/client/conversation-nodes/message.ts` plus `src/client/chat/TurnTriggerNodeView.tsx` exist | those two source files and the minified `lib/client.js` | The source and runtime bundle are both patched. |
| dsh `0.2.2-rc.1` (npm) | `package.json` version, and the `src/` files above are absent | `lib/client.js` only | The published rc.1 package ships no `src/`; its bundle is esbuild-formatted, not minified. |
| DSH-go Host with DSH `0.2.2-rc.1` | `--dsh-go <dir>` (rootfs, prefix, or checkout), or a resolved path under `opt/dsh/node_modules/` / `dsh-prefix/node_modules/` | the rc.1 `lib/client.js` inside the DSH-go PRoot rootfs or build prefix | DSH-go's own engine patches (for example `web-empty-reply-notice.diff`) stay in place. |

Any other `@deepseek-ai/dsh-client-ui-chat` version is rejected with exit code 1
and no writes. `0.2.1-rc.4` (an older DSH-go pin) and `0.2.2-rc.4`/`rc.5` are
not supported.

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
- The card itself is `TurnTriggerNodeView`: agent icon, `收到任务消息`,
  timestamp, chevron, and an expandable body. `turn-trigger.ts` already maps
  `source.kind === 'agent-message'` to that label and icon, so no new visual is
  needed.

## Version and layout differences

| | `0.2.2-rc.3` | `0.2.2-rc.1` / DSH-go |
| --- | --- | --- |
| Install layout | `src/` plus `lib/client.js` | `lib/` only; no `src/` |
| Bundle format | minified, backtick template literals | esbuild output with tabs and double-quoted strings |
| Classification | `message.ts` `const waking = ...` / `buildViewNode` | `lib/client.js` function: `const waking = context.state.kind === "context" ...` |
| Card selection | `waking ? 'turn-trigger' : context.state.kind` | `chatNode(context, waking ? "turn-trigger" : context.state.kind, ...)` |
| Explanation | `TurnTriggerNodeView.tsx` `<p>{t('message.trigger.explanation')}</p>` | `children: [(0, react_jsx_runtime.jsx)("p", { className: ...explanation ... }), ...]` |
| DSH-go path | not applicable | `<DSH-go root>/opt/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`, or `<checkout>/runtime/.work/<abi>/dsh-prefix/node_modules/...` |

DSH-go builds its engine with DSH `0.2.2-rc.1` (`runtime/build-runtime.sh` default
`DSH_VERSION`), then applies its own diffs under `runtime/patches/`. Its
`web-empty-reply-notice.diff` also edits `lib/client.js`, but in the locale map
and `TurnTailNodeView`; it does not overlap the two regions this patch touches.
The script therefore matches its target snippets inside the DSH-go-patched
bundle and leaves DSH-go's changes alone. A future DSH-go engine upgrade that
changes either region makes `--check` fail instead of guessing.

A normal DSH-go app install keeps its rootfs inside the app's private data and
cannot be patched in place without root/adb. `--dsh-go` targets an extracted
rootfs (the `opt/dsh` tree) or a DSH-go checkout's built `dsh-prefix`; to ship the
change to ordinary app users it has to go into the DSH-go engine build instead.

## What the patch changes

| File | Change |
| --- | --- |
| `src/client/conversation-nodes/message.ts` (rc.3 only) | A non-waking `agent-message` context also selects `turn-trigger`; the `turn-trigger` data type keeps the optional `waking` flag. |
| `src/client/chat/TurnTriggerNodeView.tsx` (rc.3 only) | The `这条通知触发了本轮回复。` explanation is shown only when `waking !== false`, because a steered report did not open the Turn. |
| `lib/client.js` (all supported installs) | The same classification and explanation guard in the runtime bundle the browser actually loads. |

No delivery semantics change: the message still arrives at the same point and
the model sees the same content. Omitted sources (anything other than
`agent-message`) keep their previous rendering, including the `context` row.
`agent-message` that actually wakes a Turn already rendered as a card and keeps
the explanation.

## Apply

`--check` writes nothing and exits non-zero when the version, layout, or target
snippets do not match. The applier uses exact snippets rather than a unified
diff because rc.3's runtime file is one minified line.

```sh
# npm install resolved from the `dsh` executable on PATH
node scripts/dsh-client-ui-chat-agent-message-card.mjs --check
node scripts/dsh-client-ui-chat-agent-message-card.mjs

# a specific npm install
node scripts/dsh-client-ui-chat-agent-message-card.mjs --dsh /path/to/@deepseek-ai/dsh --check
node scripts/dsh-client-ui-chat-agent-message-card.mjs --package /path/to/dsh-client-ui-chat

# DSH-go rootfs, built dsh-prefix, or DSH-go checkout
node scripts/dsh-client-ui-chat-agent-message-card.mjs --dsh-go /path/to/dsh-go-rootfs --check
node scripts/dsh-client-ui-chat-agent-message-card.mjs --dsh-go /path/to/dsh-Go --check
```

Expected `--check` output:

```text
@deepseek-ai/dsh-client-ui-chat 0.2.2-rc.3 (source-and-bundle): patch is applicable (src/client/conversation-nodes/message.ts, src/client/chat/TurnTriggerNodeView.tsx, lib/client.js)
@deepseek-ai/dsh-client-ui-chat 0.2.2-rc.1 (bundle-only): patch is applicable (lib/client.js)
@deepseek-ai/dsh-client-ui-chat 0.2.2-rc.1 (DSH-go Host, bundle-only): patch is applicable (lib/client.js)
```

After a successful apply, restart DSH (`dsh web ...`) for an npm Host. For
DSH-go, restart the app's local engine (or the Host whose rootfs you patched).
The running Host has already imported `lib/client.js`; a page refresh alone is
not enough.

Without `--package`, `--dsh`, or `--dsh-go`, the script resolves the Chat package
from the `dsh` executable on PATH. It accepts both npm layouts: a package nested
under the installed `@deepseek-ai/dsh`, and a sibling hoisted into the same
`@deepseek-ai` scope directory (the layout inside a DSH-go rootfs).

### DSH-go resolution

`--dsh-go <dir>` accepts:

- an extracted DSH-go rootfs: `<dir>/opt/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat`
- a staged DSH prefix: `<dir>/node_modules/@deepseek-ai/dsh-client-ui-chat`
- a DSH-go checkout: `<dir>/runtime/.work/<abi>/dsh-prefix/node_modules/@deepseek-ai/dsh-client-ui-chat`
- the package directory itself

If more than one candidate exists, the script refuses and lists them; pass
`--package` to choose one. If none exists, it prints the expected paths.

## Verify

```sh
node scripts/dsh-client-ui-chat-agent-message-card.mjs --check
```

For rc.3, check both the source and the runtime bundle:

```sh
grep -n "agentCard" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js"
grep -n "node.data.waking !== false\|node.data.waking!==false" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/chat/TurnTriggerNodeView.tsx" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js"
```

For rc.1 and DSH-go there is no source tree; check the bundle:

```sh
grep -n "const agentCard = context.state.kind" "$CHAT_PKG/lib/client.js"
grep -n "waking || agentCard ? \"turn-trigger\"" "$CHAT_PKG/lib/client.js"
grep -n "children: \[node.data.waking !== false &&" "$CHAT_PKG/lib/client.js"
```

At runtime, an `agent-message` claimed into `next-step` while the router Turn is
running must render the `收到任务消息` card. Expanding it shows the message body
but not the `这条通知触发了本轮回复。` line. Other context rows, such as
`subagent-settled` notices, keep their old presentation.

## Failure messages

The script fails closed and writes nothing unless every target snippet matches
exactly once.

| Message | Meaning | Action |
| --- | --- | --- |
| `supported versions are 0.2.2-rc.3, 0.2.2-rc.1` | The installed package version is not covered. | Do not patch. Add a version-specific target after checking its bundle. |
| `expected the 0.2.2-rc.3 source-and-bundle layout, but ... is missing` | The rc.3 install was pruned or hand-assembled. | Reinstall the package or patch only after adding a verified bundle-only rule. |
| `this 0.2.2-rc.1 install ships ...; ... only supports the published bundle` | An rc.1 tree unexpectedly contains source files. | Stop; the bundle rules do not describe that tree. |
| `does not contain "<label>"` | The bundle differs from the supported build (wrong version, future patch, or DSH-go pin). | Do not patch. Compare the bundle with the target version and add a new target only after review. |
| `contains "<label>" 2 times; refusing an ambiguous patch` | The snippet is duplicated, so the intended location is unclear. | Restore a clean package copy; do not patch. |
| `contains more than one @deepseek-ai/dsh-client-ui-chat` | `--dsh-go` found several installs. | Pass `--package <dir>`. |

An already-patched or already-reverted tree exits 0 with `already patched` /
`already reverted`; it is not an error.

## Upgrade and rollback

- An npm upgrade or DSH-go engine update replaces the package/rootfs, including
  `lib/client.js`, so the patch is lost. Re-run `--check`, then apply again.
- Without the patch, the plugin still works: the report is delivered exactly as
  before and renders as the plain context row.
- Roll back with the same target option:
  `node scripts/dsh-client-ui-chat-agent-message-card.mjs --revert`,
  `... --dsh-go <dir> --revert`, or `... --package <dir> --revert`.
  The script reverses only its own two edits; a DSH-go engine patch in the same
  `lib/client.js` remains. Restart the Host (or DSH-go local engine) afterwards.
- If an upgrade lands between apply and revert, the patched snippets may be
  gone; `--revert` then reports a mismatch and leaves the new file alone. Keep a
  copy of the pristine `lib/client.js` if you need a byte-exact restore across
  upgrades.
- Keep the plugin's `dispatch.js` source and this patch together; the card
  requires both the Host-side rendering change and the plugin passing
  `agent-message`.
