#!/usr/bin/env node
/**
 * Apply the agent-message task-card patch to the installed
 * `@deepseek-ai/dsh-client-ui-chat` 0.2.2-rc.3 client.
 *
 * The Chat composer classifies a non-`user` message as a `turn-trigger` card
 * only while it is waking the Turn. A worker report steered into a running
 * router Turn therefore falls back to the `context` row. This patch keeps the
 * existing card chrome for every `agent-message`, and suppresses the
 * "triggered this response" explanation when the message did not open the Turn.
 *
 * Usage:
 *   node scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs
 *   node scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs --check
 *   node scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs --revert
 *
 * Options:
 *   --check            report whether the patch is applicable, without writing
 *   --revert           restore the two `src` files and the `lib/client.js` bundle
 *   --package <dir>    the installed dsh-client-ui-chat package directory
 *   --dsh <dir>        the installed @deepseek-ai/dsh package directory
 *
 * Without `--package` or `--dsh`, the package is resolved from the `dsh`
 * executable on PATH. The patch is idempotent: applying it twice is a no-op.
 */

import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const PACKAGE = '@deepseek-ai/dsh-client-ui-chat'
const VERSION = '0.2.2-rc.3'
const MESSAGE = 'src/client/conversation-nodes/message.ts'
const TRIGGER_VIEW = 'src/client/chat/TurnTriggerNodeView.tsx'
const CLIENT_BUNDLE = 'lib/client.js'

const PATCHES = [
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
]

function fail(message) {
  console.error(`agent-message-card: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const options = { check: false, revert: false, packageDir: undefined, dshDir: undefined }
  for (let index = 0; index < argv.length; ++index) {
    const arg = argv[index]
    if (arg === '--check') options.check = true
    else if (arg === '--revert') options.revert = true
    else if (arg === '--package') options.packageDir = argv[++index]
    else if (arg === '--dsh') options.dshDir = argv[++index]
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs [--check|--revert] [--package <dir>|--dsh <dir>]')
      process.exit(0)
    } else fail(`unknown argument ${JSON.stringify(arg)}`)
  }
  return options
}

function resolvePackage(options) {
  if (options.packageDir !== undefined) return resolve(options.packageDir)
  if (options.dshDir !== undefined) return join(resolve(options.dshDir), 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat')
  let binary
  try {
    binary = execFileSync('sh', ['-c', 'command -v dsh'], { encoding: 'utf8' }).trim()
  } catch {
    fail('cannot find `dsh` on PATH; pass --dsh <installed @deepseek-ai/dsh> or --package <dsh-client-ui-chat>')
  }
  if (binary === '') fail('cannot find `dsh` on PATH; pass --dsh <installed @deepseek-ai/dsh> or --package <dsh-client-ui-chat>')
  const dshRoot = dirname(dirname(realpathSync(binary)))
  return join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const packageDir = resolvePackage(options)
  let version
  try {
    version = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')).version
  } catch (error) {
    fail(`cannot read ${join(packageDir, 'package.json')}: ${error.message}`)
  }
  if (version !== VERSION) fail(`${PACKAGE} is ${version}; this patch targets ${VERSION}`)

  const changes = new Map()
  for (const entry of PATCHES) {
    const content = changes.get(entry.file) ?? await readFile(join(packageDir, entry.file), 'utf8')
    const hasOld = content.includes(entry.old)
    const hasNew = content.includes(entry.new)
    if (options.revert) {
      if (!hasNew) {
        if (hasOld) continue
        fail(`${entry.file} does not contain either side of "${entry.label}"; the installed package differs from ${VERSION}`)
      }
      if (content.split(entry.new).length !== 2) fail(`${entry.file} contains "${entry.label}" more than once; refusing to revert an ambiguous match`)
      changes.set(entry.file, content.split(entry.new).join(entry.old))
      continue
    }
    if (hasNew) continue
    if (!hasOld) fail(`${entry.file} does not contain "${entry.label}"; the installed package differs from ${VERSION}`)
    if (content.split(entry.old).length !== 2) fail(`${entry.file} contains "${entry.label}" more than once; refusing to patch an ambiguous match`)
    changes.set(entry.file, content.split(entry.old).join(entry.new))
  }

  if (options.check) {
    if (changes.size === 0) console.log(`${PACKAGE} ${version}: already patched`)
    else console.log(`${PACKAGE} ${version}: patch is applicable (${[...changes.keys()].join(', ')})`)
    return
  }
  if (changes.size === 0) {
    console.log(`${PACKAGE} ${version}: already ${options.revert ? 'reverted' : 'patched'}; nothing to do`)
    return
  }
  for (const [file, content] of changes) await writeFile(join(packageDir, file), content)
  console.log(`${PACKAGE} ${version}: ${options.revert ? 'reverted' : 'patched'} ${[...changes.keys()].join(', ')}`)
  console.log('Restart DSH so the running Host imports the patched client bundle.')
}

await main()
