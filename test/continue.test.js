import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-continue-'))
process.env.HOME = home

const originalTask = 'Implement it.\n\nAcceptance: tests pass.'

test('continue_worker sends a running worker the task message without the dispatch setup phase', async (t) => {
  const { createContinueTool } = await import('../src/continue.js')
  const { createTask, readTask } = await import('../src/task-store.js')
  const { buildWorkerPrompt } = await import('../src/worker-prompt.js')
  const id = 'aaaaaaaaaaaaaaaa'
  await createTask({
    id, title: 'Task', teamId: 'team', task: originalTask, parentSessionId: 'router',
    projectRoot: home, baseCommit: 'abc', baseBranch: 'main', workerSessionId: 'worker',
    status: 'running', createdAt: new Date().toISOString(),
  })
  const sends = []
  const ctx = { subagents: { async sendMessage(sender, targetId, content) { sends.push({ sender: sender.id, targetId, text: content[0].text }) } } }
  const tool = createContinueTool(ctx)
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /running worker/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, /^Project team: team\nBase branch: main\nTask: Task\n\nRequirements:\nImplement it\.\n\nAcceptance: tests pass\./)
  const dispatchHeader = buildWorkerPrompt({ title: 'Task', teamId: 'team', baseBranch: 'main', task: originalTask }).split('\n\n')[0]
  assert.equal(sends[0].text.split('\n\n')[0], dispatchHeader)
  assert.match(sends[0].text, /Follow-up:\nNew requirement/)
  assert.match(sends[0].text, /Before:\n- Use the worktree already assigned to this task/)
  assert.doesNotMatch(sends[0].text, /call create_worktree once/)
  assert.match(sends[0].text, /During:\n- Apply the follow-up to your current work; restart only if the change requires it\./)
  assert.match(sends[0].text, /After:\n- Commit on the assigned branch and call review_worker_commit; do not push or merge\./)
  assert.equal((await readTask(id)).status, 'running')
  t.after(() => rm(join(home, 'tasks'), { recursive: true, force: true }))
})

test('continue_worker resumes a settled worker with the full dispatch task message', async (t) => {
  const { createContinueTool } = await import('../src/continue.js')
  const { createTask, readTask, updateTask } = await import('../src/task-store.js')
  const { buildWorkerPrompt } = await import('../src/worker-prompt.js')
  const id = 'bbbbbbbbbbbbbbbb'
  await createTask({
    id, title: 'Second task', teamId: 'team', task: originalTask, parentSessionId: 'router',
    projectRoot: home, baseCommit: 'abc', baseBranch: 'main', workerSessionId: 'worker',
    status: 'running', createdAt: new Date().toISOString(),
  })
  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const sends = []
  const ctx = { subagents: { async sendMessage(sender, targetId, content) { sends.push({ sender: sender.id, targetId, text: content[0].text }) } } }
  const tool = createContinueTool(ctx)
  const text = await tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /Follow-up accepted/)
  assert.equal(sends[0].targetId, 'worker')
  assert.equal(sends[0].text, buildWorkerPrompt({
    title: 'Second task',
    teamId: 'team',
    baseBranch: 'main',
    task: `${originalTask}\n\nFollow-up:\nMore work\n\nContinue the same task in your assigned worktree. After committing changes, call review_worker_commit again. Do not push or merge.`,
  }))
  assert.match(sends[0].text, /^Project team: team\nBase branch: main\nTask: Second task/)
  assert.equal((await readTask(id)).status, 'resuming')
  t.after(() => rm(join(home, 'tasks'), { recursive: true, force: true }))
})
