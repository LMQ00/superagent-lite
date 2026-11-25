import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

function setup({ fetch, openSession, language = 'en', timers = {} }) {
  const schedule = timers.setTimeout ?? setTimeout
  const cancel = timers.clearTimeout ?? clearTimeout
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
      previous?.dispose?.()
      effects[index] = { dependencies, dispose: effect() }
    },
  }
  runInContext(source, createContext({
    window: { __ModuleLoader__: { load(value) { definition = value } } }, fetch, AbortController, URL,
    setTimeout: schedule, clearTimeout: cancel,
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
      for (const { dispose } of effects) dispose?.()
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
const tab = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props?.role === 'tab' && text(node).startsWith(label))
const buttons = (tree, label) => nodes(tree).filter(node => node.type === 'button' && text(node) === label)
const select = (tree, predicate) => nodes(tree).find(node => node.type === 'select' && predicate?.(node))

const task = overrides => {
  const value = {
    id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one', mode: 'change', status: 'unmerged',
    workerSessionId: 'worker-a', parentSessionId: 'parent-a', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
  if (value.stoppable === undefined) value.stoppable = value.status === 'running' || value.queued === true
  if (value.deletable === undefined) value.deletable = true
  return value
}

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
  assert.equal(board.definition.id, '@lmq00/superagent-lite')
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

test('keeps the task list scrollable beside the settings tab', async () => {
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
  const tabs = nodes(tree).filter(node => node.type === 'button' && node.props?.role === 'tab')
  assert.deepEqual(tabs.map(node => text(node)), ['项目任务', '设置', '记忆系统', '分支 / worktree'])
  assert.equal(tabs[0].props['aria-selected'], true)
  assert.equal(tabs[1].props['aria-selected'], false)
  assert.equal(tabs[2].props['aria-selected'], false)
  assert.equal(tabs[3].props['aria-selected'], false)
  assert.match(source, /\.sl-board\{[^}]*height:100%[^}]*overflow:hidden/)
  assert.match(source, /\.sl-scroll\{[^}]*flex:1[^}]*overflow-y:auto/)
  assert.equal(byClass(tree, 'sl-scroll').length, 1)
  assert.match(text(byClass(tree, 'sl-scroll')[0]), /Task 1/)
  assert.equal(byClass(tree, 'sl-task').length, 12)
  assert.equal(requests.filter(path => path === '/superagent-lite/tasks').length, 1)
  board.dispose()
})

test('the settings tab edits the worker model and concurrency limit', async () => {
  const requests = []
  let saved = { workerModel: null, maxWorkers: 3 }
  const catalog = {
    default: { provider: 'deepseek', model: 'deepseek-chat' },
    groups: [{ id: 'deepseek', name: 'DeepSeek', models: [
      { id: 'deepseek-chat', name: 'Chat' },
      { id: 'deepseek-reasoner', name: 'Reasoner', reasoning: { efforts: [{ id: 'high', name: 'High' }] } },
    ] }],
    failures: [],
  }
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks: [] }) }
      if (path === '/superagent-lite/worker-settings' && options.method === 'POST') {
        saved = JSON.parse(options.body)
        return { ok: true, json: async () => ({ settings: saved }) }
      }
      return {
        ok: true,
        json: async () => ({ settings: saved, limits: { maxWorkers: { min: 1, max: 16 } }, catalog }),
      }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  tab(tree, '设置').props.onClick()
  tree = board.render()
  assert.equal(tab(tree, '设置').props['aria-selected'], true)
  assert.match(text(tree), /Worker 模型/)
  assert.match(text(tree), /留空时跟随 DSH 默认模型/)
  assert.match(text(tree), /并发 worker 上限/)
  assert.match(text(tree), /DSH 当前默认/)
  const input = id => nodes(tree).find(node => node.type === 'input' && node.props?.id === id)
  input('panel-heading-provider').props.onChange({ target: { value: 'deepseek' } })
  tree = board.render()
  input('panel-heading-model').props.onChange({ target: { value: 'deepseek-reasoner' } })
  tree = board.render()
  input('panel-heading-effort').props.onChange({ target: { value: 'high' } })
  tree = board.render()
  input('panel-heading-provider').props.onChange({ target: { value: 'deepseek' } })
  nodes(tree).find(node => node.type === 'input' && node.props?.min === 1)
    .props.onChange({ target: { value: '2' } })
  tree = board.render()
  button(tree, '保存').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  const posts = requests.filter(request => request.path === '/superagent-lite/worker-settings' && request.options.method === 'POST')
  assert.equal(posts.length, 1)
  assert.deepEqual(JSON.parse(posts[0].options.body), {
    workerModel: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    maxWorkers: 2,
  })
  assert.match(text(board.render()), /设置已保存/)
  board.dispose()
})

