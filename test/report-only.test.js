import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'

const root = await mkdtemp(join(tmpdir(), 'superagent-lite-report-'))
process.env.HOME = root
after(() => rm(root, { recursive: true, force: true }))

const { apply } = await import('../index.js')
const { createTask, linkWorkerSession, readTask, listTasks } = await import('../src/task-store.js')
const { createDispatchTool } = await import('../src/dispatch.js')

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

async function createRepo(name) {
  const repo = join(root, name)
  await mkdir(repo)
  git(repo, ['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(repo, ['add', 'notes.txt'])
  git(repo, ['commit', '-m', 'initial'])
  return { repo, baseCommit: git(repo, ['rev-parse', 'HEAD']) }
}

function harness(repo) {
  const listeners = new Map()
  const agents = new Map()
  const delivered = []
  const commands = []
  const worktrees = []
  const activations = []
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get: id => agents.get(id) },
    agentPresets: { composedPreset: () => 'superagent-lite-worker' },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) {
        activations.push(spec)
        return { childId: spec.childId }
      },
      async sendMessage(sender, target, content) {
        delivered.push({ sender: sender.id, target, text: content[0].text })
      },
    },
    worktrees: {
      async create() {
        worktrees.push('create')
        throw new Error('A report-only task must not create a worktree')
      },
    },
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv, cwd, env }) {
        commands.push(argv)
        const [command, ...args] = argv
        const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
        return { done: Promise.resolve({ exitCode: result.status }), collected: { stdout: { readFrom: () => ({ text: result.stdout ?? '', lossy: false }) } } }
      },
    },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    workingDirectory: { get: () => repo, async set() {} },
    systemPrompt: { context: () => () => {} },
  }
  return { ctx, listeners, agents, delivered, commands, worktrees, activations }
}

async function createWorker(agents, workerSessionId) {
  const registered = new Map()
  let guard
  const worker = {
    id: workerSessionId,
    status: 'running',
    session: { id: workerSessionId, header: { origin: 'subagent', parentSession: 'router' } },
    ctx: {
      systemPrompt: { context: () => () => {} },
      tools: {
        guard(callback) { guard = callback; return () => {} },
        register(tool, options) { registered.set(tool.name, { tool, options }); return () => {} },
      },
    },
  }
  agents.set(worker.id, worker)
  return { worker, registered, guard: args => guard(args) }
}

async function createRunningTask({ id, workerSessionId, repo, baseCommit, mode, teamId = 'team' }) {
  await createTask({
    id,
    title: 'Diagnose the merge worker',
    teamId,
    task: '只做诊断，本轮不改代码。给出结论与证据。',
    parentSessionId: 'router',
    projectRoot: repo,
    baseCommit,
    baseBranch: 'main',
    workerSessionId,
    mode,
    status: 'starting',
    createdAt: new Date().toISOString(),
  })
  await linkWorkerSession(id, workerSessionId)
}

const waitFor = () => new Promise(resolve => setTimeout(resolve, 20))
const writesToRepo = argv => argv.some(argument => ['commit', 'push', 'checkout', 'switch', 'worktree', 'branch'].includes(argument))
const ghCalls = commands => commands.filter(argv => argv[0] === 'gh')

