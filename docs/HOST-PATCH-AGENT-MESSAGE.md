# DSH host patch: role-message task cards

`superagent-lite` reaches the router as DSH `user/message` records, and the
installed Chat client renders a card only for records that open the Turn. A
record steered into a running router Turn falls back to the plain
`上下文注入 · <kind>` context row. The patch below makes every role message,
settled-role status notification and plugin-owned notice use the existing
task-card chrome, whether it woke the Turn or was steered into it. The patch is
version-aware (`0.2.2-rc.1` through `0.2.3-alpha.1`, including every
`0.2.2-rc.*` release, plus the DSH-go Host), idempotent, upgrades the earlier
agent-message-only rc.3 patch, and can be reverted.

The earlier creation-card work carries its own host patch and note
(`scripts/dsh-subagent-0.2.2-prompt-source.patch`,
`scripts/dsh-subagent-0.2.2-rc.1-prompt-source.patch` and `docs/HOST-PATCH.md`).
That source patch covers `0.2.2-rc.1` through `0.2.2-rc.5`; `0.2.3-alpha.1`
records the initial task natively, so it needs no source patch. This note covers
only the separate Chat client change.

## Supported installs

| Install | Detection | Files patched | Notes |
| --- | --- | --- | --- |
| dsh `0.2.3-alpha.1` (npm) | `@deepseek-ai/dsh-client-ui-chat` `package.json` version, and `src/client/conversation-nodes/message.ts` plus `src/client/chat/TurnTriggerNodeView.tsx` exist | those two source files and the minified `lib/client.js` | The source and runtime bundle are both patched. The two patched source files are byte-identical to rc.2–rc.5 and the bundle keeps the same target snippets, so this version shares their target; the rest of alpha.1's Chat package changed. |
| dsh `0.2.2-rc.5` / `0.2.2-rc.4` / `0.2.2-rc.3` / `0.2.2-rc.2` (npm) | `@deepseek-ai/dsh-client-ui-chat` `package.json` version, and `src/client/conversation-nodes/message.ts` plus `src/client/chat/TurnTriggerNodeView.tsx` exist | those two source files and the minified `lib/client.js` | The four releases publish the same Chat client except for `package.json`, including `lib/client.js`, so all use the same patch target. |
| dsh `0.2.2-rc.1` (npm) | `package.json` version, and the `src/` files above are absent | `lib/client.js` only | The published rc.1 package ships no `src/`; its bundle is esbuild-formatted, not minified. |
| DSH-go Host with DSH `0.2.2-rc.1` | `--dsh-go <dir>` (rootfs, prefix, or checkout), or a resolved path under `opt/dsh/node_modules/` / `dsh-prefix/node_modules/` | the rc.1 `lib/client.js` inside the DSH-go PRoot rootfs or build prefix | DSH-go's own engine patches (for example `web-empty-reply-notice.diff`) stay in place. |

Version equality alone is not enough: the script also verifies the expected
layout (source plus bundle for rc.2–rc.5 and alpha.1, bundle only for rc.1) and
every target snippet before writing. Any other `@deepseek-ai/dsh-client-ui-chat`
version is rejected with exit code 1 and no writes. That includes
`0.2.2-alpha.3` (below the supported range), `0.2.1-rc.4` (an older DSH-go pin),
`0.2.3-alpha.2` and later versions.

## Which message forms exist

| Family | Durable `user/message` source | Written by |
| --- | --- | --- |
| Role message / report | `{ kind: 'agent-message', form: 'relay', senderSessionId }` | `ctx.subagents.sendMessage` for worker reports, follow-ups and appended merge requests; `promptSource` for the initial dispatch and for the worker's review and memory requests on `0.2.2-rc.1` through `0.2.2-rc.5`, or the native `createAgentMessage` path on `0.2.3-alpha.1` |
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
- On `0.2.2-rc.1` and the DSH-go Host the package ships no `src/`, so the same
  classification and explanation guard live only in `lib/client.js`; that
  published bundle is esbuild-formatted (`const waking = ...`, tabs, double
  quotes) rather than minified.