test('the memory tab browses and deletes global memory, project memory, skills and global knowledge', async () => {
  const requests = []
  const tasks = [
    task({ id: 'a', projectRoot: '/two', updatedAt: '2026-02-01T00:00:00.000Z' }),
    task({ id: 'b', projectRoot: '/one', updatedAt: '2026-01-01T00:00:00.000Z' }),
  ]
  const sharedSkills = [{
    name: 'superagent-shared-memory', description: 'Shared inspection.', content: 'Inspect first.',
  }]
  const views = {
    '/one': {
      global: { userProfile: 'Prefers Chinese reports.' },
      project: { projectRoot: '/one', responsibilities: 'Keep the board accurate.', positioning: 'Local-first tools.' },
      knowledge: [{
        id: '1', text: 'Run npm test before reporting.',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      }],
      skills: {
        global: sharedSkills,
        project: [
          { name: 'superagent-lite-test-conventions', description: 'Test conventions.', content: 'Prefer node --test.' },
          { name: 'superagent-project-memory', description: 'Keep the board accurate.', content: 'Run npm test.' },
        ],
      },
    },
    '/two': {
      global: { userProfile: 'Prefers Chinese reports.' },
      project: { projectRoot: '/two', responsibilities: 'Watch the second project.', positioning: '' },
      knowledge: [{
        id: '1', text: 'Run npm test before reporting.',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      }],
      skills: {
        global: [{ name: 'superagent-shared-memory', description: 'Shared inspection guidance.', content: 'Inspect the repository first.' }],
        project: [{ name: 'superagent-project-memory', description: 'Project inspection guidance.', content: 'Run the project tests.' }],
      },
    },
  }
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks }) }
      if (options.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({
            deleted: { kind: 'skill', scope: 'project', name: 'superagent-lite-test-conventions' },
            existed: true,
          }),
        }
      }
      const root = new URL(path, 'http://localhost').searchParams.get('projectRoot')
      return { ok: true, json: async () => views[root] }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  board.render()
  await flush()
  let tree = board.render()
  tab(tree, '记忆系统').props.onClick()
  tree = board.render()
  // The memory view loads when its tab is first selected.
  assert.equal(tab(tree, '记忆系统').props['aria-selected'], true)
  assert.match(text(tree), /正在加载任务/)
  await flush()
  tree = board.render()
  assert.equal(tab(tree, '项目任务').props['aria-selected'], false)
  assert.equal(tab(tree, '设置').props['aria-selected'], false)
  assert.match(text(tree), /查看并删除保存的项目记忆/)
  assert.match(text(tree), /全局记忆/)
  assert.match(text(tree), /用户画像/)
  assert.match(text(tree), /Prefers Chinese reports/)
  assert.match(text(tree), /全局 skill/)
  assert.match(text(tree), /superagent-shared-memory/)
  assert.match(text(tree), /Shared inspection/)
  assert.match(text(tree), /项目记忆/)
  assert.match(text(tree), /责任/)
  assert.match(text(tree), /Watch the second project/)
  assert.match(text(tree), /定位/)
  assert.match(text(tree), /未保存/)
  assert.match(text(tree), /全局 skill/)
  assert.match(text(tree), /Shared inspection guidance/)
  assert.match(text(tree), /项目 skill/)
  assert.match(text(tree), /Project inspection guidance/)
  assert.match(text(tree), /全局知识库1/)
  assert.match(text(tree), /Run npm test before reporting/)
  // The most recently updated task's project is the current project.
  const projectSelect = nodes(tree).find(node => node.type === 'select')
  assert.equal(projectSelect.props.value, '/two')
  // Deleting is an inline action with a confirmation dialog, not an edit form.
  const searchInput = nodes(tree).find(node => node.type === 'input' && node.props?.type === 'search')
  assert.ok(searchInput, 'the memory tab has a search box')
  assert.equal(searchInput.props['aria-label'], '搜索记忆')
  assert.equal(nodes(tree).filter(node => ['input', 'textarea'].includes(node.type)).length, 1)
  assert.equal(buttons(tree, '删除').length, 5)
  assert.equal(nodes(tree).filter(node => node.props?.role === 'tabpanel').length, 1)

  projectSelect.props.onChange({ target: { value: '/one' } })
  board.render()
  await flush()
  tree = board.render()
  assert.match(text(tree), /Keep the board accurate/)
  assert.match(text(tree), /Local-first tools/)
  assert.match(text(tree), /Test conventions/)
  assert.doesNotMatch(text(tree), /Prefer node --test/)
  // Skill content stays collapsed until the summary row is opened.
  nodes(tree).find(node => node.type === 'button' && node.props?.['aria-expanded'] === false &&
    text(node).includes('superagent-lite-test-conventions')).props.onClick()
  tree = board.render()
  assert.match(text(tree), /Prefer node --test/)
  assert.match(text(tree), /superagent-lite-test-conventions/)
  assert.doesNotMatch(text(tree), /未保存/)
  assert.doesNotMatch(text(tree), /Shared inspection guidance/)
  assert.match(text(tree), /全局知识库1/)
  assert.match(text(tree), /Run npm test before reporting/)
  assert.match(text(tree), /更新时间/)
  assert.equal(nodes(tree).filter(node => node.type === 'button' &&
    /^删除: /.test(node.props?.['aria-label'] ?? '')).length, 7)
  const memoryRequests = requests.filter(request => request.path.startsWith('/superagent-lite/memory'))
  assert.deepEqual(memoryRequests.map(request => new URL(request.path, 'http://localhost').searchParams.get('projectRoot')),
    ['/two', '/one'])
  for (const request of memoryRequests) {
    assert.equal(request.options.method, 'GET')
    assert.equal(request.options.credentials, 'same-origin')
    assert.equal(request.options.cache, 'no-store')
    assert.ok(request.options.signal)
  }

  const skillDelete = nodes(tree).find(node => node.type === 'button' &&
    node.props?.['aria-label'] === '删除: superagent-lite-test-conventions')
  assert.ok(skillDelete, 'the project skill has a delete button')
  skillDelete.props.onClick()
  tree = board.render()
  assert.match(text(tree), /删除记忆内容/)
  assert.match(text(tree), /superagent-lite-test-conventions/)
  buttons(tree, '删除').at(-1).props.onClick()
  await flush()
  tree = board.render()
  const deletes = requests.filter(request => request.options.method === 'DELETE')
  assert.equal(deletes.length, 1)
  const params = new URL(deletes[0].path, 'http://localhost').searchParams
  assert.equal(params.get('kind'), 'skill')
  assert.equal(params.get('scope'), 'project')
  assert.equal(params.get('name'), 'superagent-lite-test-conventions')
  assert.equal(params.get('projectRoot'), '/one')
  assert.equal(deletes[0].options.credentials, 'same-origin')
  assert.match(text(tree), /记忆内容已删除/)
  assert.doesNotMatch(text(tree), /Prefer node --test/)
  assert.match(text(tree), /Keep the board accurate/)
  board.dispose()
  assert.ok(requests.filter(request => request.options.signal).every(request => request.options.signal.aborted))
})

