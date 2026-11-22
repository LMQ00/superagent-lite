import assert from 'node:assert/strict'
import test from 'node:test'
import { githubRepository, publishGithub } from '../src/github.js'

const head = 'a'.repeat(40)
const oldHead = 'b'.repeat(40)
const url = 'https://github.com/example/project/pull/7'
const task = { id: 'abcdef0123456789', title: 'Change', baseBranch: 'main', worktree: { path: '/fixture', branch: 'sl-feature' }, review: { head } }
const origin = { repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }

function fixture({ existing = false, exact = true } = {}) {
  const calls = []
  const view = {
    url,
    state: 'OPEN',
    headRefOid: exact ? head : oldHead,
    headRefName: 'sl-feature',
    baseRefName: 'main',
    isCrossRepository: false,
  }
  const ctx = { subprocess: {
    async resolveExecutable(name) { return name },
    spawn({ argv }) {
      calls.push(argv)
      let output = ''
      let exitCode = 0
      let stderr = ''
      if (argv[0] === 'git') {
        if (argv.includes('push')) {
          view.headRefOid = head
        } else {
          exitCode = 1
        }
      } else {
        const [, domain, action, reference] = argv
        if (domain === 'auth') {
          // authenticated
        } else if (domain === 'pr' && action === 'view') {
          if (reference === 'sl-feature' && !existing) exitCode = 1
          else output = JSON.stringify(view)
        } else if (domain === 'pr' && action === 'create') {
          if (existing) exitCode = 1
          output = url
        }
      }
      return {
        done: Promise.resolve({ exitCode }),
        collected: {
          stdout: { readFrom: () => ({ text: output, lossy: false }) },
          stderr: { readFrom: () => ({ text: stderr, lossy: false }) },
        },
      }
    },
  } }
  return { ctx, calls, view }
}

test('strict GitHub origin parsing rejects credentials and alternate hosts', () => {
  assert.equal(githubRepository(origin.pushUrl), origin.repo)
  assert.equal(githubRepository('git@github.com:example/project.git'), origin.repo)
  for (const url of ['https://github.com.evil.test/example/project.git', 'https://secret@github.com/example/project.git', 'git@github.com:example/..']) {
    assert.equal(githubRepository(url), undefined)
  }
})

test('publishing pushes the reviewed head, creates a pull request and records it', async () => {
  const { ctx, calls } = fixture()
  const recorded = []
  const result = await publishGithub(ctx, task, origin, new AbortController().signal, next => recorded.push(next))
  assert.equal(result.state, 'OPEN')
  assert.equal(result.number, '7')
  assert.deepEqual(recorded, [{ status: 'awaiting-ci', prUrl: url, prState: 'OPEN' }])
  assert.ok(calls.some(args => args[0] === 'git' && args.includes(`${head}:refs/heads/sl-feature`)))
  assert.ok(calls.some(args => args[0] === 'gh' && args[2] === 'create'))
})

test('publishing reuses an exact pull request and pushes a moved head without a duplicate', async () => {
  const exactRun = fixture({ existing: true, exact: true })
  const recorded = []
  const exact = await publishGithub(exactRun.ctx, task, origin, new AbortController().signal, next => recorded.push(next))
  assert.deepEqual([exact.adopted, exact.url, ...recorded.map(value => value.status)], [true, url, 'awaiting-ci'])
  assert.ok(!exactRun.calls.some(args => args[0] === 'git' || (args[0] === 'gh' && args[2] === 'create')))
  const movedRun = fixture({ existing: true, exact: false })
  const moved = await publishGithub(movedRun.ctx, task, origin, new AbortController().signal)
  assert.equal(moved.url, url)
  assert.equal(movedRun.view.headRefOid, head)
  assert.ok(movedRun.calls.some(args => args[0] === 'git' && args.includes(`${head}:refs/heads/sl-feature`)))
  assert.ok(!movedRun.calls.some(args => args[0] === 'gh' && args[2] === 'create'))
})
