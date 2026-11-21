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
const sections = ['Project team:', 'Base branch:', 'Task:', 'Requirements:', 'Follow-up:', 'Before:', 'During:', 'After:', 'Reporting:']

function assertSectionOrder(text) {
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

function context(sends) {
  return { subagents: { async sendMessage(sender, targetId, content) { sends.push({ sender: sender.id, targetId, text: content[0].text }) } } }
}

test('continue_worker keeps steering a running worker with a requirements update', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = 'aaaaaaaaaaaaaaaa'
  await taskFixture(id)
  const sends = []
  const tool = createContinueTool(context(sends))
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /running worker/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, /Requirements update/)
  assert.match(sends[0].text, /New requirement/)
  assert.doesNotMatch(sends[0].text, /Project team:/)
  assert.equal((await readTask(id)).status, 'running')
})

test('continue_worker resumes a settled worker with the dispatch task message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = 'bbbbbbbbbbbbbbbb'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const tool = createContinueTool(context(sends))
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up accepted/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, /Project team: team/)
  assert.match(sends[0].text, /Base branch: main/)
  assert.match(sends[0].text, /Task: Task/)
  assert.match(sends[0].text, /Requirements:\nImplement it\.\n\nAcceptance: tests pass\./)
  assert.match(sends[0].text, /Follow-up:\nNew requirement/)
  assert.match(sends[0].text, /Resume from where you stopped; do not redo completed work/)
  assert.match(sends[0].text, /Do not push or merge/)
  assertSectionOrder(sends[0].text)
  assert.equal((await readTask(id)).status, 'resuming')
})

test('resuming keeps only the current follow-up in the new task message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { updateTask } = await import('../src/task-store.js')
  const id = 'eeeeeeeeeeeeeeee'
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
})

test('other settled states also resume with the task message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  for (const [index, status] of ['review-required', 'failed'].entries()) {
    const id = `${'f'.repeat(15)}${index}`
    await taskFixture(id)
    await updateTask(id, { status, worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
    const sends = []
    const tool = createContinueTool(context(sends))
    await tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal })
    assert.match(sends[0].text, /Project team: team/)
    assert.equal((await readTask(id)).status, 'resuming')
  }
})

test('a failed running delivery leaves the task running', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = 'cccccccccccccccc'
  await taskFixture(id)
  const tool = createContinueTool({ subagents: { async sendMessage() { throw new Error('worker is gone') } } })
  await assert.rejects(
    tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  assert.equal((await readTask(id)).status, 'running')
})

test('a failed resume delivery marks the settled task failed', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = 'dddddddddddddddd'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const tool = createContinueTool({ subagents: { async sendMessage() { throw new Error('worker is gone') } } })
  await assert.rejects(
    tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  assert.equal((await readTask(id)).status, 'failed')
})