test('the memory tab filters all sections locally and keeps collapse, expand and delete behaviour', async () => {
  const requests = []
  const longProfile = 'Prefers terse reports. '.repeat(12)
  const longKnowledge = 'Keep the feedback loop short. '.repeat(8)
  const view = {
    global: { userProfile: longProfile },
    project: { projectRoot: '/one', responsibilities: 'Keep the board accurate.', positioning: 'Local-first tools.' },
    knowledge: [
      {
        id: '7', text: 'Always run the test suite.',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: '8', text: longKnowledge,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ],
    skills: {
      global: [{ name: 'shared-memory', description: 'Inspect the repository first.', content: 'Read AGENTS.md before editing.' }],
      project: [{ name: 'board-memory', description: 'Keep the board accurate.', content: 'Run npm test.' }],
    },
  }
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks: [task({ projectRoot: '/one' })] }) }
      if (path === '/superagent-lite/worker-settings') return { ok: true, json: async () => ({ settings: {} }) }
      return { ok: true, json: async () => view }
    },
    language: 'en',
  })
  board.render()
  await flush()
  board.render()
  await flush()
  let tree = board.render()
  tab(tree, 'Memory').props.onClick()
  board.render()
  await flush()
  tree = board.render()
  const search = (value, current = board.render()) => {
    nodes(current).find(node => node.type === 'input' && node.props?.type === 'search')
      .props.onChange({ target: { value } })
    return board.render()
  }
  const sectionCount = current => byClass(current, 'sl-memory__section').length
  const deleteLabels = current => nodes(current).filter(node => node.type === 'button' &&
    /^Delete: /.test(node.props?.['aria-label'] ?? '')).map(node => node.props['aria-label'])

  // Long memory and knowledge text is clamped until expanded; skill content
  // starts folded and shows only the name and description.
  assert.equal(sectionCount(tree), 3)
  assert.match(text(tree), /Global knowledge base2/)
  assert.match(text(tree), /Inspect the repository first/)
  assert.doesNotMatch(text(tree), /Read AGENTS.md before editing/)
  const profile = nodes(tree).find(node => node.type === 'p' &&
    (node.props?.className ?? '').startsWith('sl-memory-field__value') && text(node).includes('Prefers terse'))
  assert.match(profile.props.className, /sl-memory-field__value--clamped/)
  nodes(tree).find(node => node.type === 'button' && node.props?.['aria-label'] === 'Show more: User profile')
    .props.onClick()
  tree = board.render()
  assert.doesNotMatch(nodes(tree).find(node => node.type === 'p' &&
    (node.props?.className ?? '').startsWith('sl-memory-field__value') && text(node).includes('Prefers terse'))
    .props.className, /--clamped/)
  const knowledgeText = nodes(tree).find(node => node.type === 'p' &&
    (node.props?.className ?? '').startsWith('sl-memory-entry__text') &&
    text(node).includes('Keep the feedback loop short.'))
  assert.match(knowledgeText.props.className, /sl-memory-entry__text--clamped/)
  nodes(tree).find(node => node.type === 'button' && node.props?.['aria-label'] === 'Show more: #8').props.onClick()
  tree = board.render()
  assert.equal(nodes(tree).find(node => node.type === 'p' &&
    (node.props?.className ?? '').startsWith('sl-memory-entry__text') && text(node).includes('Keep the feedback loop short.'))
    .props.className.includes('--clamped'), false)

  // A project field and the project skill description match; the global
  // section and the knowledge section are hidden while filtering.
  tree = search('accurate')
  assert.equal(sectionCount(tree), 1)
  assert.match(text(tree), /Keep the board accurate/)
  assert.match(text(tree), /board-memory/)
  assert.doesNotMatch(text(tree), /Prefers terse/)
  assert.doesNotMatch(text(tree), /Inspect the repository first/)
  assert.doesNotMatch(text(tree), /Global knowledge base/)
  // Delete stays available on a filtered row and still opens the confirmation.
  assert.ok(deleteLabels(tree).includes('Delete: Responsibilities'))
  nodes(tree).find(node => node.type === 'button' && node.props?.['aria-label'] === 'Delete: Responsibilities')
    .props.onClick()
  tree = board.render()
  assert.match(text(tree), /Delete memory content/)
  button(tree, 'Cancel').props.onClick()
  board.render()

  // Matching is case-insensitive and searches skill content, which stays
  // collapsed until opened.
  tree = search('TEST')
  assert.equal(sectionCount(tree), 2)
  assert.match(text(tree), /Global knowledge base1/)
  assert.match(text(tree), /Always run the test suite/)
  assert.match(text(tree), /Keep the board accurate/)
  assert.doesNotMatch(text(tree), /Run npm test\./)
  nodes(tree).find(node => node.type === 'button' && node.props?.['aria-expanded'] === false &&
    text(node).includes('board-memory')).props.onClick()
  tree = board.render()
  assert.match(text(tree), /Run npm test\./)

  tree = search('shared')
  assert.equal(sectionCount(tree), 1)
  assert.match(text(tree), /shared-memory/)
  assert.doesNotMatch(text(tree), /board-memory/)

  tree = search('zzz')
  assert.equal(sectionCount(tree), 0)
  assert.match(text(tree), /No memory content matches the search/)
  assert.equal(deleteLabels(tree).length, 0)

  // Clearing the query restores the already-loaded view without another read.
  tree = search('')
  assert.equal(sectionCount(tree), 3)
  assert.match(text(tree), /Prefers terse/)
  assert.match(text(tree), /Keep the board accurate/)
  assert.match(text(tree), /Global knowledge base2/)
  assert.equal(requests.filter(request => request.path.startsWith('/superagent-lite/memory')).length, 1)
  board.dispose()
})

