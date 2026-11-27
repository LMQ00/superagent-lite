import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'continue-'))
process.env.HOME = home
await mkdir(join(home, 'worktree'), { recursive: true })
after(() => rm(home, { recursive: true, force: true }))

const originalTask = 'Implement it.\n\nAcceptance: tests pass.'
const resumeSections = ['Task ID:', 'Branch:', 'Worktree:', 'Base:', 'Rules:', 'Follow-up (the only authoritative instruction for this turn):']

function assertSectionOrder(text, sections) {
  let previous = -1
  for (const section of sections) {
    const index = text.indexOf(section)
    assert.ok(index > previous, `${section} is missing or out of order`)
    previous = index
  }
}

async function taskFixture(id, status = 'running') {
  const { createTask } = await import('../src/task-store.js')
  await createTask({
    id, title: 'Task', teamId: 'team', task: originalTask, parentSessionId: 'router',
    projectRoot: home, baseCommit: 'abc', baseBranch: 'main', workerSessionId: 'worker',
    status, createdAt: new Date().toISOString(),
  })
}

function context(sends, worker, onSend, sessionQuery) {
  return {
    agents: { get: () => typeof worker === 'string' ? { status: worker } : worker },
    sessionQuery,
    subagents: {
      async sendMessage(sender, targetId, content) {
        await onSend?.()
        sends.push({ sender: sender.id, targetId, text: content[0].text })
      },
    },
  }
}

async function followUpTexts(id) {
  const { readTask } = await import('../src/task-store.js')
  return ((await readTask(id)).followUps ?? []).map(item => item.text)
}

test('continue_worker records an explicit landing authorization on the task', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = '5000000000000001'
  await taskFixture(id)
  const sends = []
  const tool = createContinueTool(context(sends, 'running'))
  await tool.execute({ taskId: id, task: 'Now land it', land: true }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(sends[0].text, /Landing is authorized for this task/)
  assert.match(sends[0].text, /you may push the assigned branch and open a pull request for it/)
  assert.match(sends[0].text, /Do not merge; a merge request gets a newly dispatched merge worker/)
  const task = await readTask(id)
  assert.equal(task.land, true)
  assert.equal(task.landAuthorizedVia, 'continue')
  assert.equal(typeof task.landAuthorizedAt, 'string')
})

