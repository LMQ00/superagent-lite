import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'dispatch-merge-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))
beforeEach(async () => {
  for (const task of await listTasks()) await removeTask(task.id)
})

const { createDispatchTool } = await import('../src/dispatch.js')
const { createTask, listTasks, readTask, removeTask } = await import('../src/task-store.js')

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

function context(repo, { sendMessage, liveWorker } = {}) {
  const activations = []
  const sends = []
  const ctx = {
    workingDirectory: { get: () => repo },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    agents: { get: id => liveWorker === undefined || liveWorker.has(id) ? { status: 'running' } : undefined },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) { activations.push(spec); return { childId: spec.childId } },
      async sendMessage(sender, targetId, content, options) {
        if (sendMessage) await sendMessage(sender, targetId, content, options)
        sends.push({ sender: sender.id, targetId, content, text: content[0].text })
      },
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
  return { ctx, activations, sends }
}

function addBranch(repo, name) {
  git(repo, ['switch', '-q', '-c', name, 'main'])
  git(repo, ['commit', '--allow-empty', '-m', name])
  git(repo, ['switch', '-q', 'main'])
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

test('mode=merge appends a new request to a running merge worker instead of dispatching another', async () => {
  const facts = await repoFixture('append-running')
  const extra = 'sl-append-running-extra'
  addBranch(facts.repo, extra)
  const mergeId = '1111111111111111'
  await createTask({
    id: mergeId,
    title: 'Merge the delivered branch',
    teamId: 'team-append',
    task: 'Merge the delivered branch into main.',
    mode: 'merge',
    land: true,
    landAuthorizedAt: new Date().toISOString(),
    landAuthorizedVia: 'dispatch',
    mergeBranches: [facts.branch],
    parentSessionId: 'router',
    projectRoot: facts.repo,
    baseCommit: facts.baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker-merge',
    status: 'running',
    createdAt: new Date().toISOString(),
  })
  const { ctx, activations, sends } = context(facts.repo)
  const result = await createDispatchTool(ctx).execute({
    mode: 'merge',
    title: 'Merge the extra branch',
    worktreeName: 'merge-append-extra',
    teamId: 'team-append',
    task: 'Also merge the extra branch.',
    land: true,
    branches: [extra],
  }, exec('append-running-call'))
  assert.equal(result.appended, true)
  assert.equal(result.taskId, mergeId)
  assert.equal(result.workerSessionId, 'worker-merge')
  assert.equal(result.status, 'running')
  assert.equal(activations.length, 0)
  assert.equal(sends.length, 1)
  assert.equal(sends[0].sender, 'router')
  assert.equal(sends[0].targetId, 'worker-merge')
  assert.match(sends[0].text, /appended to this running merge task/)
  assert.match(sends[0].text, /Call merge_branch for each added target/)
  assert.ok(sends[0].text.includes(`- ${extra}`))
  assert.match(sends[0].text, /Landing is authorized for this task/)
  const task = await readTask(mergeId)
  assert.deepEqual(task.mergeBranches, [facts.branch, extra])
  assert.equal(task.followUps.length, 1)
  assert.equal(task.followUps[0].text, 'Also merge the extra branch.')
  assert.equal(task.land, true)
  assert.equal(task.status, 'running')
})

test('mode=merge appends images to the running merge worker message', async () => {
  const facts = await repoFixture('append-images')
  const extra = 'sl-append-images-extra'
  addBranch(facts.repo, extra)
  const imagePath = join(home, 'append-screenshot.png')
  await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]))
  const mergeId = '3333333333333333'
  await createTask({
    id: mergeId,
    title: 'Merge the delivered branch',
    teamId: 'team-append-images',
    task: 'Merge the delivered branch into main.',
    mode: 'merge',
    land: true,
    mergeBranches: [facts.branch],
    parentSessionId: 'router',
    projectRoot: facts.repo,
    baseCommit: facts.baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker-merge-images',
    status: 'running',
    createdAt: new Date().toISOString(),
  })
  const { ctx, activations, sends } = context(facts.repo)
  const saved = []
  ctx.attachments = {
    imageLimits: { maxImagesPerMessage: 20, maxMessageImageBytes: 1_000_000 },
    async saveImage(input) {
      saved.push(input)
      return { attachmentId: `sha256:${'c'.repeat(64)}`, mediaType: input.mediaType, bytes: input.data.byteLength, width: 1, height: 1, name: input.name }
    },
  }
  const result = await createDispatchTool(ctx).execute({
    mode: 'merge',
    title: 'Merge the extra branch',
    worktreeName: 'merge-append-images',
    teamId: 'team-append-images',
    task: 'Also merge the extra branch.',
    land: true,
    branches: [extra],
    images: [imagePath],
  }, exec('append-images-call'))
  assert.equal(result.appended, true)
  assert.equal(activations.length, 0)
  assert.equal(saved.length, 1)
  assert.equal(sends.length, 1)
  assert.equal(sends[0].content[0].type, 'text')
  assert.equal(sends[0].content[1].type, 'image')
  assert.equal(sends[0].content[1].attachment.name, 'append-screenshot.png')
})

