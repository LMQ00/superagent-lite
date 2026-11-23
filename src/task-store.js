import { open, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

const writesByRoot = new Map()

function safeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(value)) {
    throw new TypeError('Invalid superagent-lite task identity')
  }
  return value
}

function sessionKey(value) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('Invalid worker Session identity')
  return createHash('sha256').update(value).digest('hex')
}

function serializeForRoot(root, key, operation) {
  let writes = writesByRoot.get(root)
  if (!writes) {
    writes = new Map()
    writesByRoot.set(root, writes)
  }
  const previous = writes.get(key) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(operation)
  writes.set(key, current)
  return current.finally(() => {
    if (writes.get(key) === current) writes.delete(key)
  })
}

export function createTaskStore(baseDir = join(homedir(), '.dsh', 'superagent-lite')) {
  const tasksDir = join(baseDir, 'tasks')
  const sessionsDir = join(tasksDir, 'sessions')

  async function ensureDirectories() {
    await mkdir(sessionsDir, { recursive: true, mode: 0o700 })
  }

  async function writeAtomic(path, value) {
    const temporary = `${path}.${randomUUID()}.tmp`
    let handle
    try {
      handle = await open(temporary, 'wx', 0o600)
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporary, path)
    } catch (error) {
      await handle?.close().catch(() => {})
      await rm(temporary, { force: true }).catch(() => {})
      throw error
    }
  }

  async function createTask(task) {
    const id = safeId(task.id)
    await ensureDirectories()
    return serializeForRoot(baseDir, 'create', async () => {
      const path = join(tasksDir, `${id}.json`)
      try {
        await readFile(path, 'utf8')
        return false
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (task.teamId && task.projectRoot) {
        const records = await listTasks()
        if (records.some(record => (record.teamId === task.teamId) !== (record.projectRoot === task.projectRoot))) {
          throw new Error('The project and team must retain their existing one-to-one assignment')
        }
      }
      await writeAtomic(path, task)
      return true
    })
  }

  async function readTask(id) {
    const path = join(tasksDir, `${safeId(id)}.json`)
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw error
    }
  }

  async function updateTask(id, changes) {
    const safe = safeId(id)
    await ensureDirectories()
    return serializeForRoot(baseDir, `task:${safe}`, async () => {
      const path = join(tasksDir, `${safe}.json`)
      const task = JSON.parse(await readFile(path, 'utf8'))
      const next = { ...task, ...(typeof changes === 'function' ? changes(task) : changes), updatedAt: new Date().toISOString() }
      await writeAtomic(path, next)
      return next
    })
  }

  async function removeTask(id) {
    const safe = safeId(id)
    return serializeForRoot(baseDir, `task:${safe}`, async () => {
      const path = join(tasksDir, `${safe}.json`)
      let task
      try {
        task = JSON.parse(await readFile(path, 'utf8'))
      } catch (error) {
        if (error.code === 'ENOENT') return false
        throw error
      }
      await rm(path, { force: true })
      if (task.workerSessionId) {
        await rm(join(sessionsDir, `${sessionKey(task.workerSessionId)}.json`), { force: true })
      }
      return true
    })
  }

  async function linkWorkerSession(taskId, sessionId) {
    await ensureDirectories()
    const safe = safeId(taskId)
    const path = join(sessionsDir, `${sessionKey(sessionId)}.json`)
    await writeAtomic(path, { taskId: safe, sessionId })
  }

  async function taskForSession(taskId, sessionId) {
    if (taskId !== undefined) {
      const task = await readTask(taskId)
      return task?.workerSessionId === undefined || task.workerSessionId === sessionId ? task : undefined
    }

    try {
      const link = JSON.parse(await readFile(join(sessionsDir, `${sessionKey(sessionId)}.json`), 'utf8'))
      const task = await readTask(link.taskId)
      return task?.workerSessionId === sessionId ? task : undefined
    } catch (error) {
      if (error.code === 'ENOENT') return undefined
      throw error
    }
  }

  async function listTasks() {
    let names
    try {
      names = await readdir(tasksDir)
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
    const tasks = await Promise.all(names.filter(name => /^[a-f0-9]{16}\.json$/.test(name)).map(name => readTask(name.slice(0, -5))))
    return tasks.filter(Boolean).sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
  }

  return { createTask, readTask, updateTask, removeTask, listTasks, linkWorkerSession, taskForSession, root: baseDir }
}

const store = createTaskStore()
export const { createTask, readTask, updateTask, removeTask, listTasks, linkWorkerSession, taskForSession } = store
export const dataRoot = store.root
