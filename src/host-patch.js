import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DSH = '@deepseek-ai/dsh'
const SUBAGENT = '@deepseek-ai/dsh-subagent'
// 0.2.3-alpha.1 records the initial child prompt through `createAgentMessage`,
// so it needs neither the `promptSource` option nor this patch.
const SUBAGENT_NATIVE_VERSIONS = new Set(['0.2.3-alpha.1'])
const PROMPT_SOURCE = 'spec.promptSource ?? { kind: "user" }'
const RC1_PROMPT_SOURCE = 'request.promptSource ?? { kind: "user" }'

const TYPES_DTS_IMPORT = {
  label: 'declare MessageSource on the start request',
  old: "import type { ContentBlock, MessageId } from '@deepseek-ai/dsh-llm';",
  new: "import type { ContentBlock, MessageId, MessageSource } from '@deepseek-ai/dsh-llm';",
}
const TYPES_DTS_PROMPT = {
  label: 'add promptSource beside the start prompt',
  old: `    /** Content delivered as the child's user message. */
    readonly prompt: ContentBlock[];
    /**
     * The spawning agent. Its effective directory supplies the default cwd;
`,
  new: `    /** Content delivered as the child's user message. */
    readonly prompt: ContentBlock[];
    /**
     * Optional attribution recorded on the child's initial user message.
     * Omitted keeps the ordinary \`user\` source, so the creation prompt renders
     * as a plain input row; a non-\`user\` source lets a waking initial turn render
     * as a turn-trigger card. Local backends deliver this source themselves;
     * external backends receive it on the resolved request and own delivery.
     */
    readonly promptSource?: MessageSource;
    /**
     * The spawning agent. Its effective directory supplies the default cwd;
`,
}
const TYPES_TS_IMPORT = {
  label: 'declare MessageSource on the start request',
  old: "import type { ContentBlock, MessageId } from '@deepseek-ai/dsh-llm'",
  new: "import type { ContentBlock, MessageId, MessageSource } from '@deepseek-ai/dsh-llm'",
}
const TYPES_TS_PROMPT = {
  label: 'add promptSource beside the start prompt',
  old: `  /** Content delivered as the child's user message. */
  readonly prompt: ContentBlock[]
  /**
   * The spawning agent. Its effective directory supplies the default cwd;
`,
  new: `  /** Content delivered as the child's user message. */
  readonly prompt: ContentBlock[]
  /**
   * Optional attribution recorded on the child's initial user message.
   * Omitted keeps the ordinary \`user\` source, so the creation prompt renders
   * as a plain input row; a non-\`user\` source lets a waking initial turn render
   * as a turn-trigger card. Local backends deliver this source themselves;
   * external backends receive it on the resolved request and own delivery.
   */
  readonly promptSource?: MessageSource
  /**
   * The spawning agent. Its effective directory supplies the default cwd;
`,
}

// 0.2.2-rc.1 ships the subagent bundle only and nests the start request. Every
// patch side is a byte-exact snippet of the published package: the planner
// compares all files first, refuses a snippet that does not occur exactly once,
// and only then writes, so a mismatch leaves the install untouched.
const SUBAGENT_RC1_TARGET = {
  marker: RC1_PROMPT_SOURCE,
  patches: [
    { file: 'lib/types/types.d.ts', ...TYPES_DTS_IMPORT },
    { file: 'lib/types/types.d.ts', ...TYPES_DTS_PROMPT },
    {
      file: 'lib/types/manager.js',
      label: 'forward promptSource on local child creation',
      old: "{ source: { kind: 'user' }, signal: spec.signal, delivery: 'queue' }",
      new: "{ source: request.promptSource ?? { kind: 'user' }, signal: spec.signal, delivery: 'queue' }",
    },
    {
      file: 'lib/index.js',
      label: 'forward promptSource in the runtime bundle',
      old: 'source: { kind: "user" },',
      new: 'source: request.promptSource ?? { kind: "user" },',
    },
  ],
}

