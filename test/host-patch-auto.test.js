import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { TARGETS } from '../scripts/dsh-client-ui-chat-agent-message-card.mjs'
import {
  reconcileHostPatches, reconcileSubagentPromptSource, resolveDshDirectory, SUBAGENT_TARGETS,
} from '../src/host-patch.js'

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

async function writeSubagentPackage(packageDir, version, { omitLabel, duplicateLabel } = {}) {
  await writeManifest(packageDir, SUBAGENT, version)
  const target = SUBAGENT_TARGETS.get(version)
  if (target === undefined) {
    await mkdir(join(packageDir, 'lib'), { recursive: true })
    await writeFile(join(packageDir, 'lib', 'index.js'), 'source: { kind: "user" },\n')
    return
  }
  const files = new Map()
  for (const entry of target.patches) {
    const parts = files.get(entry.file) ?? []
    if (entry.label !== omitLabel) {
      parts.push(`/* ${entry.label} */`, entry.old)
      if (entry.label === duplicateLabel) parts.push(entry.old)
    }
    files.set(entry.file, parts)
  }
  for (const [file, parts] of files) {
    const targetPath = join(packageDir, file)
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, `${parts.join('\n')}\n`)
  }
}

async function makeHost(t, {
  dshVersion = '0.2.2-rc.5', chatVersion = '0.2.2-rc.5', subagentVersion = '0.2.2-rc.5', subagentOptions = {},
} = {}) {
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, 'host-patch-auto-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dshDir = join(root, 'node_modules', '@deepseek-ai', 'dsh')
  await writeManifest(dshDir, DSH, dshVersion)
  await mkdir(join(dshDir, 'lib'), { recursive: true })
  await writeFile(join(dshDir, 'lib', 'bin.js'), '// fake entry\n')
  await writeChatPackage(join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat'), chatVersion)
  const subagentDir = join(dshDir, 'node_modules', '@deepseek-ai', 'dsh-subagent')
  await writeSubagentPackage(subagentDir, subagentVersion, subagentOptions)
  return { root, dshDir, subagentDir, chatDir: join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat') }
}

test('resolveDshDirectory walks up from the installed entry and honours DSH_INSTALL_DIR', async (t) => {
  const { root, dshDir } = await makeHost(t)
  assert.equal(resolveDshDirectory(join(dshDir, 'lib', 'bin.js'), {}), dshDir)
  assert.equal(resolveDshDirectory('/nonexistent/dsh', { DSH_INSTALL_DIR: dshDir }), dshDir)
  assert.equal(resolveDshDirectory(join(root, 'missing.js'), {}), undefined)
})

test('startup reconciliation applies the subagent and Chat patches once', async (t) => {
  const { dshDir, subagentDir, chatDir } = await makeHost(t)
  const warnings = []
  const logger = { warn: message => warnings.push(message) }
  const result = await reconcileHostPatches({ logger }, { dshDir })
  assert.deepEqual(result.subagent, { state: 'applied', version: '0.2.2-rc.5' })
  assert.equal(result.chat.state, 'applied')
  assert.match(await readFile(join(subagentDir, 'lib/index.js'), 'utf8'), new RegExp(PROMPT_SOURCE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(await readFile(join(chatDir, 'lib/client.js'), 'utf8'), /const cardedNotice=context\.state\.kind===`context`/)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /restart DSH/)

  const again = await reconcileHostPatches({ logger }, { dshDir })
  assert.deepEqual(again.subagent, { state: 'already', version: '0.2.2-rc.5' })
  assert.equal(again.chat.state, 'already')
  assert.equal(warnings.length, 1)
})

test('unsupported subagent versions and failed patches leave the package untouched', async (t) => {
  const unsupported = await makeHost(t, { dshVersion: '0.2.3-alpha.2', subagentVersion: '0.2.3-alpha.2' })
  assert.deepEqual(
    await reconcileSubagentPromptSource({ dshDir: unsupported.dshDir }),
    { state: 'unsupported', version: '0.2.3-alpha.2' },
  )

  const broken = await makeHost(t, {
    subagentOptions: { omitLabel: 'forward promptSource in the runtime bundle' },
  })
  const warnings = []
  const result = await reconcileHostPatches({ logger: { warn: message => warnings.push(message) } }, {
    dshDir: broken.dshDir,
  })
  assert.equal(result.subagent.state, 'failed')
  assert.match(result.subagent.reason, /does not contain "forward promptSource in the runtime bundle"/)
  assert.doesNotMatch(await readFile(join(broken.subagentDir, 'lib/index.js'), 'utf8'), /promptSource/)
  assert.ok(warnings.some(message => /subagent promptSource patch was not applied/.test(message)))
})

test('a failed snippet leaves every subagent file untouched', async (t) => {
  const { dshDir, subagentDir } = await makeHost(t, {
    subagentOptions: { omitLabel: 'add promptSource beside the start prompt' },
  })
  const pristine = new Map()
  for (const file of ['src/types.ts', 'src/manager.ts', 'lib/index.js', 'lib/types/manager.js', 'lib/types/types.d.ts']) {
    pristine.set(file, await readFile(join(subagentDir, file), 'utf8'))
  }
  const result = await reconcileSubagentPromptSource({ dshDir })
  assert.equal(result.state, 'failed')
  assert.match(result.reason, /does not contain "add promptSource beside the start prompt"/)
  for (const [file, content] of pristine) assert.equal(await readFile(join(subagentDir, file), 'utf8'), content)
})

test('duplicate subagent snippets fail closed', async (t) => {
  const { dshDir, subagentDir } = await makeHost(t, {
    subagentOptions: { duplicateLabel: 'forward promptSource in the runtime bundle' },
  })
  const pristine = await readFile(join(subagentDir, 'lib/index.js'), 'utf8')
  const result = await reconcileSubagentPromptSource({ dshDir })
  assert.equal(result.state, 'failed')
  assert.match(result.reason, /contains "forward promptSource in the runtime bundle" 2 times/)
  assert.match(result.reason, /refusing an ambiguous patch/)
  assert.equal(await readFile(join(subagentDir, 'lib/index.js'), 'utf8'), pristine)
})

test('a desktop app.asar runtime is reported read-only and never patched', async () => {
  const dshDir = join('/Applications/DSH.app/Contents/Resources/app.asar', 'node_modules', DSH)
  const warnings = []
  assert.deepEqual(await reconcileSubagentPromptSource({ dshDir }), { state: 'readonly' })
  const result = await reconcileHostPatches({ logger: { warn: message => warnings.push(message) } }, { dshDir })
  assert.deepEqual(result, {
    dshDir,
    readonly: true,
    subagent: { state: 'readonly' },
    chat: { state: 'readonly' },
  })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /read-only app archive/)
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
  const result = await reconcileHostPatches({ logger: { warn: message => warnings.push(message) } }, { dshDir })
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
  const warnings = []
  const result = await reconcileHostPatches({ logger: { warn: message => warnings.push(message) } }, { dshDir })
  assert.deepEqual(result.subagent, { state: 'native', version: '0.2.3-alpha.1' })
  assert.equal(result.chat.state, 'applied')
  assert.match(await readFile(join(subagentDir, 'lib/index.js'), 'utf8'), /source: \{ kind: "user" \}/)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /restart DSH/)
  assert.doesNotMatch(warnings[0], /subagent/)
})

test('the subagent promptSource patch applies without a patch executable on PATH', async (t) => {
  const { dshDir, subagentDir } = await makeHost(t)
  const path = process.env.PATH
  process.env.PATH = ''
  try {
    assert.deepEqual(await reconcileSubagentPromptSource({ dshDir }), { state: 'applied', version: '0.2.2-rc.5' })
  } finally {
    process.env.PATH = path
  }
  assert.match(await readFile(join(subagentDir, 'lib/index.js'), 'utf8'), /spec\.promptSource/)
})

test('0.2.2-rc.1 applies the bundle-only promptSource diff', async (t) => {
  const { dshDir, subagentDir } = await makeHost(t, {
    dshVersion: '0.2.2-rc.1',
    chatVersion: '0.2.2-rc.1',
    subagentVersion: '0.2.2-rc.1',
  })
  assert.deepEqual(
    await reconcileSubagentPromptSource({ dshDir }),
    { state: 'applied', version: '0.2.2-rc.1' },
  )
  assert.match(await readFile(join(subagentDir, 'lib/index.js'), 'utf8'), /request\.promptSource/)
  assert.match(await readFile(join(subagentDir, 'lib/types/manager.js'), 'utf8'), /request\.promptSource/)
  assert.match(await readFile(join(subagentDir, 'lib/types/types.d.ts'), 'utf8'), /readonly promptSource\?: MessageSource;/)
  assert.equal(existsSync(join(subagentDir, 'src')), false)
  assert.deepEqual(
    await reconcileSubagentPromptSource({ dshDir }),
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
    assert.deepEqual(await reconcileSubagentPromptSource({ dshDir: anchor }), { state: 'native', version })
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
