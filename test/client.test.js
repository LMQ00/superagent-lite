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
    useEffect(effect, dependencies = []) {
      const index = effectIndex++
      const previous = effects[index]
      if (previous && previous.dependencies.length === dependencies.length &&
          previous.dependencies.every((value, position) => Object.is(value, dependencies[position]))) return
      previous?.dispose()
      effects[index] = { dependencies, dispose: effect() }
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
    renderSettings() {
      stateIndex = refIndex = effectIndex = 0
      const section = slots.get('settings.section')
      return section.Component({ t: ctx.locale.bind(), close() {} })
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
  return value?.type ? [value, ...(value.children ?? []).flatMap(nodes)] : []
}

function text(value) {
  if (typeof value === 'string') return value
  return value?.children?.map(text).join('') ?? ''
}

const flush = () => new Promise(resolve => setImmediate(resolve))
const byClass = (tree, className) => nodes(tree).filter(node => node.props?.className === className)
const button = (tree, label) => nodes(tree).filter(node => node.type === 'button' && text(node) === label).at(-1)
const filterButton = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node).startsWith(label))
const buttons = (tree, label) => nodes(tree).filter(node => node.type === 'button' && text(node) === label)
const select = (tree, predicate) => nodes(tree).find(node => node.type === 'select' && predicate?.(node))