// 0.2.2-rc.2 through rc.5 publish the same source and runtime bundle; only the
// package version and dependency versions differ, so they share one target.
const SUBAGENT_SOURCE_TARGET = {
  marker: PROMPT_SOURCE,
  patches: [
    { file: 'src/types.ts', ...TYPES_TS_IMPORT },
    { file: 'src/types.ts', ...TYPES_TS_PROMPT },
    {
      file: 'src/manager.ts',
      label: 'forward promptSource on local child creation',
      old: "{ source: { kind: 'user' }, signal, delivery: 'queue', authorize: () => { this.assertAdmitting(parent) } },",
      new: "{ source: spec.promptSource ?? { kind: 'user' }, signal, delivery: 'queue', authorize: () => { this.assertAdmitting(parent) } },",
    },
    {
      file: 'lib/index.js',
      label: 'forward promptSource in the runtime bundle',
      old: 'source: { kind: "user" },',
      new: 'source: spec.promptSource ?? { kind: "user" },',
    },
    {
      file: 'lib/types/manager.js',
      label: 'forward promptSource in the per-module build',
      old: "{ source: { kind: 'user' }, signal, delivery: 'queue', authorize: () => { this.assertAdmitting(parent); } }",
      new: "{ source: spec.promptSource ?? { kind: 'user' }, signal, delivery: 'queue', authorize: () => { this.assertAdmitting(parent); } }",
    },
    { file: 'lib/types/types.d.ts', ...TYPES_DTS_IMPORT },
    { file: 'lib/types/types.d.ts', ...TYPES_DTS_PROMPT },
  ],
}

export const SUBAGENT_TARGETS = new Map([
  ['0.2.2-rc.1', SUBAGENT_RC1_TARGET],
  ...['0.2.2-rc.2', '0.2.2-rc.3', '0.2.2-rc.4', '0.2.2-rc.5']
    .map(version => [version, SUBAGENT_SOURCE_TARGET]),
])

