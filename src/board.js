import { listTasks } from './task-store.js'
import { panelStatus } from './status.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }

export function createBoardHandler(connection, agents, tasks = listTasks, git) {
  return async (req, res) => {
    const admission = connection.admit(req)
    if ('rejection' in admission || admission.peer.principal.kind !== 'owner') {
      res.writeHead(admission.rejection ?? 403, { 'cache-control': 'no-store' }).end()
      return
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET' }).end()
      return
    }
    const records = await tasks()
    const views = git ? await git.list(records, AbortSignal.timeout(30_000)).catch(() => undefined) : undefined
    const rows = records.map(({ id, title, teamId, projectRoot, mode, status, workerSessionId, parentSessionId, updatedAt, createdAt, prUrl, failure }) => {
      const view = views?.get(id)
      const unconfirmed = ['starting', 'running', 'resuming'].includes(status) && !agents.get(workerSessionId)
      const row = {
        id, title, teamId, projectRoot, mode, workerSessionId, parentSessionId, prUrl,
        updatedAt: updatedAt ?? createdAt,
        status: view?.status ?? panelStatus({ status, mode }, {}),
        ...(unconfirmed ? { unconfirmed: true } : {}),
        ...(typeof failure === 'string' && failure ? { failure } : {}),
      }
      return view?.git ? { ...row, git: view.git } : row
    })
    res.writeHead(200, JSON_HEADERS)
    res.end(JSON.stringify({ tasks: rows }))
  }
}

async function readJsonBody(request, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) {
      const error = new Error('Request body is too large')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Invalid JSON body')
    error.status = 400
    throw error
  }
}

const ACTIONS = new Set(['merge', 'publish', 'review', 'delete-branch'])

export function createGitActionHandler(connection, git) {
  return async (req, res) => {
    const admission = connection.admit(req)
    if ('rejection' in admission || admission.peer.principal.kind !== 'owner') {
      res.writeHead(admission.rejection ?? 403, { 'cache-control': 'no-store' }).end()
      return
    }
    if (req.method === 'GET') {
      const taskId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('taskId')
      if (!/^[a-f0-9]{16}$/.test(taskId ?? '')) {
        res.writeHead(400, { 'cache-control': 'no-store' }).end(JSON.stringify({ error: 'A task ID is required' }))
        return
      }
      try {
        const detail = await git.detail(taskId, AbortSignal.timeout(30_000))
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify(detail))
      } catch (error) {
        res.writeHead(error?.status === 404 ? 404 : 409, JSON_HEADERS)
          .end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
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
      body = await readJsonBody(req, 4096)
    } catch (error) {
      res.writeHead(error.status ?? 400, { 'cache-control': 'no-store' }).end(JSON.stringify({ error: error.message }))
      return
    }
    const target = typeof body?.target === 'string' ? body.target.trim() : undefined
    const remote = typeof body?.remote === 'string' ? body.remote.trim() : undefined
    const validTarget = body?.action === 'merge' ? Boolean(target && target.length <= 200) : true
    const validRemote = body?.action === 'publish' ? Boolean(remote && remote.length <= 200) : true
    if (typeof body?.taskId !== 'string' || !/^[a-f0-9]{16}$/.test(body.taskId) ||
        !ACTIONS.has(body.action) || !validTarget || !validRemote) {
      res.writeHead(400, { 'cache-control': 'no-store' }).end(JSON.stringify({
        error: body?.action === 'merge' ? 'A task ID and a merge target branch are required'
          : body?.action === 'publish' ? 'A task ID and a remote are required'
            : 'A task ID and a known action are required',
      }))
      return
    }
    try {
      const result = await git.perform(body.taskId, body.action, { target, remote }, AbortSignal.timeout(15 * 60_000))
      res.writeHead(200, JSON_HEADERS).end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(409, JSON_HEADERS).end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    }
  }
}