const task = overrides => ({
  id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one', mode: 'change', status: 'unmerged',
  workerSessionId: 'worker-a', parentSessionId: 'parent-a', updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const gitFacts = overrides => ({
  branch: 'sl-a', baseBranch: 'main', reviewed: true, approved: true, merged: false, hasCommits: true,
  canMerge: true, canPublish: true, canReview: false, canDelete: false,
  ...overrides,
})

function detail(overrides = {}) {
  return {
    branches: [{ name: 'main', current: true }, { name: 'release', current: false }],
    remotes: [{ name: 'origin', fetchUrl: 'https://github.com/owner/repo.git', pushUrl: 'https://github.com/owner/repo.git', repository: 'owner/repo' }],
    gh: { ok: true, account: 'octocat' },
    commits: [], files: [],
    ...overrides,
  }
}

test('renders the six status categories, navigation and session links without a Git delivery block', async () => {
  const requests = []
  const opened = []
  const tasks = [
    task({ prUrl: 'https://github.com/owner/repo/pull/1', git: gitFacts(), status: 'unmerged', land: true }),
    task({ id: 'b', title: 'Task B', status: 'running', workerSessionId: 'worker-b' }),
  ]
  const board = setup({
    fetch: async (path, options) => {
      requests.push({ path, options })
      return { ok: true, json: async () => ({ tasks }) }
    },
    openSession: target => opened.push(target),
    language: 'zh',
  })
  assert.equal(board.definition.id, '@local/superagent-lite')
  const sidebar = board.slots.get('sidebar.panellist')
  assert.equal(sidebar.options.label(), '项目任务')

  assert.match(text(board.render()), /正在加载任务/)
  await flush()
  let tree = board.render()
  assert.match(text(tree), /未合并的任务可以合并或提交 PR/)
  assert.match(text(tree), /Task A/)
  assert.match(text(tree), /Task B/)
  assert.match(text(tree), /已授权落地/)
  for (const label of ['未合并1', '运行中1', '未审查0', '已完成0', '失败0', '仅回答0']) assert.ok(text(tree).includes(label), label)
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['未合并1', '运行中1'])
  assert.equal(byClass(tree, 'sl-git-section').length, 0)
  assert.doesNotMatch(text(tree), /Git 交付/)
  assert.deepEqual(nodes(tree).filter(node => node.type === 'a').map(node => node.props.href),
    ['https://github.com/owner/repo/pull/1'])

  nodes(tree).find(node => node.type === 'button' && text(node) === 'Worker 会话').props.onClick()
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Router 会话').props.onClick()
  assert.equal(opened[0].childSessionId, 'worker-a')
  assert.equal(opened[0].parentSessionId, 'parent-a')
  assert.equal(opened[1], 'parent-a')

  filterButton(tree, '未审查').props.onClick()
  tree = board.render()
  assert.match(text(tree), /该状态下暂无任务/)
  filterButton(tree, '全部').props.onClick()
  tree = board.render()
  button(tree, '刷新').props.onClick()
  assert.match(text(board.render()), /正在加载任务/)
  await flush()
  assert.match(text(board.render()), /Task A/)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks').length, 2)
  for (const request of requests) {
    assert.equal(request.options.method, 'GET')
    assert.equal(request.options.credentials, 'same-origin')
  }
  board.dispose()
  assert.ok(requests.every(request => request.options.signal.aborted))
})

test('scrolls the task list inside a fixed panel without a tab bar', async () => {
  const requests = []
  const tasks = Array.from({ length: 12 }, (_, index) => task({
    id: `t${index}`, title: `Task ${index + 1}`,
  }))
  const board = setup({
    fetch: async path => {
      requests.push(path)
      return { ok: true, json: async () => ({ tasks }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  const tree = board.render()
  assert.equal(nodes(tree).filter(node => node.type === 'button' && node.props?.role === 'tab').length, 0)
  assert.match(source, /\.sl-board\{[^}]*height:100%[^}]*overflow:hidden/)
  assert.match(source, /\.sl-scroll\{[^}]*flex:1[^}]*overflow-y:auto/)
  assert.equal(byClass(tree, 'sl-scroll').length, 1)
  assert.match(text(byClass(tree, 'sl-scroll')[0]), /Task 1/)
  assert.equal(byClass(tree, 'sl-task').length, 12)
  assert.equal(requests.filter(path => path === '/superagent-lite/tasks').length, 1)
  assert.equal(requests.filter(path => path === '/superagent-lite/memory').length, 0)
  board.dispose()
})

test('groups tasks by the six statuses in the specified order', async () => {
  const statuses = ['unmerged', 'running', 'unreviewed', 'completed', 'failed', 'answer']
  const tasks = statuses.map((status, index) => task({ id: `t${index}`, title: `T ${status}`, status }))
  const board = setup({
    fetch: async () => ({ ok: true, json: async () => ({ tasks }) }),
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)),
    ['未合并1', '运行中1', '未审查1', '已完成1', '失败1', '仅回答1'])
  for (const [label, title] of [['未合并', 'T unmerged'], ['运行中', 'T running'], ['未审查', 'T unreviewed'],
    ['已完成', 'T completed'], ['失败', 'T failed'], ['仅回答', 'T answer']]) {
    filterButton(tree, label).props.onClick()
    tree = board.render()
    assert.deepEqual(byClass(tree, 'sl-task__title').map(node => text(node)), [title])
  }
  filterButton(tree, '全部').props.onClick()
  tree = board.render()
  assert.deepEqual(byClass(tree, 'sl-task__title').map(node => text(node)),
    ['T unmerged', 'T running', 'T unreviewed', 'T completed', 'T failed', 'T answer'])
  board.dispose()
})

test('reports a load error and can refresh without workspace navigation', async () => {
  let attempt = 0
  const board = setup({ fetch: async () => ++attempt === 1 ? { ok: false } : {
    ok: true, json: async () => ({ tasks: [task({ status: 'running', unconfirmed: true })] }),
  } })
  board.render()
  await flush()
  let tree = board.render()
  assert.match(text(tree), /Could not load tasks/)
  button(tree, 'Refresh').props.onClick()
  board.render()
  await flush()
  tree = board.render()
  assert.match(text(tree), /Not confirmed/)
  assert.equal(nodes(tree).find(node => text(node) === 'Worker session').type, 'span')
  board.dispose()
})

test('opens a merge dialog, lists target branches and updates the row in place after merging', async () => {
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/git') {
        assert.equal(options.method, 'POST')
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'merge', target: 'release' })
        return {
          ok: true,
          json: async () => ({
            message: 'Merged a into release.',
            status: 'merged',
            updatedAt: '2026-01-02T00:00:00.000Z',
            view: {
              status: 'completed',
              git: gitFacts({ merged: true, canMerge: false, canPublish: false, canDelete: true }),
            },
          }),
        }
      }
      if (path === '/superagent-lite/git?taskId=a') {
        assert.equal(options.method, 'GET')
        return { ok: true, json: async () => detail() }
      }
      return { ok: true, json: async () => ({ tasks: [task({ git: gitFacts() })] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['未合并1'])
  assert.equal(buttons(tree, '合并').length, 1)
  button(tree, '合并').props.onClick()
  await flush()
  tree = board.render()
  assert.match(text(tree), /合并到分支/)
  const target = select(tree, node => node.props.value === 'main')
  assert.ok(target)
  target.props.onChange({ target: { value: 'release' } })
  tree = board.render()
  assert.equal(select(tree, node => node.props.value === 'release').props.value, 'release')
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 1)
  button(tree, '合并').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.match(text(tree), /Merged a into release/)
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 0)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/git').length, 1)
  // The merged row moves to completed with its refreshed Git facts, without a list reload.
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks').length, 1)
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['已完成1'])
  assert.equal(byClass(tree, 'sl-task').length, 1)
  assert.equal(buttons(tree, '合并').length, 0)
  assert.equal(buttons(tree, '提交 PR').length, 0)
  assert.equal(buttons(tree, '删除分支').length, 1)
  board.dispose()
})

