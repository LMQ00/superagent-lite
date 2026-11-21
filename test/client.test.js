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
  { id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one', status: 'running', mode: 'change',
    workerSessionId: 'worker-a', parentSessionId: 'parent-a', prUrl: 'https://github.com/owner/repo/pull/1' },
  { id: 'b', title: 'Task B', teamId: 'beta', projectRoot: '/two', status: 'awaiting-ci', mode: 'change',
    prUrl: 'javascript:alert(1)' },
]

const byClass = (tree, className) => nodes(tree).filter(node => node.props?.className === className)
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node).startsWith(label))

test('registers matching slots and renders a localized, status-filtered read-only board with navigation', async () => {
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
  assert.match(text(tree), /任务状态只在任务列表呈现/)
  assert.match(text(tree), /Task A/)
  assert.match(text(tree), /Task B/)
  assert.match(text(tree), /进行中2/)
  assert.match(text(tree), /等待 CI/)
  assert.equal(byClass(tree, 'sl-group').length, 1)
  for (const label of ['失败0', '进行中2', '已合并0', '待审查0', '仅回答0']) assert.ok(text(tree).includes(label))
  assert.deepEqual(nodes(tree).filter(node => node.type === 'a').map(node => node.props.href),
    ['https://github.com/owner/repo/pull/1'])

  button(tree, '待审查').props.onClick()
  tree = board.render()
  assert.match(text(tree), /该状态下暂无任务/)
  assert.doesNotMatch(text(tree), /Task A/)
  button(tree, '全部').props.onClick()
  tree = board.render()
  assert.match(text(tree), /Task A/)

  const [team, project] = nodes(tree).filter(node => node.type === 'select')
  team.props.onChange({ target: { value: 'alpha' } })
  tree = board.render()
  assert.match(text(tree), /Task A/)
  assert.doesNotMatch(text(tree), /Task B/)
  project.props.onChange({ target: { value: '/two' } })
  assert.match(text(board.render()), /没有符合筛选条件的任务/)
  project.props.onChange({ target: { value: '' } })
  tree = board.render()
  assert.match(text(tree), /Task A/)
  assert.doesNotMatch(text(tree), /Task B/)

  nodes(tree).find(node => node.type === 'button' && text(node) === 'Worker 会话').props.onClick()
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Router 会话').props.onClick()
  assert.equal(opened[0].childSessionId, 'worker-a')
  assert.equal(opened[0].parentSessionId, 'parent-a')
  assert.equal(opened[0].mode, 'unknown')
  assert.equal(opened[1], 'parent-a')
  button(tree, '刷新').props.onClick()
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

test('groups and filters tasks by the five categories, and carries report-only tasks in their own group', async () => {
  const categoryTasks = [
    { id: 'a', title: 'Blocked delivery', teamId: 'alpha', projectRoot: '/one', status: 'delivery-blocked', mode: 'change' },
    { id: 'b', title: 'Worker running', teamId: 'alpha', projectRoot: '/one', status: 'running', mode: 'change' },
    { id: 'c', title: 'Merged branch', teamId: 'alpha', projectRoot: '/one', status: 'merged', mode: 'change' },
    { id: 'd', title: 'Review required', teamId: 'alpha', projectRoot: '/one', status: 'review-required', mode: 'change' },
    { id: 'e', title: 'Answer only', teamId: 'alpha', projectRoot: '/one', status: 'completed', mode: 'report' },
  ]
  const board = setup({
    fetch: async () => ({ ok: true, json: async () => ({ tasks: categoryTasks }) }),
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)),
    ['失败1', '进行中1', '已合并1', '待审查1', '仅回答1'])
  assert.deepEqual(byClass(tree, 'sl-stage').map(node => node.props['data-state']),
    ['error', 'ongoing', 'done', 'warning', 'done'])
  const titles = () => byClass(tree, 'sl-task__title').map(node => text(node))
  assert.deepEqual(titles(), ['Blocked delivery', 'Worker running', 'Merged branch', 'Review required', 'Answer only'])
  assert.match(text(tree), /仅回答1.*已完成.*Answer only/s)
  for (const [filter, title] of [['失败', 'Blocked delivery'], ['进行中', 'Worker running'], ['已合并', 'Merged branch'],
    ['待审查', 'Review required'], ['仅回答', 'Answer only']]) {
    button(tree, filter).props.onClick()
    tree = board.render()
    assert.deepEqual(titles(), [title])
    assert.equal(byClass(tree, 'sl-group').length, 1)
    assert.equal(text(byClass(tree, 'sl-group__title')[0]), `${filter}1`)
  }
  button(tree, '全部').props.onClick()
  tree = board.render()
  assert.deepEqual(titles(), ['Blocked delivery', 'Worker running', 'Merged branch', 'Review required', 'Answer only'])
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
  button(tree, 'Refresh').props.onClick()
  board.render()
  await flush()
  tree = board.render()
  assert.match(text(tree), /Not confirmed.*Worker session/)
  assert.equal(nodes(tree).find(node => text(node) === 'Worker session').type, 'span')
  board.dispose()
})

test('lists branches under Git delivery without a second status system and sends the chosen merge action', async () => {
  const requests = []
  let merged = false
  const branchTasks = () => [{
    id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one', mode: 'change',
    status: merged ? 'merged' : 'awaiting-merge', workerSessionId: 'worker-a', parentSessionId: 'parent-a',
    updatedAt: '2026-01-01T00:00:00.000Z',
    git: {
      branch: 'sl-a', baseBranch: 'master', author: 'dsh', approved: true, reviewed: true,
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
        return { ok: true, json: async () => ({ status: 'merged', message: 'Merged a into master.' }) }
      }
      if (path === '/superagent-lite/git?taskId=a') {
        assert.equal(options.method, 'GET')
        assert.equal(options.credentials, 'same-origin')
        assert.equal(options.cache, 'no-store')
        return { ok: true, json: async () => ({
          commits: [{ hash: 'b'.repeat(40), author: 'dsh', date: '2026-01-01T00:00:00.000Z', subject: 'Task A change' }],
          files: [{ path: 'src/a.js', additions: 3, deletions: 1 }],
        }) }
      }
      return { ok: true, json: async () => ({ tasks: branchTasks() }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  assert.match(text(tree), /Git 交付/)
  assert.match(text(tree), /sl-a.*master/s)
  assert.match(text(tree), /dsh/)
  assert.equal(nodes(tree).filter(node => node.props?.role === 'tab').length, 0)
  assert.equal(nodes(tree).filter(node => node.type === 'input' && node.props.type === 'search').length, 0)
  assert.doesNotMatch(text(byClass(tree, 'sl-git-section')[0]), /打开|已关闭/)
  byClass(tree, 'sl-git__head')[0].props.onClick()
  await flush()
  tree = board.render()
  assert.match(text(tree), /提交/)
  assert.match(text(tree), /改动文件/)
  assert.match(text(tree), /审查已通过/)
  assert.match(text(tree), /有未合并改动/)
  assert.match(text(tree), /src\/a\.js.*\+3.*-1/)
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
  assert.match(text(tree), /Merged a into master/)
  assert.equal(nodes(tree).find(node => node.type === 'button' && text(node) === '合并到 master'), undefined)
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['已合并1'])
  assert.equal(byClass(tree, 'sl-git__head').length, 1)
  board.dispose()
})

test('shows the Git action error returned by the host', async () => {
  const board = setup({
    fetch: async (path) => path === '/superagent-lite/git'
      ? { ok: false, json: async () => ({ error: 'Merge would conflict' }) }
      : path.startsWith('/superagent-lite/git?taskId=')
        ? { ok: true, json: async () => ({ commits: [], files: [] }) }
        : { ok: true, json: async () => ({ tasks: [{
          id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one', status: 'awaiting-merge', mode: 'change',
          workerSessionId: 'worker-a', parentSessionId: 'parent-a',
          git: { branch: 'sl-a', baseBranch: 'master', approved: true, reviewed: true, canMerge: true, canPublish: false },
        }] }) },
    language: 'en',
  })
  board.render()
  await flush()
  let tree = board.render()
  byClass(tree, 'sl-git__head')[0].props.onClick()
  await flush()
  tree = board.render()
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Merge into master').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.match(text(tree), /Merge would conflict/)
  board.dispose()
})

test('does not show pull request state tabs, counts or search, and keeps review facts inside delivery details', async () => {
  const base = { teamId: 'alpha', projectRoot: '/one', updatedAt: '2026-01-01T00:00:00.000Z', mode: 'change' }
  const rows = [
    { ...base, id: 'a', title: 'Add dashboard', status: 'awaiting-ci',
      git: { branch: 'sl-a', baseBranch: 'master', author: 'dsh', approved: true, reviewed: true, merged: false, unmerged: true,
        pr: { url: 'https://github.com/owner/repo/pull/12', state: 'OPEN', exact: true, draft: false, author: 'octocat', comments: 2, checks: { state: 'success', total: 3 } },
        canMerge: false, mergeReason: 'GitHub projects must merge through a pull request',
        canPublish: false, publishReason: 'All required CI checks must pass' } },
    { ...base, id: 'b', title: 'Merged feature', status: 'merged',
      git: { branch: 'sl-b', baseBranch: 'master', approved: true, reviewed: true, merged: true, unmerged: false,
        pr: { url: 'https://github.com/owner/repo/pull/11/', state: 'MERGED', exact: true, draft: false, author: 'octocat', comments: 1, checks: { state: 'success', total: 2 } },
        canMerge: false, canPublish: false } },
  ]
  const board = setup({
    fetch: async (path) => path.startsWith('/superagent-lite/git?taskId=')
      ? { ok: true, json: async () => ({ commits: [], files: [{ path: 'src/panel.js', additions: 4, deletions: 2 }] }) }
      : { ok: true, json: async () => ({ tasks: rows }) },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  const gitText = () => text(byClass(tree, 'sl-git-section')[0])
  assert.match(gitText(), /Add dashboard/)
  assert.match(gitText(), /Merged feature/)
  assert.match(gitText(), /#12/)
  assert.match(gitText(), /#11/)
  assert.doesNotMatch(gitText(), /打开|已关闭/)
  assert.equal(nodes(tree).filter(node => node.props?.role === 'tab').length, 0)
  assert.equal(nodes(tree).filter(node => node.type === 'input').length, 0)
  byClass(tree, 'sl-git__head')[0].props.onClick()
  await flush()
  tree = board.render()
  assert.match(gitText(), /Comment: 2|评论: 2/)
  assert.match(gitText(), /Check|检查/)
  assert.match(gitText(), /src\/panel\.js.*\+4.*-2/)
  const merge = nodes(tree).find(node => node.type === 'button' && text(node) === '合并到 master')
  const publish = nodes(tree).find(node => node.type === 'button' && text(node) === '发送 PR')
  assert.equal(merge.props.disabled, true)
  assert.equal(publish.props.disabled, true)
  assert.match(gitText(), /GitHub projects must merge through a pull request/)
  assert.match(gitText(), /All required CI checks must pass/)
  board.dispose()
})
