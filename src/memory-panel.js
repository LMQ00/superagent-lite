import { isAbsolute } from 'node:path'
import { deleteMemoryView, readMemoryView } from './memory.js'
import { GLOBAL_FIELDS, PROJECT_FIELDS } from './memory-store.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const KINDS = new Set(['memory', 'skill', 'knowledge'])
const SCOPES = new Set(['global', 'project'])

function fail(res, status, message) {
  res.writeHead(status, JSON_HEADERS).end(JSON.stringify({ error: message }))
}

// The memory role writes saved memory, skills and knowledge. The owner can
// read that content and delete individual pieces; there is no way to create or
// edit it from the panel.
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
    const kind = params.get('kind')
    if (!KINDS.has(kind)) {
      fail(res, 400, 'A known delete kind is required')
      return
    }
    let target
    if (kind === 'knowledge') {
      const id = params.get('id')
      if (!id) {
        fail(res, 400, 'A knowledge entry id is required')
        return
      }
      target = { kind, id }
    } else {
      const scope = params.get('scope')
      if (!SCOPES.has(scope)) {
        fail(res, 400, 'A memory or skill scope is required')
        return
      }
      if (scope === 'project' && projectRoot === undefined) {
        fail(res, 400, 'An absolute project root is required')
        return
      }
      if (kind === 'memory') {
        const field = params.get('field')
        const fields = scope === 'global' ? GLOBAL_FIELDS : PROJECT_FIELDS
        if (!fields.includes(field)) {
          fail(res, 400, 'A known memory field is required')
          return
        }
        target = { kind, scope, projectRoot, field }
      } else {
        const name = params.get('name')
        if (!name) {
          fail(res, 400, 'A skill name is required')
          return
        }
        target = { kind, scope, projectRoot, name }
      }
    }
    try {
      res.writeHead(200, JSON_HEADERS).end(JSON.stringify(await remove(target)))
    } catch (error) {
      fail(res, error instanceof TypeError ? 400 : 409, error instanceof Error ? error.message : String(error))
    }
  }
}