test('merging updates the row even when the response carries no refreshed view', async () => {
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/git') {
        return { ok: true, json: async () => ({ message: 'Merged a into main.', status: 'merged' }) }
      }
      if (path === '/superagent-lite/git?taskId=a') return { ok: true, json: async () => detail() }
      return { ok: true, json: async () => ({ tasks: [task({ git: gitFacts() })] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  button(board.render(), '合并').props.onClick()
  await flush()
  button(board.render(), '合并').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  const tree = board.render()
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks').length, 1)
  assert.match(text(tree), /Merged a into main/)
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['已完成1'])
  assert.equal(buttons(tree, '合并').length, 0)
  assert.equal(buttons(tree, '删除分支').length, 1)
  board.dispose()
})

test('the merge dialog refuses to submit without a target branch', async () => {
  const board = setup({
    fetch: async path => path.startsWith('/superagent-lite/git?taskId=')
      ? { ok: true, json: async () => detail({ branches: [] }) }
      : { ok: true, json: async () => ({ tasks: [task({ git: gitFacts() })] }) },
    language: 'en',
  })
  board.render()
  await flush()
  button(board.render(), 'Merge').props.onClick()
  await flush()
  const tree = board.render()
  assert.match(text(tree), /No merge target is available/)
  assert.equal(button(tree, 'Merge').props.disabled, true)
  board.dispose()
})

test('opens a publish dialog with the gh account and posts the chosen remote', async () => {
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/git') {
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'publish', remote: 'origin' })
        return { ok: true, json: async () => ({ message: 'Published the reviewed commit as pull request 7.' }) }
      }
      if (path === '/superagent-lite/git?taskId=a') return { ok: true, json: async () => detail() }
      return { ok: true, json: async () => ({ tasks: [task({ git: gitFacts() })] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  button(board.render(), '提交 PR').props.onClick()
  await flush()
  let tree = board.render()
  assert.match(text(tree), /提交仓库/)
  assert.match(text(tree), /origin \(owner\/repo\)/)
  button(tree, '提交').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  assert.match(text(board.render()), /Published the reviewed commit/)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/git').length, 1)
  board.dispose()
})

test('a publish dialog without a gh account explains the requirement and cannot submit', async () => {
  const board = setup({
    fetch: async path => path.startsWith('/superagent-lite/git?taskId=')
      ? { ok: true, json: async () => detail({ gh: { ok: false, error: 'You are not logged into any GitHub hosts.' } }) }
      : { ok: true, json: async () => ({ tasks: [task({ git: gitFacts() })] }) },
    language: 'zh',
  })
  board.render()
  await flush()
  button(board.render(), '提交 PR').props.onClick()
  await flush()
  const tree = board.render()
  assert.match(text(tree), /需要 gh 账号/)
  assert.match(text(tree), /not logged into any GitHub hosts/)
  assert.equal(button(tree, '提交').props.disabled, true)
  board.dispose()
})

test('starts a review from the unreviewed row and reports the verdict', async () => {
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/git') {
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'review' })
        return { ok: true, json: async () => ({ approved: true, status: 'awaiting-merge', message: 'Review approved.' }) }
      }
      return { ok: true, json: async () => ({ tasks: [task({
        status: 'unreviewed',
        git: gitFacts({ reviewed: false, canMerge: false, canPublish: false, canReview: true, reviewReason: undefined }),
      })] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  button(board.render(), '审查').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  assert.match(text(board.render()), /审查已通过/)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/git').length, 1)
  board.dispose()
})

test('deletes the worker branch from a completed merged row after confirmation', async () => {
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/git') {
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'delete-branch' })
        return { ok: true, json: async () => ({ message: 'Deleted the worker branch sl-a.' }) }
      }
      if (path === '/superagent-lite/git?taskId=a') {
        return { ok: true, json: async () => detail({ branches: [{ name: 'main', current: true }] }) }
      }
      return { ok: true, json: async () => ({ tasks: [task({
        status: 'completed', git: gitFacts({ merged: true, canMerge: false, canPublish: false, canDelete: true }),
      })] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  button(board.render(), '删除分支').props.onClick()
  await flush()
  let tree = board.render()
  assert.match(text(tree), /删除修改分支/)
  assert.match(text(tree), /sl-a/)
  button(tree, '删除').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  assert.match(text(board.render()), /Deleted the worker branch sl-a/)
  board.dispose()
})

test('deletes a task from the panel after confirmation and disables deletion for a running worker', async () => {
  let tasks = [
    task({ id: 'a', title: 'Task A', status: 'answer', mode: 'report', workerSessionId: 'worker-a' }),
    task({ id: 'b', title: 'Task B', status: 'running', workerSessionId: 'worker-b' }),
    task({ id: 'c', title: 'Task C', status: 'running', workerSessionId: 'worker-c', unconfirmed: true }),
  ]
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path.startsWith('/superagent-lite/tasks?taskId=')) {
        assert.equal(options.method, 'DELETE')
        assert.equal(path, '/superagent-lite/tasks?taskId=a')
        tasks = tasks.filter(item => item.id !== 'a')
        return { ok: true, json: async () => ({ deleted: 'a' }) }
      }
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks }) }
      return { ok: true, json: async () => ({ records: [] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  const rowFor = title => byClass(tree, 'sl-task').find(row => text(row).includes(title))
  const deleteIn = row => nodes(row).find(node => node.type === 'button' && text(node) === '删除任务')
  const runningDelete = deleteIn(rowFor('Task B'))
  assert.equal(runningDelete.props.disabled, true)
  assert.match(runningDelete.props.title, /worker 仍在运行/)
  assert.equal(deleteIn(rowFor('Task C')).props.disabled, false)
  deleteIn(rowFor('Task A')).props.onClick()
  tree = board.render()
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 1)
  assert.match(text(tree), /任务记录将从面板移除/)
  button(tree, '删除').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.doesNotMatch(text(tree), /Task A/)
  assert.match(text(tree), /Task B/)
  assert.match(text(tree), /操作已完成/)
  const deletion = requests.find(request => request.options.method === 'DELETE')
  assert.equal(deletion.path, '/superagent-lite/tasks?taskId=a')
  assert.equal(deletion.options.credentials, 'same-origin')
  board.dispose()
})

