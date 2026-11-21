import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const root = await mkdtemp(join(tmp, 'review-'))
const home = join(root, 'home')
await mkdir(home)
const originalHome = process.env.HOME
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(root, { recursive: true, force: true })
})

const { createTask, readTask } = await import('../src/task-store.js')
const { createReviewTool } = await import('../src/review.js')
const { claimHelper, registerReadOnlyGuard } = await import('../src/helper-guard.js')

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

async function setupRepo() {
  const repo = await mkdtemp(join(root, 'repo-'))
  git(repo, ['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(repo, ['add', 'notes.txt'])
  git(repo, ['commit', '-m', 'initial'])
  const baseCommit = git(repo, ['rev-parse', 'HEAD'])
  await writeFile(join(repo, 'notes.txt'), 'updated\n')
  git(repo, ['commit', '-am', 'change notes'])
  const head = git(repo, ['rev-parse', 'HEAD'])
  return { repo, baseCommit, head }
}

function harness({ baseCommit, head, evidence = 'diff' }) {
  const activations = []
  const ctx = {
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv: [command, ...args], cwd, env }) {
        const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
        return {
          done: Promise.resolve({ exitCode: result.status }),
          collected: { stdout: { readFrom: () => ({ text: result.stdout ?? '', lossy: false }) } },
        }
      },
    },
    subagents: {
      async startActivation(spec) {
        activations.push(spec)
        const claim = claimHelper(spec.parent.session.id)
        assert.ok(claim, 'review must claim its helper')
        const listeners = []
        const reviewer = {
          id: 'reviewer',
          session: { id: 'reviewer', append() {} },
          ctx: {
            get: name => name === 'shell' ? { sandboxMode: 'workspace-write' }
              : name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'read-only' }) }
              : undefined,
            tools: { guard() {} },
            on(name, fn) { if (name === 'session/event') listeners.push(fn) },
          },
        }
        registerReadOnlyGuard(reviewer, claim.scope)
        const emit = event => { for (const listener of listeners) listener(reviewer.session, event) }
        const call = (callId, name, input) => ({
          type: 'tool/call', data: { callId, name, arguments: JSON.stringify(input) },
        })
        const result = callId => ({ type: 'tool/result', data: { message: { toolCallId: callId, isError: false } } })
        if (evidence === 'diff') {
          emit(call('diff', 'bash', { command: `git diff ${baseCommit}..${head}` }))
          emit(result('diff'))
        } else if (evidence === 'file') {
          emit(call('read', 'read', { file_path: 'notes.txt' }))
          emit(result('read'))
        }
        return {
          childId: 'reviewer',
          result: Promise.resolve({ stopReason: 'completed', structured: { approved: true, findings: 'The change is correct.' } }),
        }
      },
    },
  }
  return { ctx, activations }
}

let nextId = 0
async function fixture(options) {
  const { repo, baseCommit, head } = await setupRepo()
  const id = (++nextId).toString(16).padStart(16, '0')
  const worker = { id: `worker-${id}`, session: { id: `worker-${id}` } }
  await createTask({
    id,
    title: 'Change notes',
    teamId: `review-team-${id}`,
    task: 'Update notes',
    parentSessionId: 'router',
    projectRoot: repo,
    baseCommit,
    baseBranch: 'main',
    workerSessionId: worker.id,
    status: 'running',
    createdAt: new Date().toISOString(),
    worktree: { path: repo, branch: 'main' },
  })
  const { ctx, activations } = harness({ baseCommit, head, ...options })
  return { id, repo, baseCommit, head, worker, activations, review: createReviewTool(ctx, worker, id) }
}

test('the reviewer prompt carries scope and the worktree instead of the diff', async () => {
  const { id, repo, baseCommit, head, worker, activations, review } = await fixture({})
  const result = await review.execute({}, { agent: worker, signal: new AbortController().signal })
  assert.match(result, /^Approved for /)

  assert.equal(activations.length, 1)
  assert.equal(activations[0].cwd, repo)
  const text = activations[0].prompt[0].text
  assert.ok(text.includes(repo), 'worktree path is in the prompt')
  assert.ok(text.includes(baseCommit), 'base commit is in the prompt')
  assert.ok(text.includes(head), 'head commit is in the prompt')
  assert.match(text, /Read it yourself/)
  assert.match(text, /only commits/)
  assert.match(text, /cite the file and line/)
  assert.doesNotMatch(text, /diff --git/, 'no patch header is inlined')
  assert.doesNotMatch(text, /\+updated/, 'no patch body is inlined')
  assert.doesNotMatch(text, /"patch"/, 'no patch field is inlined')
  assert.equal((await readTask(id)).review.head, head)
  assert.equal((await readTask(id)).review.reviewerSessionId, 'reviewer')
  assert.equal((await readTask(id)).review.approved, true)
})

test('a verdict without reading the change is rejected', async () => {
  const { id, worker, review } = await fixture({ evidence: 'none' })
  await assert.rejects(
    review.execute({}, { agent: worker, signal: new AbortController().signal }),
    /did not inspect the committed change/,
  )
  assert.equal((await readTask(id)).review, undefined)
})

test('reading a changed file counts as evidence', async () => {
  const { id, head, worker, review } = await fixture({ evidence: 'file' })
  assert.match(await review.execute({}, { agent: worker, signal: new AbortController().signal }), /^Approved for /)
  assert.equal((await readTask(id)).review.head, head)
})
