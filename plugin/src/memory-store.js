import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, normalize, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const VERSION = 1
const CATEGORIES = new Set(['private', 'public', 'profile', 'team'])
const ROLES = new Set(['router', 'worker', 'memory'])
const ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const TEAM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const SECRET_PATTERN = /-----BEGIN [^-\r\n]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\b(?:api[-_ ]?key|password|secret|token)\s*[:=]\s*\S+/i

function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) {
    throw new TypeError('Invalid memory fields')
  }
  return value
}

function sourceOf(value) {
  const { sessionId, seq } = object(value, ['sessionId', 'seq'])
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 512 ||
      !Number.isSafeInteger(seq) || seq < 0) {
    throw new TypeError('Memory source requires a Session id and a non-negative event sequence')
  }
  return { sessionId, seq }
}

function payloadOf(category, input) {
  if (category === 'private' && Object.hasOwn(input, 'credentialRef')) {
    if (Object.hasOwn(input, 'content') || Object.hasOwn(input, 'nonSecret') ||
        typeof input.credentialRef !== 'string' || !REF_PATTERN.test(input.credentialRef) ||
        SECRET_PATTERN.test(input.credentialRef)) {
      throw new TypeError('Private credential memory accepts only a credential reference name')
    }
    return { credentialRef: input.credentialRef }
  }
  if (Object.hasOwn(input, 'credentialRef') || (category === 'private'
    ? input.nonSecret !== true
    : Object.hasOwn(input, 'nonSecret'))) {
    throw new TypeError('Private content must be explicitly marked nonSecret; other categories accept content only')
  }
  if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 16_000) {
    throw new TypeError('Memory content must contain 1–16000 characters')
  }
  if (SECRET_PATTERN.test(input.content)) throw new TypeError('Memory content appears to contain a secret; use a credential reference instead')
  return { content: input.content.trim(), ...(category === 'private' ? { nonSecret: true } : {}) }
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function scopeOf(caller, category) {
  if (!CATEGORIES.has(category)) throw new TypeError('Invalid memory category')
  if (!ROLES.has(caller?.role)) throw new TypeError('A trusted memory caller role is required')
  if (category !== 'team') return null
  if (caller.role !== 'worker' || typeof caller.teamId !== 'string' || !TEAM_PATTERN.test(caller.teamId) ||
      typeof caller.projectRoot !== 'string' || !isAbsolute(caller.projectRoot) || caller.projectRoot.includes('\0')) {
    throw new Error('Team memory requires a trusted worker team and absolute project root')
  }
  return { teamId: caller.teamId, projectRoot: resolve(caller.projectRoot) }
}

async function directoryExists(path, create) {
  try {
    const info = await lstat(path)
    if (!info.isDirectory()) throw new Error('Memory storage path must be a real directory')
    return true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    if (!create) return false
  }
  await mkdir(path, { mode: 0o700, recursive: true })
  if (!(await lstat(path)).isDirectory()) throw new Error('Memory storage path must be a real directory')
  return true
}

