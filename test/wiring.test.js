import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'superagent-lite-wiring-'))
const originalHome = process.env.HOME
const originalAgentsHome = process.env.DSH_AGENTS_HOME
process.env.HOME = home
delete process.env.DSH_AGENTS_HOME

after(async () => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  if (originalAgentsHome === undefined) delete process.env.DSH_AGENTS_HOME
  else process.env.DSH_AGENTS_HOME = originalAgentsHome
  await rm(home, { recursive: true, force: true })
})

test('apply wires turn/end into a reminder delivered on agent idle', async () => {
  const { apply } = await import('../index.js')
  const listeners = new Map()
  const followups = []
  const agent = {
    id: 'router',
    session: { id: 'router' },
    followup: message => followups.push(message),
  }
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get: id => id === agent.id ? agent : undefined, list: () => [] },
    agentPresets: { composedPreset: () => 'superagent-lite' },
  }
  await apply(ctx)
  const emit = (name, ...args) => listeners.get(name)(...args)

  emit('session/event', agent.session, { type: 'user/message', data: { id: 'input', source: { kind: 'user' } } })
  emit('session/event', agent.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  assert.equal(followups.length, 0)
  emit('agent/status', { agent, status: 'running' })
  assert.equal(followups.length, 0)
  emit('agent/status', { agent, status: 'idle' })
  assert.equal(followups.length, 1)
  assert.match(followups[0].content[0].text, /dispatch_worker/)
})

test('the catalog guard wraps preset listeners that add the catalog after next()', async () => {
  const { apply } = await import('../index.js')
  const skillRoot = join(home, '.agents', 'skills', 'superagent-npm-publish')
  await mkdir(skillRoot, { recursive: true })
  await writeFile(join(skillRoot, 'SKILL.md'), [
    '---',
    'name: superagent-npm-publish',
    'author: memory',
    'description: "Publish the package."',
    '---',
    '',
    'Body.',
    '',
  ].join('\n'))
  const catalog = (entries, update = false) => ({
    id: update ? 'catalog-update' : 'catalog',
    source: { kind: 'skill-catalog', form: 'catalog', ...update ? { update: true } : {}, entries },
  })
  const initial = catalog([{ name: 'find-skills', description: 'Find skills.' }])
  const update = catalog([
    { name: 'find-skills', description: 'Find skills.' },
    { name: 'superagent-npm-publish', description: 'Publish the package.' },
  ], true)
  const chain = []
  let calls = 0
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler, options) {
      if (name !== 'agent/pre-step') return
      if (options?.prepend) chain.unshift(handler)
      else chain.push(handler)
    },
    agents: { get() {}, list: () => [] },
    agentPresets: { composedPreset: () => 'superagent-lite-worker' },
  }
  // The worker preset's tool-skill listener is mounted before this plugin and
  // appends the catalog on its way out.
  ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    return { ...decision, messages: [...decision.messages, calls++ === 0 ? initial : update] }
  })
  await apply(ctx)
  const agent = {
    id: 'worker-catalog-wiring',
    session: { id: 'worker-catalog-wiring', header: { origin: 'subagent', parentSession: 'router' } },
    ctx: {},
  }
  const step = () => {
    const run = index => index === chain.length
      ? { kind: 'enter', messages: [] }
      : chain[index]({ agent }, () => run(index + 1))
    return run(0)
  }
  assert.deepEqual((await step()).messages, [initial])
  assert.deepEqual((await step()).messages, [])
})

