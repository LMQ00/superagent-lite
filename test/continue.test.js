import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-continue-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))

const originalTask = 'Implement it.\n\nAcceptance: tests pass.'
const runningInstruction = 'Apply it to your current work; restart only if the change requires it. Your worktree already exists: create_worktree re-enters it and never creates a second checkout. Do not push or merge.'
const resumingInstruction = 'Continue the same task in your assigned worktree. After committing changes, call review_worker_commit again. Do not push or merge.'

async function taskFixture(id, status = 'running') {
  const { createTask } = await import('../src/task-store.js')
  await createTask({
    id, title: 'Task', teamId: 'team', task: originalTask, parentSessionId: 'router',
    projectRoot: home, baseCommit: 'abc', baseBranch: 'main', workerSessionId: 'worker',
    status, createdAt: new Date().toISOString(),
  })
}

test('continue_worker sends a running worker the dispatch task message without recreating the worktree', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask } = await import('../src/task-store.js')
  const { buildWorkerPrompt } = await import('../src/worker-prompt.js')
  const id = 'aaaaaaaaaaaaaaaa'
  await taskFixture(id)
  const sends = []
  const ctx = { subagents: { async sendMessage(sender, targetId, content) { sends.push({ sender: sender.id, targetId, text: content[0].text }) } } }
  const tool = createContinueTool(ctx)
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /running worker/)
  assert.equal(sends[0].targetId, 'worker')
  assert.equal(sends[0].text, buildWorkerPrompt({
    title: 'Task', teamId: 'team', baseBranch: 'main',
    task: `${originalTask}\n\nFollow-up:\nNew requirement\n\n${runningInstruction}`,
  }))
  assert.match(sends[0].text, /^Project team: team\nBase branch: main\nTask: Task\n\nRequirements:\nImplement it\.\n\nAcceptance: tests pass\./)
  assert.match(sends[0].text, /Follow-up:\nNew requirement/)
  assert.match(sends[0].text, /Your worktree already exists: create_worktree re-enters it and never creates a second checkout\./)
  assert.match(sends[0].text, /Before:/)
  assert.match(sends[0].text, /During:/)
  assert.match(sends[0].text, /After:/)
  assert.match(sends[0].text, /Reporting:/)
  assert.equal((await readTask(id)).status, 'running')
})

test('continue_worker resumes a settled worker with the full dispatch task message', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const { buildWorkerPrompt } = await import('../src/worker-prompt.js')
  const id = 'bbbbbbbbbbbbbbbb'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const ctx = { subagents: { async sendMessage(sender, targetId, content) { sends.push({ sender: sender.id, targetId, text: content[0].text }) } } }
  const tool = createContinueTool(ctx)
  const text = await tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up accepted/)
  assert.equal(sends[0].targetId, 'worker')
  assert.equal(sends[0].text, buildWorkerPrompt({
    title: 'Task', teamId: 'team', baseBranch: 'main',
    task: `${originalTask}\n\nFollow-up:\nMore work\n\n${resumingInstruction}`,
  }))
  assert.match(sends[0].text, /^Project team: team\nBase branch: main\nTask: Task\n\nRequirements:\nImplement it\.\n\nAcceptance: tests pass\./)
  assert.match(sends[0].text, /Follow-up:\nMore work/)
  assert.match(sends[0].text, /Continue the same task in your assigned worktree\./)
  assert.match(sends[0].text, /Before:/)
  assert.match(sends[0].text, /During:/)
  assert.match(sends[0].text, /After:/)
  assert.match(sends[0].text, /Reporting:/)
  assert.equal((await readTask(id)).status, 'resuming')
})

test('a failed resume delivery marks the settled task failed', async () => {
  const { createContinueTool } = await import('../src/continue.js')
  const { readTask, updateTask } = await import('../src/task-store.js')
  const id = 'cccccccccccccccc'
  await taskFixture(id)
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const ctx = { subagents: { async sendMessage() { throw new Error('worker is gone') } } }
  const tool = createContinueTool(ctx)
  await assert.rejects(
    tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal }),
    /worker is gone/,
  )
  assert.equal((await readTask(id)).status, 'failed')
})
