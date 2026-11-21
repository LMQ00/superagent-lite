import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-continue-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))

const originalTask = 'Implement it.\n\nAcceptance: tests pass.'
const runningInstruction = 'Requirements update for the same task. Apply it to your current work; restart only if the change requires it. If you have not created your worktree yet, call create_worktree once; otherwise it re-enters the existing checkout instead of creating another. Do not push or merge.'
const resumingInstruction = 'Continue the same task in your assigned worktree. After committing changes, call review_worker_commit again. Do not push or merge.'
const sections = ['Project team:', 'Base branch:', 'Task:', 'Requirements:', 'Follow-up:', 'Before:', 'During:', 'After:', 'Reporting:']

function envelope(instruction) {
  return `Project team: team\nBase branch: main\nTask: Task\n\nRequirements:\n${originalTask}\n\nFollow-up:\nNew requirement\n\n${instruction}\n\n`
}

function assertTaskMessage(text, instruction) {
  assert.ok(text.startsWith(envelope(instruction)), text)
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

test('continue_worker sends a running worker the task message before it creates a worktree', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = 'aaaaaaaaaaaaaaaa'
  await taskFixture(id)
  const sends = []
  const ctx = { subagents: { async sendMessage(sender, targetId, content) { sends.push({ sender: sender.id, targetId, text: content[0].text }) } } }
  const tool = createContinueTool(ctx)
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /running worker/)
  assert.equal(sends[0].targetId, 'worker')
  assertTaskMessage(sends[0].text, runningInstruction)
  assert.match(sends[0].text, /If you have not created your worktree yet, call create_worktree once; otherwise it re-enters the existing checkout instead of creating another\./)
  assert.equal((await readTask(id)).status, 'running')
})

test('continue_worker resumes a settled worker with the full dispatch task message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = 'bbbbbbbbbbbbbbbb'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const ctx = { subagents: { async sendMessage(sender, targetId, content) { sends.push({ sender: sender.id, targetId, text: content[0].text }) } } }
  const tool = createContinueTool(ctx)
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up accepted/)
  assert.equal(sends[0].targetId, 'worker')
  assertTaskMessage(sends[0].text, resumingInstruction)
  assert.equal((await readTask(id)).status, 'resuming')
})

test('a failed running delivery leaves the task running', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const id = 'cccccccccccccccc'
  await taskFixture(id)
  const ctx = { subagents: { async sendMessage() { throw new Error('worker is gone') } } }
  const tool = createContinueTool(ctx)
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
  const ctx = { subagents: { async sendMessage() { throw new Error('worker is gone') } } }
  const tool = createContinueTool(ctx)
  await assert.rejects(
    tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  assert.equal((await readTask(id)).status, 'failed')
})
