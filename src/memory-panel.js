import { isAbsolute } from 'node:path'
import { readMemoryView } from './memory.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }

function fail(res, status, message) {
  res.writeHead(status, JSON_HEADERS).end(JSON.stringify({ error: message }))
}

// The memory panel is a read-only view. Memory and knowledge writes stay in
// the memory role; this endpoint only serves the owner.
export function createMemoryPanelHandler(connection, { read = readMemoryView } = {}) {
  return async (req, res) => {
    const admission = connection.admit(req)
    if ('rejection' in admission || admission.peer.principal.kind !== 'owner') {
      res.writeHead(admission.rejection ?? 403, { 'cache-control': 'no-store' }).end()
      return
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' }).end()
      return
    }
    const projectRoot = new URL(req.url ?? '/', 'http://localhost').searchParams.get('projectRoot') ?? undefined
    if (projectRoot !== undefined && (!isAbsolute(projectRoot) || projectRoot.includes('\0'))) {
      fail(res, 400, 'An absolute project root is required')
      return
    }
    try {
      res.writeHead(200, JSON_HEADERS).end(JSON.stringify(await read(projectRoot)))
    } catch (error) {
      fail(res, 409, error instanceof Error ? error.message : String(error))
    }
  }
}