test('shows the failure text and the action error returned by the host', async () => {
  let posted = false
  const board = setup({
    fetch: async (path, options = {}) => {
      if (path === '/superagent-lite/git') {
        posted = true
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'merge', target: 'main' })
        return { ok: false, json: async () => ({ error: 'Merge would conflict' }) }
      }
      if (path === '/superagent-lite/git?taskId=a') return { ok: true, json: async () => detail() }
      return { ok: true, json: async () => ({ tasks: [task({ failure: 'turn failed', git: gitFacts() })] }) }
    },
    language: 'en',
  })
  board.render()
  await flush()
  let tree = board.render()
  assert.match(text(tree), /Failure: turn failed/)
  button(tree, 'Merge').props.onClick()
  await flush()
  button(board.render(), 'Merge').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.match(text(tree), /Merge would conflict/)
  assert.equal(posted, true)
  board.dispose()
})

test('selects several tasks and deletes them in one confirmed batch', async () => {
  let tasks = [
    task({ id: 'a', title: 'Task A', status: 'answer', mode: 'report', workerSessionId: 'worker-a' }),
    task({ id: 'b', title: 'Task B', status: 'running', workerSessionId: 'worker-b' }),
    task({ id: 'c', title: 'Task C', status: 'failed' }),
  ]
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path.startsWith('/superagent-lite/tasks?taskId=')) {
        assert.equal(options.method, 'DELETE')
        const removed = new URL(path, 'http://localhost').searchParams.get('taskId')
        tasks = tasks.filter(item => item.id !== removed)
        return { ok: true, json: async () => ({ deleted: removed }) }
      }
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks }) }
      return { ok: true, json: async () => ({ records: [] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  const rowFor = title => byClass(tree, 'sl-task').find(row => text(row).includes(title))
  const checkIn = row => nodes(row).find(node => node.type === 'input' && node.props.type === 'checkbox')
  const runningCheck = checkIn(rowFor('Task B'))
  assert.equal(runningCheck.props.disabled, true)
  assert.match(runningCheck.props.title, /worker 仍在运行/)
  checkIn(rowFor('Task A')).props.onChange()
  checkIn(rowFor('Task C')).props.onChange()
  tree = board.render()
  assert.match(text(tree), /已选择 2/)
  button(tree, '删除所选').props.onClick()
  tree = board.render()
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 1)
  assert.match(text(tree), /删除所选任务/)
  assert.match(text(tree), /已选择 2/)
  button(tree, '删除').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.doesNotMatch(text(tree), /Task A/)
  assert.doesNotMatch(text(tree), /Task C/)
  assert.match(text(tree), /Task B/)
  assert.match(text(tree), /所选任务已删除/)
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 0)
  assert.deepEqual(requests.filter(request => request.options.method === 'DELETE')
    .map(request => request.path).sort(),
  ['/superagent-lite/tasks?taskId=a', '/superagent-lite/tasks?taskId=c'])
  board.dispose()
})

