import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { TARGETS } from '../scripts/dsh-client-ui-chat-agent-message-card.mjs'
import { reconcileHostPatches, reconcileSubagentPromptSource, resolveDshDirectory } from '../src/host-patch.js'

const anchor = process.env.DSH_INSTALL_DIR
const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
const DSH = '@deepseek-ai/dsh'
const SUBAGENT = '@deepseek-ai/dsh-subagent'
const PROMPT_SOURCE = 'spec.promptSource ?? { kind: "user" }'

function snippetFixture(version, file) {
  const parts = []
  for (const entry of TARGETS[version].patches.filter(patch => patch.file === file)) {
    parts.push(`/* ${entry.label} */`, Array.isArray(entry.old) ? entry.old[0] : entry.old)
  }
  return `${parts.join('\n')}\n`
}

async function writeManifest(dir, name, version) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), `${JSON.stringify({ name, version }, null, 2)}\n`)
}

async function writeChatPackage(packageDir, version) {
  await writeManifest(packageDir, '@deepseek-ai/dsh-client-ui-chat', version)
  for (const file of TARGETS[version].files) {
    const target = join(packageDir, file)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, snippetFixture(version, file))
  }
}

async function writeSubagentPackage(packageDir, version) {
  await writeManifest(packageDir, SUBAGENT, version)
  for (const file of ['src/types.ts', 'src/manager.ts', 'lib/index.js', 'lib/types/manager.js', 'lib/types/types.d.ts']) {
    const target = join(packageDir, file)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, `${file}\n\t\t\t\tsource: { kind: "user" },\n`)
  }
}

