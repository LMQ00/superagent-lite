import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PACKAGE, TARGETS } from '../scripts/dsh-client-ui-chat-agent-message-card.mjs'

const anchor = process.env.DSH_INSTALL_DIR
const script = fileURLToPath(new URL('../scripts/dsh-client-ui-chat-agent-message-card.mjs', import.meta.url))
const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
const sourceVersions = ['0.2.2-rc.5', '0.2.2-rc.3']

function sourceFiles(version) {
  return ['package.json', ...TARGETS[version].files]
}

/** Resolve the Chat package from an npm install: nested or hoisted sibling. */
function installedPackage(anchor) {
  const nested = join(anchor, 'node_modules', PACKAGE)
  const hoisted = join(dirname(anchor), PACKAGE.slice(PACKAGE.indexOf('/') + 1))
  return [nested, hoisted].find(candidate => existsSync(join(candidate, 'package.json')))
}

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

function snippetFixture(version, file, { omitLabel, duplicateLabel } = {}) {
  const target = TARGETS[version]
  const parts = []
  for (const entry of target.patches.filter(patch => patch.file === file)) {
    if (entry.label === omitLabel) continue
    const old = Array.isArray(entry.old) ? entry.old[0] : entry.old
    parts.push(`/* ${entry.label} */`, old)
    if (entry.label === duplicateLabel) parts.push(old)
  }
  return `${parts.join('\n')}\n`
}

async function writePackage(packageDir, version, options = {}) {
  const target = TARGETS[version]
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(packageDir, 'package.json'), `${JSON.stringify({ name: PACKAGE, version }, null, 2)}\n`)
  for (const file of target.files) {
    const targetPath = join(packageDir, file)
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, snippetFixture(version, file, options))
  }
}

async function makeRoot(t, prefix) {
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, prefix))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

for (const version of sourceVersions) {
  test(`role, status and reminder task-card host patch applies, upgrades, repeats and reverts on ${version}`, {
    skip: !anchor,
  }, async (t) => {
    const installed = installedPackage(anchor)
    const actual = installed === undefined
      ? undefined
      : JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version
    if (actual !== version) {
      t.skip(`installed ${PACKAGE} is ${actual ?? 'missing'}; this check targets ${version}`)
      return
    }
    const root = await makeRoot(t, `host-patch-${version}-`)
    const copy = join(root, 'node_modules', PACKAGE)
    for (const file of sourceFiles(version)) {
      const target = join(copy, file)
      await mkdir(dirname(target), { recursive: true })
      await copyFile(join(installed, file), target)
    }
    const apply = (...args) => run('--package', copy, ...args)
    const read = file => readFile(join(copy, file), 'utf8')

    const installedMessage = await read('src/client/conversation-nodes/message.ts')
    const legacy = installedMessage.includes('const agentCard =')
      && !installedMessage.includes('const cardedNotice =')

    // A Host that still carries the earlier agent-message-only patch upgrades in
    // place: `--check` reports the upgrade, applying yields the current snippets,
    // and reverting restores the pristine package.
    if (legacy) {
      let result = apply('--check')
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /patch is applicable/)
      result = apply()
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /patched/)
      const narrowed = await read('src/client/conversation-nodes/message.ts')
      assert.match(narrowed, /const cardedNotice = context\.state\.kind === 'context'/)
      assert.match(narrowed, /source\.kind === 'subagent-settled'/)
      assert.match(narrowed, /source\.kind\.startsWith\('superagent-lite-'\)/)
      assert.doesNotMatch(narrowed, /const agentCard =/)
      assert.match(await read('lib/client.js'), /const cardedNotice=context\.state\.kind===`context`/)
      result = apply('--check')
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /already patched/)
    }

    // Start from the pristine side even when the installed Host already carries
    // the patch: revert the copy, then capture the baseline.
    let result = apply('--revert')
    assert.equal(result.status, 0, result.stderr)
    const pristine = new Map()
    for (const file of sourceFiles(version).slice(1)) pristine.set(file, await read(file))
    result = apply('--check')
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.stdout.includes(`${version} (source-and-bundle): patch is applicable`), result.stdout)

    result = apply()
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /patched/)
    const message = await read('src/client/conversation-nodes/message.ts')
    const trigger = await read('src/client/chat/TurnTriggerNodeView.tsx')
    const bundle = await read('lib/client.js')
    assert.match(message, /ContextMessageNode & \{ readonly waking\?: boolean \}/)
    assert.match(message, /const cardedNotice = context\.state\.kind === 'context'/)
    assert.match(message, /source\.kind === 'subagent-settled'/)
    assert.match(message, /source\.kind\.startsWith\('superagent-lite-'\)/)
    assert.match(message, /waking \|\| cardedNotice \? 'turn-trigger'/)
    assert.doesNotMatch(message, /const agentCard =/)
    assert.match(trigger, /\{node\.data\.waking !== false && <p className=\{css\.explanation\}>/)
    assert.match(bundle, /const cardedNotice=context\.state\.kind===`context`/)
    assert.match(bundle, /source\.kind===`subagent-settled`/)
    assert.match(bundle, /source\.kind\.startsWith\(`superagent-lite-`\)/)
    assert.match(bundle, /\(waking\|\|cardedNotice\)\?`turn-trigger`/)
    assert.match(bundle, /node\.data\.waking!==false&&/)

    // A second application must not duplicate anything.
    result = apply()
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /already patched/)
    assert.equal(await read('lib/client.js'), bundle)

    result = apply('--check')
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /already patched/)

    result = apply('--revert')
    assert.equal(result.status, 0, result.stderr)
    const reverted = await read('lib/client.js')
    assert.doesNotMatch(reverted, /cardedNotice/)
    assert.doesNotMatch(reverted, /node\.data\.waking!==false/)
    for (const file of sourceFiles(version).slice(1)) assert.equal(await read(file), pristine.get(file))
    assert.equal(reverted, pristine.get('lib/client.js'))
  })
}

