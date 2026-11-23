import { dirname, join } from 'node:path'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dataRoot } from './task-store.js'

export const MAX_WORKERS = { min: 1, max: 16, default: 3 }
const MODEL_FIELDS = ['provider', 'model', 'reasoningEffort']
const SETTINGS_FIELDS = ['workerModel', 'maxWorkers']
const LIMIT = 200

export const defaultWorkerSettings = () => ({ workerModel: null, maxWorkers: MAX_WORKERS.default })

function text(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`)
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > LIMIT) throw new TypeError(`${field} must be 1-${LIMIT} characters`)
  return trimmed
}

function model(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !MODEL_FIELDS.includes(key))) {
    throw new TypeError('workerModel must name a provider and model')
  }
  const provider = text(value.provider, 'workerModel.provider')
  const name = text(value.model, 'workerModel.model')
  const effort = value.reasoningEffort === undefined || value.reasoningEffort === ''
    ? undefined
    : text(value.reasoningEffort, 'workerModel.reasoningEffort')
  return { provider, model: name, ...(effort ? { reasoningEffort: effort } : {}) }
}

export function normalizeWorkerSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !SETTINGS_FIELDS.includes(key))) {
    throw new TypeError('Worker settings must contain only workerModel and maxWorkers')
  }
  const maxWorkers = value.maxWorkers === undefined ? MAX_WORKERS.default : value.maxWorkers
  if (!Number.isInteger(maxWorkers) || maxWorkers < MAX_WORKERS.min || maxWorkers > MAX_WORKERS.max) {
    throw new TypeError(`maxWorkers must be an integer from ${MAX_WORKERS.min} to ${MAX_WORKERS.max}`)
  }
  return { workerModel: model(value.workerModel), maxWorkers }
}

export function workerAgentOptions(settings) {
  const selected = settings?.workerModel
  if (!selected) return undefined
  return {
    provider: selected.provider,
    model: selected.model,
    ...(selected.reasoningEffort ? { reasoningEffort: selected.reasoningEffort } : {}),
  }
}

export function workerSettingsPath() {
  return join(dataRoot, 'settings.json')
}

export async function readWorkerSettings() {
  try {
    const value = JSON.parse(await readFile(workerSettingsPath(), 'utf8'))
    return normalizeWorkerSettings(value)
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError || error instanceof TypeError) {
      return defaultWorkerSettings()
    }
    throw error
  }
}

async function writeAtomic(value) {
  const path = workerSettingsPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, path)
  } catch (error) {
    await handle?.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

export async function saveWorkerSettings(value) {
  const next = normalizeWorkerSettings(value)
  await writeAtomic(next)
  return next
}
