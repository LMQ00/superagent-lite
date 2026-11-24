import { isAbsolute } from 'node:path'
import { deleteMemoryView, readMemoryView } from './memory.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const SCOPES = new Set(['global', 'project'])

function fail(res, status, message) {
  res.writeHead(status, JSON_HEADERS).end(JSON.stringify({ error: message }))
}

// The memory role writes saved memory, skills and knowledge. The owner can read
// that content and delete a memory-managed skill; there is no way to create or
// edit memory from the panel.
export function createMemoryPanelHandler(connection, {
  read = readMemoryView,
  remove = deleteMemoryView,
} = {}) {
  return async (req, res) => {
    const admission = connection.admit(req)
    if ('rejection' in admission || admission.peer.principal.kind !== 'owner') {
      res.writeHead(admission.rejection ?? 403, { 'cache-control': 'no-store' }).end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      res.writeHead(405, { allow: 'GET, DELETE', 'cache-control': 'no-store' }).end()
      return
    }
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams
    const provided = params.get('projectRoot')
    const projectRoot = provided ?? undefined
    if (provided !== null && (!isAbsolute(provided) || provided.includes('\0'))) {
      fail(res, 400, 'An absolute project root is required')
      return
    }
    if (req.method === 'GET') {
      try {
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify(await read(projectRoot)))
      } catch (error) {
        fail(res, 409, error instanceof Error ? error.message : String(error))
      }
      return
    }
    if (params.get('kind') !== 'skill') {
      fail(res, 400, 'A known delete kind is required')
      return
    }
    const scope = params.get('scope')
    if (!SCOPES.has(scope)) {
      fail(res, 400, 'A memory or skill scope is required')
      return
    }
    if (scope === 'project' && projectRoot === undefined) {
      fail(res, 400, 'An absolute project root is required')
      return
    }
    const name = params.get('name')
    if (!name) {
      fail(res, 400, 'A skill name is required')
      return
    }
    try {
      res.writeHead(200, JSON_HEADERS).end(JSON.stringify(await remove({ kind: 'skill', scope, projectRoot, name })))
    } catch (error) {
      fail(res, error instanceof TypeError ? 400 : 409, error instanceof Error ? error.message : String(error))
    }
  }
}
