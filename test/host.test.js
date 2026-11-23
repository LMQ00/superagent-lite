import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire, registerHooks } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const anchor = process.env.DSH_INSTALL_DIR

test('installed DSH schemas, dispatched worktree and reviewed commit', {
  skip: !anchor || typeof registerHooks !== 'function',
}, async (t) => {
  const require = createRequire(join(anchor, 'package.json'))
  const toolsUrl = pathToFileURL(require.resolve('@deepseek-ai/dsh-tools')).href
  const { assertSupportedJsonSchema } = await import(toolsUrl)
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/dsh-tools') return next(toolsUrl, context)
    return next(specifier, context)
  } })
  const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
  await mkdir(tmp, { recursive: true })
  const root = await mkdtemp(join(tmp, 'host-'))
  const originalHome = process.env.HOME
  process.env.HOME = root
  t.after(async () => {
    hooks.deregister()
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    await rm(root, { recursive: true, force: true })
  })
  const { createDispatchTool } = await import('../src/dispatch.js')
  const { createReviewResultTool, createReviewTool } = await import('../src/review.js')
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const { archiveWorkerTurn, createMemoryStore, memoryOutputSchema } = await import('../src/memory.js')
  const { createMessageRouterTool } = await import('../src/message-router.js')
  const { claimHelper, registerReviewGuard } = await import('../src/helper-guard.js')
  const repo = join(root, 'repo')
  const worktree = join(root, 'worktree')
  await mkdir(repo)
  const git = (args, cwd = repo) => {
    const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git(['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(['add', 'notes.txt'])
  git(['commit', '-m', 'initial'])
  const baseCommit = git(['rev-parse', 'HEAD'])
  const signal = new AbortController().signal
  const parent = { id: 'router', session: { id: 'router' } }
  let worker
  let reviewCalls = 0
  const scopeMode = 'danger-full-access'
  const ctx = {
    workingDirectory: { get: () => repo },
    sandboxPolicy: { resolve: () => ({ mode: scopeMode }) },
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv: [command, ...args], cwd, env }) {
        const result = spawnSync(command, ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, env, encoding: 'utf8' })
        return { done: Promise.resolve({ exitCode: result.status }), collected: { stdout: { readFrom: () => ({ text: result.stdout, lossy: false }) } } }
      },
    },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) {
        if (spec.delivery === 'parent') {
          worker = { id: spec.childId, session: { id: spec.childId } }
          assert.equal(spec.cwd, repo)
          assert.deepEqual(spec.promptSource, { kind: 'agent-message', form: 'relay', senderSessionId: 'router' })
          assert.match(spec.prompt[0].text, /Project team: team/)
          assert.match(spec.prompt[0].text, /Base branch: main/)
          assert.match(spec.prompt[0].text, /Task: Change notes/)
          assert.match(spec.prompt[0].text, /Requirements:\nUpdate notes/)
          assert.match(spec.prompt[0].text, /Landing is authorized for this task/)
          let previous = -1
          for (const section of ['Project team:', 'Base branch:', 'Task:', 'Requirements:', 'Before:', 'During:', 'After:', 'Reporting:']) {
            const index = section === 'Project team:' ? spec.prompt[0].text.indexOf(section) : spec.prompt[0].text.indexOf(`\n${section}`)
            assert.ok(index > previous, `${section} is missing or out of order`)
            previous = index
          }
          return { childId: spec.childId }
        }
        ++reviewCalls
        assert.equal(spec.agentPreset, undefined)
        assert.match(spec.prompt[0].text, /Inspect it yourself/)
        assert.match(spec.prompt[0].text, /file write\/edit tools are unavailable/)
        assert.match(spec.prompt[0].text, /Uncommitted local changes and assumptions about the repository are not part of the change/)
        assert.match(spec.prompt[0].text, /Follow-ups are context only: they can explain additional changes/)
        assert.match(spec.prompt[0].text, /"followUps":\["Add a changelog entry"\]/)
        assert.match(spec.prompt[0].text, /"requirements":"Update notes"/)
        assert.match(spec.prompt[0].text, /Approve only when the change is correct/)
        assert.match(spec.prompt[0].text, /Block for a concrete correctness/)
        assert.match(spec.prompt[0].text, /cite the file and line/)
        assert.match(spec.prompt[0].text, /Do not block on style preferences/)
        assert.ok(spec.prompt[0].text.includes(baseCommit))
        assert.ok(spec.prompt[0].text.includes(head))
        assert.ok(spec.prompt[0].text.includes(worktree))
        assert.doesNotMatch(spec.prompt[0].text, /diff --git/)
        assert.doesNotMatch(spec.prompt[0].text, /\+updated/)
        assert.match(spec.prompt[0].text, /User profile: Prefers terse reviews\./)
        assert.match(spec.prompt[0].text, /Responsibilities: Review notes carefully\./)
        const claim = claimHelper(spec.parent.session.id)
        assert.ok(claim)
        const listeners = []
        const reviewer = {
          id: 'reviewer',
          session: { id: 'reviewer', append() {} },
          ctx: {
            get: () => undefined,
            tools: { guard() {}, register() {} },
            on(name, fn) { if (name === 'session/event') listeners.push(fn) },
          },
        }
        registerReviewGuard(reviewer, claim.scope)
        await createReviewResultTool(reviewer).execute({ content: '通过' }, { agent: reviewer })
        for (const event of [
          { type: 'tool/call', data: { callId: 'review-diff', name: 'bash', arguments: JSON.stringify({ command: `git diff ${baseCommit}..${head}` }) } },
          { type: 'tool/result', data: { message: { toolCallId: 'review-diff', isError: false } } },
        ]) {
          for (const listener of listeners) listener(reviewer.session, event)
        }
        return { childId: 'reviewer', result: Promise.resolve({ stopReason: 'completed' }) }
      },
    },
  }
  const sends = []
  ctx.subagents.sendMessage = async (sender, targetId, content) => sends.push({ sender: sender.id, targetId, text: content[0].text })
  const dispatch = createDispatchTool(ctx)
  const args = { mode: 'change', title: 'Change notes', teamId: 'team', task: 'Update notes', land: true }
  const exec = { agent: parent, signal, callId: 'call' }
  await assert.rejects(dispatch.execute({ ...args, teamId: '../bad' }, exec), /teamId/)
  await assert.rejects(dispatch.execute({ title: 'Missing mode' }, exec), /mode/)
  const skipped = await dispatch.execute({ mode: 'answer' }, exec)
  assert.deepEqual(skipped, { delegated: false, mode: 'answer' })
  const dispatched = await dispatch.execute(args, exec)
  assert.equal(dispatched.delegated, true)
  assert.equal(dispatched.mode, 'change')
  const branch = 'sl-fixture'
  assert.equal(dispatched.workerSessionId, worker.id)
  assert.equal((await readTask(dispatched.taskId)).baseCommit, baseCommit)
  assert.equal((await readTask(dispatched.taskId)).land, true)
  assert.equal((await readTask(dispatched.taskId)).landAuthorizedVia, 'dispatch')
  git(['worktree', 'add', '-b', branch, worktree])
  await writeFile(join(worktree, 'notes.txt'), 'updated\n')
  git(['commit', '-am', 'change notes'], worktree)
  const head = git(['rev-parse', 'HEAD'], worktree)
  await updateTask(dispatched.taskId, { status: 'running', worktree: { path: worktree, branch } })
  await createMemoryStore().writeMemory(repo, {
    global: { userProfile: 'Prefers terse reviews.' },
    project: { responsibilities: 'Review notes carefully.' },
  })
  const continueTool = createContinueTool(ctx)
  await continueTool.execute({ taskId: dispatched.taskId, task: 'Add a changelog entry' }, { agent: parent, signal })
  assert.match(sends[0].text, /Add a changelog entry/)
  sends.length = 0
  const review = createReviewTool(ctx, worker, dispatched.taskId)
  for (const tool of [dispatch, review]) {
    assertSupportedJsonSchema(tool.parameters)
    assertSupportedJsonSchema(tool.output.schema)
  }
  assert.match(await review.execute({}, { agent: worker, signal }), /Approved/)
  assert.equal(reviewCalls, 1)
  assert.equal((await readTask(dispatched.taskId)).task, 'Update notes')
  const message = createMessageRouterTool(ctx, worker, dispatched.taskId)
  assert.match(message.description, /Do not send routine progress/)
  assert.match(message.description, /any unapplied follow-up/)
  assert.match(message.description, /reviewed commit when one exists/)
  assert.match(message.description, /reviewed implementation with relevant checks passed/)
  assert.match(message.description, /job whose result you need runs/)
  assert.doesNotMatch(message.description, /asks for status/)
  await message.execute({ message: 'Done on sl-fixture' }, { agent: worker, signal })
  assert.deepEqual(sends, [{ sender: worker.id, targetId: 'router', text: 'Done on sl-fixture' }])
  assert.equal((await readTask(dispatched.taskId)).review.head, head)

  assertSupportedJsonSchema(memoryOutputSchema)
  const events = [{ type: 'turn/start', seq: 0, data: { turn: 1 } }, { type: 'turn/end', seq: 1, data: { turn: 1 } }]
  const archive = []
  await archiveWorkerTurn({ id: worker.id, firstLiveSeq: 0, eventAt: i => events[i], snapshotEvents: (a, b) => events.slice(a, b) }, events[1], { write: (source, snapshot) => archive.push([source, snapshot]) })
  assert.deepEqual(archive[0], [{ sessionId: worker.id, seq: 1 }, {
    turn: 1, startSeq: 0, endSeq: 1,
    references: [
      { reference: 1, seq: 0, type: 'turn/start' },
      { reference: 2, seq: 1, type: 'turn/end' },
    ],
    events,
  }])
})