test('mode=merge records a repeated target once and still delivers the appended request', async () => {
  const facts = await repoFixture('append-repeat')
  const mergeId = '2222222222222222'
  await createTask({
    id: mergeId,
    title: 'Merge the delivered branch',
    teamId: 'team-append-repeat',
    task: 'Merge the delivered branch into main.',
    mode: 'merge',
    land: true,
    mergeBranches: [facts.branch],
    parentSessionId: 'router',
    projectRoot: facts.repo,
    baseCommit: facts.baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker-merge-repeat',
    status: 'starting',
    createdAt: new Date().toISOString(),
  })
  const { ctx, activations, sends } = context(facts.repo)
  const result = await createDispatchTool(ctx).execute({
    mode: 'merge',
    title: 'Merge it again',
    worktreeName: 'merge-append-repeat',
    teamId: 'team-append-repeat',
    task: 'Keep going after the conflict.',
    land: true,
    branches: [facts.branch],
  }, exec('append-repeat-call'))
  assert.equal(result.appended, true)
  assert.equal(result.taskId, mergeId)
  assert.equal(activations.length, 0)
  assert.equal(sends.length, 1)
  assert.match(sends[0].text, /No target was added; do not merge another branch/)
  const task = await readTask(mergeId)
  assert.deepEqual(task.mergeBranches, [facts.branch])
  assert.equal(task.followUps[0].text, 'Keep going after the conflict.')
})

test('mode=merge starts a new merge worker when the recorded merge task is no longer running', async () => {
  const facts = await repoFixture('settled-merge')
  const extra = 'sl-settled-merge-extra'
  addBranch(facts.repo, extra)
  const settledId = '3333333333333333'
  await createTask({
    id: settledId,
    title: 'Merge the delivered branch',
    teamId: 'team-settled',
    task: 'Merge the delivered branch into main.',
    mode: 'merge',
    land: true,
    mergeBranches: [facts.branch],
    parentSessionId: 'router',
    projectRoot: facts.repo,
    baseCommit: facts.baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker-settled',
    status: 'review-required',
    createdAt: new Date().toISOString(),
  })
  const { ctx, activations, sends } = context(facts.repo)
  const result = await createDispatchTool(ctx).execute({
    mode: 'merge',
    title: 'Merge the extra branch',
    worktreeName: 'merge-extra-branch',
    teamId: 'team-settled',
    task: 'Merge the extra branch.',
    land: true,
    branches: [extra],
  }, exec('settled-merge-call'))
  assert.equal(result.appended, undefined)
  assert.notEqual(result.taskId, settledId)
  assert.equal(activations.length, 1)
  assert.equal(sends.length, 0)
  assert.deepEqual((await readTask(result.taskId)).mergeBranches, [extra])
  const settled = await readTask(settledId)
  assert.deepEqual(settled.mergeBranches, [facts.branch])
  assert.equal(settled.followUps, undefined)
})

