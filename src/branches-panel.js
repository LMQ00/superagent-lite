import { isAbsolute } from 'node:path'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const KINDS = new Set(['worktree', 'branch', 'worktree-and-branch'])
const WORK_BRANCH = /^sl-[A-Za-z0-9._/-]{1,200}$/

function fail(res, status, message) {
  res.writeHead(status, JSON_HEADERS).end(JSON.stringify({ error: message }))
}

// The branch tab lists and deletes only the Worktrees this plugin created under
// .agents/worktrees and the sl-* worker branches. Other branches and worktrees
// stay invisible and undeletable. A Worktree and its branch can be removed in
// one step; removing only the Worktree keeps the branch.
export function createBranchesPanelHandler(connection, {
  list,
  removeWorktree,
  removeWorktreeAndBranch,
  removeBranch,
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
    if (req.method === 'GET') {
      try {
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify({ branches: await list(AbortSignal.timeout(30_000)) }))
      } catch (error) {
        fail(res, 409, error instanceof Error ? error.message : String(error))
      }
      return
    }
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams
    const kind = params.get('kind')
    if (!KINDS.has(kind)) {
      fail(res, 400, 'A known delete kind is required')
      return
    }
    const projectRoot = params.get('projectRoot')
    if (!projectRoot || !isAbsolute(projectRoot) || projectRoot.includes('\0')) {
      fail(res, 400, 'An absolute project root is required')
      return
    }
    const branch = params.get('branch')
    if (!WORK_BRANCH.test(branch ?? '')) {
      fail(res, 400, 'A worker branch name is required')
      return
    }
    const path = params.get('path')
    if (kind !== 'branch' && (!path || !isAbsolute(path) || path.includes('\0'))) {
      fail(res, 400, 'An absolute worktree path is required')
      return
    }
    const signal = AbortSignal.timeout(30_000)
    try {
      const result = kind === 'worktree'
        ? await removeWorktree({ projectRoot, branch, path }, signal)
        : kind === 'branch'
          ? await removeBranch({ projectRoot, branch }, signal)
          : await removeWorktreeAndBranch({ projectRoot, branch, path }, signal)
      res.writeHead(200, JSON_HEADERS).end(JSON.stringify(result))
    } catch (error) {
      fail(res, 409, error instanceof Error ? error.message : String(error))
    }
  }
}
