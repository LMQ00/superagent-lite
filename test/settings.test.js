import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createSettingsHandler } from '../src/board.js'
import {
  DEFAULT_ARCHIVE_MAX_BYTES, MAX_ARCHIVE_MAX_BYTES, createSettingsStore,
} from '../src/settings-store.js'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
const owner = { admit: () => ({ peer: { principal: { kind: 'owner' } } }) }

async function fixture(t) {
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, 'settings-'))
  t.after(() => rm(root, { recursive: true }))
  return { root, directory: join(root, 'superagent-lite') }
}

async function request(handler, method = 'GET', url = '/superagent-lite/settings') {
  const result = {}
  const response = {
    writeHead(status, headers) { Object.assign(result, { status, headers }); return this },
    end(body) { result.body = body },
  }
  await handler({ method, headers: {}, url }, response)
  return result
}

async function put(handler, body, headers = { 'content-type': 'application/json' }) {
  const result = {}
  const request = {
    method: 'PUT', headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    },
  }
  const response = {
    writeHead(status, values) { Object.assign(result, { status, headers: values }); return this },
    end(value) { result.body = value },
  }
  await handler(request, response)
  return result
}

test('settings default to 128M on a missing document and persist values or unlimited', async t => {
  const { directory } = await fixture(t)
  const store = createSettingsStore(directory)
  assert.equal(DEFAULT_ARCHIVE_MAX_BYTES, 128 * 1024 * 1024)
  assert.equal(MAX_ARCHIVE_MAX_BYTES, 2 * 1024 * 1024 * 1024)
  assert.deepEqual(await store.read(), { archiveMaxBytes: DEFAULT_ARCHIVE_MAX_BYTES })
  assert.deepEqual(await store.setArchiveMaxBytes(256 * 1024 * 1024), { archiveMaxBytes: 256 * 1024 * 1024 })
  assert.deepEqual(await createSettingsStore(directory).read(), { archiveMaxBytes: 256 * 1024 * 1024 })
  assert.deepEqual(await store.setArchiveMaxBytes(MAX_ARCHIVE_MAX_BYTES), { archiveMaxBytes: MAX_ARCHIVE_MAX_BYTES })
  assert.deepEqual(await store.setArchiveMaxBytes(null), { archiveMaxBytes: null })
  assert.deepEqual(await createSettingsStore(directory).read(), { archiveMaxBytes: null })
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8')),
    { version: 1, archiveMaxBytes: null })
})

test('settings refuse values outside the adjustable range and keep the stored value', async t => {
  const { directory } = await fixture(t)
  const store = createSettingsStore(directory)
  await store.setArchiveMaxBytes(1024)
  for (const value of [0, -1, 1.5, '1024', true, MAX_ARCHIVE_MAX_BYTES + 1, Number.MAX_SAFE_INTEGER + 2]) {
    await assert.rejects(store.setArchiveMaxBytes(value), /must be null \(unlimited\) or an integer/)
  }
  assert.deepEqual(await store.read(), { archiveMaxBytes: 1024 })
})

test('invalid stored settings fail closed', async t => {
  const { directory } = await fixture(t)
  const store = createSettingsStore(directory)
  const path = join(directory, 'settings.json')
  await mkdir(directory, { recursive: true })
  await writeFile(path, '{')
  await assert.rejects(store.read(), /Invalid settings JSON/)
  await writeFile(path, '{"version":99}')
  await assert.rejects(store.read(), /unsupported settings/)
  await writeFile(path, '{"version":1,"archiveMaxBytes":0}')
  await assert.rejects(store.read(), /Invalid archive size limit/)
  await writeFile(path, `{"version":1,"archiveMaxBytes":${MAX_ARCHIVE_MAX_BYTES + 1}}`)
  await assert.rejects(store.read(), /Invalid archive size limit/)
  await writeFile(path, '{"version":1}')
  assert.deepEqual(await store.read(), { archiveMaxBytes: DEFAULT_ARCHIVE_MAX_BYTES })
})

test('the settings handler reads and writes the owner view', async t => {
  const { directory } = await fixture(t)
  const handler = createSettingsHandler(owner, createSettingsStore(directory))
  let result = await request(handler)
  assert.equal(result.status, 200)
  assert.deepEqual(JSON.parse(result.body), {
    archiveMaxBytes: DEFAULT_ARCHIVE_MAX_BYTES,
    defaultArchiveMaxBytes: DEFAULT_ARCHIVE_MAX_BYTES,
    maxArchiveMaxBytes: MAX_ARCHIVE_MAX_BYTES,
  })
  result = await put(handler, { archiveMaxBytes: 64 * 1024 * 1024 })
  assert.equal(result.status, 200)
  assert.equal(JSON.parse(result.body).archiveMaxBytes, 64 * 1024 * 1024)
  assert.match((await request(handler)).body, /67108864/)
  result = await put(handler, { archiveMaxBytes: null })
  assert.equal(result.status, 200)
  assert.equal(JSON.parse(result.body).archiveMaxBytes, null)
})

test('the settings handler refuses other callers, methods and invalid payloads', async t => {
  const { directory } = await fixture(t)
  for (const admission of [{ rejection: 401 }, { peer: { principal: { kind: 'guest' } } }]) {
    const handler = createSettingsHandler({ admit: () => admission }, createSettingsStore(directory))
    assert.equal((await request(handler)).status, admission.rejection ?? 403)
    assert.equal((await put(handler, { archiveMaxBytes: 1024 })).status, admission.rejection ?? 403)
  }
  const store = createSettingsStore(directory)
  const handler = createSettingsHandler(owner, store)
  const wrongMethod = await request(handler, 'POST')
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.headers.allow, 'GET, PUT')
  assert.equal((await put(handler, { archiveMaxBytes: 1024 }, { 'content-type': 'text/plain' })).status, 415)
  assert.equal((await put(handler, '{')).status, 400)
  assert.equal((await put(handler, {})).status, 400)
  assert.equal((await put(handler, { archiveMaxBytes: 0 })).status, 400)
  assert.match(JSON.parse((await put(handler, { archiveMaxBytes: 'large' })).body).error, /must be null/)
  assert.deepEqual(await store.read(), { archiveMaxBytes: DEFAULT_ARCHIVE_MAX_BYTES })
})
