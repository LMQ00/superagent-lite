import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'review-limit-home-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))

const { createTask, readTask } = await import('../src/task-store.js')
const { createReviewTool } = await import('../src/review.js')

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function harness() {
  const spawns = []
  const activations = []
  const ctx = {
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv, cwd, env, stdio }) {
        spawns.push({ argv, stdio })
        const [command, ...args] = argv
        const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
        const stdout = result.stdout ?? ''
        const lossy = Buffer.byteLength(stdout) > stdio.stdout.maxBytes
        const text = lossy ? stdout.slice(-stdio.stdout.maxBytes) : stdout
        return { done: Promise.resolve({ exitCode: result.status }), collected: { stdout: { readFrom: () => ({ text, lossy }) } } }
      },
    },
    subagents: {
      async startActivation(spec) {
        activations.push(spec)
        return {
          childId: 'reviewer',
          result: Promise.resolve({ stopReason: 'completed', structured: { approved: true, findings: 'The change is correct.' } }),
        }
      },
    },
  }
  return { ctx, spawns, activations }
}

test('the review diff uses 262144 bytes, drops --binary, and reaches the reviewer past 65536', async (t) => {
  const root = await mkdtemp(join(tmp, 'review-limit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const repo = join(root, 'repo')
  await mkdir(repo)
  git(repo, ['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(repo, ['add', 'notes.txt'])
  git(repo, ['commit', '-m', 'initial'])
  const baseCommit = git(repo, ['rev-parse', 'HEAD'])
  await writeFile(join(repo, 'notes.txt'), 'updated\n')
  await writeFile(join(repo, 'large.txt'), 'line\n'.repeat(20000))
  git(repo, ['add', 'notes.txt', 'large.txt'])
  git(repo, ['commit', '-m', 'large update'])
  assert.ok(Buffer.byteLength(git(repo, ['diff', '--no-ext-diff', '--no-textconv', baseCommit, 'HEAD', '--'])) > 65536)

  const taskId = '0123456789abcdef'
  await createTask({
    id: taskId,
    title: 'Review a large diff',
    teamId: 'review-limit',
    task: 'Add a large file',
    parentSessionId: 'router',
    projectRoot: repo,
    baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker-review-limit',
    status: 'running',
    createdAt: new Date().toISOString(),
    worktree: { path: repo, branch: 'main' },
  })

  const { ctx, spawns, activations } = harness()
  const worker = { id: 'worker-review-limit', session: { id: 'worker-review-limit' } }
  const review = createReviewTool(ctx, worker, taskId)
  const result = await review.execute({}, { agent: worker, signal: new AbortController().signal })

  assert.match(result, /^Approved for /)
  assert.equal(activations.length, 1)
  assert.match(activations[0].prompt[0].text, /"patch":"diff --git a\/large\.txt b\/large\.txt/)
  assert.equal((await readTask(taskId)).review.approved, true)

  const diffCall = spawns.find(({ argv }) => argv.includes('diff'))
  assert.ok(diffCall)
  assert.equal(diffCall.stdio.stdout.maxBytes, 262144)
  assert.equal(diffCall.stdio.stderr.maxBytes, 262144)
  assert.ok(!diffCall.argv.includes('--binary'))
  for (const { argv, stdio } of spawns.filter(call => call !== diffCall)) {
    assert.equal(stdio.stdout.maxBytes, 65536, argv.join(' '))
    assert.equal(stdio.stderr.maxBytes, 65536, argv.join(' '))
  }
})
