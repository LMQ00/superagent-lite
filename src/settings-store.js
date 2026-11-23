import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const VERSION = 1

// Raw archives keep one complete worker turn per file. A turn larger than the
// limit is not written; the worker keeps running and the Host logs the refusal.
export const DEFAULT_ARCHIVE_MAX_BYTES = 128 * 1024 * 1024
export const MAX_ARCHIVE_MAX_BYTES = 2 * 1024 * 1024 * 1024

export function validateArchiveMaxBytes(value) {
  if (value === null) return null
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ARCHIVE_MAX_BYTES) {
    throw new TypeError(
      `The archive size limit must be null (unlimited) or an integer from 1 to ${MAX_ARCHIVE_MAX_BYTES} bytes`,
    )
  }
  return value
}

function archiveMaxBytesOf(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.version !== VERSION) {
    throw new Error('Invalid or unsupported settings')
  }
  if (!Object.hasOwn(doc, 'archiveMaxBytes')) return DEFAULT_ARCHIVE_MAX_BYTES
  try {
    return validateArchiveMaxBytes(doc.archiveMaxBytes)
  } catch {
    throw new Error('Invalid archive size limit in settings')
  }
}

async function readDocument(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) throw new Error('Invalid settings JSON')
    throw error
  }
}

async function writeDocument(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8')
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

export function createSettingsStore(baseDir = join(homedir(), '.dsh', 'superagent-lite')) {
  const root = resolve(baseDir)
  const path = join(root, 'settings.json')

  async function read() {
    const doc = await readDocument(path)
    if (doc === undefined) return { archiveMaxBytes: DEFAULT_ARCHIVE_MAX_BYTES }
    return { archiveMaxBytes: archiveMaxBytesOf(doc) }
  }

  async function setArchiveMaxBytes(value) {
    const limit = validateArchiveMaxBytes(value)
    await writeDocument(path, { version: VERSION, archiveMaxBytes: limit })
    return { archiveMaxBytes: limit }
  }

  return { read, setArchiveMaxBytes }
}
