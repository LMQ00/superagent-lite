import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

const VERSION = 1
export const MAX_FIELD_LENGTH = 4_000

export const GLOBAL_FIELDS = Object.freeze(['userProfile', 'sharedSkill'])
export const PROJECT_FIELDS = Object.freeze(['responsibilities', 'positioning', 'scenarios', 'skill'])
export const MEMORY_FIELDS = Object.freeze([...GLOBAL_FIELDS, ...PROJECT_FIELDS])

function emptyGlobal() {
  return Object.fromEntries(GLOBAL_FIELDS.map(field => [field, '']))
}

function emptyProject(projectRoot) {
  return { projectRoot, ...Object.fromEntries(PROJECT_FIELDS.map(field => [field, ''])) }
}

function fieldValue(value, field) {
  if (value === undefined) return ''
  if (typeof value !== 'string') throw new TypeError(`Memory field "${field}" must be a string`)
  const text = value.trim()
  if (text.length > MAX_FIELD_LENGTH) {
    throw new TypeError(`Memory field "${field}" must contain at most ${MAX_FIELD_LENGTH} characters`)
  }
  return text
}

function projectRootOf(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || !isAbsolute(value)) {
    throw new TypeError('Project memory requires an absolute project root')
  }
  return resolve(value)
}

function documentFrom(doc, fields, label) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.version !== VERSION) {
    throw new Error(`Invalid or unsupported ${label} memory`)
  }
  return Object.fromEntries(fields.map(field => [field, fieldValue(doc[field], field)]))
}

async function readDocument(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) throw new Error('Invalid memory storage JSON')
    throw error
  }
}

async function writeDocument(path, value, maxBytes) {
  const text = `${JSON.stringify(value)}\n`
  if (maxBytes !== undefined && maxBytes !== null) {
    const bytes = Buffer.byteLength(text)
    if (bytes > maxBytes) {
      throw new RangeError(`Raw memory archive is ${bytes} bytes, over the ${maxBytes}-byte limit`)
    }
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(text, 'utf8')
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => {})
    await unlink(temporary).catch(() => {})
    throw error
  }
  await handle.close()
  try {
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

function archivePath(root, source) {
  if (!source || typeof source.sessionId !== 'string' || !source.sessionId ||
      !Number.isSafeInteger(source.seq) || source.seq < 0) {
    throw new TypeError('Raw memory archive requires a Session id and a non-negative event sequence')
  }
  const key = createHash('sha256').update(`${source.sessionId}\0${source.seq}`).digest('hex')
  return join(root, 'archive', `${key}.json`)
}

export function createMemoryStore(directory = join(homedir(), '.dsh', 'superagent-lite', 'memory'), options = {}) {
  const root = resolve(directory)
  const archiveMaxBytes = options.archiveMaxBytes ?? (() => undefined)

  async function readGlobal() {
    const doc = await readDocument(join(root, 'global.json'))
    return doc === undefined ? emptyGlobal() : documentFrom(doc, GLOBAL_FIELDS, 'global')
  }

  async function readProject(projectRoot) {
    const resolved = projectRootOf(projectRoot)
    const path = join(root, 'projects', `${createHash('sha256').update(resolved).digest('hex')}.json`)
    const doc = await readDocument(path)
    if (doc === undefined) return emptyProject(resolved)
    if (doc.projectRoot !== undefined && doc.projectRoot !== resolved) {
      throw new Error('Stored project memory belongs to a different project root')
    }
    return { projectRoot: resolved, ...documentFrom(doc, PROJECT_FIELDS, 'project') }
  }

  async function readMemory(projectRoot) {
    return { global: await readGlobal(), project: await readProject(projectRoot) }
  }

  function changesOf(changes, fields, label) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw new TypeError(`A ${label} memory update is required`)
    }
    const update = {}
    for (const [field, value] of Object.entries(changes)) {
      if (!fields.includes(field)) throw new TypeError(`Unknown ${label} memory field "${field}"`)
      update[field] = fieldValue(value, field)
    }
    return update
  }

  function differs(current, update, fields) {
    return fields.some(field => Object.hasOwn(update, field) && update[field] !== current[field])
  }

  async function writeGlobal(changes) {
    const update = changesOf(changes, GLOBAL_FIELDS, 'global')
    const current = await readGlobal()
    if (!differs(current, update, GLOBAL_FIELDS)) return current
    const next = { ...current, ...update }
    await writeDocument(join(root, 'global.json'), { version: VERSION, ...next })
    return next
  }

  async function writeProject(projectRoot, changes) {
    const resolved = projectRootOf(projectRoot)
    const update = changesOf(changes, PROJECT_FIELDS, 'project')
    const current = await readProject(resolved)
    if (!differs(current, update, PROJECT_FIELDS)) return current
    const next = { ...current, ...update }
    await writeDocument(
      join(root, 'projects', `${createHash('sha256').update(resolved).digest('hex')}.json`),
      { version: VERSION, ...next },
    )
    return next
  }

  async function writeMemory(projectRoot, { global: globalChanges = {}, project: projectChanges = {} }) {
    return {
      global: await writeGlobal(globalChanges),
      project: await writeProject(projectRoot, projectChanges),
    }
  }

  async function writeArchive(source, value) {
    const path = archivePath(root, source)
    await writeDocument(path, { version: VERSION, source, value }, await archiveMaxBytes())
  }

  async function readArchive(source) {
    const doc = await readDocument(archivePath(root, source))
    if (doc === undefined) return undefined
    if (doc.version !== VERSION || doc.source?.sessionId !== source.sessionId || doc.source?.seq !== source.seq) {
      throw new Error('Invalid or unsupported raw memory archive record')
    }
    return doc.value
  }

  return {
    readGlobal,
    readProject,
    readMemory,
    writeGlobal,
    writeProject,
    writeMemory,
    archive: Object.freeze({ write: writeArchive, read: readArchive }),
  }
}