test('the memory tab reports a load failure and can retry from the same panel', async () => {
  let fail = true
  const board = setup({
    fetch: async path => {
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks: [task()] }) }
      if (path === '/superagent-lite/worker-settings') return { ok: true, json: async () => ({ settings: {} }) }
      return fail
        ? { ok: false }
        : {
            ok: true,
            json: async () => ({ global: { userProfile: 'Recovered.' }, project: { responsibilities: 'R' }, knowledge: [] }),
          }
    },
    language: 'en',
  })
  board.render()
  await flush()
  board.render()
  await flush()
  let tree = board.render()
  tab(tree, 'Memory').props.onClick()
  board.render()
  await flush()
  tree = board.render()
  assert.match(text(tree), /Could not load memory/)
  fail = false
  button(tree, 'Refresh').props.onClick()
  board.render()
  await flush()
  board.render()
  await flush()
  tree = board.render()
  assert.match(text(tree), /Recovered/)
  board.dispose()
})

test('deletes saved memory, skills and knowledge in place after confirmation', async () => {
  const requests = []
  const view = {
    global: { userProfile: 'Delete this profile.' },
    project: { projectRoot: '/one', responsibilities: 'Delete this responsibility.', positioning: 'Keep positioning.' },
    knowledge: [{
      id: '1', text: 'Delete this knowledge.',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    }],
    skills: {
      global: [{ name: 'superagent-shared-memory', description: 'Shared inspection guidance.', content: 'Inspect the repository first.' }],
      project: [{ name: 'superagent-project-memory', description: 'Project inspection guidance.', content: 'Run the project tests.' }],
    },
  }
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks: [task({ projectRoot: '/one' })] }) }
      if (path === '/superagent-lite/worker-settings') return { ok: true, json: async () => ({ settings: {} }) }
      if (options.method === 'DELETE') return { ok: true, json: async () => ({ deleted: {} }) }
      return { ok: true, json: async () => view }
    },
    language: 'en',
  })
  board.render()
  await flush()
  board.render()
  await flush()
  let tree = board.render()
  tab(tree, 'Memory').props.onClick()
  board.render()
  await flush()
  tree = board.render()
  const deleteButton = label => nodes(tree).find(node => node.type === 'button' &&
    node.props?.['aria-label'] === `Delete: ${label}`)
  const confirm = async () => {
    button(board.render(), 'Delete').props.onClick()
    board.render()
    await flush()
    board.render()
    await flush()
    return board.render()
  }

  deleteButton('User profile').props.onClick()
  tree = board.render()
  assert.match(text(tree), /Delete memory content/)
  assert.match(text(tree), /The saved memory field is cleared/)
  tree = await confirm()
  assert.doesNotMatch(text(tree), /Delete this profile/)
  assert.match(text(tree), /Memory content deleted/)

  deleteButton('Responsibilities').props.onClick()
  tree = board.render()
  assert.match(text(tree), /Delete this responsibility\./)
  tree = await confirm()
  assert.doesNotMatch(text(tree), /Delete this responsibility/)
  assert.match(text(tree), /Keep positioning/)

  deleteButton('superagent-project-memory').props.onClick()
  tree = board.render()
  assert.match(text(tree), /Later sessions no longer see this skill/)
  tree = await confirm()
  assert.doesNotMatch(text(tree), /Project inspection guidance/)

  deleteButton('#1').props.onClick()
  tree = board.render()
  assert.match(text(tree), /so queries no longer return it/)
  tree = await confirm()
  assert.doesNotMatch(text(tree), /Delete this knowledge/)
  assert.match(text(tree), /Global knowledge base0/)

  const deletes = requests.filter(request => request.options.method === 'DELETE')
  assert.deepEqual(deletes.map(request => {
    const url = new URL(request.path, 'http://localhost')
    return [
      url.searchParams.get('kind'), url.searchParams.get('scope'), url.searchParams.get('field'),
      url.searchParams.get('projectRoot'), url.searchParams.get('name'), url.searchParams.get('id'),
    ]
  }), [
    ['memory', 'global', 'userProfile', null, null, null],
    ['memory', 'project', 'responsibilities', '/one', null, null],
    ['skill', 'project', null, '/one', 'superagent-project-memory', null],
    ['knowledge', null, null, null, null, '1'],
  ])
  for (const request of deletes) {
    assert.equal(request.options.credentials, 'same-origin')
    assert.equal(request.options.cache, 'no-store')
  }
  // Deletes update the loaded view in place and do not reload the memory tab.
  assert.equal(requests.filter(request =>
    request.path.startsWith('/superagent-lite/memory') && request.options.method !== 'DELETE').length, 1)
  board.dispose()
})

