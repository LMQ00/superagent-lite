import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const anchor = process.env.DSH_INSTALL_DIR
const script = fileURLToPath(new URL('../scripts/dsh-client-ui-chat-0.2.2-rc.3-agent-message-card.mjs', import.meta.url))
const packageName = '@deepseek-ai/dsh-client-ui-chat'
const files = [
  'package.json',
  'src/client/conversation-nodes/message.ts',
  'src/client/chat/TurnTriggerNodeView.tsx',
  'lib/client.js',
]

test('role, status and reminder task-card host patch applies, upgrades, repeats and reverts on 0.2.2-rc.3', {
  skip: !anchor,
}, async (t) => {
  const installed = join(anchor, 'node_modules', packageName)
  const version = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version
  if (version !== '0.2.2-rc.3') {
    t.skip(`installed ${packageName} is ${version}; the checked patch targets 0.2.2-rc.3`)
    return
  }
  const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, 'host-patch-'))
  const copy = join(root, 'node_modules', packageName)
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const file of files) {
    const target = join(copy, file)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(installed, file), target)
  }
  const run = (...args) => spawnSync(process.execPath, [script, '--package', copy, ...args], { encoding: 'utf8' })
  const read = file => readFile(join(copy, file), 'utf8')

  const installedMessage = await read('src/client/conversation-nodes/message.ts')
  const legacy = installedMessage.includes('const agentCard =')
    && !installedMessage.includes('const cardedNotice =')

  // A Host that still carries the earlier agent-message-only patch upgrades in
  // place: `--check` reports the upgrade, applying yields the current snippets,
  // and reverting restores the pristine package.
  if (legacy) {
    let result = run('--check')
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /patch is applicable/)
    result = run()
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /patched/)
    const narrowed = await read('src/client/conversation-nodes/message.ts')
    assert.match(narrowed, /const cardedNotice = context\.state\.kind === 'context'/)
    assert.match(narrowed, /'agent-message', 'subagent-settled', 'superagent-lite-reminder'/)
    assert.doesNotMatch(narrowed, /const agentCard =/)
    assert.match(await read('lib/client.js'), /const cardedNotice=context\.state\.kind===`context`/)
    result = run('--check')
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /already patched/)
  }

  // Start from the pristine side even when the installed Host already carries
  // the patch: revert the copy, then capture the baseline.
  let result = run('--revert')
  assert.equal(result.status, 0, result.stderr)
  const pristine = new Map()
  for (const file of files.slice(1)) pristine.set(file, await read(file))
  result = run('--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /patch is applicable/)

  result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /patched/)
  const message = await read('src/client/conversation-nodes/message.ts')
  const trigger = await read('src/client/chat/TurnTriggerNodeView.tsx')
  const bundle = await read('lib/client.js')
  assert.match(message, /ContextMessageNode & \{ readonly waking\?: boolean \}/)
  assert.match(message, /const cardedNotice = context\.state\.kind === 'context'/)
  assert.match(message, /'agent-message', 'subagent-settled', 'superagent-lite-reminder'/)
  assert.match(message, /waking \|\| cardedNotice \? 'turn-trigger'/)
  assert.doesNotMatch(message, /const agentCard =/)
  assert.match(trigger, /\{node\.data\.waking !== false && <p className=\{css\.explanation\}>/)
  assert.match(bundle, /const cardedNotice=context\.state\.kind===`context`/)
  assert.match(bundle, /\[`agent-message`,`subagent-settled`,`superagent-lite-reminder`\]\.includes/)
  assert.match(bundle, /\(waking\|\|cardedNotice\)\?`turn-trigger`/)
  assert.match(bundle, /node\.data\.waking!==false&&/)

  // A second application must not duplicate anything.
  result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /already patched/)
  assert.equal(await read('lib/client.js'), bundle)

  result = run('--revert')
  assert.equal(result.status, 0, result.stderr)
  const reverted = await read('lib/client.js')
  assert.doesNotMatch(reverted, /cardedNotice/)
  assert.doesNotMatch(reverted, /node\.data\.waking!==false/)
  for (const file of files.slice(1)) assert.equal(await read(file), pristine.get(file))
  assert.equal(reverted, pristine.get('lib/client.js'))
})
