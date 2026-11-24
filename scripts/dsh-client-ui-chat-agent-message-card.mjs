#!/usr/bin/env node
/**
 * Apply the agent-message task-card patch to an installed
 * `@deepseek-ai/dsh-client-ui-chat` client.
 *
 * The Chat composer classifies a non-`user` message as a `turn-trigger` card
 * only while it is waking the Turn. A worker report steered into a running
 * router Turn therefore falls back to the `context` row. This patch keeps the
 * existing card chrome for every `agent-message`, and suppresses the
 * "triggered this response" explanation when the message did not open the Turn.
 *
 * Supported installs:
 *   - dsh 0.2.2-rc.3: source files plus the minified `lib/client.js` bundle.
 *   - dsh 0.2.2-rc.1: the shipped `lib/client.js` bundle only (no `src/`).
 *   - DSH-go Host: the DSH 0.2.2-rc.1 bundle in the DSH-go PRoot rootfs or its
 *     build prefix. DSH-go's own engine patches are left untouched.
 *
 * Usage:
 *   node scripts/dsh-client-ui-chat-agent-message-card.mjs
 *   node scripts/dsh-client-ui-chat-agent-message-card.mjs --check
 *   node scripts/dsh-client-ui-chat-agent-message-card.mjs --revert
 *
 * Options:
 *   --check            report whether the patch is applicable, without writing
 *   --revert           restore the patched files
 *   --package <dir>    the installed dsh-client-ui-chat package directory
 *   --dsh <dir>        the installed @deepseek-ai/dsh package directory
 *   --dsh-go <dir>     a DSH-go rootfs, dsh-prefix, or DSH-go checkout
 *
 * Without a target option, the package is resolved from the `dsh` executable on
 * PATH. The patch is idempotent: applying it twice is a no-op.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKAGE = '@deepseek-ai/dsh-client-ui-chat'

const MESSAGE = 'src/client/conversation-nodes/message.ts'
const TRIGGER_VIEW = 'src/client/chat/TurnTriggerNodeView.tsx'
const CLIENT_BUNDLE = 'lib/client.js'

/**
 * Version-specific patch sides. `old` is the published text, `new` the patched
 * text. Every snippet must occur exactly once in its file.
 */