function manifest(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Resolve the installed `@deepseek-ai/dsh` package from the running entry file,
 * `DSH_INSTALL_DIR`, or an explicit path. Walking up from the entry also covers
 * the global npm shim (`<prefix>/bin/dsh` -> `<prefix>/lib/node_modules/...`).
 */
export function resolveDshDirectory(start = process.argv[1], env = process.env) {
  const candidates = [env.DSH_INSTALL_DIR, start].filter(Boolean)
  for (const candidate of candidates) {
    let current
    try {
      current = realpathSync(candidate)
      if (statSync(current).isFile()) current = dirname(current)
    } catch {
      continue
    }
    for (;;) {
      if (manifest(current)?.name === DSH) return current
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return undefined
}

function isDshGo(dshDir) {
  return /[/\\]opt[/\\]dsh[/\\]|[/\\]dsh-prefix[/\\]/.test(dshDir)
}

function subagentPackage(dshDir) {
  for (const candidate of [join(dshDir, 'node_modules', SUBAGENT), join(dirname(dshDir), 'dsh-subagent')]) {
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}

function failure(error) {
  return error instanceof Error ? error.message : String(error)
}

/** A DSH install inside an Electron `app.asar` archive cannot be written. */
export function isReadonlyArchived(dshDir) {
  return typeof dshDir === 'string' && /(?:^|[/\\])[^/\\]+\.asar(?:[/\\]|$)/i.test(dshDir)
}

function countOccurrences(content, snippet) {
  return content.split(snippet).length - 1
}

/**
 * Compare every snippet before touching the disk. A snippet that is missing or
 * not unique means the package differs from the supported build, so the caller
 * receives no changes and the install stays untouched.
 */
function planSnippetChanges(packageDir, target, label) {
  const changes = new Map()
  for (const entry of target.patches) {
    let content = changes.get(entry.file)
    if (content === undefined) {
      try {
        content = readFileSync(join(packageDir, entry.file), 'utf8')
      } catch (error) {
        throw new Error(`${label}: cannot read ${join(packageDir, entry.file)}: ${failure(error)}`)
      }
    }
    const occurrences = countOccurrences(content, entry.old)
    if (occurrences === 0) {
      throw new Error(`${label}: ${entry.file} does not contain "${entry.label}". The installed bundle differs from the supported ${label} build.`)
    }
    if (occurrences !== 1) {
      throw new Error(`${label}: ${entry.file} contains "${entry.label}" ${occurrences} times; refusing an ambiguous patch`)
    }
    changes.set(entry.file, content.replace(entry.old, entry.new))
  }
  return changes
}

/**
 * Apply the `promptSource` patch to the installed subagent package in process.
 * The running Host has already imported the old manager, so the patch takes
 * effect on the next DSH start; a failed or unsupported patch only disables the
 * dispatch card. A version listed as native already records the initial prompt
 * as an agent message, so it is reported and left untouched.
 */
export async function reconcileSubagentPromptSource({ dshDir } = {}) {
  if (dshDir === undefined) return { state: 'unresolved' }
  if (isDshGo(dshDir)) return { state: 'dsh-go' }
  if (isReadonlyArchived(dshDir)) return { state: 'readonly' }
  const packageDir = subagentPackage(dshDir)
  if (packageDir === undefined) return { state: 'missing' }
  const version = manifest(packageDir)?.version
  if (SUBAGENT_NATIVE_VERSIONS.has(version)) return { state: 'native', version }
  const target = SUBAGENT_TARGETS.get(version)
  if (target === undefined) return { state: 'unsupported', version }
  const bundlePath = join(packageDir, 'lib/index.js')
  if (!existsSync(bundlePath)) return { state: 'missing', version }
  if (readFileSync(bundlePath, 'utf8').includes(target.marker)) return { state: 'already', version }
  try {
    const changes = planSnippetChanges(packageDir, target, `${SUBAGENT} ${version}`)
    for (const [file, content] of changes) writeFileSync(join(packageDir, file), content)
  } catch (error) {
    return { state: 'failed', version, reason: failure(error) }
  }
  if (!readFileSync(bundlePath, 'utf8').includes(target.marker)) return { state: 'failed', version, reason: 'patched files do not carry promptSource' }
  return { state: 'applied', version }
}

/**
 * Apply the Chat card patch through its own version-checked script. The script
 * writes the source files and the runtime bundle and fails closed on any
 * unsupported version or mismatched snippet.
 */
export async function reconcileChatCardPatch({ dshDir, run } = {}) {
  if (dshDir === undefined) return { state: 'unresolved' }
  let applicable = false
  try {
    await run(['--dsh', dshDir, '--check'], line => {
      if (line.includes('patch is applicable')) applicable = true
    })
  } catch (error) {
    return { state: 'failed', reason: failure(error) }
  }
  if (!applicable) return { state: 'already' }
  try {
    await run(['--dsh', dshDir], () => {})
  } catch (error) {
    return { state: 'failed', reason: failure(error) }
  }
  return { state: 'applied' }
}

async function clientPatchRunner() {
  const { run } = await import('../scripts/dsh-client-ui-chat-agent-message-card.mjs')
  return run
}

/**
 * Re-apply both optional Host patches when the plugin loads. The DSH install is
 * replaced on every `npm install -g`/upgrade, so this is the only point where a
 * missing patch can be repaired without the user remembering the manual steps.
 * Card rendering is the only consumer: every failure is a warning, never a
 * startup failure, and patches that are already present are left untouched.
 */
export async function reconcileHostPatches(ctx, options = {}) {
  // The node:test runner loads the plugin through its wiring harnesses; an
  // implicit reconciliation must never patch the developer's installed Host.
  if (process.env.NODE_TEST_CONTEXT !== undefined
    && options.dshDir === undefined && options.entry === undefined && options.env === undefined) {
    return { skipped: 'test', subagent: { state: 'skipped' }, chat: { state: 'skipped' } }
  }
  const dshDir = options.dshDir ?? resolveDshDirectory(options.entry, options.env)
  const logger = options.logger ?? ctx?.logger
  if (dshDir === undefined) return { dshDir: undefined, subagent: { state: 'unresolved' }, chat: { state: 'unresolved' } }
  if (isDshGo(dshDir)) return { dshDir, subagent: { state: 'dsh-go' }, chat: { state: 'dsh-go' } }
  // An Electron desktop app keeps the runtime inside read-only `app.asar`.
  // Every write would fail with EACCES, and the desktop app has no persisted
  // plugin log, so the result is surfaced in the panel instead.
  if (isReadonlyArchived(dshDir)) {
    logger?.warn(`superagent-lite host patch: ${dshDir} is inside a read-only app archive; task-card patches are unavailable`)
    return { dshDir, readonly: true, subagent: { state: 'readonly' }, chat: { state: 'readonly' } }
  }
  try {
    const run = options.runClientPatch ?? await clientPatchRunner()
    const subagent = await reconcileSubagentPromptSource({ dshDir })
    const chat = await reconcileChatCardPatch({ dshDir, run })
    const applied = ['subagent', 'chat'].filter(name => ({ subagent, chat })[name].state === 'applied')
    if (applied.length > 0) {
      logger?.warn(`superagent-lite host patch: applied the ${applied.join(' and ')} card patch under ${dshDir}; restart DSH to load it`)
    }
    for (const [name, result] of [['subagent promptSource', subagent], ['Chat card', chat]]) {
      if (result.state === 'failed') logger?.warn(`superagent-lite host patch: ${name} patch was not applied: ${result.reason}`)
    }
    return { dshDir, subagent, chat }
  } catch (error) {
    logger?.warn(`superagent-lite host patch: ${failure(error)}`)
    return { dshDir, subagent: { state: 'failed', reason: failure(error) }, chat: { state: 'skipped' } }
  }
}
