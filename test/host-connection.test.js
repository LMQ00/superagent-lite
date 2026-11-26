import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'

const anchor = process.env.DSH_INSTALL_DIR
const PACKAGE = '@deepseek-ai/dsh-client-connection'
const SUPPORTED = [
  '0.2.2-rc.1', '0.2.2-rc.2', '0.2.2-rc.3',
  '0.2.2-rc.4', '0.2.2-rc.5', '0.2.3-alpha.1',
]

/** Resolve the Connection package from a real dsh install: nested or hoisted sibling. */
function installedPackage(anchor) {
  const nested = join(anchor, 'node_modules', PACKAGE)
  const hoisted = join(dirname(anchor), PACKAGE.slice(PACKAGE.indexOf('/') + 1))
  return [nested, hoisted].find(candidate => existsSync(join(candidate, 'package.json')))
}

// The panel routes pick their registration context from this contract:
// 0.2.2-rc.* authenticate inside admit and expose requestRejection, while
// 0.2.3-alpha.1 removed it and resolves connection.authentication from the
// calling fiber. A real Host that exposes both or neither would leave the
// panels unregistered or registered from a context admit cannot use.
test('the installed Host exposes exactly one connection authentication contract', { skip: !anchor }, async (t) => {
  const dir = installedPackage(anchor)
  if (!dir) {
    t.skip('the installed dsh has no resolvable Connection package')
    return
  }
  const version = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).version
  if (!SUPPORTED.includes(version)) {
    t.skip(`Connection ${version} is outside the supported Host range`)
    return
  }
  const source = await readFile(join(dir, 'lib/index.js'), 'utf8')
  const legacy = /requestRejection\s*\(/.test(source)
  const authentication = source.includes('connection.authentication')
  assert.notEqual(legacy, authentication, `${version} must expose exactly one authentication contract`)
  if (version === '0.2.3-alpha.1') {
    assert.equal(legacy, false, `${version} must not expose requestRejection`)
    assert.equal(authentication, true, `${version} must resolve connection.authentication`)
  } else {
    assert.equal(legacy, true, `${version} must expose requestRejection`)
    assert.equal(authentication, false, `${version} must not require connection.authentication`)
  }
})