export const TARGETS = {
  '0.2.2-rc.3': {
    layout: 'source-and-bundle',
    files: [MESSAGE, TRIGGER_VIEW, CLIENT_BUNDLE],
    patches: [
      {
        file: MESSAGE,
        label: 'card data carries the waking flag',
        old: `    /** Recorded notification or manual continuation that starts a Turn. */
    'turn-trigger': ContextMessageNode
`,
        new: `    /** Recorded notification or manual continuation that starts a Turn, or a steered agent message. */
    'turn-trigger': ContextMessageNode & { readonly waking?: boolean }
`,
      },
      {
        file: MESSAGE,
        label: 'agent messages select the turn-trigger card',
        old: `    const waking = context.state.kind === 'context'
      && context.start?.event.type === 'user/message'
      && context.state.waking === true
    // Human input claimed for Step 1 opens an exchange; Notice-woken Turns and
`,
        new: `    const waking = context.state.kind === 'context'
      && context.start?.event.type === 'user/message'
      && context.state.waking === true
    // An agent message is a task message whether it woke this Turn or was
    // steered into it; both use the turn-trigger card chrome.
    const agentCard = context.state.kind === 'context'
      && context.start?.event.type === 'user/message'
      && context.start.event.data.source.kind === 'agent-message'
    // Human input claimed for Step 1 opens an exchange; Notice-woken Turns and
`,
      },
      {
        file: MESSAGE,
        label: 'card kind also covers a steered agent message',
        old: `    return chatNode(
      context,
      waking ? 'turn-trigger' : context.state.kind,
`,
        new: `    return chatNode(
      context,
      waking || agentCard ? 'turn-trigger' : context.state.kind,
`,
      },
      {
        file: TRIGGER_VIEW,
        label: 'explanation only when the message woke the Turn',
        old: `      {open && <div id={bodyId} className={css.body}>
        <p className={css.explanation}>{t('message.trigger.explanation')}</p>
`,
        new: `      {open && <div id={bodyId} className={css.body}>
        {node.data.waking !== false && <p className={css.explanation}>{t('message.trigger.explanation')}</p>}
`,
      },
      {
        file: CLIENT_BUNDLE,
        label: 'runtime bundle: card classification',
        old: 'const waking=context.state.kind===`context`&&context.start?.event.type===`user/message`&&context.state.waking===true;const human=context.state.kind===`user`||context.state.kind===`steering`;const opensExchange=human&&location.kind===`step`&&location.step.step===1;return chatNode(context,waking?`turn-trigger`:context.state.kind,',
        new: 'const waking=context.state.kind===`context`&&context.start?.event.type===`user/message`&&context.state.waking===true;const agentCard=context.state.kind===`context`&&context.start?.event.type===`user/message`&&context.start.event.data.source.kind===`agent-message`;const human=context.state.kind===`user`||context.state.kind===`steering`;const opensExchange=human&&location.kind===`step`&&location.step.step===1;return chatNode(context,(waking||agentCard)?`turn-trigger`:context.state.kind,',
      },
      {
        file: CLIENT_BUNDLE,
        label: 'runtime bundle: explanation guard',
        old: '(0,react_jsx_runtime.jsx)(`p`,{className:TurnTriggerNodeView_module_css_default.explanation,children:t(`message.trigger.explanation`)}),',
        new: 'node.data.waking!==false&&(0,react_jsx_runtime.jsx)(`p`,{className:TurnTriggerNodeView_module_css_default.explanation,children:t(`message.trigger.explanation`)}),',
      },
    ],
  },
  '0.2.2-rc.1': {
    layout: 'bundle-only',
    files: [CLIENT_BUNDLE],
    patches: [
      {
        file: CLIENT_BUNDLE,
        label: 'card classification for a steered agent message',
        old: `				const waking = context.state.kind === "context" && context.start?.event.type === "user/message" && context.state.waking === true;
				const location = contextLocation(context);
`,
        new: `				const waking = context.state.kind === "context" && context.start?.event.type === "user/message" && context.state.waking === true;
				const agentCard = context.state.kind === "context" && context.start?.event.type === "user/message" && context.start.event.data.source.kind === "agent-message";
				const location = contextLocation(context);
`,
      },
      {
        file: CLIENT_BUNDLE,
        label: 'card kind also covers a steered agent message',
        old: `				return chatNode(context, waking ? "turn-trigger" : context.state.kind, context.state.seq, context.state, {
`,
        new: `				return chatNode(context, waking || agentCard ? "turn-trigger" : context.state.kind, context.state.seq, context.state, {
`,
      },
      {
        file: CLIENT_BUNDLE,
        label: 'explanation only when the message woke the Turn',
        old: `					children: [(0, react_jsx_runtime.jsx)("p", {
						className: TurnTriggerNodeView_module_css_default.explanation,
						children: t("message.trigger.explanation")
					}), (0, react_jsx_runtime.jsx)("div", {
`,
        new: `					children: [node.data.waking !== false && (0, react_jsx_runtime.jsx)("p", {
						className: TurnTriggerNodeView_module_css_default.explanation,
						children: t("message.trigger.explanation")
					}), (0, react_jsx_runtime.jsx)("div", {
`,
      },
    ],
  },
}

class PatchError extends Error {}

function fail(message) {
  throw new PatchError(message)
}

function countOccurrences(content, snippet) {
  return content.split(snippet).length - 1
}

function parseArgs(argv) {
  const options = { check: false, revert: false, packageDir: undefined, dshDir: undefined, dshGoDir: undefined }
  for (let index = 0; index < argv.length; ++index) {
    const arg = argv[index]
    if (arg === '--check') options.check = true
    else if (arg === '--revert') options.revert = true
    else if (arg === '--package') {
      if (argv[index + 1] === undefined) fail('--package needs a directory')
      options.packageDir = argv[++index]
    } else if (arg === '--dsh') {
      if (argv[index + 1] === undefined) fail('--dsh needs a directory')
      options.dshDir = argv[++index]
    } else if (arg === '--dsh-go') {
      if (argv[index + 1] === undefined) fail('--dsh-go needs a directory')
      options.dshGoDir = argv[++index]
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/dsh-client-ui-chat-agent-message-card.mjs [--check|--revert] [--package <dir>|--dsh <dir>|--dsh-go <dir>]')
      process.exit(0)
    } else fail(`unknown argument ${JSON.stringify(arg)}`)
  }
  const targets = [options.packageDir, options.dshDir, options.dshGoDir].filter(value => value !== undefined)
  if (targets.length > 1) fail('pass only one of --package, --dsh, or --dsh-go')
  for (const [name, value] of [['--package', options.packageDir], ['--dsh', options.dshDir], ['--dsh-go', options.dshGoDir]]) {
    if (value === '') fail(`${name} needs a directory`)
  }
  return options
}

