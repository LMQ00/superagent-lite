import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-continue-'))
process.env.HOME = home

test('continue_worker asks the worker to judge follow-up scope before applying it', async (t) => {
  t.after(() => rm(home, { recursive: true, force: true }))
  const { createContinueTool } = await import('../src/continue.js')
  const { createTask, readTask, updateTask } = await import('../src/task-store.js')
  const id = 'aaaaaaaaaaaaaaaa'
  await createTask({
    id, title: 'Task', teamId: 'team', task: 'Do it', parentSessionId: 'router',
    projectRoot: home, baseCommit: 'abc', baseBranch: 'main', workerSessionId: 'worker',
    status: 'running', createdAt: new Date().toISOString(),
  })
  const sends = []
  const followUpsAtSend = []
  const ctx = {
    subagents: {
      async sendMessage(sender, targetId, content) {
        const task = await readTask(id)
        followUpsAtSend.push((task.followUps ?? []).map(item => item.text))
        sends.push({ sender: sender.id, targetId, text: content[0].text })
      },
    },
  }
  const tool = createContinueTool(ctx)
  const text = await tool.execute({ taskId: id, task: 'New requirement' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(text, /running worker/)
  assert.equal(sends[0].targetId, 'worker')
  assert.match(sends[0].text, /Follow-up for the same task/)
  assert.match(sends[0].text, /Apply an addition or change within the task's goal/)
  assert.match(sends[0].text, /keep working on the current task/)
  assert.match(sends[0].text, /include the unapplied follow-up in your final report/)
  assert.match(sends[0].text, /restart only if the change requires it/)
  assert.doesNotMatch(sends[0].text, /as BLOCKED/)
  assert.match(sends[0].text, /New requirement/)
  assert.deepEqual(followUpsAtSend[0], ['New requirement'])
  assert.equal((await readTask(id)).status, 'running')
  assert.equal((await readTask(id)).task, 'Do it')
  assert.deepEqual((await readTask(id)).followUps.map(item => item.text), ['New requirement'])

  await updateTask(id, current => ({ ...current, status: 'awaiting-merge', worktree: { path: join(home, 'worktree'), branch: 'sl-test' } }))
  const resumed = await tool.execute({ taskId: id, task: 'More work' }, { agent: { id: 'router' }, signal: new AbortController().signal })
  assert.match(resumed, /Follow-up delivered/)
  assert.match(resumed, /worker decides whether it belongs/)
  assert.match(sends[1].text, /Decide whether this follow-up belongs to the task/)
  assert.match(sends[1].text, /apply it if it stays within the task's goal/)
  assert.match(sends[1].text, /report BLOCKED with the mismatch and do not request another review/)
  assert.match(sends[1].text, /If it applies, after committing changes call review_worker_commit again/)
  assert.match(sends[1].text, /More work/)
  assert.doesNotMatch(sends[1].text, /as BLOCKED/)
  assert.deepEqual(followUpsAtSend[1], ['New requirement', 'More work'])
  assert.equal((await readTask(id)).status, 'resuming')
  assert.equal((await readTask(id)).task, 'Do it')
  assert.deepEqual((await readTask(id)).followUps.map(item => item.text), ['New requirement', 'More work'])
})
