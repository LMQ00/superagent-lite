import { createMemoryPanel } from './memory.js'
import { readJsonBody } from './board.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const CATEGORIES = new Set(['private', 'public', 'profile', 'team'])
const ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const BODY_LIMIT = 32 * 1024

function fail(res, status, message) {
  res.writeHead(status, { ...JSON_HEADERS }).end(JSON.stringify(message ? { error: message } : {}))
}

function teamScope(body) {
  if (typeof body.teamId !== 'string' || typeof body.projectRoot !== 'string') {
    throw new TypeError('Team memory requires teamId and projectRoot')
  }
  return { teamId: body.teamId, projectRoot: body.projectRoot }
}

function mutation(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new TypeError('A memory body is required')
  const { action, category, id } = body
  if ((action !== 'update' && action !== 'delete') || !CATEGORIES.has(category) ||
      typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new TypeError('A memory update or delete action, category and record id are required')
  }
  const input = { action, category, id }
  if (category === 'team') Object.assign(input, teamScope(body))
  if (action === 'update') {
    if (category === 'private') {
      if (typeof body.credentialRef !== 'string' || !body.credentialRef.trim()) throw new TypeError('A credential reference name is required')
      input.credentialRef = body.credentialRef
    } else {
      if (typeof body.content !== 'string' || !body.content.trim()) throw new TypeError('Memory content is required')
      input.content = body.content
    }
  }
  return input
}

export function createMemoryPanelHandler(connection, panel = createMemoryPanel()) {
  return async (req, res) => {
    const admission = connection.admit(req)
    if ('rejection' in admission || admission.peer.principal.kind !== 'owner') {
      res.writeHead(admission.rejection ?? 403, { 'cache-control': 'no-store' }).end()
      return
    }
    if (req.method === 'GET') {
      try {
        const view = await panel.list()
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify({
          total: view.records.length, records: view.records, injection: view.injection,
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
    let input
    try {
      input = mutation(body)
    } catch (error) {
      fail(res, 400, error.message)
      return
    }
    try {
      if (input.action === 'update') {
        const record = await panel.update(input)
        if (!record) return fail(res, 404, 'Memory record not found')
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify({ record }))
        return
      }
      if (!await panel.delete(input)) return fail(res, 404, 'Memory record not found')
      res.writeHead(200, JSON_HEADERS).end(JSON.stringify({ deleted: input.id }))
    } catch (error) {
      fail(res, error instanceof TypeError ? 400 : 409, error instanceof Error ? error.message : String(error))
    }
  }
}