test('the archive settings section loads and saves a numeric size limit', async () => {
  const requests = []
  const view = archiveMaxBytes => ({
    archiveMaxBytes, defaultArchiveMaxBytes: 134217728, maxArchiveMaxBytes: 2147483648,
  })
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      assert.equal(path, '/superagent-lite/settings')
      if (options.method === 'PUT') {
        assert.equal(options.credentials, 'same-origin')
        return { ok: true, json: async () => view(JSON.parse(options.body).archiveMaxBytes) }
      }
      return { ok: true, json: async () => view(134217728) }
    },
    language: 'zh',
  })
  const section = board.slots.get('settings.section')
  assert.equal(section.options.id, 'superagent-lite-archive')
  assert.equal(section.options.label(), '归档')
  assert.match(text(board.renderSettings()), /正在加载/)
  await flush()
  let tree = board.renderSettings()
  assert.match(text(tree), /归档大小/)
  assert.match(text(tree), /默认 128M/)
  let number = nodes(tree).find(node => node.type === 'input' && node.props.type === 'number')
  assert.equal(number.props.value, '128')
  assert.equal(number.props.max, 2048)
  assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.type === 'checkbox').props.checked, false)
  number.props.onChange({ target: { value: '256' } })
  tree = board.renderSettings()
  button(tree, '保存').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.renderSettings()
    await flush()
  }
  const put = requests.find(request => request.options.method === 'PUT')
  assert.deepEqual(JSON.parse(put.options.body), { archiveMaxBytes: 268435456 })
  tree = board.renderSettings()
  assert.match(text(tree), /已保存。/)
  number = nodes(tree).find(node => node.type === 'input' && node.props.type === 'number')
  assert.equal(number.props.value, '256')
  board.dispose()
})

