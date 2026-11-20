import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-continue-'))
process.env.HOME = home

test('continue_worker steers a running worker without changing its status', async (t) => {
  const { createContinueTool } = await import('../src/continue.js')
  const { createTask, readTask } = await import('../src/task-store.js')
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
  assert.match(sends[0].text, /Requirements update/)
  assert.match(sends[0].text, /New requirement/)
  assert.equal((await readTask(id)).status, 'running')
  t.after(() => rm(home, { recursive: true, force: true }))
})