## Version and layout differences

`0.2.2-rc.2` through `0.2.2-rc.5` publish the same Chat client: the source files
and `lib/client.js` have the same SHA-256 in those releases. `0.2.3-alpha.1`
changes most of the Chat package, but its
`src/client/conversation-nodes/message.ts` and
`src/client/chat/TurnTriggerNodeView.tsx` are byte-identical to rc.2–rc.5 and
its `lib/client.js` contains the same classification and explanation snippets.
The script therefore maps all five versions to the same source-and-bundle
target. rc.1 and DSH-go keep the older bundle-only layout.

| | `0.2.2-rc.2` … `0.2.2-rc.5`, `0.2.3-alpha.1` | `0.2.2-rc.1` / DSH-go |
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
| `src/client/conversation-nodes/message.ts` (rc.2–rc.5, alpha.1) | `agent-message`, `subagent-settled` and every `superagent-lite-*` notice also select `turn-trigger` when they did not wake the Turn; the `turn-trigger` data type keeps the optional `waking` flag. |
| `src/client/chat/TurnTriggerNodeView.tsx` (rc.2–rc.5, alpha.1) | The `这条通知触发了本轮回复。` explanation is shown only when `waking !== false`, because a steered message did not open the Turn. |
| `lib/client.js` (all supported installs) | The same three edits in the runtime bundle the browser actually loads. |

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
`user` messages, which the Chat patch deliberately leaves alone. `0.2.3-alpha.1`
records the initial task natively, so it needs only this Chat patch. Without
either patch the plugin still works and the affected messages render as before.
Both patches are mandatory only for the card presentation; the `0.2.2-rc.2`
through `0.2.2-rc.5` `promptSource` work is one unified diff
(`scripts/dsh-subagent-0.2.2-prompt-source.patch`), and `0.2.2-rc.1` has its own
bundle-only diff (`scripts/dsh-subagent-0.2.2-rc.1-prompt-source.patch`).

## Apply

The `--check` pass writes nothing and exits non-zero when the version, layout or
snippet does not match. The runtime file is one minified line, so the applier is
an idempotent script rather than a unified diff; it still fails closed when a
target snippet or the package version differs. Applying over a Host that still
carries the earlier agent-message-only rc.3 patch upgrades that snippet in place.

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
@deepseek-ai/dsh-client-ui-chat 0.2.3-alpha.1 (source-and-bundle): patch is applicable (src/client/conversation-nodes/message.ts, src/client/chat/TurnTriggerNodeView.tsx, lib/client.js)
@deepseek-ai/dsh-client-ui-chat 0.2.2-rc.5 (source-and-bundle): patch is applicable (src/client/conversation-nodes/message.ts, src/client/chat/TurnTriggerNodeView.tsx, lib/client.js)
@deepseek-ai/dsh-client-ui-chat 0.2.2-rc.4 (source-and-bundle): patch is applicable (src/client/conversation-nodes/message.ts, src/client/chat/TurnTriggerNodeView.tsx, lib/client.js)
@deepseek-ai/dsh-client-ui-chat 0.2.2-rc.3 (source-and-bundle): patch is applicable (src/client/conversation-nodes/message.ts, src/client/chat/TurnTriggerNodeView.tsx, lib/client.js)
@deepseek-ai/dsh-client-ui-chat 0.2.2-rc.2 (source-and-bundle): patch is applicable (src/client/conversation-nodes/message.ts, src/client/chat/TurnTriggerNodeView.tsx, lib/client.js)
@deepseek-ai/dsh-client-ui-chat 0.2.2-rc.1 (bundle-only): patch is applicable (lib/client.js)
@deepseek-ai/dsh-client-ui-chat 0.2.2-rc.1 (DSH-go Host, bundle-only): patch is applicable (lib/client.js)
```

After a successful apply, restart DSH (`dsh web ...`) for an npm Host. For
DSH-go, restart the app's local engine (or the Host whose rootfs you patched).
The running Host has already imported `lib/client.js`; a page refresh alone is
not enough.

An installed bundle also runs this check and apply from `src/host-patch.js` when
it loads. It resolves the current `@deepseek-ai/dsh` from the running entry, calls
the same script for the nested or hoisted Chat package, applies only a supported
version that still reports `patch is applicable`, and writes
`superagent-lite host patch: applied ...; restart DSH to load it` to the Host log.
DSH-go rootfs is never modified automatically; use the `--dsh-go` commands above.

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

For `0.2.2-rc.2` through `0.2.2-rc.5` and `0.2.3-alpha.1`, check both the source and the runtime bundle:

```sh
grep -n "cardedNotice" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js"
grep -n "node.data.waking !== false\|node.data.waking!==false" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/chat/TurnTriggerNodeView.tsx" \
  "$DSH_PKG/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js"
