import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createTaskStore } from '../src/task-store.js'

test('task store creates private records and resolves a worker session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-lite-'))
  const store = createTaskStore(root)
  try {
    const task = { id: 'task_1', title: 'Add feature', parentSessionId: 'parent-1', status: 'starting' }
    assert.equal(await store.createTask(task), true)
    assert.equal(await store.createTask(task), false)
    await store.updateTask(task.id, { workerSessionId: 'worker-1', status: 'running' })
    await store.linkWorkerSession(task.id, 'worker-1')

    assert.deepEqual(await store.taskForSession(undefined, 'worker-1'), {
      ...task,
      workerSessionId: 'worker-1',
      status: 'running',
      updatedAt: (await store.readTask(task.id)).updatedAt,
    })
    assert.equal(await store.taskForSession('task_1', 'another-worker'), undefined)

    const taskFile = await readFile(join(root, 'tasks', 'task_1.json'), 'utf8')
    assert.equal(JSON.parse(taskFile).status, 'running')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('task store removes a task and its worker session link', async () => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-lite-'))
  const store = createTaskStore(root)
  try {
    const task = { id: '0123456789abcdef', workerSessionId: 'worker-1', status: 'completed' }
    assert.equal(await store.createTask(task), true)
    await store.linkWorkerSession(task.id, task.workerSessionId)
    assert.deepEqual((await store.listTasks()).map(record => record.id), [task.id])
    assert.equal(await store.removeTask(task.id), true)
    assert.equal(await store.readTask(task.id), undefined)
    assert.deepEqual(await store.listTasks(), [])
    assert.equal(await store.taskForSession(undefined, task.workerSessionId), undefined)
    assert.equal(await store.removeTask(task.id), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('task store rejects path-shaped identities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'superagent-lite-'))
  const store = createTaskStore(root)
  try {
    await assert.rejects(store.readTask('../escape'), /Invalid superagent-lite task identity/)
    await assert.rejects(store.removeTask('../escape'), /Invalid superagent-lite task identity/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
