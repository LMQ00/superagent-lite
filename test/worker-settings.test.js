import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after, beforeEach } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'worker-settings-'))
process.env.HOME = home

const {
  MAX_WORKERS, defaultWorkerSettings, normalizeWorkerSettings, readWorkerSettings, saveWorkerSettings, workerAgentOptions,
} = await import('../src/worker-settings.js')
const { createSettingsPanelHandler } = await import('../src/settings-panel.js')
const { createDispatchTool } = await import('../src/dispatch.js')
const { occupiedSlots, pumpWorkers } = await import('../src/launch-queue.js')
const { readTask, stopTask, updateTask } = await import('../src/task-store.js')

after(() => rm(home, { recursive: true, force: true }))
beforeEach(async () => saveWorkerSettings(defaultWorkerSettings()))

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

async function repoFixture(name) {
  const repo = join(home, name)
  await mkdir(repo)
  git(repo, ['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'initial'])
  return { repo }
}

function dispatchContext(repo, activations = []) {
  const ctx = {
    workingDirectory: { get: () => repo },
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) },
    subagents: {
      resolveMaxDepth: () => 1,
      async startActivation(spec) { activations.push(spec); return { childId: spec.childId } },
    },
    subprocess: {
      async resolveExecutable(name) { return name },
      spawn({ argv, cwd, env }) {
        const [command, ...args] = argv
        const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
        return {
          done: Promise.resolve({ exitCode: result.status }),
          collected: {
            stdout: { readFrom: () => ({ text: result.stdout ?? '', lossy: false }) },
            stderr: { readFrom: () => ({ text: result.stderr ?? '', lossy: false }) },
          },
        }
      },
    },
  }
  return ctx
}

const exec = callId => ({
  agent: { id: 'router', session: { id: 'router' } },
  callId,
  signal: new AbortController().signal,
})

test('worker settings default to the DSH model and three workers, and validate their fields', async () => {
  assert.deepEqual(await readWorkerSettings(), { workerModel: null, maxWorkers: MAX_WORKERS.default })
  assert.deepEqual(normalizeWorkerSettings({ workerModel: null, maxWorkers: 1 }), { workerModel: null, maxWorkers: 1 })
  assert.deepEqual(normalizeWorkerSettings({
    workerModel: { provider: ' deepseek ', model: ' deepseek-reasoner ', reasoningEffort: ' high ' }, maxWorkers: 16,
  }), {
    workerModel: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' }, maxWorkers: 16,
  })
  assert.throws(() => normalizeWorkerSettings({ maxWorkers: 0 }), /maxWorkers/)
  assert.throws(() => normalizeWorkerSettings({ maxWorkers: 17 }), /maxWorkers/)
  assert.throws(() => normalizeWorkerSettings({ maxWorkers: '3' }), /maxWorkers/)
  assert.throws(() => normalizeWorkerSettings({ workerModel: { provider: 'deepseek' } }), /model/)
  assert.throws(() => normalizeWorkerSettings({ paused: true }), /only workerModel and maxWorkers/)
  assert.throws(() => normalizeWorkerSettings({ workerModel: { provider: 'deepseek', model: 'chat', extra: 'x' } }), /provider and model/)
  assert.equal(workerAgentOptions({ workerModel: null }), undefined)
  assert.deepEqual(workerAgentOptions({
    workerModel: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
  }), { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' })
})

test('worker settings persist atomically and malformed records fall back to the defaults', async () => {
  const saved = await saveWorkerSettings({ workerModel: { provider: 'deepseek', model: 'deepseek-chat' }, maxWorkers: 5 })
  assert.deepEqual(await readWorkerSettings(), saved)
  const path = join(home, '.dsh', 'superagent-lite', 'worker-settings.json')
  await writeFile(path, '{not json')
  assert.deepEqual(await readWorkerSettings(), defaultWorkerSettings())
})

test('the settings panel refuses non-owner requests without reading settings', async () => {
  for (const admission of [{ rejection: 401 }, { peer: { principal: { kind: 'guest' } } }]) {
    const handler = createSettingsPanelHandler({ admit: () => admission }, {
      read: async () => assert.fail('must not read settings'),
    })
    const result = {}
    await handler({ method: 'GET', headers: {} }, {
      writeHead(status, headers) { Object.assign(result, { status, headers }); return this },
      end() {},
    })
    assert.equal(result.status, admission.rejection ?? 403)
    assert.equal(result.headers['cache-control'], 'no-store')
  }
})

test('the settings panel serves the catalog and saves an available model and limit', async () => {
  const catalog = {
    default: { provider: 'deepseek', model: 'deepseek-chat' },
    groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'Chat' }, { id: 'deepseek-reasoner', name: 'Reasoner' }] }],
    failures: [],
  }
  const changes = []
  const handler = createSettingsPanelHandler(
    { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
    { catalog: async () => catalog, onChange: async () => { changes.push(true) } },
  )
  const request = async (method, body, headers = {}) => {
    const result = {}
    const req = {
      method, headers,
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) yield Buffer.from(JSON.stringify(body))
      },
    }
    const res = {
      writeHead(status, values) { Object.assign(result, { status, headers: values }); return this },
      end(value) { result.body = value },
    }
    await handler(req, res)
    return result
  }
  const initial = await request('GET')
  assert.equal(initial.status, 200)
  assert.deepEqual(JSON.parse(initial.body).settings, defaultWorkerSettings())
  assert.deepEqual(JSON.parse(initial.body).catalog, catalog)
  assert.equal(JSON.parse(initial.body).limits.maxWorkers.min, 1)

  assert.equal((await request('PUT')).status, 405)
  assert.equal((await request('POST', { maxWorkers: 1 }, { 'content-type': 'text/plain' })).status, 415)
  assert.equal((await request('POST', { maxWorkers: 0 }, { 'content-type': 'application/json' })).status, 400)
  assert.match(JSON.parse((await request('POST', {
    workerModel: { provider: 'deepseek', model: 'missing' }, maxWorkers: 1,
  }, { 'content-type': 'application/json' })).body).error, /not available/)

  const saved = await request('POST', {
    workerModel: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    maxWorkers: 2,
  }, { 'content-type': 'application/json' })
  assert.equal(saved.status, 200)
  assert.deepEqual(JSON.parse(saved.body).settings, {
    workerModel: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    maxWorkers: 2,
  })
  assert.equal(changes.length, 1)
  assert.deepEqual(await readWorkerSettings(), JSON.parse(saved.body).settings)
})

