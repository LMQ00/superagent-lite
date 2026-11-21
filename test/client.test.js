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

test('lists worker branches as pull requests and sends the chosen merge action from the detail', async () => {
  const requests = []
  let merged = false
  const branchTasks = () => [{
    id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one',
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
  assert.match(text(tree), /Git 管理/)
  assert.match(text(tree), /sl-a.*master/)
  assert.match(text(tree), /有未合并改动/)
  assert.match(text(tree), /dsh/)
  assert.deepEqual(nodes(tree).filter(node => node.props?.className === 'sl-pr__state').map(node => node.props['data-state']), ['open'])
  nodes(tree).find(node => node.type === 'button' && node.props.className === 'sl-pr__row').props.onClick()
  await flush()
  tree = board.render()
  assert.match(text(tree), /提交/)
  assert.match(text(tree), /改动文件/)
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
  assert.match(text(tree), /没有打开的拉取请求/)
  nodes(tree).find(node => node.type === 'button' && node.props.role === 'tab' && text(node).startsWith('已合并')).props.onClick()
  tree = board.render()
  assert.match(text(tree), /Task A/)
  assert.match(text(tree), /无未合并改动/)
  board.dispose()
})

test('shows the Git action error returned by the host', async () => {
  const board = setup({
    fetch: async (path) => path === '/superagent-lite/git'
      ? { ok: false, json: async () => ({ error: 'Merge would conflict' }) }
      : path.startsWith('/superagent-lite/git?taskId=')
        ? { ok: true, json: async () => ({ commits: [], files: [] }) }
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
  nodes(tree).find(node => node.type === 'button' && node.props.className === 'sl-pr__row').props.onClick()
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

test('filters pull requests by state and search, and opens a row into commits, files and validated actions', async () => {
  const detailRequests = []
  const base = { teamId: 'alpha', projectRoot: '/one', updatedAt: '2026-01-01T00:00:00.000Z' }
  const rows = [
    { ...base, id: 'a', title: 'Add dashboard', status: 'awaiting-ci',
      git: { branch: 'sl-a', baseBranch: 'master', author: 'dsh', approved: true, reviewed: true, merged: false, unmerged: true,
        pr: { url: 'https://github.com/owner/repo/pull/12', state: 'OPEN', exact: true, draft: false, author: 'octocat', comments: 2, checks: { state: 'success', total: 3 } },
        canMerge: false, mergeReason: 'GitHub projects must merge through a pull request',
        canPublish: false, publishReason: 'All required CI checks must pass' } },
    { ...base, id: 'b', title: 'Draft docs', status: 'review-required',
      git: { branch: 'sl-b', baseBranch: 'master', author: 'dsh', approved: false, reviewed: false, merged: false, unmerged: true,
        pr: { url: 'https://github.com/owner/repo/pull/13', state: 'OPEN', exact: true, draft: true, author: 'monalisa', comments: 0, checks: { state: 'pending', total: 1 } },
        canMerge: false, mergeReason: 'The review has not approved this branch',
        canPublish: false, publishReason: 'The review has not approved this branch' } },
    { ...base, id: 'c', title: 'Merged feature', status: 'merged',
      git: { branch: 'sl-c', baseBranch: 'master', approved: true, reviewed: true, merged: true, unmerged: false,
        pr: { url: 'https://github.com/owner/repo/pull/11/', state: 'MERGED', exact: true, draft: false, author: 'octocat', comments: 1, checks: { state: 'success', total: 2 } },
        canMerge: false, canPublish: false } },
    { ...base, id: 'd', title: 'Abandoned branch', status: 'delivery-blocked',
      git: { branch: 'sl-d', baseBranch: 'master', approved: true, reviewed: true, merged: false, unmerged: true,
        pr: { url: 'https://github.com/owner/repo/pull/10', state: 'CLOSED', exact: true, draft: false, author: 'ghost', comments: 0 },
        canMerge: false, mergeReason: 'This branch already has a pull request',
        canPublish: false, publishReason: 'This branch already has a pull request' } },
  ]
  const board = setup({
    fetch: async (path) => {
      if (path.startsWith('/superagent-lite/git?taskId=')) {
        detailRequests.push(path)
        return { ok: true, json: async () => ({
          commits: [{ hash: 'e'.repeat(40), author: 'Worker', date: '2026-01-01T00:00:00.000Z', subject: 'Explain the change' }],
          files: [{ path: 'src/panel.js', additions: 4, deletions: 2 }, { path: 'assets/logo.png', additions: undefined, deletions: undefined }],
        }) }
      }
      return { ok: true, json: async () => ({ tasks: rows }) }
    },
    language: 'zh',
  })
  const gitNode = () => nodes(board.render()).find(node => node.props?.className === 'sl-pr-section')
  const gitNodes = () => nodes(gitNode())
  const gitText = () => text(gitNode())
  board.render()
  await flush()
  assert.match(gitText(), /Add dashboard/)
  assert.match(gitText(), /Draft docs/)
  assert.match(gitText(), /#12/)
  assert.match(gitText(), /octocat/)
  assert.match(gitText(), /monalisa/)
  assert.doesNotMatch(gitText(), /Merged feature/)
  assert.doesNotMatch(gitText(), /Abandoned branch/)
  assert.deepEqual(gitNodes().filter(node => node.props?.className === 'sl-pr__state').map(node => node.props['data-state']), ['open', 'draft'])
  const badges = gitNodes().filter(node => node.props?.className === 'sl-pr__badge')
  assert.ok(badges.some(node => node.props.title === '评论: 2'))
  assert.ok(badges.some(node => node.props.title === '检查: 检查通过' && node.props['data-state'] === 'success'))
  assert.ok(badges.some(node => node.props.title === '检查: 检查进行中' && node.props['data-state'] === 'pending'))

  const search = () => gitNodes().find(node => node.type === 'input' && node.props.type === 'search')
  assert.equal(search().props.placeholder, '搜索拉取请求')
  search().props.onChange({ target: { value: 'docs' } })
  assert.match(gitText(), /Draft docs/)
  assert.doesNotMatch(gitText(), /Add dashboard/)
  search().props.onChange({ target: { value: 'missing' } })
  assert.match(gitText(), /没有符合搜索条件的拉取请求/)
  search().props.onChange({ target: { value: '' } })

  const tab = label => gitNodes().find(node => node.type === 'button' && node.props.role === 'tab' && text(node).startsWith(label))
  assert.equal(text(tab('打开')), '打开2')
  assert.equal(text(tab('已合并')), '已合并1')
  assert.equal(text(tab('已关闭')), '已关闭1')
  tab('已合并').props.onClick()
  assert.match(gitText(), /Merged feature/)
  assert.match(gitText(), /#11/)
  assert.doesNotMatch(gitText(), /Add dashboard/)
  gitNodes().find(node => node.type === 'button' && node.props.className === 'sl-pr__row').props.onClick()
  await flush()
  assert.match(gitText(), /Explain the change/)
  assert.match(gitText(), /src\/panel\.js.*\+4.*-2/)
  assert.match(gitText(), /assets\/logo\.png/)
  assert.equal(gitNodes().find(node => node.type === 'button' && text(node) === '合并到 master'), undefined)
  assert.deepEqual(gitNodes().filter(node => node.type === 'a').map(node => node.props.href),
    ['https://github.com/owner/repo/pull/11/'])

  tab('已关闭').props.onClick()
  assert.match(gitText(), /Abandoned branch/)
  assert.doesNotMatch(gitText(), /Merged feature/)

  tab('打开').props.onClick()
  const rowsShown = gitNodes().filter(node => node.type === 'button' && node.props.className === 'sl-pr__row')
  rowsShown[0].props.onClick()
  await flush()
  const merge = gitNodes().find(node => node.type === 'button' && text(node) === '合并到 master')
  const publish = gitNodes().find(node => node.type === 'button' && text(node) === '发送 PR')
  assert.equal(merge.props.disabled, true)
  assert.equal(publish.props.disabled, true)
  assert.match(gitText(), /GitHub projects must merge through a pull request/)
  assert.match(gitText(), /All required CI checks must pass/)
  assert.equal(detailRequests.length, 2)
  board.dispose()
})

test('shows why a Git action is unavailable and reports the completed action', async () => {
  const requests = []
  const tasks = [{ id: 'a', title: 'Task A', teamId: 'alpha', projectRoot: '/one', status: 'awaiting-merge', workerSessionId: 'worker-a', parentSessionId: 'parent-a',
    git: { branch: 'sl-a', baseBranch: 'master', approved: true, reviewed: true, merged: false, unmerged: true, canMerge: false, canPublish: true, mergeReason: 'The target checkout has uncommitted changes' } }]
  const board = setup({
    fetch: async (path, options = {}) => {
      requests.push({ path, options })
      if (path.startsWith('/superagent-lite/git?taskId=')) return { ok: true, json: async () => ({ commits: [], files: [] }) }
      if (path === '/superagent-lite/git') return { ok: true, json: async () => ({}) }
      return { ok: true, json: async () => ({ tasks }) }
    },
    language: 'en',
  })
  board.render()
  await flush()
  let tree = board.render()
  nodes(tree).find(node => node.type === 'button' && node.props.className === 'sl-pr__row').props.onClick()
  await flush()
  tree = board.render()
  assert.match(text(tree), /Merge into master: The target checkout has uncommitted changes/)
  assert.equal(nodes(tree).find(node => node.type === 'button' && text(node) === 'Merge into master').props.disabled, true)
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Send pull request').props.onClick()
  for (let step = 0; step < 2; step += 1) { board.render(); await flush() }
  assert.equal(requests.filter(request => request.path === '/superagent-lite/git').length, 1)
  assert.deepEqual(JSON.parse(requests.find(request => request.path === '/superagent-lite/git').options.body), { taskId: 'a', action: 'publish' })

  board.dispose()
})