test('a report-only task completes through report_task without a branch, commit, review, or pull request', async () => {
  const { repo, baseCommit } = await createRepo('report-happy')
  const env = harness(repo)
  await apply(env.ctx)
  const taskId = '0123456789abcdef'
  await createRunningTask({ id: taskId, workerSessionId: 'worker-report', repo, baseCommit, mode: 'report', teamId: 'team-report' })
  const { worker, registered, guard } = await createWorker(env.agents, 'worker-report')
  await env.listeners.get('agent/created')({ agent: worker })

  assert.equal(guard({ name: 'read' }), undefined)
  assert.equal(guard({ name: 'bash' }), undefined)
  assert.match(guard({ name: 'bash', arguments: { command: 'git push origin main' } }), /Landing is not authorized/)
  assert.match(guard({ name: 'bash', arguments: { command: 'git merge HEAD' } }), /Landing is not authorized/)
  assert.match(guard({ name: 'write' }), /Report-only tasks/)
  assert.match(guard({ name: 'create_worktree' }), /Report-only tasks/)
  assert.equal(registered.get('create_worktree').options.when(), false)
  assert.equal(registered.get('review_worker_commit').options.when(), false)
  assert.equal(registered.get('report_task').options.when(), true)

  const conclusion = '结论：合并命令只认 awaiting-merge；证据：src/merge.js 的 status 门禁。'
  await registered.get('report_task').tool.execute({ report: conclusion }, { agent: worker, signal: new AbortController().signal })

  assert.deepEqual(env.delivered, [{
    sender: 'worker-report',
    target: 'router',
    text: `Report-only task ${taskId} (no branch, commit, review, or pull request):\n${conclusion}`,
  }])
  const task = await readTask(taskId)
  assert.equal(task.status, 'completed')
  assert.equal(task.worktree, undefined)
  assert.equal(task.review, undefined)
  assert.equal(task.prUrl, undefined)
  assert.equal(git(repo, ['rev-parse', 'HEAD']), baseCommit)
  assert.equal(git(repo, ['status', '--porcelain', '--untracked-files=all']), '')
  assert.equal(git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']), 'main')
  assert.equal(env.worktrees.length, 0)
  assert.ok(env.commands.every(argv => !writesToRepo(argv)))
  assert.deepEqual(ghCalls(env.commands), [])
  assert.match(guard({ name: 'read' }), /frozen/)

  env.listeners.get('subagent/end')({ id: 'worker-report', parentSessionId: 'router', stopReason: 'completed' })
  await waitFor()
  assert.equal((await readTask(taskId)).status, 'completed')
  assert.deepEqual(ghCalls(env.commands), [])
})

test('a report-only task cannot report after committing', async () => {
  const { repo, baseCommit } = await createRepo('report-commit')
  const env = harness(repo)
  await apply(env.ctx)
  const taskId = 'fedcba9876543210'
  await createRunningTask({ id: taskId, workerSessionId: 'worker-commit', repo, baseCommit, mode: 'report', teamId: 'team-commit' })
  const { worker, registered } = await createWorker(env.agents, 'worker-commit')
  await env.listeners.get('agent/created')({ agent: worker })

  await writeFile(join(repo, 'notes.txt'), 'changed\n')
  git(repo, ['commit', '-am', 'a report task must not commit'])
  await assert.rejects(
    registered.get('report_task').tool.execute({ report: '结论' }, { agent: worker, signal: new AbortController().signal }),
    /must not commit or move HEAD/,
  )

  env.listeners.get('subagent/end')({ id: 'worker-commit', parentSessionId: 'router', stopReason: 'completed' })
  await waitFor()
  const task = await readTask(taskId)
  assert.equal(task.status, 'failed')
  assert.notEqual(task.status, 'review-required')
  assert.equal(task.review, undefined)
  assert.equal(task.prUrl, undefined)
  assert.deepEqual(ghCalls(env.commands), [])
})

test('the host never delivers a report-only task, even with a reviewed worktree', async () => {
  const { repo, baseCommit } = await createRepo('report-forged')
  const env = harness(repo)
  await apply(env.ctx)
  const taskId = '0011223344556677'
  await createRunningTask({ id: taskId, workerSessionId: 'worker-forged', repo, baseCommit, mode: 'report', teamId: 'team-forged' })
  const { updateTask } = await import('../src/task-store.js')
  await updateTask(taskId, {
    status: 'running',
    worktree: { path: repo, branch: `sl-${taskId}` },
    review: { head: baseCommit, reviewerSessionId: 'reviewer', approved: true },
  })

  env.listeners.get('subagent/end')({ id: 'worker-forged', parentSessionId: 'router', stopReason: 'completed' })
  await waitFor()
  const task = await readTask(taskId)
  assert.equal(task.status, 'failed')
  assert.notEqual(task.status, 'review-required')
  assert.deepEqual(env.commands, [])
  assert.deepEqual(ghCalls(env.commands), [])
})

test('a change task cannot report and still has to create its worktree first', async () => {
  const { repo, baseCommit } = await createRepo('change-task')
  const env = harness(repo)
  await apply(env.ctx)
  const taskId = '8899aabbccddeeff'
  await createRunningTask({ id: taskId, workerSessionId: 'worker-change', repo, baseCommit, mode: 'change', teamId: 'team-change' })
  const { worker, registered, guard } = await createWorker(env.agents, 'worker-change')
  await env.listeners.get('agent/created')({ agent: worker })

  assert.match(guard({ name: 'read' }), /worktree/)
  assert.equal(guard({ name: 'create_worktree' }), undefined)
  assert.equal(registered.get('report_task').options.when(), false)
  await assert.rejects(
    registered.get('report_task').tool.execute({ report: '结论' }, { agent: worker, signal: new AbortController().signal }),
    /not report-only/,
  )
})

test('dispatch stores the report mode and builds a report-only prompt', async () => {
  const { repo, baseCommit } = await createRepo('dispatch-report')
  const env = harness(repo)
  const dispatch = createDispatchTool(env.ctx)
  const exec = { agent: { id: 'router', session: { id: 'router' } }, callId: 'call', signal: new AbortController().signal }

  await assert.rejects(
    dispatch.execute({ mode: 'docs', teamId: 'team-dispatch', title: 'Bad mode', task: 'x' }, exec),
    /mode/,
  )
  await assert.rejects(
    dispatch.execute({ mode: 'report', teamId: 'team-dispatch', title: 'Bad land', task: 'x', land: true }, exec),
    /report-only tasks cannot be authorized to land/,
  )
  const result = await dispatch.execute({ mode: 'report', teamId: 'team-dispatch', title: 'Diagnose', task: '只做诊断，不改代码' }, exec)
  assert.equal(result.delegated, true)
  assert.equal(result.mode, 'report')
  const task = await readTask(result.taskId)
  assert.equal(task.mode, 'report')
  assert.equal(task.baseCommit, baseCommit)
  assert.equal(env.activations.length, 1)
  assert.match(env.activations[0].prompt[0].text, /Mode: report-only/)
  assert.match(env.activations[0].prompt[0].text, /Call report_task once with the conclusion and evidence/)
  assert.match(env.activations[0].prompt[0].text, /Do not call create_worktree/)
})

test('mode=answer answers without creating a task, worktree, command, or worker', async () => {
  const { repo } = await createRepo('dispatch-answer')
  const env = harness(repo)
  const dispatch = createDispatchTool(env.ctx)
  const exec = { agent: { id: 'router', session: { id: 'router' } }, callId: 'answer', signal: new AbortController().signal }
  const before = await listTasks()

  assert.deepEqual(await dispatch.execute({ mode: 'answer' }, exec), { delegated: false, mode: 'answer' })
  assert.equal((await listTasks()).length, before.length)
  assert.deepEqual(env.activations, [])
  assert.deepEqual(env.worktrees, [])
  assert.deepEqual(env.commands, [])
  assert.deepEqual(env.delivered, [])
})
