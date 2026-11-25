import { listTasks, removeTask, STOPPABLE_STATUSES } from './task-store.js'
import { panelStatus } from './status.js'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const ACTIVE_DELIVERY = new Set(['merging', 'publishing'])
const TASK_ID = /^[a-f0-9]{16}$/

function taskIdFromQuery(req) {
  return new URL(req.url ?? '/', 'http://localhost').searchParams.get('taskId')
}

function jsonError(res, status, message) {
  res.writeHead(status, JSON_HEADERS).end(JSON.stringify({ error: message }))
}

export function createBoardHandler(connection, agents, tasks = listTasks, git, remove = removeTask, stop) {
  return async (req, res) => {
    const admission = connection.admit(req)
    if ('rejection' in admission || admission.peer.principal.kind !== 'owner') {
      res.writeHead(admission.rejection ?? 403, { 'cache-control': 'no-store' }).end()
      return
    }
    if (req.method === 'POST') {
      if (String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
        res.writeHead(415, { 'cache-control': 'no-store' }).end()
        return
      }
      let body
      try {
        body = await readJsonBody(req, 4096)
      } catch (error) {
        jsonError(res, error.status ?? 400, error.message)
        return
      }
      if (body?.action !== 'stop' || typeof body.taskId !== 'string' || !TASK_ID.test(body.taskId)) {
        jsonError(res, 400, 'A task ID and the stop action are required')
        return
      }
      const task = (await tasks()).find(record => record.id === body.taskId)
      if (!task) {
        jsonError(res, 404, 'Task not found')
        return
      }
      if (!STOPPABLE_STATUSES.has(task.status) && task.status !== 'cancelled') {
        jsonError(res, 409, 'The task has already finished')
        return
      }
      if (typeof stop !== 'function') {
        jsonError(res, 500, 'Stopping tasks is unavailable')
        return
      }
      try {
        const result = await stop(body.taskId)
        if (!result) {
          jsonError(res, 404, 'Task not found')
          return
        }
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify({
          stopped: result.task.id,
          status: 'cancelled',
          cancelled: true,
          ...(typeof result.task.cancelledAt === 'string' ? { cancelledAt: result.task.cancelledAt } : {}),
          ...(typeof result.task.updatedAt === 'string' ? { updatedAt: result.task.updatedAt } : {}),
        }))
      } catch (error) {
        jsonError(res, 409, error instanceof Error ? error.message : String(error))
      }
      return
    }
    if (req.method === 'DELETE') {
      const taskId = taskIdFromQuery(req)
      if (!TASK_ID.test(taskId ?? '')) {
        jsonError(res, 400, 'A task ID is required')
        return
      }
      const task = (await tasks()).find(record => record.id === taskId)
      if (!task) {
        jsonError(res, 404, 'Task not found')
        return
      }
      if (ACTIVE_DELIVERY.has(task.status)) {
        jsonError(res, 409, 'A merge or publication is in progress')
        return
      }
      if (STOPPABLE_STATUSES.has(task.status) || task.status === 'cancelled') {
        if (typeof stop !== 'function') {
          jsonError(res, 500, 'Stopping tasks is unavailable')
          return
        }
        try {
          // Deleting an active Task stops its worker first and waits for the
          // worker to become idle, so no record is removed under a live worker.
          const result = await stop(taskId, { waitForStop: true, notify: false })
          if (!result) {
            jsonError(res, 404, 'Task not found')
            return
          }
          if (result.ready === false) {
            jsonError(res, 409, 'The worker did not stop in time; stop the task again before deleting it')
            return
          }
        } catch (error) {
          jsonError(res, 409, error instanceof Error ? error.message : String(error))
          return
        }
      }
      if (agents.get?.(task.workerSessionId)?.status === 'running') {
        jsonError(res, 409, 'The worker is still running')
        return
      }
      try {
        if (!await remove(taskId)) {
          jsonError(res, 404, 'Task not found')
          return
        }
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify({ deleted: taskId }))
      } catch (error) {
        jsonError(res, 409, error instanceof Error ? error.message : String(error))
      }
      return
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET, POST, DELETE' }).end()
      return
    }
    const records = await tasks()
    const views = git ? await git.list(records, AbortSignal.timeout(30_000)).catch(() => undefined) : undefined
    const rows = records.map(record => {
      const { id, title, teamId, projectRoot, mode, status, workerSessionId, parentSessionId, updatedAt, createdAt, prUrl, failure, land, landAuthorizedAt } = record
      const view = views?.get(id)
      const unconfirmed = ['starting', 'running', 'resuming'].includes(status) && !agents.get(workerSessionId)
      const row = {
        id, title, teamId, projectRoot, mode, workerSessionId, parentSessionId, prUrl,
        land: land === true,
        updatedAt: updatedAt ?? createdAt,
        status: view?.status ?? panelStatus({ status, mode, report: record.report }, { reviewed: record.review?.approved === true }),
        ...(status === 'queued' ? { queued: true } : {}),
        ...(unconfirmed ? { unconfirmed: true } : {}),
        ...(STOPPABLE_STATUSES.has(status) ? { stoppable: true } : {}),
        ...(status === 'cancelled' ? { cancelled: true } : {}),
        deletable: !ACTIVE_DELIVERY.has(status),
        ...(land === true && typeof landAuthorizedAt === 'string' ? { landAuthorizedAt } : {}),
        ...(typeof failure === 'string' && failure ? { failure } : {}),
      }
      return view?.git ? { ...row, git: view.git } : row
    })
    res.writeHead(200, JSON_HEADERS)
    res.end(JSON.stringify({ tasks: rows }))
  }
}

export async function readJsonBody(request, limit) {
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