async function readDocument(path) {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    if (!(await handle.stat()).isFile()) throw new Error('Memory storage record must be a regular file')
    return JSON.parse(await handle.readFile('utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) throw new Error('Invalid memory storage JSON')
    throw error
  } finally {
    await handle?.close()
  }
}

async function syncDirectory(path) {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

async function writeDocument(directory, path, value, exclusive = false) {
  const temporary = join(directory, `.${randomUUID()}.tmp`)
  const data = `${JSON.stringify(value)}\n`
  const handle = await open(temporary, 'wx', 0o600)
  let published = false
  try {
    try {
      await handle.writeFile(data, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (exclusive) await link(temporary, path)
    else await rename(temporary, path)
    published = true
    await syncDirectory(directory)
  } finally {
    if (exclusive || !published) await unlink(temporary).catch(() => {})
  }
}

const queues = new Map()

function serialized(path, operation) {
  const previous = queues.get(path) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(operation)
  queues.set(path, next)
  return next.finally(() => { if (queues.get(path) === next) queues.delete(path) })
}

// Caller identity comes from the Host, never from model arguments. Give tool code
// only the memory facade; archive is a separate Host-only capability.
export function createMemoryStore(directory = join(homedir(), '.dsh', 'superagent-lite', 'memory')) {
  const root = resolve(directory)

  async function partition(category, scope, create) {
    const parent = join(root, category)
    if (!await directoryExists(root, create) || !await directoryExists(parent, create)) return undefined
    if (scope === null) return parent
    const partition = join(parent, hash([scope.teamId, normalize(scope.projectRoot)]))
    return await directoryExists(partition, create) ? partition : undefined
  }

  function recordPath(directory, id) {
    return join(directory, `${id}.json`)
  }

  function assertId(id) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new TypeError('Invalid memory record id')
  }

  async function loadRecord(path, category, scope, id) {
    const document = await readDocument(path)
    if (document === undefined) return undefined
    const { version, scope: savedScope, record } = document ?? {}
    if (version !== VERSION || !isDeepStrictEqual(scope, savedScope) || record?.id !== id || record.category !== category ||
        typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') {
      throw new Error('Invalid or unsupported memory storage record')
    }
    const { id: _id, category: _category, createdAt, updatedAt, source, ...payload } = record
    object(payload, ['content', 'nonSecret', 'credentialRef'])
    return { id, category, ...payloadOf(category, payload), source: sourceOf(source), createdAt, updatedAt }
  }

  async function create(caller, input) {
    const { category, source, ...payload } = object(input, ['category', 'source', 'content', 'nonSecret', 'credentialRef'])
    const scope = scopeOf(caller, category)
    const facts = payloadOf(category, payload)
    const origin = sourceOf(source)
    const storage = await partition(category, scope, true)
    const id = randomUUID()
    const time = new Date().toISOString()
    const record = { id, category, ...facts, source: origin, createdAt: time, updatedAt: time }
    await writeDocument(storage, recordPath(storage, id), { version: VERSION, scope, record }, true)
    return record
  }

  async function read(caller, category, id) {
    const scope = scopeOf(caller, category)
    assertId(id)
    const storage = await partition(category, scope, false)
    return storage === undefined ? undefined : loadRecord(recordPath(storage, id), category, scope, id)
  }

  async function list(caller, category) {
    const scope = scopeOf(caller, category)
    const storage = await partition(category, scope, false)
    if (storage === undefined) return []
    const records = []
    for (const name of (await readdir(storage)).sort()) {
      const id = name.slice(0, -5)
      if (!name.endsWith('.json') || !ID_PATTERN.test(id)) continue
      const record = await loadRecord(recordPath(storage, id), category, scope, id)
      if (record !== undefined) records.push(record)
    }
    return records
  }

  async function update(caller, category, id, changes) {
    const scope = scopeOf(caller, category)
    assertId(id)
    const { source, ...payload } = object(changes, ['source', 'content', 'nonSecret', 'credentialRef'])
    const origin = Object.hasOwn(changes, 'source') ? sourceOf(source) : undefined
    const facts = Object.keys(payload).length > 0 ? payloadOf(category, payload) : undefined
    if (origin === undefined && facts === undefined) throw new TypeError('A memory update must supply content, a credential reference, or a source')
    const storage = await partition(category, scope, false)
    if (storage === undefined) return undefined
    const path = recordPath(storage, id)
    return serialized(path, async () => {
      const previous = await loadRecord(path, category, scope, id)
      if (previous === undefined) return undefined
      const { id: _id, category: _category, source, createdAt, updatedAt: _updatedAt, ...previousFacts } = previous
      const record = {
        id, category, ...(facts ?? previousFacts), source: origin ?? source, createdAt, updatedAt: new Date().toISOString(),
      }
      await writeDocument(storage, path, { version: VERSION, scope, record })
      return record
    })
  }

  async function deleteRecord(caller, category, id) {
    const scope = scopeOf(caller, category)
    assertId(id)
    const storage = await partition(category, scope, false)
    if (storage === undefined) return false
    const path = recordPath(storage, id)
    return serialized(path, async () => {
      if (await loadRecord(path, category, scope, id) === undefined) return false
      await unlink(path)
      await syncDirectory(storage)
      return true
    })
  }

  async function readArchive(origin) {
    const source = sourceOf(origin)
    const storage = await partition('archive', null, false)
    if (storage === undefined) return undefined
    const document = await readDocument(join(storage, `${hash(source)}.json`))
    if (document === undefined) return undefined
    if (document?.version !== VERSION || !isDeepStrictEqual(document.source, source) || !Object.hasOwn(document, 'value')) {
      throw new Error('Invalid or unsupported raw memory archive record')
    }
    return document.value
  }

  async function writeArchive(origin, value) {
    const source = sourceOf(origin)
    const encoded = JSON.stringify(value)
    const snapshot = encoded === undefined ? undefined : JSON.parse(encoded)
    if (snapshot === undefined || !isDeepStrictEqual(value, snapshot)) {
      throw new TypeError('Raw memory archive value must be lossless JSON')
    }
    const storage = await partition('archive', null, true)
    const path = join(storage, `${hash(source)}.json`)
    try {
      await writeDocument(storage, path, { version: VERSION, source, value: snapshot }, true)
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (!isDeepStrictEqual(await readArchive(source), snapshot)) throw new Error('Raw memory archive source is already recorded with different data')
      await syncDirectory(storage)
    }
  }

  return {
    memory: Object.freeze({ create, read, list, update, delete: deleteRecord }),
    archive: Object.freeze({ write: writeArchive, read: readArchive }),
  }
}