test('keeps memory content and reports the error when a delete fails', async () => {
  const board = setup({
    fetch: async (path, options = {}) => {
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks: [task({ projectRoot: '/one' })] }) }
      if (path === '/superagent-lite/worker-settings') return { ok: true, json: async () => ({ settings: {} }) }
      if (options.method === 'DELETE') return { ok: false, json: async () => ({ error: 'Memory is locked' }) }
      return { ok: true, json: async () => ({ global: { userProfile: 'Keep this profile.' }, project: { responsibilities: 'R' }, knowledge: [] }) }
    },
    language: 'en',
  })
  board.render()
  await flush()
  board.render()
  await flush()
  let tree = board.render()
  tab(tree, 'Memory').props.onClick()
  board.render()
  await flush()
  tree = board.render()
  nodes(tree).find(node => node.type === 'button' && node.props?.['aria-label'] === 'Delete: User profile')
    .props.onClick()
  button(board.render(), 'Delete').props.onClick()
  board.render()
  await flush()
  tree = board.render()
  assert.match(text(tree), /Memory is locked/)
  assert.match(text(tree), /Keep this profile/)
  assert.doesNotMatch(text(tree), /Memory content deleted/)
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

test('a queued task carries its own label and becomes running in place when a slot opens', async () => {
  const requests = []
  const scheduled = []
  const cleared = []
  const responses = [
    [task({ status: 'running', queued: true })],
    [task({ status: 'running' })],
  ]
  let loads = 0
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/tasks') {
        const tasks = responses[Math.min(loads++, responses.length - 1)]
        return { ok: true, json: async () => ({ tasks }) }
      }
      return { ok: true, json: async () => ({ settings: { maxWorkers: 1 }, limits: { maxWorkers: { min: 1, max: 16 } } }) }
    },
    timers: {
      setTimeout(callback, delay) { scheduled.push({ callback, delay }); return scheduled.length },
      clearTimeout(id) { cleared.push(id) },
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  const rowOf = target => byClass(target, 'sl-task').find(row => text(row).includes('Task A'))
  assert.match(text(rowOf(tree)), /排队中/)
  assert.ok(text(tree).includes('排队中1'))
  assert.doesNotMatch(text(tree), /未确认/)
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['运行中1'])
  assert.equal(scheduled.length, 1)
  assert.equal(scheduled[0].delay, 3000)

  await scheduled[0].callback()
  await flush()
  tree = board.render()
  assert.doesNotMatch(text(rowOf(tree)), /排队中/)
  assert.ok(text(tree).includes('排队中0'))
  assert.doesNotMatch(text(tree), /正在加载任务/)
  assert.match(text(tree), /运行中/)
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['运行中1'])
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks').length, 2)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks').at(-1).options.credentials, 'same-origin')
  assert.deepEqual(cleared, [1])
  board.dispose()
})

