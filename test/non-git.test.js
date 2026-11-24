import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-non-git-'))
const originalHome = process.env.HOME
process.env.HOME = home

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

const { createDispatchTool } = await import('../src/dispatch.js')
const { createTask, linkWorkerSession, listTasks, readTask, removeTask, updateTask } = await import('../src/task-store.js')
const { WORKSPACE_REVISION, createReviewResultTool, createReviewTool } = await import('../src/review.js')
const { claimHelper, registerReviewGuard } = await import('../src/helper-guard.js')
const { createReportTool } = await import('../src/report-tool.js')
const { createGitManager } = await import('../src/git-actions.js')

beforeEach(async () => {
  for (const task of await listTasks()) await removeTask(task.id)
})

const exec = (callId = 'call') => ({
  agent: { id: 'router', session: { id: 'router' } },
  callId,
  signal: new AbortController().signal,
})

const waitFor = () => new Promise(resolve => setTimeout(resolve, 30))

async function projectFixture(name) {
  const projectRoot = join(home, name)
  await mkdir(join(projectRoot, 'src'), { recursive: true })
  await writeFile(join(projectRoot, 'notes.txt'), 'original\n')
  await writeFile(join(projectRoot, 'src', 'app.js'), 'export const value = 1\n')
  return projectRoot
}

function commandContext(projectRoot) {
  const activations = []
  const commands = []
  const ctx = {
    workingDirectory: { get: () => projectRoot },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    agents: { get: () => undefined, list: () => [] },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) {
        activations.push(spec)
        return { childId: spec.childId }
      },
    },
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv, cwd, env }) {
        commands.push(argv)
        const [command, ...args] = argv
        const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
        return {
          done: Promise.resolve({ exitCode: result.status }),
          collected: { stdout: { readFrom: () => ({ text: result.stdout ?? '', lossy: false }) } },
        }
      },
    },
  }
  return { ctx, activations, commands }
}

test('a non-git folder dispatches change work directly in place without a worktree or commit', async () => {
  const projectRoot = await projectFixture('dispatch-change')
  const { ctx, activations } = commandContext(projectRoot)
  const result = await createDispatchTool(ctx).execute({
    mode: 'change',
    title: 'Update notes',
    worktreeName: 'update-notes',
    teamId: 'team-native-change',
    task: 'Update notes.txt and its tests.',
  }, exec('dispatch-change'))
  assert.equal(result.delegated, true)
  assert.equal(result.mode, 'change')
  const task = await readTask(result.taskId)
  assert.equal(task.git, false)
  assert.equal(task.projectRoot, projectRoot)
  assert.equal(task.baseCommit, undefined)
  assert.equal(task.baseBranch, undefined)
  assert.equal(task.worktree, undefined)
  assert.equal(activations.length, 1)
  assert.equal(activations[0].cwd, projectRoot)
  assert.deepEqual(activations[0].promptSource, { kind: 'agent-message', form: 'relay', senderSessionId: 'router' })
  const text = activations[0].prompt[0].text
  assert.match(text, /Base branch: none \(this project is not a git repository\)/)
  assert.match(text, /Mode: change/)
  assert.match(text, /Work directly in the project folder; there is no branch, worktree, or commit/)
  assert.match(text, /Do not call create_worktree/)
  assert.match(text, /review_worker_commit/)
  assert.match(text, /This project is not a git repository: there is no branch, commit, worktree, push, pull request, or merge/)
  assert.doesNotMatch(text, /call create_worktree once/)
  assert.doesNotMatch(text, /Commit on the assigned branch/)
})

test('report-only work in a non-git folder keeps its read-only prompt', async () => {
  const projectRoot = await projectFixture('dispatch-report')
  const { ctx, activations } = commandContext(projectRoot)
  const result = await createDispatchTool(ctx).execute({
    mode: 'report',
    title: 'Diagnose notes',
    teamId: 'team-native-report',
    task: 'Explain notes.txt without changing it.',
  }, exec('dispatch-report'))
  const task = await readTask(result.taskId)
  assert.equal(task.git, false)
  assert.equal(task.mode, 'report')
  assert.equal(activations.length, 1)
  assert.equal(activations[0].cwd, projectRoot)
  assert.match(activations[0].prompt[0].text, /Mode: report-only/)
  assert.match(activations[0].prompt[0].text, /inspect the project checkout in place/)
  assert.match(activations[0].prompt[0].text, /Call report_task once with the conclusion and evidence/)
})