```

For rc.1 and DSH-go there is no source tree; check the bundle:

```sh
grep -n "const cardedNotice = context.state.kind" "$CHAT_PKG/lib/client.js"
grep -n "waking || cardedNotice ? \"turn-trigger\"" "$CHAT_PKG/lib/client.js"
grep -n "children: \[node.data.waking !== false &&" "$CHAT_PKG/lib/client.js"
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

## Failure messages

The script fails closed and writes nothing unless every target snippet matches
exactly once.

| Message | Meaning | Action |
| --- | --- | --- |
| `supported versions are 0.2.3-alpha.1, 0.2.2-rc.5, 0.2.2-rc.4, 0.2.2-rc.3, 0.2.2-rc.2, 0.2.2-rc.1` | The installed package version is outside the supported range. | Do not patch. Add a version-specific target after checking its bundle. |
| `expected the 0.2.2-rc.5 source-and-bundle layout, but ... is missing` | An rc.2–rc.5 or alpha.1 install was pruned or hand-assembled. | Reinstall the package or patch only after adding a verified bundle-only rule. |
| `this 0.2.2-rc.1 install ships ...; ... only supports the published bundle` | An rc.1 tree unexpectedly contains source files. | Stop; the bundle rules do not describe that tree. |
| `does not contain "<label>"` | The bundle differs from the supported build (wrong version, future patch, or DSH-go pin). | Do not patch. Compare the bundle with the target version and add a new target only after review. |
| `contains "<label>" 2 times; refusing an ambiguous patch` | The snippet is duplicated, so the intended location is unclear. | Restore a clean package copy; do not patch. |
| `contains more than one @deepseek-ai/dsh-client-ui-chat` | `--dsh-go` found several installs. | Pass `--package <dir>`. |

An already-patched or already-reverted tree exits 0 with `already patched` /
`already reverted`; it is not an error.

## Upgrade and rollback

- An npm upgrade or DSH-go engine update replaces the package/rootfs, including
  `lib/client.js`, so the patch is lost. For an npm Host the bundle re-applies it
  from `src/host-patch.js` on startup and logs a pending restart; DSH-go still
  needs the manual `--dsh-go` apply against the new engine after a `--check`.
- Without the patch, the plugin still works: the affected messages are delivered
  exactly as before and render as the plain context row.
- Roll back with the same target option:
  `node scripts/dsh-client-ui-chat-agent-message-card.mjs --revert`,
  `... --dsh-go <dir> --revert`, or `... --package <dir> --revert`.
  The script restores both source files and the bundle (rc.2–rc.5 / alpha.1) or
  the bundle (rc.1 / DSH-go), including when the Host only carries the earlier
  agent-message-only patch. Restart the Host (or DSH-go local engine) afterwards.
- If an upgrade lands between apply and revert, the patched snippets may be
  gone; `--revert` then reports a mismatch and leaves the new file alone. Keep a
  copy of the pristine `lib/client.js` if you need a byte-exact restore across
  upgrades.
- Keep the plugin's `dispatch.js` source and this patch together; the card
  requires both the Host-side rendering change and the plugin passing
  `agent-message`.
