window.__ModuleLoader__.load({
  id: '@local/superagent-lite',
  factory(require) {
    const { createElement: h, useEffect, useId, useRef, useState } = require('react')
    const id = 'superagent-lite'
    const dictionaries = {
      en: {
        title: 'Project tasks', refresh: 'Refresh', loading: 'Loading tasks…',
        loadFailed: 'Could not load tasks. Try refreshing.', openFailed: 'Could not open the session.',
        empty: 'No tasks yet.', noMatch: 'No tasks match the filters.',
        team: 'Team', project: 'Project', allTeams: 'All teams', allProjects: 'All projects',
        router: 'Router session', worker: 'Worker session', pr: 'Pull request', updated: 'Updated',
        'status.merging': 'Merging', 'status.resuming': 'Resuming', 'status.publishing': 'Publishing pull request', 'status.review-required': 'Review required',
        'status.delivery-blocked': 'Delivery blocked', 'status.starting': 'Starting', 'status.running': 'In progress', 'status.ready': 'Ready',
        'status.completed': 'Completed', 'status.failed': 'Failed', 'status.interrupted': 'Interrupted',
        'status.cancelled': 'Cancelled', 'status.awaiting-ci': 'Waiting for CI',
        'status.awaiting-merge': 'Waiting for merge', 'status.merged': 'Merged',
        'status.merge-conflict': 'Merge conflict', 'status.merge-queued': 'Merge queued',
        'status.unconfirmed': 'Not confirmed', 'status.worker-finished': 'Worker finished', 'status.unknown': 'Unknown',
        gitTitle: 'Git branches', gitEmpty: 'No worker branches yet.',
        branch: 'Branch', baseBranch: 'Base branch', repository: 'Repository', pullRequestState: 'Pull request',
        unmergedChanges: 'Unmerged commits', noUnmergedChanges: 'No unmerged commits',
        reviewApproved: 'Review approved', reviewNotApproved: 'Review not approved', reviewStale: 'Review record is stale',
        mergeInto: 'Merge into', publishPullRequest: 'Send pull request', gitWorking: 'Working…',
        gitFailed: 'The Git action failed.',
        'pr.open': 'Open', 'pr.merged': 'Merged', 'pr.closed': 'Closed', 'pr.unknown': 'Unknown',
      },
      zh: {
        title: '项目任务', refresh: '刷新', loading: '正在加载任务…',
        loadFailed: '无法加载任务，请重试。', openFailed: '无法打开会话。',
        empty: '暂无任务。', noMatch: '没有符合筛选条件的任务。',
        team: '团队', project: '项目', allTeams: '全部团队', allProjects: '全部项目',
        router: 'Router 会话', worker: 'Worker 会话', pr: '拉取请求', updated: '更新时间',
        'status.merging': '正在合并', 'status.resuming': '正在恢复', 'status.publishing': '正在发布拉取请求', 'status.review-required': '需要审查',
        'status.delivery-blocked': '交付受阻', 'status.starting': '启动中', 'status.running': '进行中', 'status.ready': '已就绪',
        'status.completed': '已完成', 'status.failed': '失败', 'status.interrupted': '已中断',
        'status.cancelled': '已取消', 'status.awaiting-ci': '等待 CI',
        'status.awaiting-merge': '等待合并', 'status.merged': '已合并',
        'status.merge-conflict': '合并冲突', 'status.merge-queued': '已进入合并队列',
        'status.unconfirmed': '未确认', 'status.worker-finished': 'Worker 已结束', 'status.unknown': '未知',
        gitTitle: 'Git 管理', gitEmpty: '暂无 worker 分支。',
        branch: '分支', baseBranch: '基础分支', repository: '仓库', pullRequestState: '拉取请求',
        unmergedChanges: '有未合并改动', noUnmergedChanges: '无未合并改动',
        reviewApproved: '审查已通过', reviewNotApproved: '审查未通过', reviewStale: '审查记录已过期',
        mergeInto: '合并到', publishPullRequest: '发送 PR', gitWorking: '处理中…',
        gitFailed: 'Git 操作失败。',
        'pr.open': '打开', 'pr.merged': '已合并', 'pr.closed': '已关闭', 'pr.unknown': '未知',
      },
    }
    const styles = `
      .sl-board{box-sizing:border-box;height:100%;overflow:auto;padding:24px; padding-left:max(24px,var(--dsh-frame-leading-clearance,0px));color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
      .sl-board__body{max-width:920px;margin:0 auto}
      .sl-board__header,.sl-board__filters,.sl-board__actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
      .sl-board__header{justify-content:space-between}
      .sl-board__header h1{font-size:1.25rem;margin:0}
      .sl-board__filters{margin:16px 0}
      .sl-board__filters label{display:grid;gap:4px;max-width:100%;min-width:0;color:var(--dsw-alias-label-secondary)}
      .sl-board button,.sl-board select{box-sizing:border-box;max-width:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);padding:5px 9px;border-radius:6px;font:inherit}
      .sl-board button:not(:disabled){cursor:pointer}
      .sl-board button:not(:disabled):hover{background:var(--dsw-alias-bg-layer-2)}
      .sl-board button:disabled{color:var(--dsw-alias-label-secondary)}
      .sl-board__list{display:grid;gap:8px;padding:0;list-style:none}
      .sl-board__task{display:grid;gap:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:12px;overflow-wrap:anywhere}
      .sl-board__task h2{margin:0;font-size:1rem}
      .sl-board__task h3{margin:0;font-size:.95rem}
      .sl-board__task p{margin:0}
      .sl-board__git{margin-top:24px}
      .sl-board__git h2{font-size:1.1rem;margin:0 0 12px}
      .sl-board__meta{color:var(--dsw-alias-label-secondary)}
      .sl-board__error{color:var(--dsw-alias-state-error-primary)}
      .sl-board a{color:var(--dsw-alias-brand-primary)}
    `

    function pullRequestHref(raw) {
      if (typeof raw !== 'string') return undefined
      try {
        const url = new URL(raw)
        if (url.origin === 'https://github.com' && !url.username && !url.password &&
            /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(url.pathname)) return url.href
      } catch {
        return undefined
      }
    }

    function displayTime(value) {
      if (typeof value !== 'string' && typeof value !== 'number') return undefined
      const date = new Date(value)
      if (!Number.isFinite(date.getTime())) return undefined
      return h('time', { dateTime: date.toISOString() }, date.toLocaleString())
    }

    function Panel({ t, openSession }) {
      const [tasks, setTasks] = useState([])
      const [phase, setPhase] = useState('loading')
      const [revision, setRevision] = useState(0)
      const [team, setTeam] = useState('')
      const [project, setProject] = useState('')
      const [openFailed, setOpenFailed] = useState(false)
      const [gitPending, setGitPending] = useState('')
      const [gitError, setGitError] = useState('')
      const active = useRef(null)
      const headingId = useId()
      const gitHeadingId = useId()

      useEffect(() => {
        const controller = new AbortController()
        active.current = controller
        setPhase('loading')
        async function load() {
          try {
            const response = await fetch('/superagent-lite/tasks', {
              method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            })
            if (!response.ok) throw new Error('Task list unavailable')
            const value = await response.json()
            if (!Array.isArray(value?.tasks)) throw new Error('Invalid task list')
            if (controller.signal.aborted) return
            const rows = value.tasks.filter(task => typeof task?.id === 'string')
            setTasks(rows)
            setTeam(current => rows.some(task => task.teamId === current) ? current : '')
            setProject(current => rows.some(task => task.projectRoot === current) ? current : '')
            setPhase('ready')
          } catch {
            if (!controller.signal.aborted) {
              setTasks([])
              setPhase('error')
            }
          }
        }
        void load()
        return () => controller.abort()
      }, [revision])

      const optionsFor = (key) => [...new Set(tasks.map(task => task[key]).filter(value => typeof value === 'string' && value))]
        .sort((a, b) => a.localeCompare(b))
      const shown = tasks.filter(task => (!team || task.teamId === team) && (!project || task.projectRoot === project))
      const refresh = () => {
        active.current?.abort()
        setPhase('loading')
        setOpenFailed(false)
        setGitError('')
        setRevision(value => value + 1)
      }
      const filter = (label, empty, key, value, set) => h('label', null, t(label),
        h('select', { value, onChange: event => set(event.target.value) },
          h('option', { value: '' }, t(empty)),
          ...optionsFor(key).map(option => h('option', { key: option, value: option }, option))))
      const session = (label, sessionId, target = sessionId) => {
        if (!sessionId) return null
        const text = `${t(label)}: ${sessionId}`
        if (!openSession) return h('span', null, text)
        return h('button', { type: 'button', onClick: () => {
          try {
            setOpenFailed(false)
            openSession(target)
          } catch {
            setOpenFailed(true)
          }
        } }, text)
      }
      const gitAction = async (taskId, action) => {
        setGitPending(`${taskId}:${action}`)
        setGitError('')
        try {
          const response = await fetch('/superagent-lite/git', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ taskId, action }),
          })
          let value
          try {
            value = await response.json()
          } catch {
            value = undefined
          }
          if (!response.ok) throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('gitFailed'))
          refresh()
        } catch (error) {
          setGitError(typeof error?.message === 'string' && error.message ? error.message : t('gitFailed'))
        } finally {
          setGitPending('')
        }
      }
      const branches = shown.filter(task => task.git && typeof task.git.branch === 'string')
      const prState = value => {
        const key = `pr.${String(value).toLowerCase()}`
        return Object.hasOwn(dictionaries.en, key) ? t(key) : String(value)
      }
      const branchRow = task => {
        const git = task.git
        const status = `status.${task.status}`
        const pending = gitPending.startsWith(`${task.id}:`)
        const pr = pullRequestHref(task.prUrl)
        return h('li', { key: `git-${task.id}`, className: 'sl-board__task' },
          h('h3', null, task.title || task.id),
          h('p', { className: 'sl-board__meta' }, h('code', null, task.id), ' · ', h('code', null, git.branch)),
          h('p', null, t(Object.hasOwn(dictionaries.en, status) ? status : 'status.unknown'),
            ' · ', git.unmerged ? t('unmergedChanges') : t('noUnmergedChanges'),
            ' · ', git.reviewed ? t('reviewApproved') : git.approved ? t('reviewStale') : t('reviewNotApproved')),
          h('p', { className: 'sl-board__meta' }, `${t('baseBranch')}: ${git.baseBranch}`,
            git.repository ? ` · ${t('repository')}: ${git.repository}` : ''),
          git.pr?.state && h('p', { className: 'sl-board__meta' }, `${t('pullRequestState')}: ${prState(git.pr.state)}`),
          h('div', { className: 'sl-board__actions' },
            h('button', { type: 'button', disabled: pending || !git.canMerge, title: git.mergeReason,
              onClick: () => void gitAction(task.id, 'merge') }, `${t('mergeInto')} ${git.baseBranch}`),
            h('button', { type: 'button', disabled: pending || !git.canPublish, title: git.publishReason,
              onClick: () => void gitAction(task.id, 'publish') }, t('publishPullRequest')),
            pending && h('span', { className: 'sl-board__meta' }, t('gitWorking')),
            pr && h('a', { href: pr, target: '_blank', rel: 'noopener noreferrer' }, t('pr'))))
      }

      return h('section', { className: 'sl-board', 'aria-labelledby': headingId },
        h('style', null, styles),
        h('div', { className: 'sl-board__body' },
          h('header', { className: 'sl-board__header' },
            h('h1', { id: headingId }, t('title')),
            h('button', { type: 'button', onClick: refresh, disabled: phase === 'loading' }, t('refresh'))),
          phase === 'loading' && h('p', { role: 'status' }, t('loading')),
          phase === 'error' && h('p', { role: 'alert', className: 'sl-board__error' }, t('loadFailed')),
          openFailed && h('p', { role: 'alert', className: 'sl-board__error' }, t('openFailed')),
          tasks.length > 0 && h('div', { className: 'sl-board__filters' },
            filter('team', 'allTeams', 'teamId', team, setTeam),
            filter('project', 'allProjects', 'projectRoot', project, setProject)),
          phase === 'ready' && shown.length === 0 && h('p', { role: 'status' }, t(tasks.length ? 'noMatch' : 'empty')),
          shown.length > 0 && h('ul', { className: 'sl-board__list' }, ...shown.map(task => {
            const status = `status.${task.status}`
            const pr = pullRequestHref(task.prUrl)
            const updated = displayTime(task.updatedAt)
            const address = task.parentSessionId && task.workerSessionId ? {
              parentSessionId: task.parentSessionId, childSessionId: task.workerSessionId, mode: 'unknown',
            } : task.workerSessionId
            return h('li', { key: task.id, className: 'sl-board__task' },
              h('h2', null, task.title || task.id),
               h('code', { className: 'sl-board__meta' }, task.id),
              h('p', null, t(Object.hasOwn(dictionaries.en, status) ? status : 'status.unknown')),
              h('p', { className: 'sl-board__meta' }, `${t('team')}: ${task.teamId} · ${t('project')}: ${task.projectRoot}`),
              updated && h('p', { className: 'sl-board__meta' }, `${t('updated')}: `, updated),
              h('div', { className: 'sl-board__actions' },
                session('router', task.parentSessionId), session('worker', task.workerSessionId, address),
                pr && h('a', { href: pr, target: '_blank', rel: 'noopener noreferrer' }, t('pr'))))
          })),
          phase === 'ready' && h('section', { className: 'sl-board__git', 'aria-labelledby': gitHeadingId },
            h('h2', { id: gitHeadingId }, t('gitTitle')),
            gitError && h('p', { role: 'alert', className: 'sl-board__error' }, gitError),
            branches.length === 0
              ? h('p', { role: 'status', className: 'sl-board__meta' }, t('gitEmpty'))
              : h('ul', { className: 'sl-board__list' }, ...branches.map(branchRow)))))
    }

    function PanelIcon({ size }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }, h('rect', { x: 3.5, y: 5, width: 17, height: 14, rx: 2 }),
      h('path', { d: 'M9 5v14m4-10h4m-4 5h4' }))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(id, dictionaries), `${id}: panel dictionaries`)
        const t = ctx.locale.bind(id)
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: id, locale: id,
          inject: () => {
            const workspace = ctx.get('uiWorkspace')
            return { openSession: workspace?.openSession ? target => workspace.openSession(target) : undefined }
          },
        }, Panel))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id, order: 20, locale: id, label: () => t('title'),
        }, PanelIcon))
      },
    }
  },
})