test('0.2.2-rc.1 bundle-only install checks, patches, repeats and reverts', async (t) => {
  const root = await makeRoot(t, 'host-patch-rc1-')
  const packageDir = join(root, 'node_modules', PACKAGE)
  await writePackage(packageDir, '0.2.2-rc.1')
  const pristine = await readFile(join(packageDir, 'lib/client.js'), 'utf8')
  const apply = (...args) => run('--package', packageDir, ...args)

  let result = apply('--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /0\.2\.2-rc\.1 \(bundle-only\): patch is applicable \(lib\/client\.js\)/)

  result = apply()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /patched lib\/client\.js/)
  const patched = await readFile(join(packageDir, 'lib/client.js'), 'utf8')
  assert.match(patched, /const cardedNotice = context\.state\.kind === "context"/)
  assert.match(patched, /source\.kind === "subagent-settled"/)
  assert.match(patched, /source\.kind\.startsWith\("superagent-lite-"\)/)
  assert.match(patched, /waking \|\| cardedNotice \? "turn-trigger"/)
  assert.match(patched, /children: \[node\.data\.waking !== false && \(0, react_jsx_runtime\.jsx\)\("p", \{/)
  assert.doesNotMatch(patched, /^\s*children: \[\(0, react_jsx_runtime\.jsx\)\("p", \{$/m)

  result = apply()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /already patched/)
  assert.equal(await readFile(join(packageDir, 'lib/client.js'), 'utf8'), patched)

  result = apply('--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /already patched/)

  result = apply('--revert')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /reverted lib\/client\.js/)
  assert.equal(await readFile(join(packageDir, 'lib/client.js'), 'utf8'), pristine)

  result = apply('--revert')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /already reverted/)
})

test('0.2.2-rc.5 source-and-bundle fixture checks, patches, repeats and reverts', async (t) => {
  const root = await makeRoot(t, 'host-patch-rc5-')
  const packageDir = join(root, 'node_modules', PACKAGE)
  await writePackage(packageDir, '0.2.2-rc.5')
  const files = TARGETS['0.2.2-rc.5'].files
  const pristine = new Map()
  for (const file of files) pristine.set(file, await readFile(join(packageDir, file), 'utf8'))
  const apply = (...args) => run('--package', packageDir, ...args)

  let result = apply('--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /0\.2\.2-rc\.5 \(source-and-bundle\): patch is applicable/)

  result = apply()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /patched/)
  assert.match(await readFile(join(packageDir, 'lib/client.js'), 'utf8'), /const cardedNotice=context\.state\.kind===`context`/)

  result = apply()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /already patched/)

  result = apply('--revert')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /reverted/)
  for (const file of files) assert.equal(await readFile(join(packageDir, file), 'utf8'), pristine.get(file))
})

test('DSH-go rootfs install resolves through --dsh-go and preserves DSH-go engine patches', async (t) => {
  const root = await makeRoot(t, 'host-patch-dshgo-')
  const packageDir = join(root, 'opt', 'dsh', 'node_modules', PACKAGE)
  const marker = '\nconst dshGoMarker = "message.turnNoReply";\n'
  await writePackage(packageDir, '0.2.2-rc.1')
  await writeFile(join(packageDir, 'lib/client.js'), await readFile(join(packageDir, 'lib/client.js'), 'utf8') + marker)
  const pristine = await readFile(join(packageDir, 'lib/client.js'), 'utf8')

  let result = run('--dsh-go', root, '--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /0\.2\.2-rc\.1 \(DSH-go Host, bundle-only\): patch is applicable/)
  result = run('--package', packageDir, '--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /DSH-go Host/)

  // Inside a DSH-go rootfs the installed dsh package hoists its siblings into
  // the same @deepseek-ai scope directory; --dsh resolves that layout too.
  const dshPackage = join(root, 'opt', 'dsh', 'node_modules', '@deepseek-ai', 'dsh')
  await mkdir(dshPackage, { recursive: true })
  await writeFile(join(dshPackage, 'package.json'), `${JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.2-rc.1' }, null, 2)}\n`)
  result = run('--dsh', dshPackage, '--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /DSH-go Host, bundle-only/)

  result = run('--dsh-go', root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /DSH-go Host/)
  assert.match(result.stdout, /Restart the DSH-go local engine/)
  const patched = await readFile(join(packageDir, 'lib/client.js'), 'utf8')
  assert.match(patched, /waking \|\| cardedNotice/)
  assert.match(patched, /const dshGoMarker = "message.turnNoReply";/)
  assert.doesNotMatch(patched, /^\s*children: \[\(0, react_jsx_runtime\.jsx\)\("p", \{$/m)

  result = run('--dsh-go', root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /already patched/)
  assert.equal(await readFile(join(packageDir, 'lib/client.js'), 'utf8'), patched)

  result = run('--dsh-go', root, '--revert')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /reverted/)
  const reverted = await readFile(join(packageDir, 'lib/client.js'), 'utf8')
  assert.equal(reverted, pristine)
  assert.match(reverted, /const dshGoMarker = "message.turnNoReply";/)
  assert.doesNotMatch(reverted, /const cardedNotice =/)
})

test('DSH-go checkout build prefix resolves runtime/.work/<abi>/dsh-prefix', async (t) => {
  const root = await makeRoot(t, 'host-patch-dshgo-build-')
  const packageDir = join(root, 'runtime', '.work', 'arm64-v8a', 'dsh-prefix', 'node_modules', PACKAGE)
  await writePackage(packageDir, '0.2.2-rc.1')

  const result = run('--dsh-go', root, '--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /DSH-go Host, bundle-only/)
  assert.match(result.stdout, /patch is applicable/)
})

test('unsupported dsh-client-ui-chat versions are rejected without writing', async (t) => {
  const root = await makeRoot(t, 'host-patch-unsupported-')
  const packageDir = join(root, 'node_modules', PACKAGE)
  await writePackage(packageDir, '0.2.2-rc.1')
  const manifestPath = join(packageDir, 'package.json')
  await writeFile(manifestPath, `${JSON.stringify({ name: PACKAGE, version: '0.2.2-rc.4' }, null, 2)}\n`)
  const pristine = await readFile(join(packageDir, 'lib/client.js'), 'utf8')

  const result = run('--package', packageDir, '--check')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /0\.2\.2-rc\.4/)
  assert.match(result.stderr, /supported versions are 0\.2\.2-rc\.5, 0\.2\.2-rc\.3, 0\.2\.2-rc\.1/)
  assert.match(result.stderr, /Do not patch an unverified bundle/)
  assert.equal(await readFile(join(packageDir, 'lib/client.js'), 'utf8'), pristine)
})

test('0.2.2-rc.1 source trees are rejected instead of patched with bundle-only rules', async (t) => {
  const root = await makeRoot(t, 'host-patch-rc1-source-')
  const packageDir = join(root, 'node_modules', PACKAGE)
  await writePackage(packageDir, '0.2.2-rc.1')
  await mkdir(join(packageDir, 'src/client/conversation-nodes'), { recursive: true })
  await writeFile(join(packageDir, 'src/client/conversation-nodes/message.ts'), '// unexpected source tree\n')

  const result = run('--package', packageDir, '--check')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /only supports the published bundle/)
})

test('0.2.2-rc.3 installs missing source files are rejected', async (t) => {
  const root = await makeRoot(t, 'host-patch-rc3-pruned-')
  const packageDir = join(root, 'node_modules', PACKAGE)
  await writePackage(packageDir, '0.2.2-rc.3')
  await rm(join(packageDir, 'src/client/chat/TurnTriggerNodeView.tsx'))

  const result = run('--package', packageDir, '--check')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /expected the 0\.2\.2-rc\.3 source-and-bundle layout/)
  assert.match(result.stderr, /src\/client\/chat\/TurnTriggerNodeView\.tsx is missing/)
})

test('missing target snippets and duplicate snippets fail closed', async (t) => {
  const root = await makeRoot(t, 'host-patch-mismatch-')
  const packageDir = join(root, 'node_modules', PACKAGE)
  await writePackage(packageDir, '0.2.2-rc.1', { omitLabel: 'explanation only when the message woke the Turn' })
  const pristine = await readFile(join(packageDir, 'lib/client.js'), 'utf8')

  let result = run('--package', packageDir)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /does not contain "explanation only when the message woke the Turn"/)
  assert.match(result.stderr, /differs from the supported/)
  assert.equal(await readFile(join(packageDir, 'lib/client.js'), 'utf8'), pristine)

  await writePackage(packageDir, '0.2.2-rc.1', { duplicateLabel: 'role, status and reminder messages select the turn-trigger card' })
  const duplicatePristine = await readFile(join(packageDir, 'lib/client.js'), 'utf8')
  result = run('--package', packageDir)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /contains "role, status and reminder messages select the turn-trigger card" 2 times/)
  assert.match(result.stderr, /refusing an ambiguous patch/)
  assert.equal(await readFile(join(packageDir, 'lib/client.js'), 'utf8'), duplicatePristine)
})

test('--dsh-go reports ambiguous and missing installations', async (t) => {
  const root = await makeRoot(t, 'host-patch-dshgo-ambiguous-')
  const packageDir = join(root, 'node_modules', PACKAGE)
  await writePackage(packageDir, '0.2.2-rc.1')
  const rootfsPackage = join(root, 'opt', 'dsh', 'node_modules', PACKAGE)
  await writePackage(rootfsPackage, '0.2.2-rc.1')
  let result = run('--dsh-go', root, '--check')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /contains more than one/)
  assert.match(result.stderr, /pass --package <dir> to choose one/)

  const empty = await makeRoot(t, 'host-patch-dshgo-empty-')
  result = run('--dsh-go', empty, '--check')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /cannot find .*dsh-client-ui-chat under --dsh-go/)
  assert.match(result.stderr, /runtime\/\.work\/<abi>\/dsh-prefix/)
})
