import { readJsonBody } from './board.js'
import {
  MAX_WORKERS, normalizeWorkerSettings, readWorkerSettings, saveWorkerSettings,
} from './worker-settings.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const BODY_LIMIT = 16 * 1024

function fail(res, status, message) {
  res.writeHead(status, JSON_HEADERS).end(JSON.stringify({ error: message }))
}

function unavailable(catalog, selected) {
  if (!catalog || !Array.isArray(catalog.groups) || catalog.groups.length === 0) return false
  const group = catalog.groups.find(candidate => candidate?.id === selected.provider)
  if (!group) return true
  return !Array.isArray(group.models) || !group.models.some(candidate => candidate?.id === selected.model)
}

export function createSettingsPanelHandler(connection, {
  read = readWorkerSettings,
  save = saveWorkerSettings,
  catalog,
  onChange,
} = {}) {
  return async (req, res) => {
    const admission = connection.admit(req)
    if ('rejection' in admission || admission.peer.principal.kind !== 'owner') {
      res.writeHead(admission.rejection ?? 403, { 'cache-control': 'no-store' }).end()
      return
    }
    const view = async () => {
      if (!catalog) return undefined
      try {
        return await catalog()
      } catch {
        return undefined
      }
    }
    if (req.method === 'GET') {
      try {
        const [settings, modelCatalog] = await Promise.all([read(), view()])
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify({
          settings,
          limits: { maxWorkers: { min: MAX_WORKERS.min, max: MAX_WORKERS.max } },
          ...(modelCatalog ? { catalog: modelCatalog } : {}),
        }))
      } catch (error) {
        fail(res, 409, error instanceof Error ? error.message : String(error))
      }
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'GET, POST', 'cache-control': 'no-store' }).end()
      return
    }
    if (String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      res.writeHead(415, { 'cache-control': 'no-store' }).end()
      return
    }
    let body
    try {
      body = await readJsonBody(req, BODY_LIMIT)
    } catch (error) {
      fail(res, error.status ?? 400, error.message)
      return
    }
    let next
    try {
      next = normalizeWorkerSettings(body)
      const modelCatalog = next.workerModel ? await view() : undefined
      if (next.workerModel && unavailable(modelCatalog, next.workerModel)) {
        fail(res, 400, 'The selected worker model is not available')
        return
      }
      next = await save(next)
    } catch (error) {
      fail(res, error instanceof TypeError ? 400 : 409, error.message)
      return
    }
    try {
      await onChange?.()
    } catch (error) {
      fail(res, 409, error instanceof Error ? error.message : String(error))
      return
    }
    res.writeHead(200, JSON_HEADERS).end(JSON.stringify({ settings: next }))
  }
}