test('filters queued tasks into their own group while keeping the queued label and stop action', async () => {
  let tasks = [
    task({ id: 'a', title: 'Task A', status: 'running', queued: true, workerSessionId: 'worker-a' }),
    task({ id: 'b', title: 'Task B', status: 'running', workerSessionId: 'worker-b' }),
    task({ id: 'c', title: 'Task C', status: 'unmerged', git: gitFacts() }),
  ]
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/tasks' && options.method === 'POST') {
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'stop' })
        tasks = tasks.map(item => item.id === 'a'
          ? { ...item, status: 'failed', cancelled: true, queued: false, stoppable: false }
          : item)
        return { ok: true, json: async () => ({ stopped: 'a', status: 'cancelled', cancelled: true, updatedAt: '2026-01-02T00:00:00.000Z' }) }
      }
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks }) }
      return { ok: true, json: async () => ({ settings: { workerModel: null, maxWorkers: 3 } }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  assert.ok(text(tree).includes('运行中2'))
  assert.ok(text(tree).includes('排队中1'))
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['未合并1', '运行中2'])

  filterButton(tree, '排队中').props.onClick()
  tree = board.render()
  assert.equal(filterButton(tree, '排队中').props['aria-pressed'], true)
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['排队中1'])
  assert.deepEqual(byClass(tree, 'sl-task__title').map(node => text(node)), ['Task A'])
  const row = byClass(tree, 'sl-task').find(item => text(item).includes('Task A'))
  assert.match(text(row), /排队中/)
  const stopIn = target => nodes(target).find(node => node.type === 'button' && text(node) === '停止')
  assert.equal(stopIn(row).props.title, '停止 worker 并释放并发名额')

  filterButton(tree, '全部').props.onClick()
  tree = board.render()
  assert.deepEqual(byClass(tree, 'sl-task__title').map(node => text(node)), ['Task C', 'Task A', 'Task B'])
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['未合并1', '运行中2'])

  filterButton(tree, '排队中').props.onClick()
  tree = board.render()
  stopIn(byClass(tree, 'sl-task')[0]).props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.doesNotMatch(text(tree), /Task A/)
  assert.match(text(tree), /该状态下暂无任务/)
  assert.match(text(tree), /任务已停止/)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks' && request.options.method === 'GET').length, 1)
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

test('deletes the worker branch from a merged row after confirmation without reloading', async () => {
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/git') {
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'delete-branch' })
        return {
          ok: true,
          json: async () => ({
            status: 'merged',
            updatedAt: '2026-01-02T00:00:00.000Z',
            view: { status: 'completed' },
            message: 'Deleted the worker branch sl-a.',
          }),
        }
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
  let tree = board.render()
  assert.match(text(tree), /删除修改分支/)
  assert.match(text(tree), /已审查的提交已合并/)
  assert.match(text(tree), /sl-a/)
  // Deleting a branch confirms in place; it does not need the branch-history read.
  assert.equal(requests.filter(request => request.path.startsWith('/superagent-lite/git?')).length, 0)
  button(tree, '删除').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.match(text(tree), /Deleted the worker branch sl-a/)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks').length, 1)
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['已完成1'])
  assert.equal(buttons(tree, '删除分支').length, 0)
  board.dispose()
})

test('offers delete branch on an unmerged row, warns, and settles the row in place', async () => {
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/git') {
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'delete-branch' })
        return {
          ok: true,
          json: async () => ({
            status: 'awaiting-merge',
            updatedAt: '2026-01-02T00:00:00.000Z',
            view: { status: 'completed' },
            message: 'Deleted the worker branch sl-a for a.',
          }),
        }
      }
      return { ok: true, json: async () => ({ tasks: [task({ status: 'unmerged', git: gitFacts({ canDelete: true }) })] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['未合并1'])
  assert.equal(buttons(tree, '合并').length, 1)
  button(tree, '删除分支').props.onClick()
  tree = board.render()
  assert.match(text(tree), /尚未合并/)
  assert.match(text(tree), /丢弃该分支/)
  assert.match(text(tree), /sl-a/)
  assert.equal(requests.filter(request => request.path.startsWith('/superagent-lite/git?')).length, 0)
  button(tree, '删除').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.match(text(tree), /Deleted the worker branch sl-a/)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks').length, 1)
  assert.deepEqual(byClass(tree, 'sl-group__title').map(node => text(node)), ['已完成1'])
  assert.equal(buttons(tree, '合并').length, 0)
  assert.equal(buttons(tree, '提交 PR').length, 0)
  assert.equal(buttons(tree, '删除分支').length, 0)
  board.dispose()
})

test('disables delete branch while the worker is still running and explains why', async () => {
  const reason = 'The task is still running; wait for it to finish before deleting the branch'
  const board = setup({
    fetch: async path => ({ ok: true, json: async () => path === '/superagent-lite/tasks'
      ? { tasks: [task({ status: 'running', git: gitFacts({ canDelete: false, deleteReason: reason }) })] }
      : { records: [] } }),
    language: 'en',
  })
  board.render()
  await flush()
  const deleteBranch = button(board.render(), 'Delete branch')
  assert.equal(deleteBranch.props.disabled, true)
  assert.equal(deleteBranch.props.title, reason)
  board.dispose()
})

test('offers delete branch on every row that still has a worker branch', async () => {
  const rows = ['unmerged', 'unreviewed', 'completed', 'failed'].map((status, index) => task({
    id: String(index), title: `Task ${status}`, status,
    git: gitFacts({
      canDelete: true, merged: status === 'completed', reviewed: status !== 'unreviewed',
      canMerge: false, canPublish: false, canReview: false,
    }),
  }))
  rows.push(task({
    id: 'running', title: 'Task running', status: 'running',
    git: gitFacts({ canDelete: false, deleteReason: 'The task is still running' }),
  }))
  const board = setup({
    fetch: async () => ({ ok: true, json: async () => ({ tasks: rows }) }),
    language: 'en',
  })
  board.render()
  await flush()
  const buttonsOnRows = buttons(board.render(), 'Delete branch')
  assert.equal(buttonsOnRows.length, 5)
  assert.equal(buttonsOnRows.filter(node => node.props.disabled).length, 1)
  board.dispose()
})

