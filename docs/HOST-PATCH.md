# DSH host patch: initial subagent prompt source

The plugin's subagent requests can show as "任务消息" cards only when the Host
records the initial child prompt with a non-`user` message source. That covers the
`dispatch_worker` task, the worker's review request (`src/review.js`) and the
worker's memory distillation request (`src/memory.js`). DSH `0.2.2-rc.1` through
`0.2.2-rc.5` hard-code that source in `@deepseek-ai/dsh-subagent`, so the
installed copy needs one of the patches below. `0.2.3-alpha.1` already records
that source. This note is the application and rollback guide; the diffs are
[`scripts/dsh-subagent-0.2.2-prompt-source.patch`](../scripts/dsh-subagent-0.2.2-prompt-source.patch)
for `0.2.2-rc.2` through `0.2.2-rc.5` and
[`scripts/dsh-subagent-0.2.2-rc.1-prompt-source.patch`](../scripts/dsh-subagent-0.2.2-rc.1-prompt-source.patch)
for `0.2.2-rc.1`.

## Affected versions

- DSH CLI: `@deepseek-ai/dsh` **0.2.2-rc.1** through **0.2.2-rc.5**
  (`dsh --version`), all inside the plugin's `engines.dsh` range
  `>=0.2.2-rc.1 <=0.2.3-alpha.1`.
- Patched package: `@deepseek-ai/dsh-subagent` **0.2.2-rc.1** through
  **0.2.2-rc.5**, installed as
  `<dsh-package>/node_modules/@deepseek-ai/dsh-subagent`, a hoisted sibling in
  the same `@deepseek-ai` scope, or the DSH-go prefix.
- rc.2 through rc.5 publish the same `dsh-subagent` source and runtime bundle;
  only the `package.json` version and dependency versions differ. The
  `dsh-subagent-0.2.2-prompt-source.patch` diff applies to all four, and its line
  numbers match every release.
- rc.1 is different: it ships no `src/`, and the start request is nested under
  `request` (`SubagentActivationSpec.request`), so the local-child path reads
  `request.promptSource`. Use the bundle-only
  `dsh-subagent-0.2.2-rc.1-prompt-source.patch` and the rc.1 request shape in
  `src/subagent-start.js`.
- DSH **0.2.3-alpha.1** publishes a different `dsh-subagent`: the local-child
  path calls `createAgentMessage` and passes `{ source: task.source }`, so the
  initial task is already an `agent-message`. Do not apply either diff to it;
  the startup reconciler reports `native` and writes nothing.
- Any other DSH version must re-check the diff (`patch --dry-run`) before
  applying; line numbers and the bundle layout may differ. In particular, do not
  apply either diff to `0.2.2-alpha.3`, `0.2.3-alpha.2`, or the DSH-go Host,
  which pin other subagent packages.

## What the patches change

- `0.2.2-rc.2` through `0.2.2-rc.5` (`dsh-subagent-0.2.2-prompt-source.patch`):
  - `src/types.ts` and `lib/types/types.d.ts`: add optional
    `SubagentStartRequest.promptSource?: MessageSource`.
  - `src/manager.ts`, `lib/types/manager.js`, and the runtime bundle
    `lib/index.js`: in the local-child creation path, use
    `spec.promptSource ?? { kind: 'user' }` where `{ kind: 'user' }` was
    hard-coded.
  - The runtime bundle `lib/index.js` is the file DSH actually imports
    (`package.json` `main`); the other four files keep the published source,
    declarations, and per-module build consistent.
- `0.2.2-rc.1` (`dsh-subagent-0.2.2-rc.1-prompt-source.patch`):
  - `lib/types/types.d.ts`: the same optional `promptSource` declaration.
  - `lib/types/manager.js` and `lib/index.js`: use
    `request.promptSource ?? { kind: 'user' }` in the nested local-child request;
    the package ships no `src/`, so the bundle and its per-module build are the
    only copies.
  - Omitted `promptSource` keeps the old behavior exactly: the creation prompt is
    a plain `user` message.

The client rule is unchanged: a `user/message` whose source is not `user` and
whose message was claimed by the waking turn renders as a `turn-trigger` card.
On `0.2.2-rc.1` through `0.2.2-rc.5`, with
`promptSource = { kind: 'agent-message', form: 'relay', senderSessionId }`, the
header is the existing `收到任务消息` label and the collapsible body carries the
full prompt, without the `Agent <name> sent a message:` prefix that `sendMessage`
adds. The dispatch names the router as the sender; the review and memory requests
name the worker that started the helper. On `0.2.3-alpha.1` the manager builds
the same `agent-message` source through `createAgentMessage`, which adds that
prefix itself: the card is identical, and the child prompt text gains the
prefix. The plugin still passes `promptSource`; `0.2.3-alpha.1` ignores the extra
field.

## Related client patch