async function resolveDshGoPackage(root) {
  const candidates = []
  const consider = (dir) => {
    try {
      if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === PACKAGE) candidates.push(resolve(dir))
    } catch {
      // Not a package directory; try the next install shape.
    }
  }
  consider(root)
  consider(join(root, 'node_modules', PACKAGE))
  consider(join(root, 'opt', 'dsh', 'node_modules', PACKAGE))
  consider(join(root, 'rootfs', 'opt', 'dsh', 'node_modules', PACKAGE))
  const work = join(root, 'runtime', '.work')
  if (existsSync(work)) {
    for (const abi of await readdir(work)) {
      consider(join(work, abi, 'dsh-prefix', 'node_modules', PACKAGE))
    }
  }
  const unique = [...new Set(candidates)]
  if (unique.length === 1) return unique[0]
  if (unique.length > 1) {
    fail(`--dsh-go ${root} contains more than one ${PACKAGE}: ${unique.join(', ')}; pass --package <dir> to choose one`)
  }
  fail(`cannot find ${PACKAGE} under --dsh-go ${root}; expected <root>/opt/dsh/node_modules/${PACKAGE}, <root>/node_modules/${PACKAGE}, or <root>/runtime/.work/<abi>/dsh-prefix/node_modules/${PACKAGE}`)
}