test('the archive settings section offers unlimited and refuses an out-of-range value', async () => {
  const requests = []
  const body = value => ({ archiveMaxBytes: value, defaultArchiveMaxBytes: 134217728, maxArchiveMaxBytes: 2147483648 })
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (options.method === 'PUT') return { ok: true, json: async () => body(JSON.parse(options.body).archiveMaxBytes) }
      return { ok: true, json: async () => body(null) }
    },
    language: 'en',
  })
  board.renderSettings()
  await flush()
  let tree = board.renderSettings()
  let checkbox = nodes(tree).find(node => node.type === 'input' && node.props.type === 'checkbox')
  assert.equal(checkbox.props.checked, true)
  let number = nodes(tree).find(node => node.type === 'input' && node.props.type === 'number')
  assert.equal(number.props.disabled, true)
  checkbox.props.onChange({ target: { checked: false } })
  tree = board.renderSettings()
  number = nodes(tree).find(node => node.type === 'input' && node.props.type === 'number')
  number.props.onChange({ target: { value: '2049' } })
  tree = board.renderSettings()
  button(tree, 'Save').props.onClick()
  await flush()
  assert.match(text(board.renderSettings()), /whole number from 1 to 2048 MB/)
  assert.equal(requests.filter(request => request.options.method === 'PUT').length, 0)
  checkbox = nodes(board.renderSettings()).find(node => node.type === 'input' && node.props.type === 'checkbox')
  checkbox.props.onChange({ target: { checked: true } })
  tree = board.renderSettings()
  assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.type === 'number').props.disabled, true)
  button(tree, 'Save').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.renderSettings()
    await flush()
  }
  const puts = requests.filter(request => request.options.method === 'PUT')
  assert.equal(puts.length, 1)
  assert.deepEqual(JSON.parse(puts[0].options.body), { archiveMaxBytes: null })
  assert.match(text(board.renderSettings()), /Saved\./)
  board.dispose()
})

test('keeps failed task selections for retry and shows the host error', async () => {
  let tasks = [
    task({ id: 'a', title: 'Task A', status: 'answer', mode: 'report' }),
    task({ id: 'b', title: 'Task B', status: 'answer', mode: 'report' }),
  ]
  let rejectB = true
  const board = setup({
    fetch: async (path, options = {}) => {
      if (path.startsWith('/superagent-lite/tasks?taskId=')) {
        assert.equal(options.method, 'DELETE')
        const removed = new URL(path, 'http://localhost').searchParams.get('taskId')
        if (removed === 'b' && rejectB) {
          rejectB = false
          return { ok: false, json: async () => ({ error: 'The worker is still running' }) }
        }
        tasks = tasks.filter(item => item.id !== removed)
        return { ok: true, json: async () => ({ deleted: removed }) }
      }
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks }) }
      return { ok: true, json: async () => ({ records: [] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  const rowFor = title => byClass(tree, 'sl-task').find(row => text(row).includes(title))
  const checkIn = row => nodes(row).find(node => node.type === 'input' && node.props.type === 'checkbox')
  checkIn(rowFor('Task A')).props.onChange()
  checkIn(rowFor('Task B')).props.onChange()
  tree = board.render()
  button(tree, '删除所选').props.onClick()
  tree = board.render()
  button(tree, '删除').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.doesNotMatch(text(tree), /Task A/)
  assert.match(text(tree), /Task B/)
  assert.match(text(tree), /The worker is still running/)
  assert.match(text(tree), /已选择 1/)
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 1)
  assert.equal(checkIn(rowFor('Task B')).props.checked, true)
  button(tree, '删除').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.doesNotMatch(text(tree), /Task B/)
  assert.match(text(tree), /所选任务已删除/)
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 0)
  board.dispose()
})
