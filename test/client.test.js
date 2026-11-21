import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

function setup({ fetch, openSession, language = 'en' }) {
  let definition
  let dictionary
  const slots = new Map()
  const state = []
  const refs = []
  const effects = []
  let stateIndex
  let refIndex
  let effectIndex
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) {
      const index = stateIndex++
      if (!(index in state)) state[index] = initial
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
    },
    useRef(initial) {
      const index = refIndex++
      return refs[index] ??= { current: initial }
    },
    useId: () => 'panel-heading',
    useEffect(effect, [revision]) {
      const index = effectIndex++
      if (effects[index]?.revision === revision) return
      effects[index]?.dispose()
      effects[index] = { revision, dispose: effect() }
    },
  }
  runInContext(source, createContext({
    window: { __ModuleLoader__: { load(value) { definition = value } } }, fetch, AbortController, URL,
  }))
  const plugin = definition.factory(name => {
    assert.equal(name, 'react')
    return React
  })
  let localeDisposed = false
  const applyDisposers = []
  const ctx = {
    effect(effect) { applyDisposers.push(effect()) },
    get(name) {
      assert.equal(name, 'uiWorkspace')
      return openSession ? { openSession } : undefined
    },
    slots: {
      inject(name, effect) {
        const dispose = effect()
        assert.equal(slots.has(name), true)
        applyDisposers.push(dispose)
      },
      register(options, Component) {
        slots.set(options.name, { options, Component })
        return () => slots.delete(options.name)
      },
    },
    locale: {
      register(namespace, value) {
        assert.equal(namespace, 'superagent-lite')
        dictionary = value[language]
        return () => { localeDisposed = true }
      },
      bind: () => key => dictionary[key],
    },
  }
  plugin.apply(ctx)
  const main = slots.get('main')
  return {
    definition, slots,
    render() {
      stateIndex = refIndex = effectIndex = 0
      return main.Component({ t: ctx.locale.bind(), ...main.options.inject() })
    },
    dispose() {
      for (const { dispose } of effects) dispose()
      for (const dispose of applyDisposers.reverse()) dispose()
      assert.equal(slots.size, 0)
      assert.equal(localeDisposed, true)
    },
  }
}

function nodes(value) {
  return value?.type ? [value, ...value.children.flatMap(nodes)] : []
}

function text(value) {
  if (typeof value === 'string') return value
  return value?.children?.map(text).join('') ?? ''
}

const flush = () => new Promise(resolve => setImmediate(resolve))

const tasks = [
  { id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one', status: 'running',
    workerSessionId: 'worker-a', parentSessionId: 'parent-a', prUrl: 'https://github.com/owner/repo/pull/1' },
  { id: 'b', title: 'Task B', teamId: 'beta', projectRoot: '/two', status: 'awaiting-ci',
    prUrl: 'javascript:alert(1)' },
]

test('registers matching slots and renders a localized read-only board with filters, refresh and navigation', async () => {
  const requests = []
  const opened = []
  const board = setup({
    fetch: async (path, options) => {
      requests.push({ path, options })
      return { ok: true, json: async () => ({ tasks }) }
    },
    openSession: target => opened.push(target),
    language: 'zh',
  })
  assert.equal(board.definition.id, '@local/superagent-lite')
  const main = board.slots.get('main')
  const sidebar = board.slots.get('sidebar.panellist')
  assert.equal(main.options.key, sidebar.options.id)
  assert.equal(sidebar.options.label(), '项目任务')
  assert.equal(sidebar.Component({ size: 16 }).type, 'svg')

  assert.match(text(board.render()), /正在加载任务/)
  await flush()
  let tree = board.render()
  assert.match(text(tree), /Task A.*进行中.*Task B.*等待 CI/)
  assert.deepEqual(nodes(tree).filter(node => node.type === 'a').map(node => node.props.href),
    ['https://github.com/owner/repo/pull/1'])
  const [team, project] = nodes(tree).filter(node => node.type === 'select')
  team.props.onChange({ target: { value: 'alpha' } })
  tree = board.render()
  assert.match(text(tree), /Task A/)
  assert.doesNotMatch(text(tree), /Task B/)
  project.props.onChange({ target: { value: '/two' } })
  assert.match(text(board.render()), /没有符合筛选条件/)
  project.props.onChange({ target: { value: '' } })
  tree = board.render()
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Worker 会话: worker-a').props.onClick()
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Router 会话: parent-a').props.onClick()
  assert.equal(opened[0].childSessionId, 'worker-a')
  assert.equal(opened[0].parentSessionId, 'parent-a')
  assert.equal(opened[0].mode, 'unknown')
  assert.equal(opened[1], 'parent-a')
  nodes(tree).find(node => node.type === 'button' && text(node) === '刷新').props.onClick()
  assert.match(text(board.render()), /正在加载任务/)
  await flush()
  assert.match(text(board.render()), /Task A/)
  assert.equal(requests.length, 2)
  for (const request of requests) {
    assert.equal(request.path, '/superagent-lite/tasks')
    assert.equal(request.options.method, 'GET')
    assert.equal(request.options.credentials, 'same-origin')
  }
  board.dispose()
  assert.ok(requests.every(request => request.options.signal.aborted))
})