test('concurrent merge requests append to one merge worker instead of racing another', async () => {
  const facts = await repoFixture('concurrent-merge')
  const first = 'sl-concurrent-merge-first'
  const second = 'sl-concurrent-merge-second'
  addBranch(facts.repo, first)
  addBranch(facts.repo, second)
  const { ctx, activations, sends } = context(facts.repo, {
    sendMessage: async () => { await new Promise(resolve => setTimeout(resolve, 5)) },
  })
  const dispatch = createDispatchTool(ctx)
  const base = { mode: 'merge', title: 'Merge concurrent', worktreeName: 'merge-concurrent', teamId: 'team-concurrent', task: 'Merge the requested branches.', land: true }
  const [left, right] = await Promise.all([
    dispatch.execute({ ...base, branches: [first] }, exec('concurrent-left')),
    dispatch.execute({ ...base, branches: [second] }, exec('concurrent-right')),
  ])
  assert.equal(activations.length, 1)
  assert.equal(sends.length, 1)
  assert.equal(left.taskId, right.taskId)
  assert.equal([left.appended, right.appended].filter(Boolean).length, 1)
  const task = await readTask(left.taskId)
  assert.deepEqual([...task.mergeBranches].sort(), [first, second].sort())
  assert.equal(task.followUps.length, 1)
})

test('a failed append delivery rolls back the added target and follow-up', async () => {
  const facts = await repoFixture('append-failure')
  const extra = 'sl-append-failure-extra'
  addBranch(facts.repo, extra)
  const mergeId = '4444444444444444'
  await createTask({
    id: mergeId,
    title: 'Merge the delivered branch',
    teamId: 'team-append-failure',
    task: 'Merge the delivered branch into main.',
    mode: 'merge',
    land: true,
    mergeBranches: [facts.branch],
    parentSessionId: 'router',
    projectRoot: facts.repo,
    baseCommit: facts.baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker-merge-failure',
    status: 'running',
    createdAt: new Date().toISOString(),
  })
  const { ctx } = context(facts.repo, {
    sendMessage: async () => { throw new Error('worker is gone') },
  })
  await assert.rejects(
    createDispatchTool(ctx).execute({
      mode: 'merge',
      title: 'Merge the extra branch',
      worktreeName: 'merge-append-failure',
      teamId: 'team-append-failure',
      task: 'Merge the extra branch.',
      land: true,
      branches: [extra],
    }, exec('append-failure-call')),
    /worker is gone/,
  )
  const task = await readTask(mergeId)
  assert.deepEqual(task.mergeBranches, [facts.branch])
  assert.deepEqual(task.followUps ?? [], [])
})

test('mode=merge starts a new worker when the recorded merge task has no live worker Session', async () => {
  const facts = await repoFixture('stale-merge')
  const staleId = '5555555555555555'
  await createTask({
    id: staleId,
    title: 'Merge the delivered branch',
    teamId: 'team-stale',
    task: 'Merge the delivered branch into main.',
    mode: 'merge',
    land: true,
    mergeBranches: [facts.branch],
    parentSessionId: 'router',
    projectRoot: facts.repo,
    baseCommit: facts.baseCommit,
    baseBranch: 'main',
    workerSessionId: 'worker-stale',
    status: 'running',
    createdAt: new Date().toISOString(),
  })
  const { ctx, activations, sends } = context(facts.repo, { liveWorker: new Set() })
  const result = await createDispatchTool(ctx).execute({
    mode: 'merge',
    title: 'Merge again',
    worktreeName: 'merge-again',
    teamId: 'team-stale',
    task: 'Merge the delivered branch again.',
    land: true,
    branches: [facts.branch],
  }, exec('stale-merge-call'))
  assert.equal(result.appended, undefined)
  assert.notEqual(result.taskId, staleId)
  assert.equal(activations.length, 1)
  assert.equal(sends.length, 0)
  const stale = await readTask(staleId)
  assert.equal(stale.status, 'running')
  assert.equal(stale.followUps, undefined)
})
