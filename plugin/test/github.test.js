import assert from 'node:assert/strict'
import test from 'node:test'
import { deliverGithub, githubRepository } from '../src/github.js'

const head = 'a'.repeat(40)
const url = 'https://github.com/example/project/pull/7'
const task = { id: 'abcdef0123456789', title: 'Change', baseBranch: 'main', worktree: { path: '/fixture', branch: 'sl-feature' }, review: { head } }
const origin = { repo: 'example/project', pushUrl: 'https://github.com/example/project.git' }

function fixture(buckets, moved = false) {
  const calls = []
  let views = 0
  const ctx = { subprocess: {
    async resolveExecutable(name) { return name },
    spawn({ argv }) {
      calls.push(argv)
      const [, domain, action] = argv
      let output = ''
      if (domain === 'pr' && action === 'create') output = url
      if (domain === 'pr' && action === 'view') {
        ++views
        output = JSON.stringify({ headRefOid: moved && views === 2 ? 'b'.repeat(40) : head, headRefName: 'sl-feature', baseRefName: 'main', isCrossRepository: false, state: views === 3 ? 'MERGED' : 'OPEN' })
      }
      if (domain === 'pr' && action === 'checks' && argv.includes('--json')) output = JSON.stringify(buckets.map(bucket => ({ bucket })))
      return { done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { readFrom: () => ({ text: output, lossy: false }) } } }
    },
  } }
  return { ctx, calls }
}

test('strict GitHub origin parsing rejects credentials and alternate hosts', () => {
  assert.equal(githubRepository(origin.pushUrl), origin.repo)
  assert.equal(githubRepository('git@github.com:example/project.git'), origin.repo)
  for (const url of ['https://github.com.evil.test/example/project.git', 'https://secret@github.com/example/project.git', 'git@github.com:example/..']) {
    assert.equal(githubRepository(url), undefined)
  }
})

test('an exact reviewed PR merges only after at least one required check passes', async () => {
  const { ctx, calls } = fixture(['pass'])
  const states = []
  await deliverGithub(ctx, task, origin, new AbortController().signal, next => states.push(next.status))
  assert.deepEqual(states, ['awaiting-ci', 'merged'])
  const merge = calls.find(args => args[2] === 'merge')
  assert.ok(merge)
  assert.deepEqual(merge.slice(-2), ['--match-head-commit', head])
  assert.ok(calls.find(args => args.includes(`${head}:refs/heads/sl-feature`)))
})

test('absent checks, failed checks and moved PR heads all prevent the merge call', async () => {
  for (const [checks, moved] of [[[], false], [['pass', 'fail'], false], [['pass'], true]]) {
    const { ctx, calls } = fixture(checks, moved)
    await assert.rejects(deliverGithub(ctx, task, origin, new AbortController().signal, () => {}))
    assert.ok(!calls.some(args => args[2] === 'merge'))
  }
})