async function makeHost(t, { dshVersion = '0.2.2-rc.5', chatVersion = '0.2.2-rc.5', subagentVersion = '0.2.2-rc.5' } = {}) {
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, 'host-patch-auto-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dshDir = join(root, 'node_modules', '@deepseek-ai', 'dsh')
  await writeManifest(dshDir, DSH, dshVersion)
  await mkdir(join(dshDir, 'lib'), { recursive: true })
  await writeFile(join(dshDir, 'lib', 'bin.js'), '// fake entry\n')
  await writeChatPackage(join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat'), chatVersion)
  const subagentDir = join(dshDir, 'node_modules', '@deepseek-ai', 'dsh-subagent')
  await writeSubagentPackage(subagentDir, subagentVersion)
  return { root, dshDir, subagentDir, chatDir: join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat') }
}

function patchStub(calls, { failDryRun = false } = {}) {
  return async (command, args) => {
    calls.push([command, ...args])
    if (args.includes('--dry-run')) {
      if (failDryRun) throw new Error('patch: **** malformed patch')
      return {}
    }
    if (args.includes('-d') && args.includes('-i')) {
      const packageDir = args[args.indexOf('-d') + 1]
      for (const file of ['src/types.ts', 'src/manager.ts', 'lib/index.js', 'lib/types/manager.js', 'lib/types/types.d.ts']) {
        await writeFile(join(packageDir, file), `${file}\n\t\t\t\tsource: ${PROMPT_SOURCE},\n`)
      }
    }
    return {}
  }
}

test('resolveDshDirectory walks up from the installed entry and honours DSH_INSTALL_DIR', async (t) => {
  const { root, dshDir } = await makeHost(t)
  assert.equal(resolveDshDirectory(join(dshDir, 'lib', 'bin.js'), {}), dshDir)
  assert.equal(resolveDshDirectory('/nonexistent/dsh', { DSH_INSTALL_DIR: dshDir }), dshDir)
  assert.equal(resolveDshDirectory(join(root, 'missing.js'), {}), undefined)
})

test('startup reconciliation applies the subagent and Chat patches once', async (t) => {
  const { dshDir, subagentDir, chatDir } = await makeHost(t)
  const calls = []
  const warnings = []
  const logger = { warn: message => warnings.push(message) }
  const result = await reconcileHostPatches({ logger }, {
    dshDir, runPatch: patchStub(calls),
  })
  assert.deepEqual(result.subagent, { state: 'applied', version: '0.2.2-rc.5' })
  assert.equal(result.chat.state, 'applied')
  assert.equal(calls.length, 2)
  assert.match(await readFile(join(subagentDir, 'lib/index.js'), 'utf8'), new RegExp(PROMPT_SOURCE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(await readFile(join(chatDir, 'lib/client.js'), 'utf8'), /const cardedNotice=context\.state\.kind===`context`/)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /restart DSH/)

  const again = await reconcileHostPatches({ logger }, { dshDir, runPatch: patchStub(calls) })
  assert.deepEqual(again.subagent, { state: 'already', version: '0.2.2-rc.5' })
  assert.equal(again.chat.state, 'already')
  assert.equal(calls.length, 2)
  assert.equal(warnings.length, 1)
})

test('unsupported subagent versions and failed patches leave the package untouched', async (t) => {
  const unsupported = await makeHost(t, { dshVersion: '0.2.3-alpha.2', subagentVersion: '0.2.3-alpha.2' })
  const calls = []
  assert.deepEqual(
    await reconcileSubagentPromptSource({ dshDir: unsupported.dshDir, runPatch: patchStub(calls) }),
    { state: 'unsupported', version: '0.2.3-alpha.2' },
  )
  assert.equal(calls.length, 0)

  const broken = await makeHost(t)
  const failedCalls = []
  const warnings = []
  const result = await reconcileHostPatches({ logger: { warn: message => warnings.push(message) } }, {
    dshDir: broken.dshDir, runPatch: patchStub(failedCalls, { failDryRun: true }),
  })
  assert.equal(result.subagent.state, 'failed')
  assert.match(result.subagent.reason, /malformed patch/)
  assert.equal(failedCalls.length, 1)
  assert.match(await readFile(join(broken.subagentDir, 'lib/index.js'), 'utf8'), /source: \{ kind: "user" \}/)
  assert.ok(warnings.some(message => /subagent promptSource patch was not applied/.test(message)))
})

test('an unresolvable host is skipped without warnings or writes', async () => {
  const warnings = []
  const result = await reconcileHostPatches({ logger: { warn: message => warnings.push(message) } }, {
    entry: '/nonexistent/dsh', env: {},
  })
  assert.equal(result.dshDir, undefined)
  assert.equal(result.subagent.state, 'unresolved')
  assert.equal(result.chat.state, 'unresolved')
  assert.deepEqual(warnings, [])
})

test('implicit reconciliation never runs inside the test runner', async () => {
  assert.notEqual(process.env.NODE_TEST_CONTEXT, undefined)
  const result = await reconcileHostPatches({})
  assert.equal(result.skipped, 'test')
})

test('a DSH-go rootfs is never patched automatically', async (t) => {
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, 'host-patch-auto-dshgo-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dshDir = join(root, 'opt', 'dsh', 'node_modules', DSH)
  await writeManifest(dshDir, DSH, '0.2.2-rc.1')
  const warnings = []
  const result = await reconcileHostPatches({ logger: { warn: message => warnings.push(message) } }, {
    dshDir, runPatch: async () => assert.fail('DSH-go must not run patch'),
  })
  assert.equal(result.subagent.state, 'dsh-go')
  assert.equal(result.chat.state, 'dsh-go')
  assert.deepEqual(warnings, [])
})

test('0.2.3-alpha.1 reconciles the Chat card patch and leaves its native subagent alone', async (t) => {
  const { dshDir, subagentDir } = await makeHost(t, {
    dshVersion: '0.2.3-alpha.1',
    chatVersion: '0.2.3-alpha.1',
    subagentVersion: '0.2.3-alpha.1',
  })
  const calls = []
  const warnings = []
  const result = await reconcileHostPatches({ logger: { warn: message => warnings.push(message) } }, {
    dshDir, runPatch: patchStub(calls),
  })
  assert.deepEqual(result.subagent, { state: 'native', version: '0.2.3-alpha.1' })
  assert.equal(result.chat.state, 'applied')
  assert.equal(calls.length, 0)
  assert.match(await readFile(join(subagentDir, 'lib/index.js'), 'utf8'), /source: \{ kind: "user" \}/)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /restart DSH/)
  assert.doesNotMatch(warnings[0], /subagent/)
})

test('0.2.2-rc.1 applies the bundle-only promptSource diff', async (t) => {
  const { dshDir, subagentDir } = await makeHost(t, {
    dshVersion: '0.2.2-rc.1',
    chatVersion: '0.2.2-rc.1',
    subagentVersion: '0.2.2-rc.1',
  })
  const calls = []
  const runPatch = async (command, args) => {
    calls.push([command, ...args])
    if (!args.includes('--dry-run')) {
      await writeFile(join(subagentDir, 'lib/index.js'), 'source: request.promptSource ?? { kind: "user" },\n')
    }
    return {}
  }
  assert.deepEqual(
    await reconcileSubagentPromptSource({ dshDir, runPatch }),
    { state: 'applied', version: '0.2.2-rc.1' },
  )
  assert.equal(calls.length, 2)
  assert.match(calls[0].join(' '), /dsh-subagent-0\.2\.2-rc\.1-prompt-source\.patch/)
  assert.match(await readFile(join(subagentDir, 'lib/index.js'), 'utf8'), /request\.promptSource/)
  assert.deepEqual(
    await reconcileSubagentPromptSource({ dshDir, runPatch }),
    { state: 'already', version: '0.2.2-rc.1' },
  )
})

test('the real subagent package is patched or reported native from nested or hoisted installs', { skip: !anchor }, async (t) => {
  const installed = [join(anchor, 'node_modules', SUBAGENT), join(dirname(anchor), 'dsh-subagent')]
    .find(candidate => existsSync(join(candidate, 'package.json')))
  if (installed === undefined) {
    t.skip('the installed dsh has no nested or hoisted dsh-subagent package')
    return
  }
  const version = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version
  if (version === '0.2.3-alpha.1') {
    const native = await reconcileSubagentPromptSource({
      dshDir: anchor,
      runPatch: async () => assert.fail('a native subagent version must not run patch'),
    })
    assert.deepEqual(native, { state: 'native', version })
    return
  }
  if (!['0.2.2-rc.1', '0.2.2-rc.2', '0.2.2-rc.3', '0.2.2-rc.4', '0.2.2-rc.5'].includes(version)) {
    t.skip(`installed ${SUBAGENT} is ${version}; the source patches target 0.2.2-rc.1 through rc.5`)
    return
  }
  if ((await readFile(join(installed, 'lib/index.js'), 'utf8')).includes('promptSource')) {
    t.skip(`installed ${SUBAGENT} already carries promptSource; re-run against a pristine install`)
    return
  }
  const { dshDir, subagentDir } = await makeHost(t, { dshVersion: version, subagentVersion: version })
  if (version === '0.2.2-rc.1') await rm(join(subagentDir, 'src'), { recursive: true, force: true })
  for (const file of ['package.json', 'src/types.ts', 'src/manager.ts', 'lib/index.js', 'lib/types/manager.js', 'lib/types/types.d.ts']) {
    if (existsSync(join(installed, file))) await copyFile(join(installed, file), join(subagentDir, file))
  }
  const first = await reconcileSubagentPromptSource({ dshDir })
  assert.deepEqual(first, { state: 'applied', version })
  const marker = version === '0.2.2-rc.1'
    ? /request\.promptSource \?\? \{ kind: "user" \}/
    : /spec\.promptSource \?\? \{ kind: "user" \}/
  assert.match(await readFile(join(subagentDir, 'lib/index.js'), 'utf8'), marker)
  const second = await reconcileSubagentPromptSource({ dshDir })
  assert.deepEqual(second, { state: 'already', version })
})