test('deletes a task after confirmation and allows deleting a running worker', async () => {
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
  assert.equal(runningDelete.props.disabled, false)
  assert.equal(deleteIn(rowFor('Task C')).props.disabled, false)
  deleteIn(rowFor('Task A')).props.onClick()
  tree = board.render()
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 1)
  assert.match(text(tree), /运行中或排队中的 worker 会先被停止/)
  button(tree, '删除').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.doesNotMatch(text(tree), /Task A/)
  assert.match(text(tree), /Task B/)
  assert.match(text(tree), /操作已完成/)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks' && request.options.method === 'GET').length, 1)
  const deletion = requests.find(request => request.options.method === 'DELETE')
  assert.equal(deletion.path, '/superagent-lite/tasks?taskId=a')
  assert.equal(deletion.options.credentials, 'same-origin')
  board.dispose()
})

test('stops a running or queued task in place without reloading the task list', async () => {
  let tasks = [
    task({ id: 'a', title: 'Task A', status: 'running', queued: true, workerSessionId: 'worker-a' }),
    task({ id: 'b', title: 'Task B', status: 'running', workerSessionId: 'worker-b' }),
  ]
  const requests = []
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/tasks' && options.method === 'POST') {
        assert.deepEqual(JSON.parse(options.body), { taskId: 'a', action: 'stop' })
        tasks = tasks.map(item => item.id === 'a'
          ? { ...item, status: 'failed', cancelled: true, queued: false, stoppable: false }
          : item)
        return { ok: true, json: async () => ({ stopped: 'a', status: 'cancelled', cancelled: true, updatedAt: '2026-01-02T00:00:00.000Z' }) }
      }
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks }) }
      return { ok: true, json: async () => ({ settings: { workerModel: null, maxWorkers: 3 } }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  const rowFor = title => byClass(tree, 'sl-task').find(row => text(row).includes(title))
  const stopIn = row => nodes(row).find(node => node.type === 'button' && text(node) === '停止')
  assert.ok(stopIn(rowFor('Task A')))
  assert.ok(stopIn(rowFor('Task B')))
  assert.match(text(rowFor('Task A')), /排队中/)

  stopIn(rowFor('Task A')).props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.match(text(tree), /Task A/)
  assert.match(text(tree), /Task B/)
  assert.match(text(tree), /已取消/)
  assert.match(text(tree), /任务已停止/)
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 0)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/tasks' && request.options.method === 'GET').length, 1)
  const stop = requests.find(request => request.options.method === 'POST')
  assert.equal(stop.path, '/superagent-lite/tasks')
  assert.equal(stop.options.credentials, 'same-origin')
  assert.equal(stop.options.headers['content-type'], 'application/json')
  board.dispose()
})

