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
        mergeUnavailable: 'Merge unavailable:', publishUnavailable: 'Send pull request unavailable:',
        'pr.open': 'Open', 'pr.merged': 'Merged', 'pr.closed': 'Closed', 'pr.unknown': 'Unknown', 'pr.draft': 'Draft',
        prSearch: 'Search pull requests', prNoOpen: 'No open pull requests.', prNoMerged: 'No merged pull requests.',
        prNoClosed: 'No closed pull requests.', prNoMatch: 'No pull requests match the search.',
        prDetailFailed: 'Could not load details.', prCommits: 'Commits', prFiles: 'Files changed',
        prNoCommits: 'No commits yet.', prNoFiles: 'No changed files.', prAuthor: 'Author',
        prComments: 'Comments', prChecks: 'Checks', prChecksSuccess: 'Checks passed', prChecksPending: 'Checks running',
        prChecksFailure: 'Checks failed', prShowDetails: 'Show details', prHideDetails: 'Hide details',
        prDone: 'Git action completed.',
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
        mergeUnavailable: '无法合并：', publishUnavailable: '无法发送 PR：',
        'pr.open': '打开', 'pr.merged': '已合并', 'pr.closed': '已关闭', 'pr.unknown': '未知', 'pr.draft': '草稿',
        prSearch: '搜索拉取请求', prNoOpen: '没有打开的拉取请求。', prNoMerged: '没有已合并的拉取请求。',
        prNoClosed: '没有已关闭的拉取请求。', prNoMatch: '没有符合搜索条件的拉取请求。',
        prDetailFailed: '无法加载详情。', prCommits: '提交', prFiles: '改动文件',
        prNoCommits: '暂无提交。', prNoFiles: '无改动文件。', prAuthor: '作者',
        prComments: '评论', prChecks: '检查', prChecksSuccess: '检查通过', prChecksPending: '检查进行中',
        prChecksFailure: '检查失败', prShowDetails: '展开详情', prHideDetails: '收起详情',
        prDone: 'Git 操作已完成。',
      },
    }
    // Page, list rows and controls use only `--dsw-alias-*` theme tokens, matching the DSH panel in the prototype.
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
      .sl-pr-section{margin-top:24px}
      .sl-pr__head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px}
      .sl-pr__head h2{margin:0;font-size:1.1rem}
      .sl-pr__count{color:var(--dsw-alias-label-secondary);font-size:.9rem}
      .sl-pr__error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
      .sl-pr a{color:var(--dsw-alias-brand-primary)}
      .sl-pr{overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
      .sl-pr__bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-module-platform)}
      .sl-pr__tabs{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
      .sl-board .sl-pr__tab{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;margin-bottom:-1px;padding:9px 8px;border:0;border-bottom:2px solid transparent;border-radius:6px 6px 0 0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:18px;cursor:pointer}
      .sl-board .sl-pr__tab:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .sl-board .sl-pr__tab[aria-selected='true']{border-bottom-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary);font-weight:600}
      .sl-pr__tab-count{min-width:20px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px;font-variant-numeric:tabular-nums;text-align:center}
      .sl-board .sl-pr__tab[aria-selected='true'] .sl-pr__tab-count{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);color:var(--dsw-alias-state-business-primary)}
      .sl-pr__search{box-sizing:border-box;width:min(260px,100%);height:28px;margin:6px 0;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
      .sl-pr__search:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .sl-pr__list{list-style:none;margin:0;padding:0}
      .sl-pr__item + .sl-pr__item{border-top:1px solid var(--dsw-alias-border-l1)}
      .sl-board .sl-pr__row{display:grid;grid-template-columns:18px minmax(0,1fr) auto;column-gap:10px;align-items:start;box-sizing:border-box;width:100%;padding:12px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .sl-board .sl-pr__row:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
      .sl-board .sl-pr__row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .sl-pr__state{display:inline-flex;margin-top:2px}
      .sl-pr__state svg{display:block}
      .sl-pr__state[data-state='open']{color:var(--dsw-alias-state-success-primary)}
      .sl-pr__state[data-state='draft']{color:var(--dsw-alias-state-idle-primary)}
      .sl-pr__state[data-state='merged']{color:var(--dsw-alias-state-done-primary)}
      .sl-pr__state[data-state='closed']{color:var(--dsw-alias-state-error-primary)}
      .sl-pr__main{min-width:0}
      .sl-pr__titleline{display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 8px;min-width:0}
      .sl-pr__title{font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
      .sl-pr__number{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
      .sl-pr__meta{display:flex;align-items:center;flex-wrap:wrap;gap:2px 10px;margin-top:3px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .sl-pr__meta code{color:var(--dsw-alias-label-secondary)}
      .sl-pr__arrow{color:var(--dsw-alias-label-tertiary)}
      .sl-pr__tag{display:inline-flex;align-items:center;max-width:100%;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sl-pr__tag[data-tone='success']{border-color:transparent;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary)}
      .sl-pr__tag[data-tone='warning']{border-color:transparent;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);color:var(--dsw-alias-state-warn-primary)}
      .sl-pr__badges{display:flex;align-items:center;gap:10px;padding-top:2px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap}
      .sl-pr__badge{display:inline-flex;align-items:center;gap:4px}
      .sl-pr__badge[data-state='success']{color:var(--dsw-alias-state-success-primary)}
      .sl-pr__badge[data-state='failure']{color:var(--dsw-alias-state-error-primary)}
      .sl-pr__badge[data-state='pending']{color:var(--dsw-alias-state-warn-primary)}
      .sl-pr__chevron{color:var(--dsw-alias-label-tertiary);transition:transform .12s ease}
      .sl-pr__row[aria-expanded='true'] .sl-pr__chevron{transform:rotate(180deg)}
      .sl-pr__detail{padding:0 12px 14px 40px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
      .sl-pr__facts{display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px;padding-top:10px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .sl-pr__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding-top:12px}
      .sl-pr__section{min-width:0}
      .sl-pr__section h3{display:flex;align-items:baseline;gap:6px;margin:0 0 6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:600}
      .sl-pr__section-count{color:var(--dsw-alias-label-tertiary);font-weight:400}
      .sl-pr__items{display:grid;gap:6px;margin:0;padding:0;list-style:none}
      .sl-pr__commit{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:13px;line-height:20px}
      .sl-pr__commit code{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px}
      .sl-pr__commit-subject{min-width:0;overflow-wrap:anywhere}
      .sl-pr__commit-meta{display:flex;flex-wrap:wrap;gap:2px 8px;margin-top:1px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
      .sl-pr__file{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0;font-size:13px;line-height:20px}
      .sl-pr__file code{min-width:0;overflow-wrap:anywhere}
      .sl-pr__stats{display:inline-flex;flex:none;gap:6px;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
      .sl-pr__add{color:var(--dsw-alias-state-success-primary)}
      .sl-pr__del{color:var(--dsw-alias-state-error-primary)}
      .sl-pr__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
      .sl-board .sl-pr__primary{border-color:transparent;background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-label-on-color)}
      .sl-board .sl-pr__primary:not(:disabled):hover{background:var(--dsw-alias-state-success-secondary)}
      .sl-pr__hint{margin:6px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
      .sl-pr__empty{margin:0;padding:24px 12px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;text-align:center}
      .sl-pr__notice{margin:0 0 12px;padding:8px 12px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent);color:var(--dsw-alias-state-success-primary);font-size:13px;line-height:20px;overflow-wrap:anywhere}
      @media (max-width:680px){
        .sl-pr__grid{grid-template-columns:minmax(0,1fr)}
        .sl-pr__detail{padding-left:12px}
        .sl-pr__bar{padding:0 8px}      .sl-board{box-sizing:border-box;height:100%;overflow:auto;container-type:inline-size;padding:0 clamp(24px,4vw,48px) 48px;padding-inline-start:max(clamp(24px,4vw,48px),var(--dsh-frame-leading-clearance,0px));color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
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
        comment: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3v-5.7A8.5 8.5 0 1 1 21 11.5Z',
        check: 'M20 6 9 17l-5-5',
        close: 'M18 6 6 18M6 6l12 12',
        pending: 'M12 7v5l3 2M21 12a9 9 0 1 1-9-9',
      }[name] }))
    }

    function pullRequestStateIcon(state) {
      const common = {
        width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }
      if (state === 'draft') {
        return h('svg', common,
          h('circle', { cx: 12, cy: 12, r: 8, strokeDasharray: '3 3' }),
          h('circle', { cx: 12, cy: 12, r: 2.5, fill: 'currentColor', stroke: 'none' }))
      }
      if (state === 'merged') {
        return h('svg', common,
          h('circle', { cx: 12, cy: 12, r: 9 }),
          h('path', { d: 'M7 12h7m0 0-3-3m3 3-3 3' }))
      }
      if (state === 'closed') {
        return h('svg', common,
          h('circle', { cx: 12, cy: 12, r: 9 }),
          h('path', { d: 'm9 9 6 6M15 9l-6 6' }))
      }
      return h('svg', common,
        h('circle', { cx: 12, cy: 12, r: 9 }),
        h('path', { d: 'M8 8v8M8 10h4a2 2 0 0 1 2 2v4M12 16h4' }))
    }

    function pullRequestState(task) {
      const git = task.git
      if (git?.merged || git?.pr?.state === 'MERGED' || task.status === 'merged') return 'merged'
      if (git?.pr?.state === 'CLOSED') return 'closed'
      if (git?.pr?.state === 'OPEN' && git.pr.draft) return 'draft'
      return 'open'
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
      const [gitNotice, setGitNotice] = useState('')
      const [prTab, setPrTab] = useState('open')
      const [prQuery, setPrQuery] = useState('')
      const [expanded, setExpanded] = useState('')
      const [details, setDetails] = useState({})
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
          setGitNotice(typeof value?.message === 'string' && value.message ? value.message : t('prDone'))
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
      const prRows = branches.map(task => ({ task, state: pullRequestState(task) }))
      const prCounts = { open: 0, merged: 0, closed: 0 }
      for (const row of prRows) prCounts[row.state === 'draft' ? 'open' : row.state] += 1
      const query = prQuery.trim().toLowerCase()
      const prVisible = prRows.filter(({ task, state }) => {
        if (prTab === 'open' ? state !== 'open' && state !== 'draft' : state !== prTab) return false
        if (!query) return true
        return [task.title, task.id, task.teamId, task.git.branch, task.git.baseBranch, task.git.repository,
          task.git.author, task.git.pr?.author].filter(Boolean).join(' ').toLowerCase().includes(query)
      })
      const commitItem = (commit, index) => h('li', { key: commit.hash || index, className: 'sl-pr__commit' },
        h('div', { className: 'sl-pr__main' },
          h('div', { className: 'sl-pr__commit-subject' }, commit.subject || ''),
          h('div', { className: 'sl-pr__commit-meta' },
            commit.hash && h('code', null, String(commit.hash).slice(0, 7)),
            commit.author && h('span', null, commit.author),
            commit.date && displayTime(commit.date))))
      const fileItem = (file, index) => h('li', { key: file.path || index, className: 'sl-pr__file' },
        h('code', null, file.path),
        h('span', { className: 'sl-pr__stats' },
          typeof file.additions === 'number' && h('span', { className: 'sl-pr__add' }, `+${file.additions}`),
          typeof file.deletions === 'number' && h('span', { className: 'sl-pr__del' }, `-${file.deletions}`)))
      const branchRow = task => {
        const git = task.git
        const state = pullRequestState(task)
        const prUrl = pullRequestHref(task.prUrl) ?? pullRequestHref(git.pr?.url)
        const number = pullRequestNumber(task.prUrl) ?? pullRequestNumber(git.pr?.url)
        const pending = gitPending.startsWith(`${task.id}:`)
        const open = expanded === task.id
        const detail = details[task.id]
        const statusKey = `status.${task.status}`
        const statusLabel = t(Object.hasOwn(dictionaries.en, statusKey) ? statusKey : 'status.unknown')
        const reviewText = git.reviewed ? t('reviewApproved') : git.approved ? t('reviewStale') : t('reviewNotApproved')
        const reviewTone = git.reviewed ? 'success' : git.approved ? 'warning' : undefined
        const author = git.pr?.author || git.author
        const updated = displayTime(task.updatedAt)
        const comments = typeof git.pr?.comments === 'number' && git.pr.comments > 0 ? git.pr.comments : undefined
        const checks = git.pr?.checks
        const checksLabel = checks?.state === 'success' ? t('prChecksSuccess')
          : checks?.state === 'failure' ? t('prChecksFailure') : t('prChecksPending')
        const checksIcon = checks?.state === 'success' ? 'check' : checks?.state === 'failure' ? 'close' : 'pending'
        const prStateText = git.pr?.state ? prState(git.pr.state) : undefined
        const prTone = git.pr?.state === 'MERGED' ? 'success' : git.pr?.state === 'CLOSED' ? 'danger' : git.pr?.state ? 'info' : 'neutral'
        const active = state === 'open' || state === 'draft'
        return h('li', { key: `git-${task.id}`, className: 'sl-pr__item' },
          h('button', {
            type: 'button', className: 'sl-pr__row', 'aria-expanded': open,
            title: open ? t('prHideDetails') : t('prShowDetails'),
            onClick: () => toggleRow(task.id),
          },
          h('span', { className: 'sl-pr__state', 'data-state': state, title: prState(state), 'aria-label': prState(state) }, pullRequestStateIcon(state)),
          h('span', { className: 'sl-pr__main' },
            h('span', { className: 'sl-pr__titleline' },
              h('span', { className: 'sl-pr__title' }, task.title || task.id),
              number ? h('span', { className: 'sl-pr__number' }, `#${number}`) : h('code', { className: 'sl-pr__number' }, task.id),
              h('span', { className: 'sl-pr__tag' }, statusLabel)),
            h('span', { className: 'sl-pr__meta' },
              author && h('span', { title: t('prAuthor') }, author),
              updated && h('span', null, `${t('updated')}: `, updated),
              h('span', null, h('code', null, git.branch), h('span', { className: 'sl-pr__arrow' }, ' → '), h('code', null, git.baseBranch)),
              statusMark(task.status),
              h('span', { className: 'sl-tag', 'data-tone': reviewTone }, reviewText),
              h('span', { className: 'sl-tag', 'data-tone': git.unmerged ? 'warning' : 'neutral' },
                git.unmerged ? t('unmergedChanges') : t('noUnmergedChanges')),
              prStateText && h('span', { className: 'sl-tag', 'data-tone': prTone },
                `${t('pullRequestState')}: ${prStateText}`))),
          h('span', { className: 'sl-pr__badges' },
            comments && h('span', { className: 'sl-pr__badge', title: `${t('prComments')}: ${comments}`, 'aria-label': `${t('prComments')}: ${comments}` },
              icon('comment'), h('span', null, String(comments))),
            checks && h('span', { className: 'sl-pr__badge', 'data-state': checks.state, title: `${t('prChecks')}: ${checksLabel}`, 'aria-label': `${t('prChecks')}: ${checksLabel}` },
              icon(checksIcon), h('span', null, String(checks.total))),
            h('span', { className: 'sl-pr__chevron' }, icon('chevron')))),
          open && h('div', { className: 'sl-pr__detail' },
            h('div', { className: 'sl-pr__facts' },
              h('span', null, `${t('branch')}: `, h('code', null, git.branch)),
              h('span', null, `${t('baseBranch')}: `, h('code', null, git.baseBranch)),
              git.repository && h('span', null, `${t('repository')}: ${git.repository}`),
              git.pr?.state && h('span', null, `${t('pullRequestState')}: ${prState(git.pr.state)}`),
              prUrl && h('a', { href: prUrl, target: '_blank', rel: 'noopener noreferrer' }, t('pr'))),
            detail?.phase === 'loading' && h('p', { className: 'sl-pr__hint', role: 'status' }, t('loading')),
            detail?.phase === 'error' && h('p', { role: 'alert', className: 'sl-pr__error' }, detail.error),
            detail?.phase === 'ready' && h('div', { className: 'sl-pr__grid' },
              h('section', { className: 'sl-pr__section' },
                h('h3', null, t('prCommits'), h('span', { className: 'sl-pr__section-count' }, String(detail.commits.length))),
                detail.commits.length === 0
                  ? h('p', { className: 'sl-pr__hint' }, t('prNoCommits'))
                  : h('ul', { className: 'sl-pr__items' }, ...detail.commits.map(commitItem))),
              h('section', { className: 'sl-pr__section' },
                h('h3', null, t('prFiles'), h('span', { className: 'sl-pr__section-count' }, String(detail.files.length))),
                detail.files.length === 0
                  ? h('p', { className: 'sl-pr__hint' }, t('prNoFiles'))
                  : h('ul', { className: 'sl-pr__items' }, ...detail.files.map(fileItem)))),
            active && h('div', { className: 'sl-pr__actions' },
              h('button', {
                type: 'button', className: git.canMerge ? 'sl-pr__primary' : undefined,
                disabled: pending || !git.canMerge, title: git.mergeReason,
                onClick: () => void gitAction(task.id, 'merge'),
              }, `${t('mergeInto')} ${git.baseBranch}`),
              h('button', {
                type: 'button', className: git.canPublish && !git.canMerge ? 'sl-pr__primary' : undefined,
                disabled: pending || !git.canPublish, title: git.publishReason,
                onClick: () => void gitAction(task.id, 'publish'),
              }, t('publishPullRequest')),
              pending && h('span', { className: 'sl-pr__hint' }, t('gitWorking'))),
            active && !git.canMerge && git.mergeReason &&
              h('p', { className: 'sl-pr__hint' }, `${t('mergeInto')} ${git.baseBranch}: ${git.mergeReason}`),
            active && !git.canPublish && git.publishReason &&
              h('p', { className: 'sl-pr__hint' }, `${t('publishPullRequest')}: ${git.publishReason}`)))
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
          phase === 'ready' && h('section', { className: 'sl-pr-section', 'aria-labelledby': gitHeadingId },
            h('div', { className: 'sl-pr__head' },
              h('h2', { id: gitHeadingId }, t('gitTitle')),
              branches.length > 0 && h('span', { className: 'sl-pr__count' }, String(branches.length))),
            gitError && h('p', { role: 'alert', className: 'sl-pr__error' }, gitError),
            gitNotice && h('p', { role: 'status', className: 'sl-pr__notice' }, gitNotice),
            branches.length === 0
              ? h('p', { role: 'status', className: 'sl-pr__hint' }, t('gitEmpty'))
              : h('div', { className: 'sl-pr' },
                h('div', { className: 'sl-pr__bar' },
                  h('div', { className: 'sl-pr__tabs', role: 'tablist', 'aria-label': t('gitTitle') },
                    ...[['open', t('pr.open')], ['merged', t('pr.merged')], ['closed', t('pr.closed')]].map(([key, label]) =>
                      h('button', {
                        key, type: 'button', role: 'tab', className: 'sl-pr__tab',
                        'aria-selected': prTab === key,
                        onClick: () => { setPrTab(key); setExpanded('') },
                      }, label, h('span', { className: 'sl-pr__tab-count' }, String(prCounts[key]))))),
                  h('input', {
                    type: 'search', className: 'sl-pr__search', value: prQuery,
                    placeholder: t('prSearch'), 'aria-label': t('prSearch'),
                    onChange: event => setPrQuery(event.target.value),
                  })),
                prVisible.length === 0
                  ? h('p', { className: 'sl-pr__empty', role: 'status' },
                    t(query ? 'prNoMatch' : prTab === 'open' ? 'prNoOpen' : prTab === 'merged' ? 'prNoMerged' : 'prNoClosed'))
                  : h('ul', { className: 'sl-pr__list' }, ...prVisible.map(({ task }) => branchRow(task)))))))
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
