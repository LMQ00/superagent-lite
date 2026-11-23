import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'dispatch-merge-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))

const { createDispatchTool } = await import('../src/dispatch.js')
const { createTask, readTask } = await import('../src/task-store.js')

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

async function repoFixture(name) {
  const repo = join(home, name)
  await mkdir(repo)
  git(repo, ['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'initial'])
  const baseCommit = git(repo, ['rev-parse', 'HEAD'])
  const branch = `sl-${name}-target`
  git(repo, ['switch', '-q', '-c', branch])
  await writeFile(join(repo, `${name}.txt`), 'target\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'target work'])
  git(repo, ['switch', '-q', 'main'])
  return { repo, baseCommit, branch }
}

function context(repo) {
  const activations = []
  const ctx = {
    workingDirectory: { get: () => repo },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) { activations.push(spec); return { childId: spec.childId } },
    },
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv, cwd, env }) {
        const [command, ...args] = argv
        const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
        return {
          done: Promise.resolve({ exitCode: result.status }),
          collected: {
            stdout: { readFrom: () => ({ text: result.stdout ?? '', lossy: false }) },
            stderr: { readFrom: () => ({ text: result.stderr ?? '', lossy: false }) },
          },
        }
      },
    },
  }
  return { ctx, activations }
}

const exec = (callId = 'call-merge') => ({ agent: { id: 'router', session: { id: 'router' } }, callId, signal: new AbortController().signal })

test('mode=merge resolves a task ID to its worker branch and dispatches a new merge worker', async () => {
  const facts = await repoFixture('by-task')
  const targetId = 'a4939a132f499bb4'
  await createTask({
    id: targetId,
    title: 'Delivered work',
    teamId: 'team-merge',
    task: 'deliver it',
    mode: 'change',
    land: true,
    parentSessionId: 'router',
    projectRoot: facts.repo,
    baseCommit: facts.baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker-target',
    worktree: { path: join(home, 'target-worktree'), branch: facts.branch },
    status: 'awaiting-merge',
    createdAt: new Date().toISOString(),
  })
  const { ctx, activations } = context(facts.repo)
  const result = await createDispatchTool(ctx).execute({
    mode: 'merge',
    title: 'Merge delivered branches',
    worktreeName: 'merge-delivered-branches',
    teamId: 'team-merge',
    task: 'Merge the delivered branches into master.',
    land: true,
    branches: [targetId],
  }, exec())
  assert.equal(result.delegated, true)
  assert.equal(result.mode, 'merge')
  const task = await readTask(result.taskId)
  assert.equal(task.mode, 'merge')
  assert.equal(task.land, true)
  assert.equal(task.landAuthorizedVia, 'dispatch')
  assert.deepEqual(task.mergeBranches, [facts.branch])
  assert.equal(activations.length, 1)
  assert.equal(activations[0].agentPreset, 'superagent-lite-worker')
  assert.match(activations[0].prompt[0].text, /Mode: merge/)
  assert.match(activations[0].prompt[0].text, new RegExp(`Merge targets \\(in this order\\):\\n- ${facts.branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
})

test('mode=merge accepts branch names and rejects missing targets or a missing authorization', async () => {
  const facts = await repoFixture('by-branch')
  const { ctx } = context(facts.repo)
  const dispatch = createDispatchTool(ctx)
  const base = { mode: 'merge', title: 'Merge', worktreeName: 'merge-branches', teamId: 'team-merge-branch', task: 'merge it', land: true }
  await assert.rejects(
    dispatch.execute({ ...base, land: false, branches: [facts.branch] }, exec('no-land')),
    /merge tasks require land=true/,
  )
  await assert.rejects(
    dispatch.execute({ ...base, branches: ['sl-does-not-exist'] }, exec('missing-branch')),
    /was not found/,
  )
  const record = await dispatch.execute({ ...base, branches: [facts.branch] }, exec('branch-ok'))
  assert.deepEqual((await readTask(record.taskId)).mergeBranches, [facts.branch])
})

test('mode=merge refuses a target task owned by another router or project', async () => {
  const facts = await repoFixture('foreign-task')
  await createTask({
    id: 'bbbbccccddddeeee',
    title: 'Foreign work',
    teamId: 'team-foreign-merge',
    task: 'deliver it',
    mode: 'change',
    parentSessionId: 'other-router',
    projectRoot: facts.repo,
    baseCommit: facts.baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker-foreign',
    worktree: { path: join(home, 'foreign-worktree'), branch: facts.branch },
    status: 'awaiting-merge',
    createdAt: new Date().toISOString(),
  })
  const { ctx } = context(facts.repo)
  await assert.rejects(
    createDispatchTool(ctx).execute({
      mode: 'merge',
      title: 'Merge',
      worktreeName: 'merge-foreign',
      teamId: 'team-foreign-merge',
      task: 'merge it',
      land: true,
      branches: ['bbbbccccddddeeee'],
    }, exec('foreign')),
    /does not belong to this router Session and project/,
  )
})