function resolveUnderDsh(dshRoot) {
  const nested = join(dshRoot, 'node_modules', PACKAGE)
  const hoisted = join(dirname(dshRoot), 'dsh-client-ui-chat')
  for (const candidate of [nested, hoisted]) {
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  fail(`cannot find ${PACKAGE} under ${dshRoot}; looked in ${nested} and ${hoisted}`)
}

function resolvePackage(options) {
  if (options.packageDir !== undefined) return resolve(options.packageDir)
  if (options.dshGoDir !== undefined) return resolveDshGoPackage(resolve(options.dshGoDir))
  if (options.dshDir !== undefined) return resolveUnderDsh(resolve(options.dshDir))
  let binary
  try {
    binary = execFileSync('sh', ['-c', 'command -v dsh'], { encoding: 'utf8' }).trim()
  } catch {
    fail('cannot find `dsh` on PATH; pass --dsh <installed @deepseek-ai/dsh>, --dsh-go <dir>, or --package <dsh-client-ui-chat>')
  }
  if (binary === '') fail('cannot find `dsh` on PATH; pass --dsh <installed @deepseek-ai/dsh>, --dsh-go <dir>, or --package <dsh-client-ui-chat>')
  return resolveUnderDsh(dirname(dirname(realpathSync(binary))))
}

function isDshGoInstall(packageDir, options) {
  if (options.dshGoDir !== undefined) return true
  return /(?:^|\/)opt\/dsh\/node_modules\//.test(packageDir)
    || /(?:^|\/)dsh-prefix\/node_modules\//.test(packageDir)
}

function installLabel(version, target, dshGo) {
  return `${PACKAGE} ${version} (${dshGo ? 'DSH-go Host, ' : ''}${target.layout})`
}

async function readTargetFile(packageDir, file, label) {
  try {
    return await readFile(join(packageDir, file), 'utf8')
  } catch (error) {
    fail(`${label}: cannot read ${join(packageDir, file)}: ${error.message}`)
  }
}

/**
 * Work out whether the files on disk are the layout the target version
 * publishes. Version equality alone is not enough: a pruned or hand-assembled
 * tree must fail closed instead of receiving a source/bundle patch blindly.
 */
function checkLayout(packageDir, version, target, label) {
  const present = new Set(target.files.filter(file => existsSync(join(packageDir, file))))
  if (target.layout === 'source-and-bundle') {
    const missing = target.files.filter(file => !present.has(file))
    if (missing.length > 0) {
      fail(`${label}: expected the ${version} source-and-bundle layout, but ${missing.join(', ')} is missing. This install may be pruned; do not patch it blindly.`)
    }
    return
  }
  if (!present.has(CLIENT_BUNDLE)) fail(`${label}: ${CLIENT_BUNDLE} is missing; expected the shipped ${version} bundle`)
  const sourceFiles = [MESSAGE, TRIGGER_VIEW].filter(file => existsSync(join(packageDir, file)))
  if (sourceFiles.length > 0) {
    fail(`${label}: this ${version} install ships ${sourceFiles.join(', ')}; the 0.2.2-rc.1 target only supports the published bundle. Do not patch a source tree with the bundle-only rules.`)
  }
}

/**
 * Compare all patch sides first, then write, so a mismatch leaves every file
 * untouched. Returns the files that would change.
 */
async function planChanges(packageDir, target, label, revert) {
  const changes = new Map()
  for (const entry of target.patches) {
    let content = changes.get(entry.file)
    if (content === undefined) content = await readTargetFile(packageDir, entry.file, label)
    const oldCount = countOccurrences(content, entry.old)
    const newCount = countOccurrences(content, entry.new)
    const overlaps = entry.new.includes(entry.old)

    if (revert) {
      if (newCount === 0) {
        if (oldCount === 1) continue
        if (oldCount > 1) fail(`${label}: ${entry.file} contains "${entry.label}" ${oldCount} times; refusing an ambiguous revert`)
        fail(`${label}: ${entry.file} contains neither side of "${entry.label}". The installed bundle differs from the supported build.`)
      }
      if (newCount !== 1) fail(`${label}: ${entry.file} contains "${entry.label}" ${newCount} times; refusing an ambiguous revert`)
      if (oldCount !== (overlaps ? 1 : 0)) fail(`${label}: ${entry.file} contains extra unpatched "${entry.label}" text; refusing an ambiguous revert`)
      changes.set(entry.file, content.replace(entry.new, entry.old))
      continue
    }

    if (newCount > 0) {
      if (newCount !== 1) fail(`${label}: ${entry.file} contains "${entry.label}" ${newCount} times; refusing an ambiguous patch`)
      if (oldCount !== (overlaps ? 1 : 0)) fail(`${label}: ${entry.file} contains patched and extra unpatched "${entry.label}" text; refusing an ambiguous patch`)
      continue
    }
    if (oldCount !== 1) {
      if (oldCount > 1) fail(`${label}: ${entry.file} contains "${entry.label}" ${oldCount} times; refusing an ambiguous patch`)
      fail(`${label}: ${entry.file} does not contain "${entry.label}". The installed bundle differs from the supported ${label} build.`)
    }
    changes.set(entry.file, content.replace(entry.old, entry.new))
  }
  return changes
}

export async function run(argv = process.argv.slice(2), log = console.log) {
  const options = parseArgs(argv)
  const packageDir = await resolvePackage(options)
  const manifestPath = join(packageDir, 'package.json')
  let version
  try {
    version = JSON.parse(await readFile(manifestPath, 'utf8')).version
  } catch (error) {
    fail(`cannot read ${manifestPath}: ${error.message}`)
  }
  const target = TARGETS[version]
  if (target === undefined) {
    fail(`${PACKAGE} is ${version} at ${packageDir}; supported versions are ${Object.keys(TARGETS).join(', ')}. Do not patch an unverified bundle.`)
  }
  const dshGo = isDshGoInstall(packageDir, options)
  const label = installLabel(version, target, dshGo)
  checkLayout(packageDir, version, target, label)

  const changes = await planChanges(packageDir, target, label, options.revert)
  if (options.check) {
    if (changes.size === 0) log(`${label}: already patched`)
    else log(`${label}: patch is applicable (${[...changes.keys()].join(', ')})`)
    return
  }
  if (changes.size === 0) {
    log(`${label}: already ${options.revert ? 'reverted' : 'patched'}; nothing to do`)
    return
  }
  for (const [file, content] of changes) await writeFile(join(packageDir, file), content)
  log(`${label}: ${options.revert ? 'reverted' : 'patched'} ${[...changes.keys()].join(', ')}`)
  if (options.revert) log('Restart the Host so it imports the restored client bundle.')
  else if (dshGo) log('Restart the DSH-go local engine so it imports the patched client bundle.')
  else log('Restart DSH so the running Host imports the patched client bundle.')
}

async function main() {
  try {
    await run()
  } catch (error) {
    if (!(error instanceof PatchError)) throw error
    console.error(`agent-message-card: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
