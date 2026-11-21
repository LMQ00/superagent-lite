import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'continue-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))

const originalTask = 'Implement it.\n\nAcceptance: tests pass.'
const continuationSections = ['Project team:', 'Base branch:', 'Task:', 'Requirements:', 'Follow-up:', 'Before:', 'During:', 'After:', 'Reporting:', 'Resume:']

function assertSectionOrder(text, sections) {
  let previous = -1
  for (const section of sections) {
    const index = section === 'Project team:' ? text.indexOf(section) : text.indexOf(`\n${section}`)
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

function context(sends, workerStatus, onSend) {
  return {
    agents: { get: () => workerStatus === undefined ? undefined : { status: workerStatus } },
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

test('continue_worker sends the task message to an idle worker whose task is still running', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = 'bbbbbbbbbbbbbbbb'
  await taskFixture(id)
  const sends = []
  const tool = createContinueTool(context(sends, 'idle'))
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up delivered/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, /Project team: team/)
  assert.match(sends[0].text, /Requirements:\nImplement it\.\n\nAcceptance: tests pass\./)
  assert.match(sends[0].text, /Follow-up:\nNew requirement/)
  assert.match(sends[0].text, /Resume:/)
  assert.match(sends[0].text, /report BLOCKED with the mismatch instead of requesting another review/)
  assertSectionOrder(sends[0].text, continuationSections)
  assert.equal((await readTask(id)).status, 'running')
  assert.deepEqual(await followUpTexts(id), ['New requirement'])
})

test('continue_worker resumes a settled worker with the dispatch task message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = 'cccccccccccccccc'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const tool = createContinueTool(context(sends))
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up delivered/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, /Project team: team/)
  assert.match(sends[0].text, /Base branch: main/)
  assert.match(sends[0].text, /Task: Task/)
  assert.match(sends[0].text, /Requirements:\nImplement it\.\n\nAcceptance: tests pass\./)
  assert.match(sends[0].text, /Follow-up:\nNew requirement/)
  assert.match(sends[0].text, /Do not redo completed work or repeat the dispatch setup phases\./)
  assert.match(sends[0].text, /Do not push; merge only after the user explicitly authorizes it/)
  assertSectionOrder(sends[0].text, continuationSections)
  assert.equal((await readTask(id)).status, 'resuming')
  assert.equal((await readTask(id)).task, originalTask)
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
  assert.match(sends[0].text, /Follow-up:\nFirst follow-up/)
  assert.match(sends[1].text, /Follow-up:\nSecond follow-up/)
  assert.doesNotMatch(sends[1].text, /First follow-up/)
  assert.equal((await readTask(id)).task, originalTask)
  assert.deepEqual(await followUpTexts(id), ['First follow-up', 'Second follow-up'])
})

test('other settled states also resume with the task message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  for (const [index, status] of ['review-required', 'failed'].entries()) {
    const id = `${'e'.repeat(15)}${index}`
    await taskFixture(id)
    await updateTask(id, { status, worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
    const sends = []
    const tool = createContinueTool(context(sends))
    await tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal })
    assert.match(sends[0].text, /Project team: team/)
    assert.equal((await readTask(id)).status, 'resuming')
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
  assert.match(sends[0].text, /Project team: team/)
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
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const tool = createContinueTool({ subagents: { async sendMessage() { throw new Error('worker is gone') } } })
  await assert.rejects(
    tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  const task = await readTask(id)
  assert.equal(task.status, 'failed')
  assert.deepEqual(task.followUps ?? [], [])
})