test('resuming a settled worker carries the landing authorization into the compact message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '5000000000000002'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const tool = createContinueTool(context(sends))
  await tool.execute({ taskId: id, task: 'Land it', land: true }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(sends[0].text, /Landing is authorized for this task: you may push the assigned branch and open a pull request for it/)
  assert.match(sends[0].text, /Landing authorization comes only from this task's record/)
  const task = await readTask(id)
  assert.equal(task.land, true)
  assert.equal(task.status, 'resuming')
})

test('continue_worker rejects a landing flag that is not boolean', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const id = '6666666666666666'
  await taskFixture(id)
  const tool = createContinueTool(context([], 'running'))
  await assert.rejects(
    tool.execute({ taskId: id, task: 'Land it', land: 'yes' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /land must be true or false/,
  )
})

test('a failed steering delivery rolls back a new landing authorization', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = '7777777777777777'
  await taskFixture(id)
  const tool = createContinueTool({ agents: { get: () => ({ status: 'running' }) }, subagents: { async sendMessage() { throw new Error('worker is gone') } } })
  await assert.rejects(
    tool.execute({ taskId: id, task: 'Land it', land: true }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  const task = await readTask(id)
  assert.equal(task.land, false)
  assert.equal(task.landAuthorizedVia, undefined)
})

test('a failed resume delivery rolls back a new landing authorization', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '8888888888888888'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const tool = createContinueTool({ subagents: { async sendMessage() { throw new Error('worker is gone') } } })
  await assert.rejects(
    tool.execute({ taskId: id, task: 'Land it', land: true }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  const task = await readTask(id)
  assert.equal(task.status, 'failed')
  assert.equal(task.land, false)
  assert.equal(task.landAuthorizedVia, undefined)
})

test('continue_worker keeps a settled task unauthorized when no landing flag is carried', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '9999999999999999'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const tool = createContinueTool(context(sends))
  await tool.execute({ taskId: id, task: 'Another change' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(sends[0].text, /Landing is not authorized for this task/)
  assert.equal((await readTask(id)).land, undefined)
})

test('continue_worker keeps steering a worker whose turn is active', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = 'aaaaaaaaaaaaaaaa'
  await taskFixture(id)
  const sends = []
  const followUpsAtSend = []
  const tool = createContinueTool(context(sends, 'running', async () => followUpsAtSend.push(await followUpTexts(id))))
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /running worker/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, /Requirements update/)
  assert.match(sends[0].text, /First decide whether it belongs to this task/)
  assert.match(sends[0].text, /keep working on the current task/)
  assert.match(sends[0].text, /include the unapplied follow-up in your final report/)
  assert.match(sends[0].text, /restart only if the change requires it/)
  assert.match(sends[0].text, /New requirement/)
  assert.doesNotMatch(sends[0].text, /Project team:/)
  assert.deepEqual(followUpsAtSend, [['New requirement']])
  assert.equal((await readTask(id)).status, 'running')
  assert.equal((await readTask(id)).task, originalTask)
})

test('continue_worker sends a compact resume message to an idle worker whose task is still running', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = 'bbbbbbbbbbbbbbbb'
  await taskFixture(id)
  const sends = []
  const tool = createContinueTool(context(sends, 'idle'))
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up delivered/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, new RegExp(`Task ID: ${id}`))
  assert.match(sends[0].text, /Branch: not created yet/)
  assert.match(sends[0].text, /Worktree: not created yet/)
  assert.match(sends[0].text, /Base: main \(abc\)/)
  assert.doesNotMatch(sends[0].text, /Project team:/)
  assert.doesNotMatch(sends[0].text, /Requirements:/)
  assert.doesNotMatch(sends[0].text, /Implement it\./)
  assert.doesNotMatch(sends[0].text, /Before:|During:|After:/)
  assert.match(sends[0].text, /Follow-up \(the only authoritative instruction for this turn\):\nNew requirement/)
  assert.match(sends[0].text, /The original requirements are in the earlier conversation; do not redo completed work\./)
  assert.match(sends[0].text, /report BLOCKED with the mismatch/)
  assertSectionOrder(sends[0].text, resumeSections)
  assert.equal((await readTask(id)).status, 'running')
  assert.deepEqual(await followUpTexts(id), ['New requirement'])
})

test('continue_worker resumes a settled worker with the compact follow-up message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = 'cccccccccccccccc'
  await taskFixture(id)
  const review = { head: 'abc', reviewerSessionId: 'reviewer', approved: true }
  await updateTask(id, { status: 'awaiting-merge', review, worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const tool = createContinueTool(context(sends))
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up delivered/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, new RegExp(`Task ID: ${id}`))
  assert.match(sends[0].text, /Branch: sl-test/)
  assert.match(sends[0].text, new RegExp(`Worktree: ${join(home, 'worktree')}`))
  assert.match(sends[0].text, /Base: main \(abc\)/)
  assert.match(sends[0].text, /Follow-up \(the only authoritative instruction for this turn\):\nNew requirement/)
  assert.match(sends[0].text, /Do not redo completed work or repeat the dispatch setup phases\./)
  assert.match(sends[0].text, /If the follow-up applies, commit and call review_worker_commit\./)
  assert.match(sends[0].text, /Landing is not authorized for this task: do not push, open a pull request, or merge/)
  assert.doesNotMatch(sends[0].text, /Landing is authorized for this task/)
  assert.match(sends[0].text, /call message_router once with COMPLETED, INCOMPLETE, or BLOCKED/)
  assert.doesNotMatch(sends[0].text, /Project team:/)
  assert.doesNotMatch(sends[0].text, /Requirements:/)
  assert.doesNotMatch(sends[0].text, /Implement it\./)
  assertSectionOrder(sends[0].text, resumeSections)
  assert.equal((await readTask(id)).status, 'resuming')
  assert.equal((await readTask(id)).task, originalTask)
  assert.deepEqual((await readTask(id)).review, review)
  assert.deepEqual(await followUpTexts(id), ['New requirement'])
})

test('resuming keeps only the current follow-up in the new task message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = 'dddddddddddddddd'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const tool = createContinueTool(context(sends))
  await tool.execute({ taskId: id, task: 'First follow-up' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  await updateTask(id, { status: 'awaiting-merge' })
  await tool.execute({ taskId: id, task: 'Second follow-up' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(sends[0].text, /Follow-up \(the only authoritative instruction for this turn\):\nFirst follow-up/)
  assert.match(sends[1].text, /Follow-up \(the only authoritative instruction for this turn\):\nSecond follow-up/)
  assert.doesNotMatch(sends[1].text, /First follow-up/)
  assert.equal((await readTask(id)).task, originalTask)
  assert.deepEqual(await followUpTexts(id), ['First follow-up', 'Second follow-up'])
})

test('a compacted live worker gets the original requirements replayed', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { updateTask } = await import('../src/task-store.js')
  const id = '5555555555555555'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const worker = {
    status: 'idle',
    session: { deriveMessages: () => [{ source: { kind: 'compact-checkpoint' } }] },
  }
  const tool = createContinueTool(context(sends, worker))
  await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(sends[0].text, /Requirements \(replayed because this session's earlier context was compacted\):\nImplement it\.\n\nAcceptance: tests pass\./)
  assert.match(sends[0].text, /The requirements replayed above are the task's original requirements; do not redo completed work\./)
  assert.match(sends[0].text, /Follow-up \(the only authoritative instruction for this turn\):\nNew requirement/)
  assertSectionOrder(sends[0].text, ['Task ID:', 'Branch:', 'Worktree:', 'Base:', 'Rules:', 'Requirements (replayed', 'Follow-up (the only authoritative instruction for this turn):'])
})

test('a cold worker is inspected for compaction before replaying the requirements', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { updateTask } = await import('../src/task-store.js')
  const id = '6000000000000001'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const inspected = []
  const tool = createContinueTool(context(sends, undefined, undefined, {
    async inspectSession(sessionId, read) {
      inspected.push(sessionId)
      return read({ deriveMessages: () => [{ source: { kind: 'compact-checkpoint' } }] })
    },
  }))
  await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.deepEqual(inspected, ['worker'])
  assert.match(sends[0].text, /Requirements \(replayed because this session's earlier context was compacted\):\nImplement it\./)
})

test('an uncompacted cold worker does not get the original requirements replayed', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { updateTask } = await import('../src/task-store.js')
  const id = '6000000000000002'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const tool = createContinueTool(context(sends, undefined, undefined, {
    async inspectSession(_sessionId, read) {
      return read({ deriveMessages: () => [{ source: { kind: 'user' } }] })
    },
  }))
  await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.doesNotMatch(sends[0].text, /Requirements:/)
  assert.match(sends[0].text, /The original requirements are in the earlier conversation;/)
})

test('other settled states also resume with the compact follow-up message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  for (const [index, status] of ['review-required', 'failed'].entries()) {
    const id = `${'e'.repeat(15)}${index}`
    await taskFixture(id)
    await updateTask(id, { status, worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
    const sends = []
    const tool = createContinueTool(context(sends))
    await tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal })
    assert.match(sends[0].text, /Rules:/)
    assert.match(sends[0].text, /Follow-up \(the only authoritative instruction for this turn\):\nMore work/)
    assert.equal((await readTask(id)).status, 'resuming')
  }
})

test('a BLOCKED task that settled before creating its worktree can be continued', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '7000000000000001'
  await taskFixture(id)
  await updateTask(id, { status: 'failed', stopReason: 'completed', finishedAt: new Date().toISOString() })
  const sends = []
  const tool = createContinueTool(context(sends))
  const text = await tool.execute({ taskId: id, task: 'Use the decision below' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up delivered/)
  assert.match(sends[0].text, new RegExp(`Task ID: ${id}`))
  assert.match(sends[0].text, /Branch: not created yet/)
  assert.match(sends[0].text, /Worktree: not created yet/)
  assert.match(sends[0].text, /if you have not created it yet, call create_worktree once/)
  assert.match(sends[0].text, /Query the knowledge base with knowledge_query before changing anything/)
  assert.match(sends[0].text, /Follow-up \(the only authoritative instruction for this turn\):\nUse the decision below/)
  assert.equal((await readTask(id)).status, 'resuming')
  assert.deepEqual(await followUpTexts(id), ['Use the decision below'])
})

test('a BLOCKED report task resumes with read-only report instructions', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '7000000000000002'
  await taskFixture(id)
  await updateTask(id, { mode: 'report', status: 'failed', stopReason: 'completed' })
  const sends = []
  const tool = createContinueTool(context(sends))
  await tool.execute({ taskId: id, task: 'Try the public registry' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(sends[0].text, new RegExp(`Task ID: ${id}`))
  assert.match(sends[0].text, /report-only/)
  assert.match(sends[0].text, /do not create a worktree, edit files, commit, or move HEAD/)
  assert.match(sends[0].text, /call report_task once with the conclusion and evidence/)
  assert.doesNotMatch(sends[0].text, /call create_worktree once/)
  assert.doesNotMatch(sends[0].text, /commit and call review_worker_commit/)
  assert.equal((await readTask(id)).status, 'resuming')
})

test('continue_worker tells the router to retry a queued or starting task', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  for (const [index, status] of ['queued', 'starting'].entries()) {
    const id = `${'7'.repeat(15)}${index}`
    await taskFixture(id, status)
    const sends = []
    const tool = createContinueTool(context(sends))
    const text = await tool.execute({ taskId: id, task: 'New requirement', land: true }, { agent: { id: 'router' }, signal: new AbortController().signal })
    assert.match(text, new RegExp(`is still ${status}`))
    assert.match(text, /its worker has not started, so the follow-up was not delivered/)
    assert.match(text, /Retry continue_worker after it starts/)
    assert.equal(sends.length, 0)
    const task = await readTask(id)
    assert.equal(task.status, status)
    assert.equal(task.land, undefined)
    assert.deepEqual(task.followUps ?? [], [])
  }
})

test('continue_worker retries a task stuck in resuming instead of refusing it', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '7000000000000003'
  await taskFixture(id)
  await updateTask(id, { status: 'resuming', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const tool = createContinueTool(context(sends))
  await tool.execute({ taskId: id, task: 'Continue the resume' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(sends[0].text, /Follow-up \(the only authoritative instruction for this turn\):\nContinue the resume/)
  assert.equal((await readTask(id)).status, 'resuming')
  assert.deepEqual(await followUpTexts(id), ['Continue the resume'])
})

test('a failed delivery to a resuming task keeps it resuming', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '7000000000000007'
  await taskFixture(id)
  await updateTask(id, { status: 'resuming', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const tool = createContinueTool({ subagents: { async sendMessage() { throw new Error('worker is gone') } } })
  await assert.rejects(
    tool.execute({ taskId: id, task: 'Continue the resume' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  const task = await readTask(id)
  assert.equal(task.status, 'resuming')
  assert.deepEqual(task.followUps ?? [], [])
})

test('continue_worker refuses a task whose branch was already merged', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '7000000000000004'
  await taskFixture(id)
  await updateTask(id, { status: 'merged', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const tool = createContinueTool(context([]))
  await assert.rejects(
    tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /is already merged; dispatch new work instead of resuming it/,
  )
  assert.equal((await readTask(id)).status, 'merged')
})

test('continue_worker refuses a task whose worker branch was deleted', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '7000000000000005'
  await taskFixture(id)
  await updateTask(id, { status: 'failed', branchDeletedAt: new Date().toISOString() })
  const tool = createContinueTool(context([]))
  await assert.rejects(
    tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /The worker branch for task .* was deleted; dispatch new work instead of resuming it/,
  )
  assert.equal((await readTask(id)).status, 'failed')
})

test('continue_worker refuses a task whose recorded worktree is gone', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '7000000000000006'
  const path = join(home, 'missing-worktree')
  await taskFixture(id)
  await updateTask(id, { status: 'failed', worktree: { path, branch: 'sl-test' } })
  const tool = createContinueTool(context([]))
  await assert.rejects(
    tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /The worktree recorded for task .* is gone; dispatch new work instead of resuming it/,
  )
  assert.equal((await readTask(id)).status, 'failed')
})

test('continue_worker refuses delivery states that are no longer unpublished work', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  for (const [index, status] of ['awaiting-ci', 'publishing', 'merging', 'delivery-blocked'].entries()) {
    const id = `800000000000000${index}`
    await taskFixture(id)
    await updateTask(id, { status, worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
    const tool = createContinueTool(context([]))
    await assert.rejects(
      tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
      new RegExp(`is ${status} and can no longer be resumed; dispatch new work instead`),
    )
    assert.equal((await readTask(id)).status, status)
  }
})

test('continue_worker steers an active worker even when the task record is settled', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '3333333333333333'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' }, review: { head: 'abc', approved: true } })
  const sends = []
  const tool = createContinueTool(context(sends, 'running'))
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /running worker/)
  assert.match(sends[0].text, /Requirements update/)
  assert.match(sends[0].text, /First decide whether it belongs to this task/)
  assert.doesNotMatch(sends[0].text, /Project team:/)
  const task = await readTask(id)
  assert.equal(task.status, 'awaiting-merge')
  assert.equal(task.review.head, 'abc')
  assert.deepEqual(await followUpTexts(id), ['New requirement'])
})

test('continue_worker wakes a running task when the worker agent is not loaded', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = '4444444444444444'
  await taskFixture(id)
  const sends = []
  const tool = createContinueTool(context(sends))
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up delivered/)
  assert.match(sends[0].text, new RegExp(`Task ID: ${id}`))
  assert.match(sends[0].text, /Follow-up \(the only authoritative instruction for this turn\):\nNew requirement/)
  assert.equal((await readTask(id)).status, 'running')
  assert.deepEqual(await followUpTexts(id), ['New requirement'])
})

test('a failed steering delivery leaves the task running', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = 'ffffffffffffffff'
  await taskFixture(id)
  const tool = createContinueTool({ agents: { get: () => ({ status: 'running' }) }, subagents: { async sendMessage() { throw new Error('worker is gone') } } })
  await assert.rejects(
    tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  const task = await readTask(id)
  assert.equal(task.status, 'running')
  assert.deepEqual(task.followUps ?? [], [])
})

test('a failed wake-up delivery leaves the running task running', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = '1111111111111111'
  await taskFixture(id)
  const tool = createContinueTool({ agents: { get: () => ({ status: 'idle' }) }, subagents: { async sendMessage() { throw new Error('worker is gone') } } })
  await assert.rejects(
    tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  const task = await readTask(id)
  assert.equal(task.status, 'running')
  assert.deepEqual(task.followUps ?? [], [])
})

test('a failed resume delivery marks the settled task failed', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = '2222222222222222'
  await taskFixture(id)
  const review = { head: 'abc', reviewerSessionId: 'reviewer', approved: true }
  await updateTask(id, { status: 'awaiting-merge', review, worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const tool = createContinueTool({ subagents: { async sendMessage() { throw new Error('worker is gone') } } })
  await assert.rejects(
    tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  const task = await readTask(id)
  assert.equal(task.status, 'failed')
  assert.deepEqual(task.review, review)
  assert.deepEqual(task.followUps ?? [], [])
})

