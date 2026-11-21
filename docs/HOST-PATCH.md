# DSH host patch: initial subagent prompt source

`dispatch_worker` can show the creation dispatch as a "任务消息" card only when the
Host records the initial subagent prompt with a non-`user` message source. DSH
`0.2.2-rc.3` hard-codes that source in `@deepseek-ai/dsh-subagent`, so the installed
copy needs the patch below. This note is the application and rollback guide; the
unified diff is [`scripts/dsh-subagent-0.2.2-rc.3-prompt-source.patch`](../scripts/dsh-subagent-0.2.2-rc.3-prompt-source.patch).

## Affected versions

- DSH CLI: `@deepseek-ai/dsh` **0.2.2-rc.3** (`dsh --version`).
- Patched package: `@deepseek-ai/dsh-subagent` **0.2.2-rc.3**, installed as
  `<dsh-package>/node_modules/@deepseek-ai/dsh-subagent`.
- The plugin's `engines.dsh` is `0.2.2-rc.3`, so this is the supported pairing.
  Any other DSH version must re-check the diff (`patch --dry-run`) before applying;
  line numbers and the bundle layout may differ.

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
full task message, without the `Agent <name> sent a message:` prefix that
`sendMessage` adds.

## Apply

Resolve the installed package from the `dsh` executable:

```sh
DSH_PKG="$(dirname "$(dirname "$(readlink -f "$(command -v dsh)")")")"
DSUBAGENT="$DSH_PKG/node_modules/@deepseek-ai/dsh-subagent"
test -f "$DSUBAGENT/package.json" || { echo "dsh-subagent not found under $DSH_PKG"; exit 1; }
patch -p1 --dry-run -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-rc.3-prompt-source.patch
patch -p1 -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-rc.3-prompt-source.patch
```

`patch` must run from the repository root so the relative patch path resolves, or
pass an absolute path to the patch file. Restart DSH (`dsh web ...`) and the
plugin; the running Host has already imported `lib/index.js`.

For example, in this installation:

```sh
DSUBAGENT=/home/LMQ/.npm_global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-subagent
patch -p1 --dry-run -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-rc.3-prompt-source.patch
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
  is lost. Re-apply it after every upgrade, against the new version, with
  `--dry-run` first.
- Without the patch, the plugin still works: `promptSource` is an extra field on the
  call, the Host ignores it, and creation falls back to the ordinary user row.
- Reverse the patch with `patch -R -p1 -d "$DSUBAGENT" < scripts/…patch`.
- Keep the plugin's `dispatch.js` source and this patch together; the card requires
  both the Host-side plumbing and the plugin passing `promptSource`.
