import { listTasks } from './task-store.js'

export function createBoardHandler(connection, agents, tasks = listTasks) {
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
    const rows = records.map(({ id, title, teamId, projectRoot, status, workerSessionId, parentSessionId, updatedAt, createdAt, prUrl }) => ({
      id, title, teamId, projectRoot, workerSessionId, parentSessionId, prUrl,
      updatedAt: updatedAt ?? createdAt,
      status: ['starting', 'running', 'resuming'].includes(status) && !agents.get(workerSessionId) ? 'unconfirmed' : status,
    }))
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(JSON.stringify({ tasks: rows }))
  }
}