test('merge and landing dispatches are refused outside a git repository', async () => {
  const projectRoot = await projectFixture('dispatch-refusals')
  const dispatch = createDispatchTool(commandContext(projectRoot).ctx)
  const base = { title: 'Work', worktreeName: 'work-here', teamId: 'team-native-refusals', task: 'Do the work.' }
  await assert.rejects(
    dispatch.execute({ ...base, mode: 'change', land: true }, exec('land')),
    /Landing requires a git repository/,
  )
  await assert.rejects(
    dispatch.execute({ ...base, mode: 'merge', land: true, branches: ['sl-delivered'] }, exec('merge')),
    /Merge tasks require a git repository/,
  )
  assert.equal((await listTasks()).length, 0)
})

test('a non-git review inspects the project files and records a workspace verdict', async () => {
  const projectRoot = await projectFixture('review-workspace')
  const taskId = '1000000000000001'
  await createTask({
    id: taskId,
    title: 'Update notes',
    teamId: 'team-native-review',
    task: 'Update notes.txt.',
    mode: 'change',
    git: false,
    parentSessionId: 'router',
    projectRoot,
    workerSessionId: 'worker-native-review',
    status: 'running',
    createdAt: new Date().toISOString(),
  })
  await writeFile(join(projectRoot, 'notes.txt'), 'updated\n')
  const activations = []
  const ctx = {
    subagents: {
      async startActivation(spec) {
        activations.push(spec)
        const claim = claimHelper(spec.parent.session.id)
        assert.ok(claim)
        const listeners = []
        const reviewer = {
          id: 'reviewer',
          session: { id: 'reviewer', append() {} },
          ctx: {
            get: () => undefined,
            tools: { guard() {} },
            on(name, fn) { if (name === 'session/event') listeners.push(fn) },
          },
        }
        registerReviewGuard(reviewer, claim.scope)
        const emit = event => { for (const listener of listeners) listener(reviewer.session, event) }
        emit({ type: 'tool/call', data: { callId: 'read', name: 'read', arguments: JSON.stringify({ file_path: 'notes.txt' }) } })
        emit({ type: 'tool/result', data: { message: { toolCallId: 'read', isError: false } } })
        await createReviewResultTool(reviewer).execute({ content: '通过' }, { agent: reviewer })
        return { childId: 'reviewer', result: Promise.resolve({ stopReason: 'completed' }) }
      },
    },
  }
  const worker = { id: 'worker-native-review', session: { id: 'worker-native-review' } }
  const result = await createReviewTool(ctx, worker, taskId).execute({}, { agent: worker, signal: new AbortController().signal })
  assert.match(result, /^Approved for workspace/)
  const task = await readTask(taskId)
  assert.deepEqual(task.review, { head: WORKSPACE_REVISION, reviewerSessionId: 'reviewer', approved: true })
  assert.equal(activations[0].cwd, projectRoot)
  const text = activations[0].prompt[0].text
  assert.match(text, /This project is not a git repository, so there is no commit and no diff/)
  assert.match(text, /current content of the project folder/)
  assert.match(text, /workspace":true/)
  assert.doesNotMatch(text, /git diff/)
  assert.doesNotMatch(text, /baseCommit/)
})

test('a non-git review without reading the project files is rejected', async () => {
  const projectRoot = await projectFixture('review-no-evidence')
  const taskId = '1000000000000002'
  await createTask({
    id: taskId,
    title: 'Update notes',
    teamId: 'team-native-review-empty',
    task: 'Update notes.txt.',
    mode: 'change',
    git: false,
    parentSessionId: 'router',
    projectRoot,
    workerSessionId: 'worker-native-review-empty',
    status: 'running',
    createdAt: new Date().toISOString(),
  })
  const ctx = {
    subagents: {
      async startActivation(spec) {
        const claim = claimHelper(spec.parent.session.id)
        assert.ok(claim)
        const reviewer = {
          id: 'reviewer',
          session: { id: 'reviewer', append() {} },
          ctx: { get: () => undefined, tools: { guard() {} }, on() {} },
        }
        registerReviewGuard(reviewer, claim.scope)
        await createReviewResultTool(reviewer).execute({ content: '通过' }, { agent: reviewer })
        return { childId: 'reviewer', result: Promise.resolve({ stopReason: 'completed' }) }
      },
    },
  }
  const worker = { id: 'worker-native-review-empty', session: { id: 'worker-native-review-empty' } }
  await assert.rejects(
    createReviewTool(ctx, worker, taskId).execute({}, { agent: worker, signal: new AbortController().signal }),
    /did not inspect the project files/,
  )
  assert.equal((await readTask(taskId)).review, undefined)
})

test('report_task finishes a non-git report without asking git for HEAD or status', async () => {
  const projectRoot = await projectFixture('report-task')
  const taskId = '1000000000000003'
  await createTask({
    id: taskId,
    title: 'Diagnose notes',
    teamId: 'team-native-report-task',
    task: 'Explain notes.txt.',
    mode: 'report',
    git: false,
    parentSessionId: 'router',
    projectRoot,
    workerSessionId: 'worker-native-report-task',
    status: 'running',
    createdAt: new Date().toISOString(),
  })
  const delivered = []
  const worker = { id: 'worker-native-report-task', session: { id: 'worker-native-report-task' } }
  const tool = createReportTool({
    subagents: {
      async sendMessage(sender, target, content) {
        delivered.push({ sender: sender.id, target, text: content[0].text })
      },
    },
  }, worker, taskId, () => true)
  await tool.execute({ report: '结论：notes.txt 只是说明文件。' }, { agent: worker, signal: new AbortController().signal })
  assert.deepEqual(delivered, [{
    sender: worker.id,
    target: 'router',
    text: `Report-only task ${taskId} (no branch, commit, review, or pull request):\n结论：notes.txt 只是说明文件。`,
  }])
  assert.equal((await readTask(taskId)).status, 'completed')
})

async function applyHarness(projectRoot, memoryOutput = {}) {
  const { apply } = await import('../index.js')
  const { createMemoryStore } = await import('../src/memory.js')
  const listeners = new Map()
  const contexts = []
  const registered = new Map()
  const skillProviders = []
  const warnings = []
  const activations = []
  const memoryFields = {
    userProfile: '',
    responsibilities: '',
    positioning: '',
    sharedSkills: [],
    projectSkills: [],
    ...memoryOutput,
  }
  const skills = {
    registerProvider(create) {
      skillProviders.push(create({ invalidate() {} }))
      return () => {}
    },
  }
  const ctx = {
    logger: { warn: message => warnings.push(message) },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get() {}, list: () => [] },
    agentPresets: { composedPreset: () => 'superagent-lite-worker' },
    workingDirectory: { get: () => projectRoot, async set() {} },
    systemPrompt: { context() { return () => {} } },
    get: name => name === 'skills' ? skills : undefined,
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) {
        activations.push(spec)
        return {
          childId: spec.childId,
          result: Promise.resolve({ stopReason: 'completed', structured: spec.outputSchema ? memoryFields : undefined }),
        }
      },
      async sendMessage() {},
    },
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn() {
        return {
          done: Promise.resolve({ exitCode: 0 }),
          collected: { stdout: { readFrom: () => ({ text: '', lossy: false }) } },
        }
      },
    },
    worktrees: {
      async create() { throw new Error('a non-git task must not create a worktree') },
    },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
  }
  await apply(ctx)
  const store = createMemoryStore()
  await store.writeGlobal({ userProfile: 'Global non-git memory.' })
  await store.writeProject(projectRoot, { responsibilities: 'Non-git project responsibility.' })
  await store.writeSkill('project', projectRoot, {
    description: 'Non-git project skill.', content: 'Inspect the project folder before changing it.',
  })
  let guard
  const worker = {
    id: 'worker-native',
    status: 'running',
    session: {
      id: 'worker-native',
      header: { origin: 'subagent', parentSession: 'router' },
      deriveMessages: () => [
        { role: 'user', content: [{ type: 'text', text: 'Update notes.txt.' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Done; review approved.' }] },
      ],
    },
    ctx: {
      get: name => name === 'skills' ? skills : undefined,
      tools: {
        guard(check) { guard = check; return () => {} },
        register(tool, options) { registered.set(tool.name, { tool, options }); return () => {} },
      },
      systemPrompt: { context(entry) { contexts.push(entry); return () => {} } },
      on() {},
    },
  }
  return { listeners, contexts, registered, skillProviders, warnings, activations, worker, guard: () => guard }
}

test('a non-git worker gets memory and context injection before any worktree exists', async () => {
  const projectRoot = await projectFixture('worker-context')
  const taskId = '1000000000000004'
  await createTask({
    id: taskId,
    title: 'Change notes',
    teamId: 'team-native-worker',
    task: 'Update notes.txt.',
    mode: 'change',
    git: false,
    parentSessionId: 'router',
    projectRoot,
    workerSessionId: 'worker-native',
    status: 'starting',
    createdAt: new Date().toISOString(),
  })
  await linkWorkerSession(taskId, 'worker-native')
  const harness = await applyHarness(projectRoot, { responsibilities: 'Extracted non-git responsibility.' })
  await harness.listeners.get('agent/created')({ agent: harness.worker })

  const memory = harness.contexts.find(entry => entry.name === 'superagent-lite-memory')
  assert.ok(memory, 'the non-git worker registered the memory context')
  assert.equal(memory.required, true)
  assert.match(memory.text(), /User profile: Global non-git memory\./)
  assert.match(memory.text(), /Responsibilities: Non-git project responsibility\./)
  assert.equal(harness.skillProviders.length, 1)
  const candidates = await harness.skillProviders[0].list({ signal: new AbortController().signal })
  assert.equal(candidates[0].description, 'Non-git project skill.')
  assert.equal(harness.registered.has('create_worktree'), true)
  assert.equal(harness.registered.get('create_worktree').options.when(), false)
  assert.equal(harness.registered.get('review_worker_commit').options.when(), true)
  assert.equal(harness.registered.get('message_router').options.when({ agent: harness.worker }), true)
  assert.equal(harness.registered.has('knowledge_query'), true)
  assert.equal(harness.registered.has('knowledge_get'), true)
  assert.equal(harness.guard()({ name: 'read' }), undefined)
  assert.equal(harness.guard()({ name: 'write' }), undefined)
  assert.equal(harness.guard()({ name: 'edit' }), undefined)
  assert.equal(harness.guard()({ name: 'bash' }), undefined)

  await harness.registered.get('message_router').tool.execute(
    { message: 'Done; review approved.' },
    { agent: harness.worker, signal: new AbortController().signal },
  )
  assert.ok(harness.activations.some(spec => spec.label === 'Distill memory'), 'the memory role runs without a worktree')
  const { createMemoryStore } = await import('../src/memory.js')
  assert.equal((await createMemoryStore().readMemory(projectRoot)).project.responsibilities, 'Extracted non-git responsibility.')

  await updateTask(taskId, {
    review: { head: WORKSPACE_REVISION, reviewerSessionId: 'reviewer', approved: true },
  })
  harness.listeners.get('subagent/end')({ id: 'worker-native', parentSessionId: 'router', stopReason: 'completed' })
  await waitFor()
  const task = await readTask(taskId)
  assert.equal(task.status, 'completed')
  assert.equal(task.worktree, undefined)
})

test('a settled non-git task resumes without a worktree and gets the direct-folder rules', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const projectRoot = await projectFixture('continue-workspace')
  const taskId = '1000000000000006'
  await createTask({
    id: taskId,
    title: 'Change notes',
    teamId: 'team-native-continue',
    task: 'Update notes.txt.',
    mode: 'change',
    git: false,
    parentSessionId: 'router',
    projectRoot,
    workerSessionId: 'worker-native-continue',
    status: 'review-required',
    createdAt: new Date().toISOString(),
  })
  const sends = []
  const tool = createContinueTool({
    agents: { get: () => undefined },
    subagents: {
      async sendMessage(sender, target, content) {
        sends.push({ sender: sender.id, target, text: content[0].text })
      },
    },
  })
  const result = await tool.execute(
    { taskId, task: 'Also update the README.' },
    { agent: { id: 'router' }, signal: new AbortController().signal },
  )
  assert.match(result, /Follow-up delivered/)
  assert.equal((await readTask(taskId)).status, 'resuming')
  assert.equal(sends.length, 1)
  assert.match(sends[0].text, new RegExp(`Project folder: ${projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.match(sends[0].text, /Work directly in the project folder; do not create a worktree/)
  assert.match(sends[0].text, /call review_worker_commit/)
  assert.match(sends[0].text, /there is no branch, commit, worktree, push, pull request, or merge/)
  assert.doesNotMatch(sends[0].text, /call create_worktree once/)
  await assert.rejects(
    tool.execute({ taskId, task: 'Push it.', land: true }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /Landing requires a git repository/,
  )
})

test('the panel treats a non-git task as completed without trying any Git action', async () => {
  const projectRoot = await projectFixture('panel')
  const taskId = '1000000000000005'
  const task = {
    id: taskId,
    title: 'Update notes',
    teamId: 'team-native-panel',
    mode: 'change',
    git: false,
    projectRoot,
    status: 'completed',
    review: { head: WORKSPACE_REVISION, reviewerSessionId: 'reviewer', approved: true },
    createdAt: new Date().toISOString(),
  }
  let gitCalls = 0
  const manager = createGitManager({}, {
    store: {
      async readTask() { return task },
      async updateTask() { return task },
      async listTasks() { return [task] },
    },
    git: async () => { gitCalls += 1; throw new Error('git must not run for a non-git task') },
    gh: async () => { gitCalls += 1; throw new Error('gh must not run for a non-git task') },
  })
  const signal = new AbortController().signal
  const views = await manager.list([task], signal)
  assert.equal(views.get(taskId).status, 'completed')
  assert.equal(views.get(taskId).git, undefined)
  assert.deepEqual(await manager.detail(taskId, signal), {
    taskId,
    branches: [],
    remotes: [],
    gh: { ok: false, error: 'This project is not a git repository' },
    commits: [],
    files: [],
  })
  assert.equal(gitCalls, 0)
  await assert.rejects(
    manager.perform(taskId, 'merge', { target: 'main' }, signal),
    /This project is not a git repository/,
  )
  assert.equal(gitCalls, 0)
})