test('web panels register on both the legacy requestRejection and the newer connection.authentication Hosts', async () => {
  const { apply } = await import('../index.js')
  const { createTask, removeTask } = await import('../src/task-store.js')
  const projectRoot = join(home, 'compat-project')
  const taskId = 'abcdefabcdefabcd'
  assert.equal(await createTask({
    id: taskId, title: 'Compat probe', teamId: 'compat-team', task: 'Probe panel routes',
    mode: 'report', git: false, parentSessionId: 'router', projectRoot,
    status: 'running', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }), true)
  try {
    const serve = async authenticationService => {
      const routes = new Map()
      const ctx = {
        logger: { warn() {} },
        inject(deps, callback) {
          if (!deps.includes('webServer')) return
          const withAuth = deps.includes('connection.authentication')
          if (withAuth && !authenticationService) return
          const web = {
            webServer: {
              register(route) {
                routes.set(route.path, route.handler)
                return () => {}
              },
            },
            connection: {
              ...(withAuth ? { authentication: {} } : {}),
              ...(authenticationService || withAuth ? {} : { requestRejection() { return undefined } }),
              admit() {
                // 0.2.2-rc.1..rc.5 authenticate inside admit and expose
                // requestRejection; 0.2.3-alpha.1 removed it and resolves
                // connection.authentication from the calling fiber instead.
                if (authenticationService && !withAuth) {
                  throw new Error('cannot get property "connection.authentication" without inject')
                }
                return { peer: { principal: { kind: 'owner' } } }
              },
            },
            effect(fn) { fn(); return () => {} },
          }
          callback(web)
        },
        effect() { return () => {} },
        on() {},
        agents: { get: () => undefined, list: () => [] },
        agentPresets: { composedPreset: () => 'superagent-lite' },
      }
      await apply(ctx)
      return routes
    }
    const get = async (handler, url) => {
      const res = {
        status: undefined,
        body: undefined,
        writeHead(status) { this.status = status; return this },
        end(body) { this.body = body },
      }
      await handler({ method: 'GET', url, headers: {} }, res)
      return res
    }
    const panelPaths = [
      '/superagent-lite/tasks',
      '/superagent-lite/git',
      '/superagent-lite/worker-settings',
      '/superagent-lite/memory',
      '/superagent-lite/branches',
    ].sort()
    for (const authenticationService of [false, true]) {
      const routes = await serve(authenticationService)
      assert.deepEqual([...routes.keys()].sort(), panelPaths)
      for (const path of ['/superagent-lite/tasks', '/superagent-lite/branches', '/superagent-lite/memory', '/superagent-lite/worker-settings']) {
        const res = await get(routes.get(path), path)
        assert.equal(res.status, 200, `${path} must load on the ${authenticationService ? 'authentication' : 'requestRejection'} contract`)
        JSON.parse(res.body)
      }
      assert.deepEqual(JSON.parse((await get(routes.get('/superagent-lite/tasks'), '/superagent-lite/tasks')).body).tasks.map(task => task.id), [taskId])
      const detail = await get(routes.get('/superagent-lite/git'), `/superagent-lite/git?taskId=${taskId}`)
      assert.equal(detail.status, 200)
      assert.equal(JSON.parse(detail.body).taskId, taskId)
    }
  } finally {
    await removeTask(taskId)
  }
})

test('apply reclaims a stale running record without a live worker', async () => {
  const { createTask, listTasks, readTask } = await import('../src/task-store.js')
  const { STALE_ACTIVE_MS } = await import('../src/launch-queue.js')
  const stale = new Date(Date.now() - STALE_ACTIVE_MS - 60_000).toISOString()
  const task = {
    id: 'abcdefabcdefabcd', title: 'Lost worker', teamId: 'team', task: 'Do the work',
    mode: 'change', git: false, parentSessionId: 'router', projectRoot: home,
    workerSessionId: 'lost-worker', status: 'running', createdAt: stale, updatedAt: stale,
  }
  assert.equal(await createTask(task), true)
  const { apply } = await import('../index.js')
  const listeners = new Map()
  const ctx = {
    logger: { warn() {} },
    inject() {},
    effect() { return () => {} },
    on(name, handler) { listeners.set(name, handler) },
    agents: { get: () => undefined, list: () => [] },
    agentPresets: { composedPreset: () => 'superagent-lite' },
  }

  await apply(ctx)

  let record
  for (let attempt = 0; attempt < 100; attempt += 1) {
    record = await readTask(task.id)
    if (record.status !== 'running') break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(record.status, 'failed')
  assert.match(record.failure, /without a turn\/end/)
  assert.equal((await listTasks()).length, 1)
})
