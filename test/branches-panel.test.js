import assert from 'node:assert/strict'
import test from 'node:test'
import { createBranchesPanelHandler } from '../src/branches-panel.js'

const owner = () => ({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) })

async function request(handler, method = 'GET', url = '/superagent-lite/branches') {
  const result = {}
  const response = {
    writeHead(status, headers) { Object.assign(result, { status, headers }); return this },
    end(body) { result.body = body },
  }
  await handler({ method, headers: {}, url }, response)
  return result
}

test('the branches panel refuses non-owner requests without listing branches', async () => {
  for (const admission of [{ rejection: 401 }, { peer: { principal: { kind: 'guest' } } }]) {
    const handler = createBranchesPanelHandler({ admit: () => admission }, {
      list: async () => assert.fail('must not list branches'),
      removeWorktree: async () => assert.fail('must not remove a worktree'),
      removeBranch: async () => assert.fail('must not remove a branch'),
    })
    assert.equal((await request(handler)).status, admission.rejection ?? 403)
    assert.equal((await request(handler, 'DELETE',
      `/superagent-lite/branches?kind=branch&projectRoot=%2Fone&branch=sl-a`)).status, admission.rejection ?? 403)
  }
})

test('the branches panel lists the plugin objects for the owner', async () => {
  const calls = []
  const rows = [{ projectRoot: '/one', branch: 'sl-a', canDeleteBranch: true }]
  const handler = createBranchesPanelHandler(owner(), {
    list: async signal => {
      calls.push(signal)
      return rows
    },
  })
  const result = await request(handler)
  assert.equal(result.status, 200)
  assert.equal(result.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(result.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(result.body), { branches: rows })
  assert.equal(calls.length, 1)
  assert.equal(calls[0] instanceof AbortSignal, true)
  const failed = createBranchesPanelHandler(owner(), { list: async () => { throw new Error('Git is unavailable') } })
  assert.equal((await request(failed)).status, 409)
  assert.equal(JSON.parse((await request(failed)).body).error, 'Git is unavailable')
})

test('the branches panel accepts only GET and DELETE', async () => {
  const handler = createBranchesPanelHandler(owner(), { list: async () => [] })
  for (const method of ['POST', 'PUT', 'PATCH']) {
    const result = await request(handler, method)
    assert.equal(result.status, 405)
    assert.equal(result.headers.allow, 'GET, DELETE')
  }
})

test('the branches panel validates every delete target before touching Git', async () => {
  let touched = false
  const handler = createBranchesPanelHandler(owner(), {
    list: async () => [],
    removeWorktree: async () => { touched = true },
    removeBranch: async () => { touched = true },
  })
  const base = '/superagent-lite/branches'
  const urls = [
    `${base}?projectRoot=%2Fone&branch=sl-a`,
    `${base}?kind=tree&projectRoot=%2Fone&branch=sl-a`,
    `${base}?kind=branch&projectRoot=relative&branch=sl-a`,
    `${base}?kind=branch&branch=sl-a`,
    `${base}?kind=branch&projectRoot=%2Fone`,
    `${base}?kind=branch&projectRoot=%2Fone&branch=main`,
    `${base}?kind=branch&projectRoot=%2Fone&branch=feature`,
    `${base}?kind=worktree&projectRoot=%2Fone&branch=sl-a`,
    `${base}?kind=worktree&projectRoot=%2Fone&branch=sl-a&path=relative`,
  ]
  for (const url of urls) {
    const result = await request(handler, 'DELETE', url)
    assert.equal(result.status, 400, url)
    assert.equal(typeof JSON.parse(result.body).error, 'string')
  }
  assert.equal(touched, false)
})

test('the branches panel deletes a worktree and a branch through their own actions', async () => {
  const calls = []
  const handler = createBranchesPanelHandler(owner(), {
    removeWorktree: async (target, signal) => {
      calls.push(['worktree', target, signal instanceof AbortSignal])
      return { branch: target.branch, path: target.path, deleted: true, row: { branch: target.branch }, message: 'Worktree deleted' }
    },
    removeBranch: async (target, signal) => {
      calls.push(['branch', target, signal instanceof AbortSignal])
      return { branch: target.branch, deleted: true, message: 'Branch deleted' }
    },
  })
  const worktree = await request(handler, 'DELETE',
    `/superagent-lite/branches?kind=worktree&projectRoot=%2Fone&branch=sl-a&path=${encodeURIComponent('/one/.agents/worktrees/sl-a')}`)
  assert.equal(worktree.status, 200)
  assert.deepEqual(JSON.parse(worktree.body), { branch: 'sl-a', path: '/one/.agents/worktrees/sl-a', deleted: true, row: { branch: 'sl-a' }, message: 'Worktree deleted' })
  const branch = await request(handler, 'DELETE', `/superagent-lite/branches?kind=branch&projectRoot=%2Fone&branch=sl-b`)
  assert.equal(branch.status, 200)
  assert.deepEqual(JSON.parse(branch.body), { branch: 'sl-b', deleted: true, message: 'Branch deleted' })
  assert.deepEqual(calls, [
    ['worktree', { projectRoot: '/one', branch: 'sl-a', path: '/one/.agents/worktrees/sl-a' }, true],
    ['branch', { projectRoot: '/one', branch: 'sl-b' }, true],
  ])
})

test('the branches panel maps a refused delete to 409 without a partial success', async () => {
  const handler = createBranchesPanelHandler(owner(), {
    removeWorktree: async target => {
      assert.equal(target.path, '/one/.agents/worktrees/sl-a')
      throw new Error('The worker worktree has uncommitted changes')
    },
    removeBranch: async () => { throw new Error('The task is still running') },
  })
  const worktree = await request(handler, 'DELETE',
    `/superagent-lite/branches?kind=worktree&projectRoot=%2Fone&branch=sl-a&path=${encodeURIComponent('/one/.agents/worktrees/sl-a')}`)
  assert.equal(worktree.status, 409)
  assert.deepEqual(JSON.parse(worktree.body), { error: 'The worker worktree has uncommitted changes' })
  const branch = await request(handler, 'DELETE', `/superagent-lite/branches?kind=branch&projectRoot=%2Fone&branch=sl-a`)
  assert.equal(branch.status, 409)
  assert.deepEqual(JSON.parse(branch.body), { error: 'The task is still running' })
})
