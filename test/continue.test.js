import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-continue-'))
process.env.HOME = home

test('continue_worker reuses the dispatch task message shape for running and settled workers', async (t) => {
  const { createContinueTool } = await import('../src/continue.js')
  const { createTask, readTask, updateTask } = await import('../src/task-store.js')
  const id = 'aaaaaaaaaaaaaaaa'
  await createTask({
    id, title: 'Task', teamId: 'team', task: 'Do it', parentSessionId: 'router',
    projectRoot: home, baseCommit: 'abc', baseBranch: 'main', workerSessionId: 'worker',
    status: 'running', createdAt: new Date().toISOString(),
  })
  const sends = []
  const ctx = { subagents: { async sendMessage(sender, targetId, content) { sends.push({ sender: sender.id, targetId, text: content[0].text }) } } }
  const tool = createContinueTool(ctx)
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /running worker/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, /^Project team: team\nBase branch: main\nTask: Task\n\nRequirements:\nDo it/)
  assert.match(sends[0].text, /Follow-up:\nNew requirement/)
  assert.match(sends[0].text, /Apply it to your current work; restart only if the change requires it\./)
  assert.match(sends[0].text, /Before:\n- call create_worktree once/)
  assert.match(sends[0].text, /During:/)
  assert.match(sends[0].text, /After:/)
  assert.match(sends[0].text, /Do not push or merge; stop after the reviewed commit\./)
  assert.equal((await readTask(id)).status, 'running')

  await updateTask(id, { status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } })
  const resumed = await tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(resumed, /Follow-up accepted/)
  assert.match(sends[1].text, /^Project team: team\nBase branch: main\nTask: Task\n\nRequirements:\nDo it/)
  assert.match(sends[1].text, /Follow-up:\nMore work/)
  assert.match(sends[1].text, /Continue the same task in your assigned worktree\. After committing changes, call review_worker_commit again\./)
  assert.equal((await readTask(id)).status, 'resuming')
  t.after(() => rm(home, { recursive: true, force: true }))
})