test('dispatch gives new workers the configured model and queues tasks beyond the limit', async () => {
  const { repo } = await repoFixture('queued-workers')
  const activations = []
  const ctx = dispatchContext(repo, activations)
  const dispatch = createDispatchTool(ctx)
  await saveWorkerSettings({
    workerModel: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    maxWorkers: 1,
  })

  const first = await dispatch.execute({
    mode: 'change', title: 'First', teamId: 'team-queue', task: 'First change', worktreeName: 'first-worker',
  }, exec('first'))
  assert.equal(first.status, 'starting')
  assert.equal(activations.length, 1)
  assert.deepEqual(activations[0].agentOptions, {
    provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high',
  })

  const second = await dispatch.execute({
    mode: 'change', title: 'Second', teamId: 'team-queue', task: 'Second change', worktreeName: 'second-worker',
  }, exec('second'))
  assert.equal(second.status, 'queued')
  assert.equal((await readTask(second.taskId)).status, 'queued')
  assert.equal(activations.length, 1)

  await updateTask(first.taskId, { status: 'awaiting-merge' })
  await pumpWorkers(ctx)
  assert.equal(activations.length, 2)
  assert.equal((await readTask(second.taskId)).status, 'starting')
  assert.deepEqual(activations[1].agentOptions, {
    provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high',
  })

  const third = await dispatch.execute({
    mode: 'change', title: 'Third', teamId: 'team-queue', task: 'Third change', worktreeName: 'third-worker',
  }, exec('third'))
  assert.equal(third.status, 'queued')
  assert.equal((await stopTask(third.taskId)).task.status, 'cancelled')
  await updateTask(second.taskId, { status: 'awaiting-merge' })
  await pumpWorkers(ctx)
  assert.equal(activations.length, 2)
})

test('a blank worker model needs no override and reviews consume no extra slot', async () => {
  const { repo } = await repoFixture('blank-model')
  const activations = []
  const ctx = dispatchContext(repo, activations)
  await saveWorkerSettings({ workerModel: null, maxWorkers: 2 })
  const dispatched = await createDispatchTool(ctx).execute({
    mode: 'report', title: 'Inspect', teamId: 'team-blank', task: 'Inspect the repository',
  }, exec('blank'))
  assert.equal(dispatched.status, 'starting')
  assert.equal(activations[0].agentOptions, undefined)
  const running = { status: 'running', workerSessionId: 'worker' }
  assert.equal(occupiedSlots({ agents: { get: id => id === 'worker' ? {} : undefined } }, [running]), 1)
  // A review is a child of the worker that already holds the slot; it creates no Task record.
  assert.equal(occupiedSlots({ agents: { get: () => ({}) } }, [
    running,
    { status: 'review-required', workerSessionId: 'finished' },
  ]), 1)
})