test('shows status marks, task metadata and Git review tags for one branch', async () => {
  const board = setup({
    fetch: async () => ({ ok: true, json: async () => ({ tasks: [{
      id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one', status: 'running',
      workerSessionId: 'worker-a', parentSessionId: 'parent-a', updatedAt: '2026-11-21T07:20:00Z',
      git: {
        branch: 'sl-a', baseBranch: 'master', repository: 'owner/repo', approved: true, reviewed: false,
        unmerged: true, canMerge: false, canPublish: true, mergeReason: 'The review has not approved this branch',
        pr: { state: 'OPEN', url: 'https://github.com/owner/repo/pull/1' },
      },
    }] }) }),
    language: 'zh',
  })
  board.render()
  await flush()
  const tree = board.render()
  const content = text(tree)
  assert.match(content, /团队alpha/)
  assert.match(content, /项目\/one/)
  assert.match(content, /更新时间/)
  assert.match(content, /审查记录已过期/)
  assert.match(content, /有未合并改动/)
  assert.match(content, /拉取请求: 打开/)
  const stages = nodes(tree).filter(node => node.props?.className === 'sl-stage')
  assert.deepEqual(stages.map(node => node.props['data-state']), ['ongoing', 'ongoing'])
  const tags = nodes(tree).filter(node => node.props?.className === 'sl-tag')
  assert.deepEqual(tags.map(node => node.props['data-tone']), ['warning', 'warning', 'info'])
  const time = nodes(tree).find(node => node.type === 'time')
  assert.equal(time.props.dateTime, '2026-11-21T07:20:00.000Z')
  board.dispose()
})

test('reports a load error and can refresh without workspace navigation', async () => {
  let attempt = 0
  const board = setup({ fetch: async () => ++attempt === 1 ? { ok: false } : {
    ok: true, json: async () => ({ tasks: [{ ...tasks[0], status: 'unconfirmed' }] }),
  } })
  board.render()
  await flush()
  let tree = board.render()
  assert.match(text(tree), /Could not load tasks/)
  nodes(tree).find(node => node.type === 'button').props.onClick()
  board.render()
  await flush()
  tree = board.render()
  assert.match(text(tree), /Not confirmed.*Worker session: worker-a/)
  assert.equal(nodes(tree).filter(node => node.type === 'button').length, 1)
  board.dispose()
})

test('lists worker branches in the Git area and sends the chosen merge action', async () => {
  const requests = []
  let merged = false
  const branchTasks = () => [{
    id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one',
    status: merged ? 'merged' : 'awaiting-merge', workerSessionId: 'worker-a', parentSessionId: 'parent-a',
    git: {
      branch: 'sl-a', baseBranch: 'master', approved: true, reviewed: true,
      merged, unmerged: !merged, uncommitted: false, onBranch: true,
      canMerge: !merged, canPublish: false,
      publishReason: 'This project has no GitHub origin',
    },
  }]
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/git') {
        assert.equal(options.method, 'POST')
        assert.equal(options.credentials, 'same-origin')
        assert.equal(options.headers['content-type'], 'application/json')
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'merge' })
        merged = true
        return { ok: true, json: async () => ({ status: 'merged' }) }
      }
      return { ok: true, json: async () => ({ tasks: branchTasks() }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  assert.match(text(tree), /Git 管理/)
  assert.match(text(tree), /sl-a/)
  assert.match(text(tree), /有未合并改动/)
  const merge = nodes(tree).find(node => node.type === 'button' && text(node) === '合并到 master')
  assert.ok(merge)
  assert.equal(merge.props.disabled, false)
  merge.props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.equal(requests.filter(request => request.path === '/superagent-lite/git').length, 1)
  assert.match(text(tree), /无未合并改动/)
  assert.equal(nodes(tree).find(node => node.type === 'button' && text(node) === '合并到 master').props.disabled, true)
  board.dispose()
})

test('shows the Git action error returned by the host', async () => {
  const board = setup({
    fetch: async (path) => path === '/superagent-lite/git'
      ? { ok: false, json: async () => ({ error: 'Merge would conflict' }) }
      : { ok: true, json: async () => ({ tasks: [{
        id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one', status: 'awaiting-merge',
        workerSessionId: 'worker-a', parentSessionId: 'parent-a',
        git: { branch: 'sl-a', baseBranch: 'master', approved: true, reviewed: true, canMerge: true, canPublish: false },
      }] }) },
    language: 'en',
  })
  board.render()
  await flush()
  let tree = board.render()
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Merge into master').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.match(text(tree), /Merge would conflict/)
  board.dispose()
})
