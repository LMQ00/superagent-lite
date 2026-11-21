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
        intro: 'Status belongs to the task list only. Git delivery below carries branches and pull request actions.',
        taskFilters: 'Task status', all: 'All',
        'category.failed': 'Failed', 'category.ongoing': 'In progress', 'category.merged': 'Merged',
        'category.review': 'Needs review', 'category.answer': 'Answer only',
        team: 'Team', project: 'Project', allTeams: 'All teams', allProjects: 'All projects',
        router: 'Router session', worker: 'Worker session', pr: 'Pull request', updated: 'Updated',
        'status.merging': 'Merging', 'status.resuming': 'Resuming', 'status.publishing': 'Publishing pull request',
        'status.review-required': 'Review required', 'status.delivery-blocked': 'Delivery blocked',
        'status.starting': 'Starting', 'status.running': 'In progress', 'status.ready': 'Ready',
        'status.completed': 'Completed', 'status.failed': 'Failed', 'status.interrupted': 'Interrupted',
        'status.cancelled': 'Cancelled', 'status.awaiting-ci': 'Waiting for CI',
        'status.awaiting-merge': 'Waiting for merge', 'status.merged': 'Merged',
        'status.merge-conflict': 'Merge conflict', 'status.merge-queued': 'Merge queued',
        'status.unconfirmed': 'Not confirmed', 'status.unknown': 'Unknown',
        gitTitle: 'Git delivery', gitIntro: 'Branches and pull requests only; task status stays above.',
        gitEmpty: 'No worker branches to deliver yet.',
        branch: 'Branch', baseBranch: 'Base branch', repository: 'Repository',
        unmergedChanges: 'Unmerged commits', noUnmergedChanges: 'No unmerged commits',
        reviewApproved: 'Review approved', reviewNotApproved: 'Review not approved', reviewStale: 'Review record is stale',
        mergeInto: 'Merge into', publishPullRequest: 'Send pull request', gitWorking: 'Working…',
        gitFailed: 'The Git action failed.',
        mergeUnavailable: 'Merge unavailable:', publishUnavailable: 'Send pull request unavailable:',
        prDetailFailed: 'Could not load details.', prCommits: 'Commits', prFiles: 'Files changed',
        prNoCommits: 'No commits yet.', prNoFiles: 'No changed files.', prAuthor: 'Author',
        prComments: 'Comments', prChecks: 'Checks', prChecksSuccess: 'Checks passed', prChecksPending: 'Checks running',
        prChecksFailure: 'Checks failed', gitShowDetails: 'Show details', gitHideDetails: 'Hide details',
        gitDone: 'Git action completed.',
      },
      zh: {
        title: '项目任务', refresh: '刷新', loading: '正在加载任务…',
        loadFailed: '无法加载任务，请重试。', openFailed: '无法打开会话。',
        empty: '暂无任务。', noMatch: '没有符合筛选条件的任务。',
        emptyCategory: '该状态下暂无任务。',
        intro: '任务状态只在任务列表呈现；下方 Git 交付只负责分支与拉取请求操作。',
        taskFilters: '任务状态', all: '全部',
        'category.failed': '失败', 'category.ongoing': '进行中', 'category.merged': '已合并',
        'category.review': '待审查', 'category.answer': '仅回答',
        team: '团队', project: '项目', allTeams: '全部团队', allProjects: '全部项目',
        router: 'Router 会话', worker: 'Worker 会话', pr: '拉取请求', updated: '更新时间',
        'status.merging': '正在合并', 'status.resuming': '正在恢复', 'status.publishing': '正在发布拉取请求',
        'status.review-required': '需要审查', 'status.delivery-blocked': '交付受阻',
        'status.starting': '启动中', 'status.running': '进行中', 'status.ready': '已就绪',
        'status.completed': '已完成', 'status.failed': '失败', 'status.interrupted': '已中断',
        'status.cancelled': '已取消', 'status.awaiting-ci': '等待 CI',
        'status.awaiting-merge': '等待合并', 'status.merged': '已合并',
        'status.merge-conflict': '合并冲突', 'status.merge-queued': '已进入合并队列',
        'status.unconfirmed': '未确认', 'status.unknown': '未知',
        gitTitle: 'Git 交付', gitIntro: '只显示分支与拉取请求操作；任务状态以上方任务列表为准。',
        gitEmpty: '暂无可交付的 worker 分支。',
        branch: '分支', baseBranch: '基础分支', repository: '仓库',
        unmergedChanges: '有未合并改动', noUnmergedChanges: '无未合并改动',
        reviewApproved: '审查已通过', reviewNotApproved: '审查未通过', reviewStale: '审查记录已过期',
        mergeInto: '合并到', publishPullRequest: '发送 PR', gitWorking: '处理中…',
        gitFailed: 'Git 操作失败。',
        mergeUnavailable: '无法合并：', publishUnavailable: '无法发送 PR：',
        prDetailFailed: '无法加载详情。', prCommits: '提交', prFiles: '改动文件',
        prNoCommits: '暂无提交。', prNoFiles: '无改动文件。', prAuthor: '作者',
        prComments: '评论', prChecks: '检查', prChecksSuccess: '检查通过', prChecksPending: '检查进行中',
        prChecksFailure: '检查失败', gitShowDetails: '展开详情', gitHideDetails: '收起详情',
        gitDone: 'Git 操作已完成。',
      },
    }
    // Page, list rows and controls use only `--dsw-alias-*` theme tokens, matching the DSH panel in the prototype.
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
      .sl-lv{display:inline-flex;align-items:baseline;gap:6px;min-width:0;font-size:12px;line-height:18px;white-space:nowrap}
      .sl-lv__label{color:var(--dsw-alias-label-caption)}
      .sl-lv__value{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
      .sl-code{font-family:var(--ds-font-family-code,Menlo,monospace);font-size:11px;line-height:18px;color:var(--dsw-alias-label-caption);overflow-wrap:anywhere}
      .sl-tag{display:inline-flex;align-items:center;border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .sl-tag[data-tone='neutral']{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
      .sl-tag[data-tone='success']{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent);color:var(--dsw-alias-state-success-primary)}
      .sl-tag[data-tone='warning']{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-primary)}
      .sl-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;max-width:100%;padding:0 10px;border:0;border-radius:14px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;text-decoration:none;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
      .sl-btn:disabled{cursor:not-allowed;opacity:.4}
      .sl-btn:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
      .sl-btn--outline{border:0.5px solid var(--dsw-alias-border-l3)}
      .sl-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .sl-btn svg{flex:none}
      .sl-session{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
      .sl-git-section{display:flex;flex-direction:column;gap:8px;min-width:0;padding-top:8px}
      .sl-git-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0}
      .sl-git-head h2{margin:0;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary)}
      .sl-git-count{font-size:13px;line-height:20px;font-weight:400;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}
      .sl-git-item{min-width:0}
      .sl-git__head{box-sizing:border-box;display:grid;grid-template-columns:16px minmax(0,1fr) 16px;column-gap:10px;align-items:start;width:100%;padding:10px 8px;border:0;border-bottom:0.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .sl-git__head:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
      .sl-git__head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .sl-git__icon{display:inline-flex;margin-top:2px;color:var(--dsw-alias-label-tertiary)}
      .sl-git__main{display:flex;flex-direction:column;gap:3px;min-width:0}
      .sl-git__titleline{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 8px;min-width:0}
      .sl-git__title{min-width:0;font-size:14px;line-height:20px;font-weight:500;overflow-wrap:anywhere}
      .sl-git__number{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
      .sl-git__meta{display:flex;align-items:center;flex-wrap:wrap;gap:2px 10px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .sl-git__meta code{color:var(--dsw-alias-label-secondary)}
      .sl-git__arrow{color:var(--dsw-alias-label-tertiary)}
      .sl-git__chevron{display:inline-flex;margin-top:2px;color:var(--dsw-alias-label-tertiary);transition:transform .12s ease}
      .sl-git__head[aria-expanded='true'] .sl-git__chevron{transform:rotate(180deg)}
      .sl-git__detail{padding:0 8px 14px 34px;border-bottom:0.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1)}
      .sl-git__facts{display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px;padding-top:10px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .sl-link{position:relative;z-index:1;color:var(--dsw-alias-link,var(--dsw-alias-brand-primary));text-decoration:none}
      .sl-link:hover{text-decoration:underline}
      .sl-git__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding-top:12px}
      .sl-git__section{min-width:0}
      .sl-git__section h3{display:flex;align-items:baseline;gap:6px;margin:0 0 6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:600}
      .sl-git__section-count{color:var(--dsw-alias-label-tertiary);font-weight:400}
      .sl-git__items{display:grid;gap:6px;margin:0;padding:0;list-style:none}
      .sl-git__commit{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:13px;line-height:20px}
      .sl-git__commit code{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px}
      .sl-git__commit-subject{min-width:0;overflow-wrap:anywhere}
      .sl-git__commit-meta{display:flex;flex-wrap:wrap;gap:2px 8px;margin-top:1px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
      .sl-git__file{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0;font-size:13px;line-height:20px}
      .sl-git__file code{min-width:0;overflow-wrap:anywhere}
      .sl-git__stats{display:inline-flex;flex:none;gap:6px;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
      .sl-git__add{color:var(--dsw-alias-state-success-primary)}
      .sl-git__del{color:var(--dsw-alias-state-error-primary)}
      .sl-git__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
      .sl-board .sl-git__primary{border-color:transparent;background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-label-on-color)}
      .sl-board .sl-git__primary:not(:disabled):hover{background:var(--dsw-alias-state-success-secondary)}
      .sl-git__hint{margin:6px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
      .sl-git__error{margin:6px 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
      @container (max-width:640px){
        .sl-task{grid-template-columns:minmax(0,1fr);row-gap:4px}
        .sl-task__stage{border-right:0;padding-top:0}
        .sl-git__grid{grid-template-columns:minmax(0,1fr)}
        .sl-git__detail{padding-left:8px}
        .sl-head h1{font-size:17px;line-height:24px}
        .sl-board{padding-top:20px}
        html[data-platform='darwin'] .sl-board{padding-top:calc(20px + var(--dsh-frame-top-clearance,0px))}
        .sl-select{min-width:0;flex:1 1 140px}
        .sl-filters,.sl-scope{width:100%}
        .sl-scope{margin-inline-start:0}
      }
      @media (prefers-reduced-motion:reduce){
        .sl-spinner g{animation:none}
        .sl-git__chevron{transition:none}
      }
    `

    const ONGOING = new Set(['starting', 'running', 'resuming', 'merging', 'publishing', 'awaiting-ci', 'merge-queued'])
    const DONE = new Set(['ready', 'completed', 'merged'])
    const WARNING = new Set(['review-required', 'awaiting-merge', 'unconfirmed'])
    const ERROR = new Set(['failed', 'merge-conflict', 'delivery-blocked', 'interrupted', 'cancelled'])
    const CATEGORY_ORDER = ['failed', 'ongoing', 'merged', 'review', 'answer']
    const FAILED_CATEGORY = new Set(['failed', 'merge-conflict', 'delivery-blocked', 'interrupted', 'cancelled'])
    const REVIEW_CATEGORY = new Set(['review-required', 'awaiting-merge', 'ready', 'completed'])

    function statusTone(status) {
      if (ERROR.has(status)) return 'error'
      if (WARNING.has(status)) return 'warning'
      if (ONGOING.has(status)) return 'ongoing'
      if (DONE.has(status)) return 'done'
      return 'idle'
    }

    // The task list is the only place that classifies a task. Git delivery never derives a second state.
    function taskCategory(task) {
      if (task.status === 'merged') return 'merged'
      if (FAILED_CATEGORY.has(task.status)) return 'failed'
      if (task.mode === 'report' && task.status === 'completed') return 'answer'
      if (REVIEW_CATEGORY.has(task.status)) return 'review'
      return 'ongoing'
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
        chevron: 'm6 9 6 6 6-6',
        branch: 'M6 3v18M18 6v5a7 7 0 0 1-7 7H9',
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
      const [gitPending, setGitPending] = useState('')
      const [gitError, setGitError] = useState('')
      const [gitNotice, setGitNotice] = useState('')
      const [expanded, setExpanded] = useState('')
      const [details, setDetails] = useState({})
      const active = useRef(null)
      const headingId = useId()

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
      const scoped = tasks.filter(task => (!team || task.teamId === team) && (!project || task.projectRoot === project))
      const categoryCounts = CATEGORY_ORDER.reduce((counts, key) => {
        counts[key] = scoped.filter(task => taskCategory(task) === key).length
        return counts
      }, {})
      const shown = category ? scoped.filter(task => taskCategory(task) === category) : scoped
      const groups = CATEGORY_ORDER
        .filter(key => !category || key === category)
        .map(key => ({ key, tasks: shown.filter(task => taskCategory(task) === key) }))
        .filter(group => group.tasks.length > 0)

      const refresh = () => {
        active.current?.abort()
        setPhase('loading')
        setOpenFailed(false)
        setGitError('')
        setGitNotice('')
        setExpanded('')
        setDetails({})
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
          ONGOING.has(status) ? spinner() : h('span', { className: 'sl-dot', 'data-state': tone, 'aria-hidden': true }),
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
      const gitAction = async (taskId, action) => {
        setGitPending(`${taskId}:${action}`)
        setGitError('')
        setGitNotice('')
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
          setGitNotice(typeof value?.message === 'string' && value.message ? value.message : t('gitDone'))
        } catch (error) {
          setGitError(typeof error?.message === 'string' && error.message ? error.message : t('gitFailed'))
        } finally {
          setGitPending('')
        }
      }
      const loadDetails = async taskId => {
        setDetails(current => ({ ...current, [taskId]: { phase: 'loading' } }))
        try {
          const response = await fetch(`/superagent-lite/git?taskId=${encodeURIComponent(taskId)}`, {
            method: 'GET', credentials: 'same-origin', cache: 'no-store',
          })
          let value
          try {
            value = await response.json()
          } catch {
            value = undefined
          }
          if (!response.ok) throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('prDetailFailed'))
          setDetails(current => ({
            ...current,
            [taskId]: {
              phase: 'ready',
              commits: Array.isArray(value?.commits) ? value.commits : [],
              files: Array.isArray(value?.files) ? value.files : [],
            },
          }))
        } catch (error) {
          setDetails(current => ({
            ...current,
            [taskId]: {
              phase: 'error',
              error: typeof error?.message === 'string' && error.message ? error.message : t('prDetailFailed'),
            },
          }))
        }
      }
      const toggleRow = taskId => {
        if (expanded === taskId) {
          setExpanded('')
          return
        }
        setExpanded(taskId)
        if (details[taskId]?.phase !== 'ready') void loadDetails(taskId)
      }
      const branches = shown.filter(task => task.git && typeof task.git.branch === 'string')
      const taskRow = task => {
        const pr = pullRequestHref(task.prUrl)
        const updated = displayTime(task.updatedAt)
        const address = task.parentSessionId && task.workerSessionId ? {
          parentSessionId: task.parentSessionId, childSessionId: task.workerSessionId, mode: 'unknown',
        } : task.workerSessionId
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
              h('code', { className: 'sl-code', title: task.id }, task.id)),
            h('div', { className: 'sl-task__actions' },
              session('router', task.parentSessionId),
              session('worker', task.workerSessionId, address),
              pr && externalLink(pr, t('pr')))))
      }
      const commitItem = (commit, index) => h('li', { key: commit.hash || index, className: 'sl-git__commit' },
        h('div', { className: 'sl-git__main' },
          h('div', { className: 'sl-git__commit-subject' }, commit.subject || ''),
          h('div', { className: 'sl-git__commit-meta' },
            commit.hash && h('code', null, String(commit.hash).slice(0, 7)),
            commit.author && h('span', null, commit.author),
            commit.date && displayTime(commit.date))))
      const fileItem = (file, index) => h('li', { key: file.path || index, className: 'sl-git__file' },
        h('code', null, file.path),
        h('span', { className: 'sl-git__stats' },
          typeof file.additions === 'number' && h('span', { className: 'sl-git__add' }, `+${file.additions}`),
          typeof file.deletions === 'number' && h('span', { className: 'sl-git__del' }, `-${file.deletions}`)))
      const branchRow = task => {
        const git = task.git
        const prUrl = pullRequestHref(task.prUrl) ?? pullRequestHref(git.pr?.url)
        const number = pullRequestNumber(task.prUrl) ?? pullRequestNumber(git.pr?.url)
        const pending = gitPending.startsWith(`${task.id}:`)
        const open = expanded === task.id
        const detail = details[task.id]
        const reviewText = git.reviewed ? t('reviewApproved') : git.approved ? t('reviewStale') : t('reviewNotApproved')
        const reviewTone = git.reviewed ? 'success' : git.approved ? 'warning' : 'neutral'
        const author = git.pr?.author || git.author
        const updated = displayTime(task.updatedAt)
        const comments = typeof git.pr?.comments === 'number' && git.pr.comments > 0 ? git.pr.comments : undefined
        const checks = git.pr?.checks
        const checksLabel = checks?.state === 'success' ? t('prChecksSuccess')
          : checks?.state === 'failure' ? t('prChecksFailure') : t('prChecksPending')
        return h('li', { key: `git-${task.id}`, className: 'sl-git-item' },
          h('button', {
            type: 'button', className: 'sl-git__head', 'aria-expanded': open,
            title: open ? t('gitHideDetails') : t('gitShowDetails'),
            onClick: () => toggleRow(task.id),
          },
          h('span', { className: 'sl-git__icon' }, icon('branch')),
          h('span', { className: 'sl-git__main' },
            h('span', { className: 'sl-git__titleline' },
              h('span', { className: 'sl-git__title' }, task.title || task.id),
              number ? h('span', { className: 'sl-git__number' }, `#${number}`) : h('code', { className: 'sl-git__number' }, task.id)),
            h('span', { className: 'sl-git__meta' },
              author && h('span', { title: t('prAuthor') }, author),
              updated && h('span', null, `${t('updated')}: `, updated),
              h('span', null, h('code', null, git.branch), h('span', { className: 'sl-git__arrow' }, ' → '), h('code', null, git.baseBranch)))),
          h('span', { className: 'sl-git__chevron' }, icon('chevron'))),
          open && h('div', { className: 'sl-git__detail' },
            h('div', { className: 'sl-git__facts' },
              h('span', null, `${t('branch')}: `, h('code', null, git.branch)),
              h('span', null, `${t('baseBranch')}: `, h('code', null, git.baseBranch)),
              git.repository && h('span', null, `${t('repository')}: ${git.repository}`),
              h('span', { className: 'sl-tag', 'data-tone': reviewTone }, reviewText),
              h('span', { className: 'sl-tag', 'data-tone': git.unmerged ? 'warning' : 'neutral' },
                git.unmerged ? t('unmergedChanges') : t('noUnmergedChanges')),
              comments !== undefined && h('span', null, `${t('prComments')}: ${comments}`),
              checks && h('span', null, `${t('prChecks')}: ${checksLabel}`),
              prUrl && h('a', { className: 'sl-link', href: prUrl, target: '_blank', rel: 'noopener noreferrer' }, t('pr'))),
            detail?.phase === 'loading' && h('p', { className: 'sl-git__hint', role: 'status' }, t('loading')),
            detail?.phase === 'error' && h('p', { role: 'alert', className: 'sl-git__error' }, detail.error),
            detail?.phase === 'ready' && h('div', { className: 'sl-git__grid' },
              h('section', { className: 'sl-git__section' },
                h('h3', null, t('prCommits'), h('span', { className: 'sl-git__section-count' }, String(detail.commits.length))),
                detail.commits.length === 0
                  ? h('p', { className: 'sl-git__hint' }, t('prNoCommits'))
                  : h('ul', { className: 'sl-git__items' }, ...detail.commits.map(commitItem))),
              h('section', { className: 'sl-git__section' },
                h('h3', null, t('prFiles'), h('span', { className: 'sl-git__section-count' }, String(detail.files.length))),
                detail.files.length === 0
                  ? h('p', { className: 'sl-git__hint' }, t('prNoFiles'))
                  : h('ul', { className: 'sl-git__items' }, ...detail.files.map(fileItem)))),
            !git.merged && h('div', { className: 'sl-git__actions' },
              h('button', {
                type: 'button', className: git.canMerge ? 'sl-btn sl-git__primary' : 'sl-btn sl-btn--outline',
                disabled: pending || !git.canMerge, title: git.mergeReason,
                onClick: () => void gitAction(task.id, 'merge'),
              }, `${t('mergeInto')} ${git.baseBranch}`),
              h('button', {
                type: 'button', className: git.canPublish && !git.canMerge ? 'sl-btn sl-git__primary' : 'sl-btn sl-btn--outline',
                disabled: pending || !git.canPublish, title: git.publishReason,
                onClick: () => void gitAction(task.id, 'publish'),
              }, t('publishPullRequest')),
              pending && h('span', { className: 'sl-git__hint' }, t('gitWorking'))),
            !git.merged && !git.canMerge && git.mergeReason &&
              h('p', { className: 'sl-git__hint' }, `${t('mergeInto')} ${git.baseBranch}: ${git.mergeReason}`),
            !git.merged && !git.canPublish && git.publishReason &&
              h('p', { className: 'sl-git__hint' }, `${t('publishPullRequest')}: ${git.publishReason}`)))
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
              }, icon('refresh'), t('refresh'))),
          tasks.length > 0 && h('div', { className: 'sl-filters' },
            h('div', { className: 'sl-filter-group', role: 'group', 'aria-label': t('taskFilters') },
              h('button', {
                type: 'button', className: 'sl-filter', 'aria-pressed': category === '',
                onClick: () => setCategory(''),
              }, t('all'), h('span', { className: 'sl-filter__count' }, String(scoped.length))),
              ...CATEGORY_ORDER.map(key => h('button', {
                key, type: 'button', className: 'sl-filter', 'aria-pressed': category === key,
                onClick: () => setCategory(key),
              }, t(`category.${key}`), h('span', { className: 'sl-filter__count' }, String(categoryCounts[key]))))),
            h('div', { className: 'sl-scope' },
              filter('team', 'allTeams', 'teamId', team, setTeam),
              filter('project', 'allProjects', 'projectRoot', project, setProject))),
          phase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
          phase === 'error' && h('p', { className: 'sl-error', role: 'alert' }, t('loadFailed')),
          openFailed && h('p', { className: 'sl-error', role: 'alert' }, t('openFailed')),
          phase === 'ready' && tasks.length === 0 && h('p', { className: 'sl-hint', role: 'status' }, t('empty')),
          phase === 'ready' && tasks.length > 0 && shown.length === 0 &&
            h('p', { className: 'sl-hint', role: 'status' }, t(category ? 'emptyCategory' : 'noMatch')),
          shown.length > 0 && h('div', { className: 'sl-groups' },
            ...groups.map(group => h('section', { key: group.key, className: 'sl-group' },
              h('h2', { className: 'sl-group__title' },
                t(`category.${group.key}`),
                h('span', { className: 'sl-group__count' }, String(group.tasks.length))),
              h('ul', { className: 'sl-list' }, ...group.tasks.map(taskRow)))))),
          phase === 'ready' && h('section', { className: 'sl-git-section' },
            h('div', { className: 'sl-git-head' },
              h('h2', null, t('gitTitle')),
              branches.length > 0 && h('span', { className: 'sl-git-count' }, String(branches.length))),
            h('p', { className: 'sl-intro' }, t('gitIntro')),
            gitError && h('p', { role: 'alert', className: 'sl-error' }, gitError),
            gitNotice && h('p', { role: 'status', className: 'sl-notice' }, gitNotice),
            branches.length === 0
              ? h('p', { role: 'status', className: 'sl-hint' }, t('gitEmpty'))
              : h('ul', { className: 'sl-list' }, ...branches.map(branchRow))))
      )
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
