import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'dispatch-remove-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))
beforeEach(async () => {
  for (const task of await listTasks()) await removeTask(task.id)
})

const { createDispatchTool } = await import('../src/dispatch.js')
const { createTask, listTasks, readTask, removeTask } = await import('../src/task-store.js')

function git(cwd, args, allowFailure = false) {
  const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
  if (!allowFailure) assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

async function repoFixture(name) {
  const repo = join(home, name)
  await mkdir(repo)
  git(repo, ['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'initial'])
  return repo
}

async function worktreeFixture(repo, branch) {
  const path = join(repo, '.agents', 'worktrees', branch)
  await mkdir(join(repo, '.agents', 'worktrees'), { recursive: true })
  git(repo, ['worktree', 'add', '-q', '-b', branch, path])
  await writeFile(join(path, 'work.txt'), 'work\n')
  git(path, ['add', '.'])
  git(path, ['commit', '-m', 'work'])
  return path
}

function context(repo) {
  const activations = []
  const ctx = {
    workingDirectory: { get: () => repo },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    agents: { get: () => undefined, list: () => [] },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) { activations.push(spec); return { childId: spec.childId } },
      async sendMessage() {},
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

const exec = (callId = 'remove') => ({ agent: { id: 'router', session: { id: 'router' } }, callId, signal: new AbortController().signal })

async function taskFor(id, repo, branch, path, status = 'awaiting-merge', projectRoot = repo) {
  await createTask({
    id,
    title: 'Remove a worker branch',
    teamId: `team-${id}`,
    task: 'remove it',
    mode: 'change',
    land: false,
    parentSessionId: 'router',
    projectRoot,
    baseCommit: git(repo, ['rev-parse', 'HEAD']),
    baseBranch: 'main',
    workerSessionId: 'worker',
    worktree: { path, branch },
    status,
    createdAt: new Date().toISOString(),
  })
}

test('mode=remove deletes a task worktree and branch without starting a worker or task', async () => {
  const repo = await repoFixture('by-task')
  const branch = 'sl-remove-by-task'
  const worktree = await worktreeFixture(repo, branch)
  const taskId = '1111111111111111'
  await taskFor(taskId, repo, branch, worktree)
  const { ctx, activations } = context(repo)
  const tool = createDispatchTool(ctx)
  const before = await listTasks()

  const result = await tool.execute({ mode: 'remove', branches: [taskId] }, exec())

  assert.deepEqual(result, {
    delegated: false,
    mode: 'remove',
    removedBranches: [branch],
    removedWorktrees: [worktree],
  })
  assert.equal(activations.length, 0)
  assert.equal((await listTasks()).length, before.length)
  const task = await readTask(taskId)
  assert.equal(task.worktree, undefined)
  assert.equal(typeof task.branchDeletedAt, 'string')
  assert.notEqual(git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], true).status, 0)
  assert.equal(git(repo, ['worktree', 'list', '--porcelain']).includes(worktree), false)
  assert.equal(existsSync(worktree), false)
  assert.match(tool.output.render({}, result)[0].text, /Removed branch sl-remove-by-task and worktree/)
})

test('mode=remove resolves a branch name to its task record and records the deletion there', async () => {
  const repo = await repoFixture('branch-with-task')
  const branch = 'sl-remove-branch-with-task'
  const worktree = await worktreeFixture(repo, branch)
  const taskId = '4444444444444444'
  await taskFor(taskId, repo, branch, worktree)
  const { ctx } = context(repo)

  const result = await createDispatchTool(ctx).execute({ mode: 'remove', branches: [branch] }, exec('branch-task'))

  assert.deepEqual(result.removedBranches, [branch])
  assert.deepEqual(result.removedWorktrees, [worktree])
  const task = await readTask(taskId)
  assert.equal(task.worktree, undefined)
  assert.equal(typeof task.branchDeletedAt, 'string')
})

test('mode=remove accepts a branch name and is idempotent when the branch is already gone', async () => {
  const repo = await repoFixture('by-branch')
  const branch = 'sl-remove-by-branch'
  const worktree = await worktreeFixture(repo, branch)
  const { ctx } = context(repo)
  const tool = createDispatchTool(ctx)

  const result = await tool.execute({ mode: 'remove', branches: [branch] }, exec('branch'))
  assert.deepEqual(result.removedBranches, [branch])
  assert.deepEqual(result.removedWorktrees, [worktree])
  assert.equal(existsSync(worktree), false)

  const again = await tool.execute({ mode: 'remove', branches: [branch] }, exec('branch-again'))
  assert.deepEqual(again, { delegated: false, mode: 'remove', removedBranches: [], removedWorktrees: [] })
  assert.match(tool.output.render({}, again)[0].text, /No worker branch or worktree was left to remove/)
})

test('mode=remove refuses the base branch, a running task, a dirty worktree, and an unrelated branch', async () => {
  const repo = await repoFixture('safety')
  const { ctx } = context(repo)
  const tool = createDispatchTool(ctx)

  await assert.rejects(tool.execute({ mode: 'remove', branches: ['main'] }, exec('base')), /base branch.*cannot be removed/)

  const runningBranch = 'sl-remove-running'
  const runningPath = await worktreeFixture(repo, runningBranch)
  const runningId = '2222222222222222'
  await taskFor(runningId, repo, runningBranch, runningPath, 'running')
  await assert.rejects(tool.execute({ mode: 'remove', branches: [runningId] }, exec('running')), /still running/)
  assert.equal(existsSync(runningPath), true)

  const dirtyBranch = 'sl-remove-dirty'
  const dirtyPath = await worktreeFixture(repo, dirtyBranch)
  await writeFile(join(dirtyPath, 'uncommitted.txt'), 'dirty\n')
  await assert.rejects(tool.execute({ mode: 'remove', branches: [dirtyBranch] }, exec('dirty')), /uncommitted changes/)
  assert.equal(existsSync(dirtyPath), true)

  git(repo, ['branch', 'feature-unrelated', 'main'])
  await assert.rejects(tool.execute({ mode: 'remove', branches: ['feature-unrelated'] }, exec('unrelated')), /not a worker branch created by this plugin/)
})

test('mode=remove rejects a task from another project and a non-git folder', async () => {
  const repo = await repoFixture('ownership')
  const other = await repoFixture('other-project')
  const branch = 'sl-remove-other'
  const worktree = await worktreeFixture(other, branch)
  const taskId = '3333333333333333'
  await taskFor(taskId, other, branch, worktree, 'awaiting-merge', other)
  const { ctx } = context(repo)
  const tool = createDispatchTool(ctx)

  await assert.rejects(tool.execute({ mode: 'remove', branches: [taskId] }, exec('other')), /does not belong to this project/)

  const folder = await mkdtemp(join(tmpdir(), 'superagent-lite-not-git-'))
  try {
    const outside = createDispatchTool(context(folder).ctx)
    await assert.rejects(outside.execute({ mode: 'remove', branches: ['sl-anything'] }, exec('non-git')), /requires a git repository/)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