test('keeps a task and shows the host error when stopping is refused', async () => {
  const board = setup({
    fetch: async (path, options = {}) => {
      if (path === '/superagent-lite/tasks' && options.method === 'POST') {
        return { ok: false, json: async () => ({ error: 'The worker did not stop in time' }) }
      }
      if (path === '/superagent-lite/tasks') {
        return { ok: true, json: async () => ({ tasks: [task({ id: 'a', title: 'Task A', status: 'running' })] }) }
      }
      return { ok: true, json: async () => ({ settings: { workerModel: null, maxWorkers: 3 } }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  let tree = board.render()
  const row = byClass(tree, 'sl-task').find(item => text(item).includes('Task A'))
  nodes(row).find(node => node.type === 'button' && text(node) === '停止').props.onClick()
  for (let step = 0; step < 4; step += 1) {
    board.render()
    await flush()
  }
  tree = board.render()
  assert.match(text(tree), /Task A/)
  assert.match(text(tree), /The worker did not stop in time/)
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
  assert.equal(runningCheck.props.disabled, false)
  assert.equal(runningCheck.props.title, undefined)
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

test('the branches tab lists only plugin objects and deletes each kind in place', async () => {
  const requests = []
  const rows = [
    {
      projectRoot: '/one', branch: 'sl-feature', path: '/one/.agents/worktrees/sl-feature',
      task: { id: 'a', title: 'Task A', status: 'running', running: true },
      canDeleteWorktree: false, worktreeReason: 'The task is still running; stop its worker before deleting the worktree',
      canDeleteBranch: false, branchReason: 'The task is still running; stop its worker before deleting the branch',
    },
    {
      projectRoot: '/one', branch: 'sl-delivered', path: '/one/.agents/worktrees/sl-delivered',
      task: { id: 'b', title: 'Task B', status: 'unmerged', running: false },
      canDeleteWorktree: true,
      canDeleteBranch: false,
      branchReason: 'Delete the worktree at /one/.agents/worktrees/sl-delivered before deleting its branch',
    },
    {
      projectRoot: '/one', branch: 'sl-orphan',
      canDeleteWorktree: false, worktreeReason: 'This branch has no worktree to delete',
      canDeleteBranch: true,
    },
  ]
  let rejectBranchDelete = false
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path === '/superagent-lite/tasks') return { ok: true, json: async () => ({ tasks: [task({ projectRoot: '/one' })] }) }
      if (path === '/superagent-lite/worker-settings') return { ok: true, json: async () => ({ settings: {} }) }
      if (path.startsWith('/superagent-lite/branches') && options.method === 'DELETE') {
        const params = new URL(path, 'http://localhost').searchParams
        if (params.get('kind') === 'worktree') {
          assert.equal(params.get('projectRoot'), '/one')
          assert.equal(params.get('branch'), 'sl-delivered')
          assert.equal(params.get('path'), '/one/.agents/worktrees/sl-delivered')
          return {
            ok: true,
            json: async () => ({
              branch: 'sl-delivered',
              path: '/one/.agents/worktrees/sl-delivered',
              deleted: true,
              row: {
                projectRoot: '/one', branch: 'sl-delivered',
                task: { id: 'b', title: 'Task B', status: 'unmerged', running: false },
                canDeleteWorktree: false, worktreeReason: 'This branch has no worktree to delete',
                canDeleteBranch: true,
              },
              message: 'Deleted the worktree at /one/.agents/worktrees/sl-delivered for sl-delivered.',
            }),
          }
        }
        assert.equal(params.get('branch'), 'sl-orphan')
        if (rejectBranchDelete) {
          rejectBranchDelete = false
          return { ok: false, json: async () => ({ error: 'The worker branch sl-orphan is still checked out' }) }
        }
        return { ok: true, json: async () => ({ branch: 'sl-orphan', deleted: true, message: 'Deleted the worker branch sl-orphan.' }) }
      }
      if (path === '/superagent-lite/branches') return { ok: true, json: async () => ({ branches: rows }) }
      return { ok: true, json: async () => ({ records: [] }) }
    },
    language: 'zh',
  })
  board.render()
  await flush()
  board.render()
  await flush()
  let tree = board.render()
  tab(tree, '分支 / worktree').props.onClick()
  tree = board.render()
  assert.equal(tab(tree, '分支 / worktree').props['aria-selected'], true)
  assert.match(text(tree), /正在加载任务/)
  await flush()
  tree = board.render()
  assert.match(text(tree), /只显示和删除本插件创建的 worktree/)
  for (const branch of ['sl-feature', 'sl-delivered', 'sl-orphan', 'Task A', 'Task B', '无任务记录']) {
    assert.match(text(tree), new RegExp(branch))
  }
  assert.equal(byClass(tree, 'sl-task').length, 3)

  let delWorktree = buttons(tree, '删除 worktree')
  const delBranch = buttons(tree, '删除分支')
  assert.deepEqual(delWorktree.map(node => node.props.disabled), [true, false, true])
  assert.match(delWorktree[0].props.title, /still running/)
  assert.match(delBranch[1].props.title, /Delete the worktree/)
  assert.equal(delBranch[2].props.disabled, false)

  // Deleting the branch without a worktree removes only that row in place.
  rejectBranchDelete = true
  delBranch[2].props.onClick()
  tree = board.render()
  assert.match(text(tree), /删除分支/)
  assert.match(text(tree), /sl-orphan/)
  button(tree, '删除').props.onClick()
  await flush()
  tree = board.render()
  assert.match(text(tree), /still checked out/)
  assert.equal(byClass(tree, 'sl-task').length, 3)
  button(tree, '删除').props.onClick()
  await flush()
  tree = board.render()
  assert.equal(byClass(tree, 'sl-task').some(row => text(row).includes('sl-orphan')), false)
  assert.equal(byClass(tree, 'sl-task').length, 2)
  assert.equal(nodes(tree).filter(node => node.props?.role === 'dialog').length, 0)

  // Deleting the worktree keeps the branch row and enables its branch action.
  buttons(tree, '删除 worktree')[1].props.onClick()
  tree = board.render()
  assert.match(text(tree), /删除 worktree/)
  assert.match(text(tree), /sl-delivered · \/one\/\.agents\/worktrees\/sl-delivered/)
  button(tree, '删除').props.onClick()
  await flush()
  tree = board.render()
  assert.equal(byClass(tree, 'sl-task').length, 2)
  const delivered = byClass(tree, 'sl-task').find(row => text(row).includes('sl-delivered'))
  assert.ok(delivered)
  assert.doesNotMatch(text(delivered), /\/one\/\.agents\/worktrees\/sl-delivered/)
  assert.match(text(delivered), /无 worktree/)
  delWorktree = buttons(tree, '删除 worktree')
  assert.equal(delWorktree[1].props.disabled, true)
  assert.equal(buttons(tree, '删除分支')[1].props.disabled, false)
  assert.equal(requests.filter(request => request.path === '/superagent-lite/branches').length, 1)
  board.dispose()
  assert.ok(requests.filter(request => request.options.signal).every(request => request.options.signal.aborted))
})
