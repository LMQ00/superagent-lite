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
    // Page, list rows and controls use only `--dsw-alias-*` theme tokens, matching the DSH panel in the prototype.
    const styles = `
      .sl-board{box-sizing:border-box;height:100%;overflow:auto;container-type:inline-size;padding:0 clamp(24px,4vw,48px) 48px;padding-inline-start:max(clamp(24px,4vw,48px),var(--dsh-frame-leading-clearance,0px));color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
      .sl-column{display:flex;flex-direction:column;gap:24px;max-width:960px;margin:0 auto;padding-top:28px}
      html[data-platform='darwin'] .sl-column{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
      .sl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px 16px;flex-wrap:wrap}
      .sl-head h1{margin:0;font-size:20px;line-height:28px;font-weight:500;overflow-wrap:anywhere}
      .sl-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .sl-filters{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
      .sl-field{display:flex;flex-direction:column;gap:6px;min-width:0}
      .sl-field span{font-size:12px;line-height:18px;color:var(--dsw-alias-label-caption)}
      .sl-select{box-sizing:border-box;height:32px;min-width:140px;max-width:100%;padding:0 28px 0 8px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;text-overflow:ellipsis}
      .sl-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .sl-hint{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
      .sl-error{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
      .sl-banner{margin:0;padding:8px 12px;border-radius:10px;font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);overflow-wrap:anywhere}
      .sl-list{list-style:none;margin:0 -8px;padding:0;display:flex;flex-direction:column}
      .sl-row{position:relative;display:grid;grid-template-columns:132px minmax(0,1fr);grid-template-areas:"stage title" "stage meta" "stage actions";column-gap:12px;row-gap:4px;align-items:start;padding:12px 8px 12px 18px;border-bottom:0.5px solid var(--dsw-alias-border-l3);border-radius:12px;min-width:0}
      .sl-row:last-child{border-bottom:0}
      .sl-row__stage{grid-area:stage;align-self:stretch;min-width:0;padding-top:1px;border-right:0.5px solid var(--dsw-alias-border-l3)}
      .sl-row__title{grid-area:title;min-width:0;font-size:14px;line-height:20px;font-weight:500;overflow-wrap:anywhere}
      .sl-row__meta{grid-area:meta;display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-caption)}
      .sl-row__actions{grid-area:actions;display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-height:28px;margin-top:2px;min-width:0}
      .sl-stage{display:inline-flex;align-items:flex-start;gap:5px;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
      .sl-stage svg{flex:none;margin-top:2px}
      .sl-stage[data-state='ongoing']{color:var(--dsw-alias-state-business-primary)}
      .sl-stage[data-state='warning']{color:var(--dsw-alias-state-warn-primary)}
      .sl-stage[data-state='error']{color:var(--dsw-alias-state-error-primary)}
      .sl-dot{position:relative;display:inline-block;flex:none;width:10px;height:10px;margin-top:4px;color:var(--dsw-alias-state-idle-primary)}
      .sl-dot::after{content:'';position:absolute;inset:20%;border-radius:50%;background:currentColor}
      .sl-dot[data-state='done']{color:var(--dsw-alias-state-success-primary)}
      .sl-dot[data-state='warning']{color:var(--dsw-alias-state-warn-primary)}
      .sl-dot[data-state='error']{color:var(--dsw-alias-state-error-primary)}
      .sl-dot[data-state='ongoing']{color:var(--dsw-alias-state-business-primary)}
      .sl-spinner{flex:none;margin-top:2px;color:var(--dsw-alias-label-tertiary)}
      .sl-spinner g{transform-origin:center;animation:sl-spin 1.5s linear infinite}
      .sl-spinner circle{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
      .sl-spinner circle:first-child{opacity:.25}
      .sl-spinner circle:last-child{stroke-dasharray:18 150}
      @keyframes sl-spin{to{transform:rotate(360deg)}}
      .sl-chip{display:inline-flex;flex-wrap:wrap;max-width:100%;border:0.5px solid var(--dsw-alias-border-l3);border-radius:6px;overflow:hidden;font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary)}
      .sl-chip__label{padding:0 6px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform);white-space:nowrap}
      .sl-chip__value{box-sizing:border-box;min-width:0;max-width:min(420px,100%);padding:0 6px;border-left:0.5px solid var(--dsw-alias-border-l3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
      code.sl-chip__value{font-family:var(--ds-font-family-code,Menlo,monospace)}
      .sl-lv{display:inline-flex;align-items:baseline;gap:6px;min-width:0;font-size:12px;line-height:18px}
      .sl-lv__label{color:var(--dsw-alias-label-caption)}
      .sl-lv__value{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
      .sl-code{font-family:var(--ds-font-family-code,Menlo,monospace);font-size:11px;line-height:18px;color:var(--dsw-alias-label-caption);overflow-wrap:anywhere}
      .sl-tag{display:inline-flex;align-items:center;border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .sl-tag[data-tone='neutral']{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
      .sl-tag[data-tone='success']{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent);color:var(--dsw-alias-state-success-primary)}
      .sl-tag[data-tone='info']{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary)}
      .sl-tag[data-tone='warning']{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-primary)}
      .sl-tag[data-tone='danger']{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
      .sl-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;max-width:100%;padding:0 10px;border:0;border-radius:14px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;text-decoration:none;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
      .sl-btn:disabled{cursor:not-allowed;opacity:.4}
      .sl-btn:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
      .sl-btn--outline{border:0.5px solid var(--dsw-alias-border-l3)}
      .sl-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .sl-btn svg{flex:none}
      .sl-session{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
      .sl-section{display:flex;flex-direction:column;gap:8px;min-width:0}
      .sl-section__title{display:flex;align-items:baseline;gap:8px;margin:0;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary)}
      .sl-section__count{font-size:14px;line-height:20px;font-weight:400;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}
      @container (max-width:640px){
        .sl-row{grid-template-columns:minmax(0,1fr);grid-template-areas:"stage" "title" "meta" "actions";row-gap:6px}
        .sl-row__stage{border-right:0;padding-top:0}
        .sl-head h1{font-size:17px;line-height:24px}
        .sl-column{padding-top:20px}
        html[data-platform='darwin'] .sl-column{padding-top:calc(20px + var(--dsh-frame-top-clearance,0px))}
        .sl-select{min-width:0;width:100%}
        .sl-field{flex:1 1 160px}
      }
      @media (prefers-reduced-motion:reduce){
        .sl-spinner g{animation:none}
      }
    `

    const ICON_PATHS = {
      refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
      session: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
      external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    }

    function icon(name) {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }, h('path', { d: ICON_PATHS[name] }))
    }

    const ONGOING = new Set(['starting', 'running', 'resuming', 'merging', 'publishing'])
    const DONE = new Set(['ready', 'completed', 'merged'])
    const WARNING = new Set(['review-required', 'awaiting-merge'])
    const ERROR = new Set(['failed', 'merge-conflict', 'delivery-blocked'])

    function statusTone(status) {
      if (ERROR.has(status)) return 'error'
      if (WARNING.has(status)) return 'warning'
      if (ONGOING.has(status)) return 'ongoing'
      if (DONE.has(status)) return 'done'
      return 'idle'
    }

    function spinner() {
      return h('svg', {
        className: 'sl-spinner', width: 14, height: 14, viewBox: '0 0 24 24', 'aria-hidden': true,
      }, h('g', null, h('circle', { cx: 12, cy: 12, r: 9.5 }), h('circle', { cx: 12, cy: 12, r: 9.5 })))
    }

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
      const text = date.toLocaleString()
      return h('time', { dateTime: date.toISOString(), title: text }, text)
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
      const filter = (label, empty, key, value, set) => h('label', { className: 'sl-field' },
        h('span', null, t(label)),
        h('select', { className: 'sl-select', value, onChange: event => set(event.target.value) },
          h('option', { value: '' }, t(empty)),
          ...optionsFor(key).map(option => h('option', { key: option, value: option }, option))))
      const statusLabel = status => t(Object.hasOwn(dictionaries.en, `status.${status}`) ? `status.${status}` : 'status.unknown')
      const statusMark = status => {
        const tone = statusTone(status)
        return h('span', { className: 'sl-stage', 'data-state': tone },
          tone === 'ongoing' ? spinner() : h('span', { className: 'sl-dot', 'data-state': tone, 'aria-hidden': true }),
          h('span', null, statusLabel(status)))
      }
      const statusCell = status => h('div', { className: 'sl-row__stage' }, statusMark(status))
      const chip = (label, value) => h('span', { className: 'sl-chip' },
        h('span', { className: 'sl-chip__label' }, t(label)),
        h('span', { className: 'sl-chip__value', title: value }, value))
      const codeChip = (label, value) => h('span', { className: 'sl-chip' },
        h('span', { className: 'sl-chip__label' }, t(label)),
        h('code', { className: 'sl-chip__value', title: value }, value))
      const externalLink = (href, label) => h('a', {
        className: 'sl-btn sl-btn--outline', href, target: '_blank', rel: 'noopener noreferrer',
      }, icon('external'), label)
      const session = (label, sessionId, target = sessionId) => {
        if (!sessionId) return null
        const text = `${t(label)}: ${sessionId}`
        if (!openSession) return h('span', { className: 'sl-session' }, text)
        return h('button', {
          type: 'button', className: 'sl-btn sl-btn--outline',
          onClick: () => {
            try {
              setOpenFailed(false)
              openSession(target)
            } catch {
              setOpenFailed(true)
            }
          },
        }, icon('session'), text)
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
      const taskRow = task => {
        const pr = pullRequestHref(task.prUrl)
        const updated = displayTime(task.updatedAt)
        const address = task.parentSessionId && task.workerSessionId ? {
          parentSessionId: task.parentSessionId, childSessionId: task.workerSessionId, mode: 'unknown',
        } : task.workerSessionId
        return h('li', { key: task.id, className: 'sl-row' },
          h('div', { className: 'sl-row__title' }, task.title || task.id),
          h('div', { className: 'sl-row__meta' },
            chip('team', task.teamId),
            chip('project', task.projectRoot),
            updated && h('span', { className: 'sl-lv' },
              h('span', { className: 'sl-lv__label' }, t('updated')),
              h('span', { className: 'sl-lv__value' }, updated)),
            h('code', { className: 'sl-code', title: task.id }, task.id)),
          statusCell(task.status),
          h('div', { className: 'sl-row__actions' },
            session('router', task.parentSessionId),
            session('worker', task.workerSessionId, address),
            pr && externalLink(pr, t('pr'))))
      }
      const branchRow = task => {
        const git = task.git
        const pending = gitPending.startsWith(`${task.id}:`)
        const pr = pullRequestHref(task.prUrl) ?? pullRequestHref(git.pr?.url)
        const reviewTone = git.reviewed ? 'success' : git.approved ? 'warning' : 'neutral'
        const reviewText = git.reviewed ? t('reviewApproved') : git.approved ? t('reviewStale') : t('reviewNotApproved')
        const prStateText = git.pr?.state ? prState(git.pr.state) : undefined
        const prTone = git.pr?.state === 'MERGED' ? 'success' : git.pr?.state === 'CLOSED' ? 'danger' : git.pr?.state ? 'info' : 'neutral'
        return h('li', { key: `git-${task.id}`, className: 'sl-row' },
          h('div', { className: 'sl-row__title' }, task.title || task.id),
          h('div', { className: 'sl-row__meta' },
            codeChip('branch', git.branch),
            chip('baseBranch', git.baseBranch),
            git.repository && chip('repository', git.repository),
            h('span', { className: 'sl-tag', 'data-tone': reviewTone }, reviewText),
            h('span', { className: 'sl-tag', 'data-tone': git.unmerged ? 'warning' : 'neutral' },
              git.unmerged ? t('unmergedChanges') : t('noUnmergedChanges')),
            prStateText && h('span', { className: 'sl-tag', 'data-tone': prTone },
              `${t('pullRequestState')}: ${prStateText}`)),
          statusCell(task.status),
          h('div', { className: 'sl-row__actions' },
            h('button', {
              type: 'button', className: 'sl-btn sl-btn--outline',
              disabled: pending || !git.canMerge, title: git.mergeReason,
              onClick: () => void gitAction(task.id, 'merge'),
            }, `${t('mergeInto')} ${git.baseBranch}`),
            h('button', {
              type: 'button', className: 'sl-btn sl-btn--outline',
              disabled: pending || !git.canPublish, title: git.publishReason,
              onClick: () => void gitAction(task.id, 'publish'),
            }, t('publishPullRequest')),
            pending && h('span', { className: 'sl-hint' }, t('gitWorking')),
            pr && externalLink(pr, t('pr'))))
      }

      return h('section', { className: 'sl-board', 'aria-labelledby': headingId },
        h('style', null, styles),
        h('div', { className: 'sl-column' },
          h('header', { className: 'sl-head' },
            h('h1', { id: headingId }, t('title')),
            h('div', { className: 'sl-toolbar' },
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline',
                onClick: refresh, disabled: phase === 'loading',
              }, icon('refresh'), t('refresh')))),
          tasks.length > 0 && h('div', { className: 'sl-filters' },
            filter('team', 'allTeams', 'teamId', team, setTeam),
            filter('project', 'allProjects', 'projectRoot', project, setProject)),
          phase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
          phase === 'error' && h('p', { className: 'sl-error', role: 'alert' }, t('loadFailed')),
          openFailed && h('p', { className: 'sl-error', role: 'alert' }, t('openFailed')),
          phase === 'ready' && shown.length === 0 && h('p', { className: 'sl-hint', role: 'status' }, t(tasks.length ? 'noMatch' : 'empty')),
          shown.length > 0 && h('ul', { className: 'sl-list' }, ...shown.map(taskRow)),
          phase === 'ready' && h('section', { className: 'sl-section', 'aria-labelledby': gitHeadingId },
            h('h2', { className: 'sl-section__title', id: gitHeadingId },
              h('span', null, t('gitTitle')),
              branches.length > 0 && h('span', { className: 'sl-section__count' }, String(branches.length))),
            gitError && h('p', { className: 'sl-banner', role: 'alert' }, gitError),
            branches.length === 0
              ? h('p', { className: 'sl-hint', role: 'status' }, t('gitEmpty'))
              : h('ul', { className: 'sl-list' }, ...branches.map(branchRow)))))
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
