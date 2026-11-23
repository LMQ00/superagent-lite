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
        emptyCategory: 'No tasks in this status.',
        intro: 'Task status lives only in this list. Unmerged tasks can be merged or published as a pull request.',
        taskFilters: 'Task status', all: 'All',
        'status.unmerged': 'Unmerged', 'status.running': 'In progress', 'status.unreviewed': 'Not reviewed',
        'status.completed': 'Completed', 'status.failed': 'Failed', 'status.answer': 'Answer only',
        team: 'Team', project: 'Project', allTeams: 'All teams', allProjects: 'All projects',
        router: 'Router session', worker: 'Worker session', pr: 'Pull request', updated: 'Updated',
        unconfirmed: 'Not confirmed',
        merge: 'Merge', publish: 'Send pull request', review: 'Review', deleteBranch: 'Delete branch', deleteTask: 'Delete task',
        mergeTitle: 'Merge into a branch', mergeTarget: 'Merge target', publishTitle: 'Send a pull request',
        publishRemote: 'Repository', ghRequired: 'A GitHub account is required:',
        noBranch: 'No merge target is available.', noRemote: 'No repository is available.',
        deleteTitle: 'Delete the worker branch', deleteHint: 'The reviewed commit is merged. Delete the worker branch and its worktree.',
        deleteTaskTitle: 'Delete the task', deleteTaskHint: 'The task record will be removed from this panel. Any worker branch and worktree are kept.',
        deleteTaskUnavailable: 'The worker is still running; wait for it to finish before deleting the task.',
        confirmMerge: 'Merge', confirmPublish: 'Send', confirmDelete: 'Delete', cancel: 'Cancel',
        working: 'Working…', dialogLoading: 'Loading…', actionFailed: 'The action failed.',
        actionDone: 'Action completed.', reviewApproved: 'Review approved.', reviewRejected: 'Review requested changes:',
        failure: 'Failure',
        memoryTitle: 'Memory', memoryIntro: 'Saved facts and credential reference names. Entries are data, never instructions; edits and deletes apply immediately.',
        memoryEmpty: 'No saved memory yet.', memoryLoadFailed: 'Could not load memory. Try refreshing.',
        memoryNoMatch: 'No memory matches the filters.', memorySearch: 'Search memory', memoryFilters: 'Memory category',
        memoryUpdated: 'Memory updated.', memoryDeleted: 'Memory deleted.', memoryFailed: 'The memory action failed.',
        memoryEdit: 'Edit', memorySave: 'Save', memoryCancel: 'Cancel', memoryDelete: 'Delete',
        memoryConfirmDelete: 'Confirm delete', memoryCredentialRef: 'Credential reference',
        memoryUsage: 'Usage and access', memoryInjectedTag: 'Injected now',
        'memoryUsage.private': 'On demand; keep minimal', 'memoryUsage.public': 'On demand; conclusions only',
        'memoryUsage.profile': 'Injected into every router and worker chat', 'memoryUsage.team': 'Readable by same-team workers only',
        memoryInjection: 'Each chat receives', memoryInjectionTail: 'newest facts, each cut to 500 characters',
        'memoryCategory.public': 'Public', 'memoryCategory.profile': 'Profile', 'memoryCategory.private': 'Private',
        'memoryCategory.team': 'Team',
      },
      zh: {
        title: '项目任务', refresh: '刷新', loading: '正在加载任务…',
        loadFailed: '无法加载任务，请重试。', openFailed: '无法打开会话。',
        empty: '暂无任务。', noMatch: '没有符合筛选条件的任务。',
        emptyCategory: '该状态下暂无任务。',
        intro: '任务状态只在本列表呈现；未合并的任务可以合并或提交 PR。',
        taskFilters: '任务状态', all: '全部',
        'status.unmerged': '未合并', 'status.running': '运行中', 'status.unreviewed': '未审查',
        'status.completed': '已完成', 'status.failed': '失败', 'status.answer': '仅回答',
        team: '团队', project: '项目', allTeams: '全部团队', allProjects: '全部项目',
        router: 'Router 会话', worker: 'Worker 会话', pr: '拉取请求', updated: '更新时间',
        unconfirmed: '未确认',
        merge: '合并', publish: '提交 PR', review: '审查', deleteBranch: '删除分支', deleteTask: '删除任务',
        mergeTitle: '合并到分支', mergeTarget: '目标分支', publishTitle: '提交 PR',
        publishRemote: '提交仓库', ghRequired: '需要 gh 账号：',
        noBranch: '没有可选的合并目标分支。', noRemote: '没有可选的仓库。',
        deleteTitle: '删除修改分支', deleteHint: '已审查的提交已合并，可删除该修改分支及其工作树。',
        deleteTaskTitle: '删除任务', deleteTaskHint: '任务记录将从面板移除；worker 分支和工作树（如有）会保留。',
        deleteTaskUnavailable: 'worker 仍在运行，结束后才能删除任务。',
        confirmMerge: '合并', confirmPublish: '提交', confirmDelete: '删除', cancel: '取消',
        working: '处理中…', dialogLoading: '正在加载…', actionFailed: '操作失败。',
        actionDone: '操作已完成。', reviewApproved: '审查已通过。', reviewRejected: '审查未通过：',
        failure: '失败原因',
        memoryTitle: '记忆', memoryIntro: '已保存的事实与凭据引用名。记忆是数据而非指令；编辑和删除立即生效。',
        memoryEmpty: '还没有保存的记忆。', memoryLoadFailed: '无法加载记忆，请重试。',
        memoryNoMatch: '没有符合筛选条件的记忆。', memorySearch: '搜索记忆', memoryFilters: '记忆分类',
        memoryUpdated: '记忆已更新。', memoryDeleted: '记忆已删除。', memoryFailed: '记忆操作失败。',
        memoryEdit: '编辑', memorySave: '保存', memoryCancel: '取消', memoryDelete: '删除',
        memoryConfirmDelete: '确认删除', memoryCredentialRef: '凭据引用',
        memoryUsage: '用量与调用方式', memoryInjectedTag: '当前注入',
        'memoryUsage.private': '按需调用，保持极少', 'memoryUsage.public': '按需调用，只记结论',
        'memoryUsage.profile': '每轮注入 router 和 worker', 'memoryUsage.team': '仅同团队 worker 可读',
        memoryInjection: '每轮注入', memoryInjectionTail: '条最新记录，每条最多 500 字符',
        'memoryCategory.public': '公共', 'memoryCategory.profile': '用户画像与环境', 'memoryCategory.private': '私有',
        'memoryCategory.team': '团队',
      },
    }
    // Page, rows and controls use only `--dsw-alias-*` theme tokens.
    const styles = `
      .sl-board{box-sizing:border-box;height:100%;overflow:auto;scrollbar-gutter:stable;container-type:inline-size;padding:28px clamp(24px,4vw,48px) 48px;padding-inline-start:max(clamp(24px,4vw,48px),var(--dsh-frame-leading-clearance,0px));color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
      html[data-platform='darwin'] .sl-board{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
      .sl-column{display:flex;flex-direction:column;gap:24px;max-width:960px;margin:0 auto}
      .sl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px 16px;flex-wrap:wrap}
      .sl-head__text{display:flex;flex-direction:column;gap:4px;min-width:0}
      .sl-head h1{margin:0;font-size:20px;line-height:28px;font-weight:500;overflow-wrap:anywhere}
      .sl-intro{margin:0;max-width:640px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
      .sl-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .sl-filters{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap}
      .sl-filter-group{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px}
      .sl-filter{display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;height:28px;padding:0 10px;border:0;border-radius:14px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:13px;line-height:20px;white-space:nowrap;cursor:pointer}
      .sl-filter:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
      .sl-filter[aria-pressed='true']{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:500}
      .sl-filter:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .sl-filter__count{color:var(--dsw-alias-label-caption);font-size:12px;font-variant-numeric:tabular-nums;font-weight:400}
      .sl-filter[aria-pressed='true'] .sl-filter__count{color:var(--dsw-alias-label-secondary)}
      .sl-scope{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-inline-start:auto}
      .sl-field{display:inline-flex;align-items:center;gap:6px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
      .sl-field span{white-space:nowrap}
      .sl-select{box-sizing:border-box;height:28px;min-width:128px;max-width:100%;padding:0 26px 0 8px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;text-overflow:ellipsis}
      .sl-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .sl-hint{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
      .sl-error{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
      .sl-notice{margin:0;padding:8px 12px;border-radius:10px;font-size:13px;line-height:20px;color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent);overflow-wrap:anywhere}
      .sl-groups{display:flex;flex-direction:column;gap:24px;min-width:0}
      .sl-group{display:flex;flex-direction:column;gap:8px;min-width:0}
      .sl-group__title{display:flex;align-items:baseline;gap:8px;margin:0;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary)}
      .sl-group__count{font-size:13px;line-height:20px;font-weight:400;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}
      .sl-list{list-style:none;margin:0 -8px;padding:0;display:flex;flex-direction:column;gap:2px}
      .sl-task{position:relative;display:grid;grid-template-columns:112px minmax(0,1fr);column-gap:12px;align-items:start;box-sizing:border-box;min-width:0;padding:12px 8px 12px 18px;border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-task:last-child{border-bottom:0}
      .sl-task__stage{align-self:stretch;min-width:0;padding-top:1px;border-right:0.5px solid var(--dsw-alias-border-l3)}
      .sl-task__body{display:flex;flex-direction:column;gap:4px;min-width:0}
      .sl-task__title{min-width:0;font-size:14px;line-height:20px;font-weight:500;overflow-wrap:anywhere}
      .sl-task__meta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-caption);overflow-wrap:anywhere}
      .sl-task__failure{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
      .sl-task__actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-height:28px;margin-top:2px;min-width:0}
      .sl-stage{display:inline-flex;align-items:flex-start;gap:5px;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
      .sl-stage svg{flex:none;margin-top:2px}
      .sl-stage[data-state='warning']{color:var(--dsw-alias-state-warn-primary)}
      .sl-stage[data-state='error']{color:var(--dsw-alias-state-error-primary)}
      .sl-stage[data-state='ongoing']{color:var(--dsw-alias-state-business-primary)}
      .sl-stage[data-state='done']{color:var(--dsw-alias-state-success-primary)}
      .sl-dot{position:relative;display:inline-block;flex:none;width:10px;height:10px;margin-top:4px;color:var(--dsw-alias-state-idle-primary)}
      .sl-dot::after{content:'';position:absolute;inset:20%;border-radius:50%;background:currentColor}
      .sl-dot[data-state='done']{color:var(--dsw-alias-state-success-primary)}
      .sl-dot[data-state='warning']{color:var(--dsw-alias-state-warn-primary)}
      .sl-dot[data-state='error']{color:var(--dsw-alias-state-error-primary)}
      .sl-dot[data-state='ongoing']{color:var(--dsw-alias-state-business-primary)}
      .sl-spinner{animation:sl-spin 1s linear infinite;color:var(--dsw-alias-state-business-primary)}
      .sl-spinner circle{fill:none;stroke:currentColor;stroke-width:2.5;stroke-dasharray:42 18;stroke-linecap:round}
      @keyframes sl-spin{to{transform:rotate(360deg)}}
      .sl-btn{display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;height:28px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer}
      .sl-btn:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
      .sl-btn:disabled{cursor:not-allowed;color:var(--dsw-alias-label-caption)}
      .sl-btn--outline{border:0.5px solid var(--dsw-alias-border-l4);color:var(--dsw-alias-label-secondary)}
      .sl-btn--primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
      .sl-btn--primary:not(:disabled):hover{background:var(--dsw-alias-brand-primary)}
      .sl-btn--danger{color:var(--dsw-alias-state-error-primary)}
      .sl-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .sl-tag{display:inline-flex;align-items:center;box-sizing:border-box;height:20px;padding:0 8px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
      .sl-tag[data-tone='warning']{color:var(--dsw-alias-state-warn-primary)}
      .sl-tag[data-tone='success']{color:var(--dsw-alias-state-success-primary)}
      .sl-chip{display:inline-flex;align-items:baseline;gap:4px;min-width:0}
      .sl-chip__label{color:var(--dsw-alias-label-caption)}
      .sl-chip__value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
      .sl-lv{display:inline-flex;align-items:baseline;gap:4px}
      .sl-lv__label{color:var(--dsw-alias-label-caption)}
      .sl-code{font-family:var(--dsw-font-mono,monospace);font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .sl-link{color:var(--dsw-alias-brand-primary);text-decoration:none}
      .sl-link:hover{text-decoration:underline}
      .sl-memory-section{display:flex;flex-direction:column;gap:8px;min-width:0;padding-top:8px}
      .sl-memory-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0}
      .sl-memory-head h2{margin:0;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary)}
      .sl-memory-count{font-size:13px;line-height:20px;font-weight:400;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}
      .sl-memory-usage{display:flex;align-items:center;flex-wrap:wrap;gap:4px 14px;min-width:0;padding:8px 0;border-top:0.5px solid var(--dsw-alias-border-l3);border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-memory-tools{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap}
      .sl-memory-filters{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px}
      .sl-input{box-sizing:border-box;height:28px;min-width:180px;max-width:100%;padding:0 8px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px}
      .sl-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .sl-memory{display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px 8px;border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-memory__head{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;min-width:0}
      .sl-memory__content{margin:0;font-size:13px;line-height:20px;overflow-wrap:anywhere;white-space:pre-wrap}
      .sl-memory__content[data-empty='true']{color:var(--dsw-alias-label-caption)}
      .sl-memory__actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-height:28px}
      .sl-textarea{box-sizing:border-box;display:block;width:100%;min-height:72px;padding:8px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;resize:vertical}
      .sl-textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .sl-modal-backdrop{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent)}
      .sl-modal{box-sizing:border-box;width:min(420px,100%);display:flex;flex-direction:column;gap:16px;padding:20px;border-radius:14px;background:var(--dsw-alias-bg-base);box-shadow:0 12px 40px color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent)}
      .sl-modal h2{margin:0;font-size:16px;line-height:24px;font-weight:500}
      .sl-modal p{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
      .sl-modal__field{display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
      .sl-modal__actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}
      @container (max-width:640px){
        .sl-task{grid-template-columns:minmax(0,1fr);row-gap:4px}
        .sl-task__stage{border-right:0;padding-top:0}
        .sl-head h1{font-size:17px;line-height:24px}
        .sl-board{padding-top:20px}
        html[data-platform='darwin'] .sl-board{padding-top:calc(20px + var(--dsh-frame-top-clearance,0px))}
        .sl-select{min-width:0;flex:1 1 140px}
        .sl-input{min-width:0;flex:1 1 180px}
        .sl-filters,.sl-scope,.sl-memory-tools{width:100%}
        .sl-scope{margin-inline-start:0}
      }
      @media (prefers-reduced-motion:reduce){
        .sl-spinner g{animation:none}
      }
    `

    const CATEGORY_ORDER = ['unmerged', 'running', 'unreviewed', 'completed', 'failed', 'answer']
    const MEMORY_CATEGORIES = ['private', 'public', 'profile', 'team']
    const TONE = {
      unmerged: 'warning', running: 'ongoing', unreviewed: 'warning',
      completed: 'done', failed: 'error', answer: 'done',
    }

    function statusTone(status) {
      return TONE[status] ?? 'idle'
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

    function pullRequestNumber(raw) {
      const href = pullRequestHref(raw)
      if (!href) return undefined
      const path = href.endsWith('/') ? href.slice(0, -1) : href
      const last = path.slice(path.lastIndexOf('/') + 1)
      return /^\d+$/.test(last) ? last : undefined
    }

    function icon(name, size = 14) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }, h('path', { d: {
        refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
        session: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
        external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
        trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
        review: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 8v4l3 2',
      }[name] }))
    }

    function Panel({ t, openSession }) {
      const [tasks, setTasks] = useState([])
      const [phase, setPhase] = useState('loading')
      const [revision, setRevision] = useState(0)
      const [team, setTeam] = useState('')
      const [project, setProject] = useState('')
      const [category, setCategory] = useState('')
      const [openFailed, setOpenFailed] = useState(false)
      const [pending, setPending] = useState('')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [dialog, setDialog] = useState(null)
      const [dialogData, setDialogData] = useState({ phase: 'loading' })
      const [dialogChoice, setDialogChoice] = useState('')
      const [dialogError, setDialogError] = useState('')
      const [memories, setMemories] = useState([])
      const [memoryInjection, setMemoryInjection] = useState(undefined)
      const [memoryPhase, setMemoryPhase] = useState('loading')
      const [memoryCategory, setMemoryCategory] = useState('')
      const [memorySearch, setMemorySearch] = useState('')
      const [memoryPending, setMemoryPending] = useState('')
      const [memoryError, setMemoryError] = useState('')
      const [memoryNotice, setMemoryNotice] = useState('')
      const [memoryEditing, setMemoryEditing] = useState('')
      const [memoryText, setMemoryText] = useState('')
      const [memoryConfirm, setMemoryConfirm] = useState('')
      const active = useRef(null)
      const headingId = useId()

      useEffect(() => {
        const controller = new AbortController()
        active.current = controller
        setPhase('loading')
        setMemoryPhase('loading')
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
        async function loadMemory() {
          try {
            const response = await fetch('/superagent-lite/memory', {
              method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            })
            if (!response.ok) throw new Error('Memory unavailable')
            const value = await response.json()
            if (!Array.isArray(value?.records)) throw new Error('Invalid memory list')
            if (controller.signal.aborted) return
            const records = value.records.filter(record => record?.id &&
              MEMORY_CATEGORIES.includes(record.category))
            setMemories(records)
            setMemoryInjection(value.injection?.profile && Array.isArray(value.injection.profile.recordIds)
              ? value.injection.profile : undefined)
            setMemoryPhase('ready')
          } catch {
            if (!controller.signal.aborted) {
              setMemories([])
              setMemoryInjection(undefined)
              setMemoryPhase('error')
            }
          }
        }
        void load()
        void loadMemory()
        return () => controller.abort()
      }, [revision])

      const optionsFor = key => [...new Set(tasks.map(task => task[key]).filter(value => typeof value === 'string' && value))]
        .sort((a, b) => a.localeCompare(b))
      const scoped = tasks.filter(task => (!team || task.teamId === team) && (!project || task.projectRoot === project))
      const categoryCounts = CATEGORY_ORDER.reduce((counts, key) => {
        counts[key] = scoped.filter(task => task.status === key).length
        return counts
      }, {})
      const shown = category ? scoped.filter(task => task.status === category) : scoped
      const groups = CATEGORY_ORDER
        .filter(key => !category || key === category)
        .map(key => ({ key, tasks: shown.filter(task => task.status === key) }))
        .filter(group => group.tasks.length > 0)

      const memoryKey = record => `${record.category}:${record.id}`
      const memoryValue = record => record.category === 'private'
        ? (record.credentialRef ?? '') : (record.content ?? '')
      const memoryCounts = MEMORY_CATEGORIES.reduce((counts, key) => {
        counts[key] = memories.filter(record => record.category === key).length
        return counts
      }, {})
      const injectedProfileIds = new Set(memoryInjection?.recordIds ?? [])
      const memoryTerm = memorySearch.trim().toLowerCase()
      const shownMemory = memories
        .filter(record => !memoryCategory || record.category === memoryCategory)
        .filter(record => !memoryTerm || [
          record.content, record.credentialRef, record.id, record.teamId, record.projectRoot,
          t(`memoryCategory.${record.category}`),
        ].some(value => typeof value === 'string' && value.toLowerCase().includes(memoryTerm)))

      const refresh = () => {
        active.current?.abort()
        setPhase('loading')
        setMemoryPhase('loading')
        setOpenFailed(false)
        setError('')
        setNotice('')
        setMemoryEditing('')
        setMemoryConfirm('')
        setMemoryPending('')
        setMemoryError('')
        setMemoryNotice('')
        setRevision(value => value + 1)
      }
      const filter = (label, empty, key, value, set) => h('label', { className: 'sl-field' },
        h('span', null, t(label)),
        h('select', { className: 'sl-select', value, onChange: event => set(event.target.value) },
          h('option', { value: '' }, t(empty)),
          ...optionsFor(key).map(option => h('option', { key: option, value: option }, option))))
      const beginMemoryEdit = record => {
        setMemoryEditing(memoryKey(record))
        setMemoryText(memoryValue(record))
        setMemoryConfirm('')
        setMemoryError('')
        setMemoryNotice('')
      }
      const cancelMemoryEdit = () => {
        setMemoryEditing('')
        setMemoryText('')
      }
      const memoryAction = async (record, action) => {
        const key = memoryKey(record)
        setMemoryPending(key)
        setMemoryError('')
        setMemoryNotice('')
        try {
          const body = { action, category: record.category, id: record.id }
          if (record.category === 'team') {
            body.teamId = record.teamId
            body.projectRoot = record.projectRoot
          }
          if (action === 'update') {
            body[record.category === 'private' ? 'credentialRef' : 'content'] = memoryText
          }
          const response = await fetch('/superagent-lite/memory', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          let value
          try {
            value = await response.json()
          } catch {
            value = undefined
          }
          if (!response.ok) throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('memoryFailed'))
          if (action === 'update') {
            const saved = value?.record
            if (!saved || typeof saved !== 'object') throw new Error(t('memoryFailed'))
            setMemories(current => current.map(item => memoryKey(item) === key ? { ...item, ...saved } : item))
            setMemoryNotice(t('memoryUpdated'))
          } else {
            setMemories(current => current.filter(item => memoryKey(item) !== key))
            setMemoryNotice(t('memoryDeleted'))
          }
          setMemoryEditing('')
          setMemoryText('')
          setMemoryConfirm('')
          if (record.category === 'profile') {
            const latest = await fetch('/superagent-lite/memory', {
              method: 'GET', credentials: 'same-origin', cache: 'no-store',
            })
            if (latest.ok) {
              const view = await latest.json()
              if (Array.isArray(view?.records)) {
                setMemories(view.records.filter(item => item?.id &&
                  MEMORY_CATEGORIES.includes(item.category)))
                setMemoryInjection(view.injection?.profile && Array.isArray(view.injection.profile.recordIds)
                  ? view.injection.profile : undefined)
              }
            }
          }
        } catch (error) {
          setMemoryError(typeof error?.message === 'string' && error.message ? error.message : t('memoryFailed'))
        } finally {
          setMemoryPending('')
        }
      }
      const statusLabel = status => t(Object.hasOwn(dictionaries.en, `status.${status}`) ? `status.${status}` : 'status.failed')
      const statusMark = status => {
        const tone = statusTone(status)
        return h('span', { className: 'sl-stage', 'data-state': tone },
          status === 'running' ? spinner() : h('span', { className: 'sl-dot', 'data-state': tone, 'aria-hidden': true }),
          h('span', null, statusLabel(status)))
      }
      const chip = (label, value) => h('span', { className: 'sl-chip' },
        h('span', { className: 'sl-chip__label' }, t(label)),
        h('span', { className: 'sl-chip__value', title: value }, value))
      const externalLink = (href, label) => h('a', {
        className: 'sl-btn sl-btn--outline', href, target: '_blank', rel: 'noopener noreferrer',
      }, icon('external'), label)
      const session = (label, sessionId, target = sessionId) => {
        if (!sessionId) return null
        const title = `${t(label)}: ${sessionId}`
        if (!openSession) return h('span', { className: 'sl-session', title }, t(label))
        return h('button', {
          type: 'button', className: 'sl-btn sl-btn--outline', title, 'aria-label': title,
          onClick: () => {
            try {
              setOpenFailed(false)
              openSession(target)
            } catch {
              setOpenFailed(true)
            }
          },
        }, icon('session'), t(label))
      }
      const post = async (taskId, action, extra = {}) => {
        const response = await fetch('/superagent-lite/git', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskId, action, ...extra }),
        })
        let value
        try {
          value = await response.json()
        } catch {
          value = undefined
        }
        if (!response.ok) throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('actionFailed'))
        return value
      }
      const removeTask = async taskId => {
        const response = await fetch(`/superagent-lite/tasks?taskId=${encodeURIComponent(taskId)}`, {
          method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
        })
        let value
        try {
          value = await response.json()
        } catch {
          value = undefined
        }
        if (!response.ok) throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('actionFailed'))
        return value
      }
      const reviewTask = async task => {
        setPending(`${task.id}:review`)
        setError('')
        setNotice('')
        try {
          const value = await post(task.id, 'review')
          refresh()
          setNotice(value?.approved ? t('reviewApproved') : `${t('reviewRejected')} ${value?.findings ?? ''}`)
        } catch (actionError) {
          setError(typeof actionError?.message === 'string' && actionError.message ? actionError.message : t('actionFailed'))
        } finally {
          setPending('')
        }
      }
      const openDialog = async (kind, task) => {
        setDialog({ kind, task })
        setDialogData({ phase: 'loading' })
        setDialogChoice('')
        setDialogError('')
        if (kind === 'delete-task') {
          setDialogData({ phase: 'ready' })
          return
        }
        try {
          const response = await fetch(`/superagent-lite/git?taskId=${encodeURIComponent(task.id)}`, {
            method: 'GET', credentials: 'same-origin', cache: 'no-store',
          })
          let value
          try {
            value = await response.json()
          } catch {
            value = undefined
          }
          if (!response.ok) throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('actionFailed'))
          const branches = (Array.isArray(value?.branches) ? value.branches : [])
            .filter(branch => typeof branch?.name === 'string' && branch.name !== task.git?.branch)
          const remotes = (Array.isArray(value?.remotes) ? value.remotes : [])
            .filter(remote => typeof remote?.name === 'string' && typeof remote.repository === 'string' && remote.repository)
          const canonical = branches.some(branch => branch.name === task.git?.baseBranch)
            ? task.git.baseBranch : (branches[0]?.name ?? '')
          setDialogData({ phase: 'ready', branches, remotes, gh: value?.gh })
          setDialogChoice(kind === 'publish' ? (remotes[0]?.name ?? '') : canonical)
        } catch (detailError) {
          setDialogData({ phase: 'error', error: typeof detailError?.message === 'string' ? detailError.message : t('actionFailed') })
        }
      }
      const confirmDialog = async () => {
        if (!dialog) return
        const { kind, task } = dialog
        const action = kind === 'merge' ? 'merge'
          : kind === 'publish' ? 'publish'
            : kind === 'delete-task' ? 'delete-task' : 'delete-branch'
        const extra = kind === 'merge' ? { target: dialogChoice } : kind === 'publish' ? { remote: dialogChoice } : {}
        setPending(`${task.id}:${action}`)
        setDialogError('')
        try {
          const value = action === 'delete-task'
            ? await removeTask(task.id)
            : await post(task.id, action, extra)
          setDialog(null)
          refresh()
          setNotice(typeof value?.message === 'string' && value.message ? value.message : t('actionDone'))
        } catch (actionError) {
          setDialogError(typeof actionError?.message === 'string' && actionError.message ? actionError.message : t('actionFailed'))
        } finally {
          setPending('')
        }
      }
      const taskRow = task => {
        const pr = pullRequestHref(task.prUrl)
        const updated = displayTime(task.updatedAt)
        const address = task.parentSessionId && task.workerSessionId ? {
          parentSessionId: task.parentSessionId, childSessionId: task.workerSessionId, mode: 'unknown',
        } : task.workerSessionId
        const git = task.git
        const busy = pending.startsWith(`${task.id}:`)
        const deletable = task.status !== 'running' || task.unconfirmed === true
        return h('li', { key: task.id, className: 'sl-task' },
          h('div', { className: 'sl-task__stage' }, statusMark(task.status)),
          h('div', { className: 'sl-task__body' },
            h('div', { className: 'sl-task__title' }, task.title || task.id),
            h('div', { className: 'sl-task__meta' },
              chip('team', task.teamId),
              chip('project', task.projectRoot),
              updated && h('span', { className: 'sl-lv' },
                h('span', { className: 'sl-lv__label' }, t('updated')),
                h('span', { className: 'sl-lv__value' }, updated)),
              task.unconfirmed && h('span', { className: 'sl-tag', 'data-tone': 'warning' }, t('unconfirmed')),
              h('code', { className: 'sl-code', title: task.id }, task.id)),
            task.failure && h('p', { className: 'sl-task__failure', title: task.failure }, `${t('failure')}: ${task.failure}`),
            h('div', { className: 'sl-task__actions' },
              session('router', task.parentSessionId),
              session('worker', task.workerSessionId, address),
              task.status === 'unmerged' && h('button', {
                type: 'button', className: git?.canMerge ? 'sl-btn sl-btn--primary' : 'sl-btn sl-btn--outline',
                disabled: busy || !git?.canMerge, title: git?.mergeReason,
                onClick: () => void openDialog('merge', task),
              }, t('merge')),
              task.status === 'unmerged' && h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline',
                disabled: busy || !git?.canPublish, title: git?.publishReason,
                onClick: () => void openDialog('publish', task),
              }, t('publish')),
              task.status === 'unreviewed' && h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline', disabled: busy || !git?.canReview,
                title: git?.reviewReason, onClick: () => void reviewTask(task),
              }, icon('review'), t('review')),
              task.status === 'completed' && git?.canDelete && h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger', disabled: busy,
                onClick: () => void openDialog('delete', task),
              }, icon('trash'), t('deleteBranch')),
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger',
                disabled: busy || !deletable, title: deletable ? undefined : t('deleteTaskUnavailable'),
                onClick: () => void openDialog('delete-task', task),
              }, icon('trash'), t('deleteTask')),
              pr && externalLink(pr, `${t('pr')} #${pullRequestNumber(pr) ?? ''}`.trim()),
              busy && h('span', { className: 'sl-hint' }, t('working')))))
      }
      const dialogView = () => {
        if (!dialog) return null
        const { kind, task } = dialog
        const title = kind === 'merge' ? t('mergeTitle')
          : kind === 'publish' ? t('publishTitle')
            : kind === 'delete-task' ? t('deleteTaskTitle') : t('deleteTitle')
        const confirm = kind === 'merge' ? t('confirmMerge')
          : kind === 'publish' ? t('confirmPublish') : t('confirmDelete')
        const busy = pending.startsWith(`${task.id}:`)
        let body
        if (dialogData.phase === 'loading') body = h('p', { role: 'status' }, t('dialogLoading'))
        else if (dialogData.phase === 'error') body = h('p', { role: 'alert', className: 'sl-error' }, dialogData.error)
        else if (kind === 'delete') body = h('p', null, `${t('deleteHint')} `, h('code', null, task.git?.branch ?? ''))
        else if (kind === 'delete-task') body = h('p', null, `${t('deleteTaskHint')} `, h('code', null, task.id))
        else if (kind === 'publish' && !dialogData.gh?.ok) {
          body = h('p', { role: 'alert', className: 'sl-error' },
            `${t('ghRequired')} ${dialogData.gh?.error ?? ''}`.trim())
        } else if (kind === 'merge' && dialogData.branches.length === 0) {
          body = h('p', { className: 'sl-hint' }, t('noBranch'))
        } else if (kind === 'publish' && dialogData.remotes.length === 0) {
          body = h('p', { className: 'sl-hint' }, t('noRemote'))
        } else {
          const options = kind === 'merge' ? dialogData.branches : dialogData.remotes
          body = h('label', { className: 'sl-modal__field' },
            h('span', null, kind === 'merge' ? t('mergeTarget') : t('publishRemote')),
            h('select', {
              className: 'sl-select', value: dialogChoice,
              onChange: event => setDialogChoice(event.target.value),
            }, ...options.map(option => h('option', { key: option.name, value: option.name },
              kind === 'merge' ? option.name : `${option.name} (${option.repository})`))))
        }
        return h('div', { className: 'sl-modal-backdrop' },
          h('div', { className: 'sl-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
            h('h2', null, title),
            body,
            dialogError && h('p', { role: 'alert', className: 'sl-error' }, dialogError),
            h('div', { className: 'sl-modal__actions' },
              h('button', { type: 'button', className: 'sl-btn sl-btn--outline', onClick: () => setDialog(null) }, t('cancel')),
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--primary',
                disabled: busy || dialogData.phase !== 'ready' ||
                  (kind === 'merge' && ((dialogData.branches?.length ?? 0) === 0 || !dialogChoice)) ||
                  (kind === 'publish' && (!dialogData.gh?.ok || (dialogData.remotes?.length ?? 0) === 0 || !dialogChoice)),
                onClick: () => void confirmDialog(),
              }, confirm))))
      }
      const memoryRow = record => {
        const key = memoryKey(record)
        const editing = memoryEditing === key
        const confirming = memoryConfirm === key
        const pending = memoryPending === key
        const updated = displayTime(record.updatedAt)
        const value = memoryValue(record)
        const fieldLabel = record.category === 'private' ? t('memoryCredentialRef') : t('memoryEdit')
        return h('li', { key, className: 'sl-memory' },
          h('div', { className: 'sl-memory__head' },
            h('span', { className: 'sl-tag', 'data-tone': 'neutral' }, t(`memoryCategory.${record.category}`)),
            record.category === 'profile' && injectedProfileIds.has(record.id) &&
              h('span', { className: 'sl-tag', 'data-tone': 'success' }, t('memoryInjectedTag')),
            h('code', { className: 'sl-code', title: record.id }, record.id),
            updated && h('span', { className: 'sl-lv' },
              h('span', { className: 'sl-lv__label' }, t('updated')),
              h('span', { className: 'sl-lv__value' }, updated)),
            record.category === 'team' && chip('team', record.teamId),
            record.category === 'team' && chip('project', record.projectRoot)),
          editing
            ? h('textarea', {
              className: 'sl-textarea', value: memoryText, 'aria-label': fieldLabel,
              maxLength: record.category === 'private' ? 128 : 16000,
              onChange: event => setMemoryText(event.target.value),
            })
            : h('p', { className: 'sl-memory__content', 'data-empty': value ? undefined : 'true' },
              record.category === 'private'
                ? `${t('memoryCredentialRef')}: ${value || '—'}`
                : (value || '—')),
          h('div', { className: 'sl-memory__actions' },
            ...(editing
              ? [
                h('button', {
                  key: 'save', type: 'button', className: 'sl-btn sl-btn--outline',
                  disabled: pending || !memoryText.trim(),
                  onClick: () => void memoryAction(record, 'update'),
                }, t('memorySave')),
                h('button', {
                  key: 'cancel', type: 'button', className: 'sl-btn',
                  disabled: pending, onClick: cancelMemoryEdit,
                }, t('memoryCancel')),
              ]
              : [
                h('button', {
                  key: 'edit', type: 'button', className: 'sl-btn sl-btn--outline',
                  disabled: pending || confirming, onClick: () => beginMemoryEdit(record),
                }, t('memoryEdit')),
                confirming
                  ? h('button', {
                    key: 'confirm', type: 'button', className: 'sl-btn sl-btn--outline',
                    disabled: pending, onClick: () => void memoryAction(record, 'delete'),
                  }, t('memoryConfirmDelete'))
                  : h('button', {
                    key: 'delete', type: 'button', className: 'sl-btn',
                    disabled: pending || editing,
                    onClick: () => {
                      setMemoryConfirm(key)
                      setMemoryEditing('')
                      setMemoryError('')
                      setMemoryNotice('')
                    },
                  }, t('memoryDelete')),
                confirming && h('button', {
                  key: 'cancel-delete', type: 'button', className: 'sl-btn',
                  disabled: pending, onClick: () => setMemoryConfirm(''),
                }, t('memoryCancel')),
              ]),
            pending && h('span', { key: 'pending', className: 'sl-hint' }, t('working'))))
      }

      return h('section', { className: 'sl-board', 'aria-labelledby': headingId },
        h('style', null, styles),
        h('div', { className: 'sl-column' },
          h('header', { className: 'sl-head' },
            h('div', { className: 'sl-head__text' },
              h('h1', { id: headingId }, t('title')),
              h('p', { className: 'sl-intro' }, t('intro'))),
            h('div', { className: 'sl-toolbar' },
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline',
                onClick: refresh, disabled: phase === 'loading',
              }, icon('refresh'), t('refresh')))),
          tasks.length > 0 && h('div', { className: 'sl-filters' },
            h('div', { className: 'sl-filter-group', role: 'group', 'aria-label': t('taskFilters') },
              h('button', {
                type: 'button', className: 'sl-filter', 'aria-pressed': category === '',
                onClick: () => setCategory(''),
              }, t('all'), h('span', { className: 'sl-filter__count' }, String(scoped.length))),
              ...CATEGORY_ORDER.map(key => h('button', {
                key, type: 'button', className: 'sl-filter', 'aria-pressed': category === key,
                onClick: () => setCategory(key),
              }, statusLabel(key), h('span', { className: 'sl-filter__count' }, String(categoryCounts[key]))))),
            h('div', { className: 'sl-scope' },
              filter('team', 'allTeams', 'teamId', team, setTeam),
              filter('project', 'allProjects', 'projectRoot', project, setProject))),
          phase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
          phase === 'error' && h('p', { className: 'sl-error', role: 'alert' }, t('loadFailed')),
          openFailed && h('p', { className: 'sl-error', role: 'alert' }, t('openFailed')),
          error && h('p', { className: 'sl-error', role: 'alert' }, error),
          notice && h('p', { className: 'sl-notice', role: 'status' }, notice),
          phase === 'ready' && tasks.length === 0 && h('p', { className: 'sl-hint', role: 'status' }, t('empty')),
          phase === 'ready' && tasks.length > 0 && shown.length === 0 &&
            h('p', { className: 'sl-hint', role: 'status' }, t(category ? 'emptyCategory' : 'noMatch')),
          shown.length > 0 && h('div', { className: 'sl-groups' },
            ...groups.map(group => h('section', { key: group.key, className: 'sl-group' },
              h('h2', { className: 'sl-group__title' },
                statusLabel(group.key),
                h('span', { className: 'sl-group__count' }, String(group.tasks.length))),
              h('ul', { className: 'sl-list' }, ...group.tasks.map(taskRow))))),
          h('section', { className: 'sl-memory-section' },
            h('div', { className: 'sl-memory-head' },
              h('h2', null, t('memoryTitle')),
              memories.length > 0 && h('span', { className: 'sl-memory-count' }, String(memories.length))),
            h('p', { className: 'sl-intro' }, t('memoryIntro')),
            memoryPhase === 'ready' && h('div', { className: 'sl-memory-usage', 'aria-label': t('memoryUsage') },
              ...MEMORY_CATEGORIES.map(key => h('span', { key, className: 'sl-lv' },
                h('span', { className: 'sl-lv__label' }, t(`memoryUsage.${key}`)),
                h('span', { className: 'sl-lv__value' }, String(memoryCounts[key]))))),
            memoryInjection && h('p', { className: 'sl-hint' },
              `${t('memoryInjection')} ${memoryInjection.recordIds.length}/${memoryInjection.limit} ${t('memoryInjectionTail')}`),
            memoryError && h('p', { role: 'alert', className: 'sl-error' }, memoryError),
            memoryNotice && h('p', { role: 'status', className: 'sl-notice' }, memoryNotice),
            memoryPhase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
            memoryPhase === 'error' && h('p', { role: 'alert', className: 'sl-error' }, t('memoryLoadFailed')),
            memoryPhase === 'ready' && memories.length === 0 &&
              h('p', { role: 'status', className: 'sl-hint' }, t('memoryEmpty')),
            memoryPhase === 'ready' && memories.length > 0 && h('div', { className: 'sl-memory-tools' },
              h('div', { className: 'sl-memory-filters', role: 'group', 'aria-label': t('memoryFilters') },
                h('button', {
                  type: 'button', className: 'sl-filter', 'aria-pressed': memoryCategory === '',
                  onClick: () => setMemoryCategory(''),
                }, t('all'), h('span', { className: 'sl-filter__count' }, String(memories.length))),
                ...MEMORY_CATEGORIES.map(key => h('button', {
                  key, type: 'button', className: 'sl-filter', 'aria-pressed': memoryCategory === key,
                  onClick: () => setMemoryCategory(key),
                }, t(`memoryCategory.${key}`),
                h('span', { className: 'sl-filter__count' }, String(memoryCounts[key])))),
              h('input', {
                className: 'sl-input', type: 'search', value: memorySearch,
                placeholder: t('memorySearch'), 'aria-label': t('memorySearch'),
                onChange: event => setMemorySearch(event.target.value),
              })),
            memoryPhase === 'ready' && memories.length > 0 && shownMemory.length === 0 &&
              h('p', { className: 'sl-hint', role: 'status' }, t('memoryNoMatch')),
            shownMemory.length > 0 &&
              h('ul', { className: 'sl-list' }, ...shownMemory.map(memoryRow)))),
          dialogView()))
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
