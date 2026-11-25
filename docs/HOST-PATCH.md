# DSH host patch: initial subagent prompt source

The plugin's subagent requests can show as "任务消息" cards only when the Host
records the initial child prompt with a non-`user` message source. That covers the
`dispatch_worker` task, the worker's review request (`src/review.js`) and the
worker's memory distillation request (`src/memory.js`). DSH `0.2.2-rc.5` and
`0.2.2-rc.3` hard-code that source in `@deepseek-ai/dsh-subagent`, so the
installed copy needs the patch below. This note is the application and rollback
guide; the unified diff is
[`scripts/dsh-subagent-0.2.2-prompt-source.patch`](../scripts/dsh-subagent-0.2.2-prompt-source.patch).

## Affected versions

- DSH CLI: `@deepseek-ai/dsh` **0.2.2-rc.5** (the plugin's `engines.dsh`) and
  **0.2.2-rc.3** (`dsh --version`).
- Patched package: `@deepseek-ai/dsh-subagent` **0.2.2-rc.5** or **0.2.2-rc.3**,
  installed as `<dsh-package>/node_modules/@deepseek-ai/dsh-subagent`.
- rc.5 and rc.3 publish the same `dsh-subagent` source and runtime bundle; only
  the `package.json` version and dependency versions differ. The same diff
  applies to both, and the line numbers below match either release.
- Any other DSH version must re-check the diff (`patch --dry-run`) before
  applying; line numbers and the bundle layout may differ. In particular, do not
  apply it to `0.2.2-rc.1` or the DSH-go Host, which pin a different subagent
  package.

## What the patch changes

- `src/types.ts` and `lib/types/types.d.ts`: add optional
  `SubagentStartRequest.promptSource?: MessageSource`.
- `src/manager.ts`, `lib/types/manager.js`, and the runtime bundle `lib/index.js`:
  in the local-child creation path, use `spec.promptSource ?? { kind: 'user' }`
  where `{ kind: 'user' }` was hard-coded.
- The runtime bundle `lib/index.js` is the file DSH actually imports
  (`package.json` `main`); the other four files keep the published source,
  declarations, and per-module build consistent.
- Omitted `promptSource` keeps the old behavior exactly: the creation prompt is a
  plain `user` message.

The client rule is unchanged: a `user/message` whose source is not `user` and
whose message was claimed by the waking turn renders as a `turn-trigger` card.
With `promptSource = { kind: 'agent-message', form: 'relay', senderSessionId }`,
the header is the existing `收到任务消息` label and the collapsible body carries the
full prompt, without the `Agent <name> sent a message:` prefix that `sendMessage`
adds. The dispatch names the router as the sender; the review and memory requests
name the worker that started the helper.

## Related client patch

The separate agent-message task-card patch supports dsh `0.2.2-rc.5`,
`0.2.2-rc.3`, `0.2.2-rc.1`, and the DSH-go Host with its pinned `0.2.2-rc.1`
engine; see [HOST-PATCH-AGENT-MESSAGE](HOST-PATCH-AGENT-MESSAGE.md). This
subagent source patch is not part of that matrix and covers only the
source-and-bundle releases `0.2.2-rc.5` and `0.2.2-rc.3`; do not apply the diff
below to a `0.2.2-rc.1` or DSH-go package without re-checking it.

## Apply

Resolve the installed package from the `dsh` executable:

```sh
DSH_PKG="$(dirname "$(dirname "$(readlink -f "$(command -v dsh)")")")"
DSUBAGENT="$DSH_PKG/node_modules/@deepseek-ai/dsh-subagent"
test -f "$DSUBAGENT/package.json" || { echo "dsh-subagent not found under $DSH_PKG"; exit 1; }
patch -p1 --dry-run -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-prompt-source.patch
patch -p1 -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-prompt-source.patch
```

`patch` must run from the repository root so the relative patch path resolves, or
pass an absolute path to the patch file. Restart DSH (`dsh web ...`) and the
plugin; the running Host has already imported `lib/index.js`.

An installed bundle also runs this same dry-run/apply from `src/host-patch.js`
when it loads. It resolves the current `@deepseek-ai/dsh` from the running entry,
patches only a supported `0.2.2-rc.5` / `0.2.2-rc.3` npm install whose bundle does
not already carry `promptSource`, and logs
`superagent-lite host patch: applied ...; restart DSH to load it`. Because the
first start has already imported the old manager, that log means one more DSH
start is needed. The manual commands above remain the fallback, and they are the
only path for DSH-go, an unsupported version, or a read-only install.

For example, in this installation:

```sh
DSUBAGENT=/home/LMQ/.npm_global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-subagent
patch -p1 --dry-run -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-prompt-source.patch
```

## Verify

```sh
grep -n "promptSource" "$DSUBAGENT/src/types.ts" "$DSUBAGENT/src/manager.ts" \
  "$DSUBAGENT/lib/index.js" "$DSUBAGENT/lib/types/manager.js" "$DSUBAGENT/lib/types/types.d.ts"
```

Expected: one declaration plus one `spec.promptSource ?? { kind: 'user' }` in each
manager copy (`src/manager.ts`, `lib/types/manager.js`) and in `lib/index.js`.

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
  is lost. When the bundle starts from this repository it re-applies the same diff
  to the installed Host and logs a pending restart; the next DSH start imports the
  patched manager. If that automatic pass is unavailable (DSH-go, unsupported
  version, read-only install), run the manual steps above against the new version
  after a `--dry-run`.
- Without the patch, the plugin still works: `promptSource` is an extra field on the
  call, the Host ignores it, and creation falls back to the ordinary user row.
- Reverse the patch with `patch -R -p1 -d "$DSUBAGENT" < scripts/…patch`.
- Keep the plugin's `promptSource` call sites (`src/launch-queue.js`,
  `src/review.js`, `src/memory.js`) and this patch together; the card requires both
  the Host-side plumbing and the plugin passing `promptSource`. The Chat client
  patch in [HOST-PATCH-AGENT-MESSAGE](HOST-PATCH-AGENT-MESSAGE.md) then renders the
  source as a card in both waking and steered Turns.
