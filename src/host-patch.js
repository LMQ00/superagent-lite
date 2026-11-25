import { execFile } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function runPatchCommand(command, args) {
  return execFileAsync(command, args, { timeout: 10_000, maxBuffer: 1 << 20 })
}

const DSH = '@deepseek-ai/dsh'
const SUBAGENT = '@deepseek-ai/dsh-subagent'
// 0.2.3-alpha.1 records the initial child prompt through `createAgentMessage`,
// so it needs neither the `promptSource` option nor this patch.
const SUBAGENT_NATIVE_VERSIONS = new Set(['0.2.3-alpha.1'])
const PROMPT_SOURCE = 'spec.promptSource ?? { kind: "user" }'
const RC1_PROMPT_SOURCE = 'request.promptSource ?? { kind: "user" }'
const SUBAGENT_PATCH = fileURLToPath(new URL('../scripts/dsh-subagent-0.2.2-prompt-source.patch', import.meta.url))
const SUBAGENT_RC1_PATCH = fileURLToPath(new URL('../scripts/dsh-subagent-0.2.2-rc.1-prompt-source.patch', import.meta.url))
// 0.2.2-rc.1 ships the subagent bundle only and nests the start request.
const SUBAGENT_TARGETS = new Map([
  ['0.2.2-rc.1', { patch: SUBAGENT_RC1_PATCH, marker: RC1_PROMPT_SOURCE }],
  ...['0.2.2-rc.2', '0.2.2-rc.3', '0.2.2-rc.4', '0.2.2-rc.5'].map(version => [version, { patch: SUBAGENT_PATCH, marker: PROMPT_SOURCE }]),
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

/**
 * Apply the `promptSource` patch to the installed subagent package. The running
 * Host has already imported the old manager, so the patch takes effect on the
 * next DSH start; a failed or unsupported patch only disables the dispatch card.
 * A version listed as native already records the initial prompt as an agent
 * message, so it is reported and left untouched.
 */
export async function reconcileSubagentPromptSource({ dshDir, runPatch = runPatchCommand } = {}) {
  if (dshDir === undefined) return { state: 'unresolved' }
  if (isDshGo(dshDir)) return { state: 'dsh-go' }
  const packageDir = subagentPackage(dshDir)
  if (packageDir === undefined) return { state: 'missing' }
  const version = manifest(packageDir)?.version
  if (SUBAGENT_NATIVE_VERSIONS.has(version)) return { state: 'native', version }
  const target = SUBAGENT_TARGETS.get(version)
  if (target === undefined) return { state: 'unsupported', version }
  const bundlePath = join(packageDir, 'lib/index.js')
  if (!existsSync(bundlePath)) return { state: 'missing', version }
  if (readFileSync(bundlePath, 'utf8').includes(target.marker)) return { state: 'already', version }
  if (!existsSync(target.patch)) return { state: 'failed', version, reason: `${target.patch} is missing` }
  try {
    await runPatch('patch', ['-p1', '--dry-run', '-d', packageDir, '-i', target.patch])
  } catch (error) {
    return { state: 'failed', version, reason: failure(error) }
  }
  try {
    await runPatch('patch', ['-p1', '-d', packageDir, '-i', target.patch])
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
  try {
    const run = options.runClientPatch ?? await clientPatchRunner()
    const subagent = await reconcileSubagentPromptSource({ dshDir, runPatch: options.runPatch })
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