The separate agent-message task-card patch supports the same range:
`0.2.2-rc.2` through `0.2.2-rc.5` and `0.2.3-alpha.1` share a source-and-bundle
target, `0.2.2-rc.1` uses a bundle-only target, and the DSH-go Host with its
pinned `0.2.2-rc.1` engine stays manual; see
[HOST-PATCH-AGENT-MESSAGE](HOST-PATCH-AGENT-MESSAGE.md). This subagent source
patch covers `0.2.2-rc.1` through `0.2.2-rc.5`; `0.2.3-alpha.1` is native and
does not need it.

## Apply

Resolve the installed package from the `dsh` executable:

```sh
DSH_PKG="$(dirname "$(dirname "$(readlink -f "$(command -v dsh)")")")"
DSUBAGENT="$DSH_PKG/node_modules/@deepseek-ai/dsh-subagent"
test -f "$DSUBAGENT/package.json" || { echo "dsh-subagent not found under $DSH_PKG"; exit 1; }
# 0.2.2-rc.2 through 0.2.2-rc.5
patch -p1 --dry-run -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-prompt-source.patch
patch -p1 -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-prompt-source.patch
# 0.2.2-rc.1 (bundle only)
patch -p1 --dry-run -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-rc.1-prompt-source.patch
patch -p1 -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-rc.1-prompt-source.patch
```

`patch` must run from the repository root so the relative patch path resolves, or
pass an absolute path to the patch file. Restart DSH (`dsh web ...`) and the
plugin; the running Host has already imported `lib/index.js`.

An installed bundle also applies this patch on startup from `src/host-patch.js`,
without invoking `patch`. It resolves the current `@deepseek-ai/dsh` from the
running entry, selects the snippet target by the installed `dsh-subagent`
version, compares every snippet first, refuses a snippet that is missing or not
unique, and writes all five (rc.2–rc.5) or three (rc.1) files only after every
comparison succeeded. It patches `0.2.2-rc.1` through `0.2.2-rc.5` when the
bundle does not already carry `promptSource`, reports `native` and writes
nothing on `0.2.3-alpha.1`, and logs
`superagent-lite host patch: applied ...; restart DSH to load it`. Because the
first start has already imported the old manager, that log means one more DSH
start is needed. Desktop DSH keeps its runtime in a read-only `app.asar`; the
plugin detects that layout, writes nothing, and shows the read-only runtime
notice in the project task panel instead. The manual commands above remain the
fallback, and they are the only path for DSH-go or a version outside the range.

For example, in this installation:

```sh
DSUBAGENT=/home/LMQ/.npm_global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-subagent
patch -p1 --dry-run -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-prompt-source.patch
```

## Verify

For `0.2.2-rc.2` through `0.2.2-rc.5`:

```sh
grep -n "promptSource" "$DSUBAGENT/src/types.ts" "$DSUBAGENT/src/manager.ts" \
  "$DSUBAGENT/lib/index.js" "$DSUBAGENT/lib/types/manager.js" "$DSUBAGENT/lib/types/types.d.ts"
```

Expected: one declaration plus one `spec.promptSource ?? { kind: 'user' }` in each
manager copy (`src/manager.ts`, `lib/types/manager.js`) and in `lib/index.js`.

For `0.2.2-rc.1` the package has no `src/`; expect the declaration in
`lib/types/types.d.ts` and `request.promptSource ?? { kind: 'user' }` in both
`lib/types/manager.js` and `lib/index.js`.

At runtime, after a fresh `dispatch_worker`, the worker Session's first
`user/message` must look like this (the `senderSessionId` is the router Session):

```json
{"type":"user/message","data":{"source":{"kind":"agent-message","form":"relay","senderSessionId":"session-…"}}}
```

and the Session's `agent/inbox/spliced` events must show that same message id
inserted into `next-turn` and removed by the waking turn. The browser then renders
the `收到任务消息` card.

## Upgrade and rollback

- An npm upgrade replaces the whole package, including `lib/index.js`, so the patch
  is lost. When the bundle starts from this repository it re-applies the matching
  target in process and logs a pending restart; the next DSH start imports the
  patched manager. If that automatic pass is unavailable (DSH-go, a version
  outside the range, a desktop `app.asar` runtime, or another read-only install),
  run the manual steps above against the new version after a `--dry-run`; a
  desktop or otherwise read-only install cannot be patched and shows the panel
  notice instead.
- Without the patch, the plugin still works: `promptSource` is an extra field on the
  call, the Host ignores it, and creation falls back to the ordinary user row.
- Reverse the patch with
  `patch -R -p1 -d "$DSUBAGENT" < scripts/…patch`, using the diff that matches
  the installed version.
- Keep the plugin's `promptSource` call sites (`src/launch-queue.js`,
  `src/review.js`, `src/memory.js`), the rc.1 request shape in
  `src/subagent-start.js`, and this patch together; the card requires both the
  Host-side plumbing and the plugin passing `promptSource`. The Chat client
  patch in [HOST-PATCH-AGENT-MESSAGE](HOST-PATCH-AGENT-MESSAGE.md) then renders the
  source as a card in both waking and steered Turns.
