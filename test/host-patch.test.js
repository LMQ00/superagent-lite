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

test('agent-message card host patch applies, repeats and reverts on 0.2.2-rc.3', {
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

  // Start from the pristine side even when the installed Host already carries the patch.
  let result = run('--revert')
  assert.equal(result.status, 0, result.stderr)
  const pristine = new Map()
  for (const file of files.slice(1)) pristine.set(file, await readFile(join(copy, file), 'utf8'))
  result = run('--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /patch is applicable/)

  result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /patched/)
  const message = await readFile(join(copy, 'src/client/conversation-nodes/message.ts'), 'utf8')
  const trigger = await readFile(join(copy, 'src/client/chat/TurnTriggerNodeView.tsx'), 'utf8')
  const bundle = await readFile(join(copy, 'lib/client.js'), 'utf8')
  assert.match(message, /const agentCard = context\.state\.kind === 'context'/)
  assert.match(message, /waking \|\| agentCard \? 'turn-trigger'/)
  assert.match(message, /ContextMessageNode & \{ readonly waking\?: boolean \}/)
  assert.match(trigger, /\{node\.data\.waking !== false && <p className=\{css\.explanation\}>/)
  assert.match(bundle, /const agentCard=context\.state\.kind===`context`/)
  assert.match(bundle, /node\.data\.waking!==false&&/)

  // A second application must not duplicate anything.
  result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /already patched/)
  assert.equal((await readFile(join(copy, 'lib/client.js'), 'utf8')), bundle)

  result = run('--revert')
  assert.equal(result.status, 0, result.stderr)
  const reverted = await readFile(join(copy, 'lib/client.js'), 'utf8')
  assert.doesNotMatch(reverted, /const agentCard=/)
  assert.doesNotMatch(reverted, /node\.data\.waking!==false/)
  for (const file of files.slice(1)) assert.equal(await readFile(join(copy, file), 'utf8'), pristine.get(file))
  assert.equal(reverted, pristine.get('lib/client.js'))
})
