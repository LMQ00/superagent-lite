import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire, registerHooks } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const anchor = process.env.DSH_INSTALL_DIR

test('installed DSH schemas, dispatched worktree, reviewed commit and explicit local merge', {
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
  const { mergeCommand } = await import('../src/merge.js')
  const { createReviewTool } = await import('../src/review.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const { archiveWorkerTurn, createMemoryTool } = await import('../src/memory.js')
  const { createMessageRouterTool } = await import('../src/message-router.js')
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
  let scopeMode = 'danger-full-access'
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
          assert.match(spec.prompt[0].text, /Project team: team/)
          assert.match(spec.prompt[0].text, /Base branch: main/)
          assert.match(spec.prompt[0].text, /Task: Change notes/)
          assert.match(spec.prompt[0].text, /Requirements:\nUpdate notes/)
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
        assert.match(spec.prompt[0].text, /updated/)
        return { childId: 'reviewer', result: Promise.resolve({ stopReason: 'completed', structured: { approved: true, findings: '' } }) }
      },
    },
  }
  const sends = []
  ctx.subagents.sendMessage = async (sender, targetId, content) => sends.push({ sender: sender.id, targetId, text: content[0].text })
  const dispatch = createDispatchTool(ctx)
  const args = { delegate: true, title: 'Change notes', teamId: 'team', task: 'Update notes' }
  const exec = { agent: parent, signal, callId: 'call' }
  await assert.rejects(dispatch.execute({ ...args, teamId: '../bad' }, exec), /teamId/)
  await assert.rejects(dispatch.execute({ delegate: false }, exec), /reason/)
  const skipped = await dispatch.execute({ delegate: false, reason: 'No project work' }, exec)
  assert.deepEqual(skipped, { delegated: false, reason: 'No project work' })
  const dispatched = await dispatch.execute(args, exec)
  assert.equal(dispatched.delegated, true)
  const branch = 'sl-fixture'
  assert.equal(dispatched.workerSessionId, worker.id)
  assert.equal((await readTask(dispatched.taskId)).baseCommit, baseCommit)
  git(['worktree', 'add', '-b', branch, worktree])
  await writeFile(join(worktree, 'notes.txt'), 'updated\n')
  git(['commit', '-am', 'change notes'], worktree)
  const head = git(['rev-parse', 'HEAD'], worktree)
  await updateTask(dispatched.taskId, { status: 'running', worktree: { path: worktree, branch } })
  const local = mergeCommand(ctx)
  assert.equal((await local.handler({ agent: parent, rawInput: dispatched.taskId, signal })).kind, 'error')
  const review = createReviewTool(ctx, worker, dispatched.taskId)
  for (const tool of [dispatch, review]) {
    assertSupportedJsonSchema(tool.parameters)
    assertSupportedJsonSchema(tool.output.schema)
  }
  assert.match(await review.execute({}, { agent: worker, signal }), /Approved/)
  assert.equal(reviewCalls, 1)
  const message = createMessageRouterTool(ctx, worker, dispatched.taskId)
  await message.execute({ message: 'Done on sl-fixture' }, { agent: worker, signal })
  assert.deepEqual(sends, [{ sender: worker.id, targetId: 'router', text: 'Done on sl-fixture' }])
  assert.equal((await readTask(dispatched.taskId)).review.head, head)
  await updateTask(dispatched.taskId, { status: 'awaiting-merge' })
  scopeMode = 'read-only'
  assert.equal((await local.handler({ agent: parent, rawInput: dispatched.taskId, signal })).kind, 'error')
  scopeMode = 'danger-full-access'
  assert.equal(git(['rev-parse', 'HEAD']), baseCommit)
  assert.equal((await local.handler({ agent: parent, rawInput: dispatched.taskId, signal })).kind, 'success')
  assert.equal(git(['show', 'HEAD:notes.txt']), 'updated')
  assert.equal((await readTask(dispatched.taskId)).status, 'merged')

  const caller = { role: 'worker', teamId: 'team', projectRoot: repo }
  const memory = createMemoryTool(caller, candidate => candidate === worker)
  assertSupportedJsonSchema(memory.parameters)
  assertSupportedJsonSchema(memory.output.schema)
  worker.session.seq = 3
  await assert.rejects(memory.execute({ action: 'list', category: 'team' }, { agent: parent, signal }), /not available/i)
  await memory.execute({ action: 'create', category: 'team', content: 'Use checked-in notes' }, { agent: worker, signal })
  assert.equal(JSON.parse(await memory.execute({ action: 'list', category: 'team' }, { agent: worker, signal })).total, 1)
  await assert.rejects(memory.execute({ action: 'list', category: 'archive' }, { agent: worker, signal }))
  const events = [{ type: 'turn/start', seq: 0, data: { turn: 1 } }, { type: 'turn/end', seq: 1, data: { turn: 1 } }]
  const archive = []
  await archiveWorkerTurn({ id: worker.id, firstLiveSeq: 0, eventAt: i => events[i], snapshotEvents: (a, b) => events.slice(a, b) }, events[1], { write: (source, snapshot) => archive.push([source, snapshot]) })
  assert.deepEqual(archive[0], [{ sessionId: worker.id, seq: 1 }, { turn: 1, startSeq: 0, endSeq: 1, events }])
})
