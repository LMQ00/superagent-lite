window.__ModuleLoader__.load({
  id: '@local/superagent-lite',
  factory(require) {
    const { createElement: h, useEffect, useId, useRef, useState } = require('react')
    const id = 'superagent-lite'
    const dictionaries = {
      en: {
        title: 'Project tasks', views: 'Panel tabs', refresh: 'Refresh', loading: 'Loading tasks…',
        loadFailed: 'Could not load tasks. Try refreshing.', openFailed: 'Could not open the session.',
        empty: 'No tasks yet.', noMatch: 'No tasks match the filters.',
        emptyCategory: 'No tasks in this status.',
        intro: 'Task status lives only in this list. Unmerged tasks can be merged or published as a pull request.',
        taskFilters: 'Task status', all: 'All',
        'status.unmerged': 'Unmerged', 'status.running': 'In progress', 'status.unreviewed': 'Not reviewed',
        'status.completed': 'Completed', 'status.failed': 'Failed', 'status.answer': 'Answer only',
        team: 'Team', project: 'Project', allTeams: 'All teams', allProjects: 'All projects',
        router: 'Router session', worker: 'Worker session', pr: 'Pull request', updated: 'Updated',
        unconfirmed: 'Not confirmed', landAuthorized: 'Landing authorized',
        merge: 'Merge', publish: 'Send pull request', review: 'Review', deleteBranch: 'Delete branch', deleteTask: 'Delete task',
        mergeTitle: 'Merge into a branch', mergeTarget: 'Merge target', publishTitle: 'Send a pull request',
        publishRemote: 'Repository', ghRequired: 'A GitHub account is required:',
        noBranch: 'No merge target is available.', noRemote: 'No repository is available.',
        deleteTitle: 'Delete the worker branch', deleteHint: 'The reviewed commit is merged. Delete the worker branch and its worktree.',
        deleteTaskTitle: 'Delete the task', deleteTaskHint: 'The task record will be removed from this panel. Any worker branch and worktree are kept.',
        deleteTaskUnavailable: 'The worker is still running; wait for it to finish before deleting the task.',
        selectTask: 'Select task', selectMemory: 'Select memory', selectedCount: 'Selected',
        clearSelection: 'Clear selection', deleteSelected: 'Delete selected',
        batchTasksTitle: 'Delete selected tasks',
        batchTasksHint: 'The selected task records will be removed from this panel. Any worker branch and worktree are kept.',
        batchMemoryTitle: 'Delete selected memory', batchMemoryHint: 'The selected records will be deleted immediately.',
        batchTasksDeleted: 'Selected tasks deleted.', batchMemoryDeleted: 'Selected memory deleted.',
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
        settingsTitle: 'Settings', settingsIntro: 'Defaults for dispatched workers. Saved settings apply to new workers only.',
        settingsLoadFailed: 'Could not load settings. Try refreshing.', settingsSaved: 'Settings saved.', settingsFailed: 'The settings action failed.',
        workerModel: 'Worker model', workerModelHint: 'Leave blank to inherit the DSH default model.',
        modelProvider: 'Provider', modelName: 'Model', modelEffort: 'Reasoning effort (optional)',
        modelInherit: 'Inherit the DSH default', modelEffortDefault: 'Model default',
        defaultModel: 'DSH default: {model}', defaultModelUnavailable: 'The DSH default model is unavailable',
        modelCatalogError: 'Model suggestions are unavailable; known Provider and Model names still work: {error}',
        maxWorkers: 'Concurrent workers', maxWorkersHint: 'Tasks beyond the limit wait in the queue. Reviews do not count.',
        saveSettings: 'Save', settingsInvalid: 'Enter a provider and model, or leave all three model fields blank.',
        queued: 'Queued',
      },
      zh: {
        title: '项目任务', views: '面板分区', refresh: '刷新', loading: '正在加载任务…',
        loadFailed: '无法加载任务，请重试。', openFailed: '无法打开会话。',
        empty: '暂无任务。', noMatch: '没有符合筛选条件的任务。',
        emptyCategory: '该状态下暂无任务。',
        intro: '任务状态只在本列表呈现；未合并的任务可以合并或提交 PR。',
        taskFilters: '任务状态', all: '全部',
        'status.unmerged': '未合并', 'status.running': '运行中', 'status.unreviewed': '未审查',
        'status.completed': '已完成', 'status.failed': '失败', 'status.answer': '仅回答',
        team: '团队', project: '项目', allTeams: '全部团队', allProjects: '全部项目',
        router: 'Router 会话', worker: 'Worker 会话', pr: '拉取请求', updated: '更新时间',
        unconfirmed: '未确认', landAuthorized: '已授权落地',
        merge: '合并', publish: '提交 PR', review: '审查', deleteBranch: '删除分支', deleteTask: '删除任务',
        mergeTitle: '合并到分支', mergeTarget: '目标分支', publishTitle: '提交 PR',
        publishRemote: '提交仓库', ghRequired: '需要 gh 账号：',
        noBranch: '没有可选的合并目标分支。', noRemote: '没有可选的仓库。',
        deleteTitle: '删除修改分支', deleteHint: '已审查的提交已合并，可删除该修改分支及其工作树。',
        deleteTaskTitle: '删除任务', deleteTaskHint: '任务记录将从面板移除；worker 分支和工作树（如有）会保留。',
        deleteTaskUnavailable: 'worker 仍在运行，结束后才能删除任务。',
        selectTask: '选择任务', selectMemory: '选择记忆', selectedCount: '已选择',
        clearSelection: '清除选择', deleteSelected: '删除所选',
        batchTasksTitle: '删除所选任务',
        batchTasksHint: '所选任务记录将从面板移除；worker 分支和工作树（如有）会保留。',
        batchMemoryTitle: '删除所选记忆', batchMemoryHint: '所选记忆将被立即删除。',
        batchTasksDeleted: '所选任务已删除。', batchMemoryDeleted: '所选记忆已删除。',
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
        settingsTitle: '设置', settingsIntro: '派发 worker 的默认值。保存后只影响新启动的 worker。',
        settingsLoadFailed: '无法加载设置，请重试。', settingsSaved: '设置已保存。', settingsFailed: '设置操作失败。',
        workerModel: 'Worker 模型', workerModelHint: '留空时跟随 DSH 默认模型。',
        modelProvider: '服务商', modelName: '模型', modelEffort: '推理强度（可选）',
        modelInherit: '继承 DSH 默认值', modelEffortDefault: '模型默认',
        defaultModel: 'DSH 当前默认：{model}', defaultModelUnavailable: 'DSH 默认模型暂不可用',
        modelCatalogError: '无法加载模型建议，仍可填写已知的服务商和模型：{error}',
        maxWorkers: '并发 worker 上限', maxWorkersHint: '超过上限的任务排队等待；review 不计入并发。',
        saveSettings: '保存', settingsInvalid: '请填写服务商和模型，或把三个模型字段都留空。',
        queued: '排队中',
      },
    }
    // Page, rows and controls use only `--dsw-alias-*` theme tokens.
    const styles = `
      .sl-board{box-sizing:border-box;height:100%;min-height:0;overflow:hidden;container-type:inline-size;display:flex;flex-direction:column;padding:28px clamp(24px,4vw,48px) 0;padding-inline-start:max(clamp(24px,4vw,48px),var(--dsh-frame-leading-clearance,0px));color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
      html[data-platform='darwin'] .sl-board{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
      .sl-column{display:flex;flex:1;flex-direction:column;gap:16px;min-height:0;width:100%;max-width:960px;margin:0 auto}
      .sl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px 16px;flex-wrap:wrap}
      .sl-head__text{display:flex;flex-direction:column;gap:4px;min-width:0}
      .sl-head h1{margin:0;font-size:20px;line-height:28px;font-weight:500;overflow-wrap:anywhere}
      .sl-intro{margin:0;max-width:640px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
      .sl-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .sl-tabs{display:flex;flex:none;align-items:center;gap:2px;border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-tab{position:relative;display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;height:32px;padding:0 12px;border:0;border-radius:8px 8px 0 0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:13px;line-height:20px;white-space:nowrap;cursor:pointer}
      .sl-tab:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}
      .sl-tab[aria-selected='true']{color:var(--dsw-alias-label-primary);font-weight:500}
      .sl-tab[aria-selected='true']::after{content:'';position:absolute;left:8px;right:8px;bottom:-0.5px;height:2px;border-radius:2px;background:var(--dsw-alias-brand-primary)}
      .sl-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .sl-tab__count{color:var(--dsw-alias-label-caption);font-size:12px;line-height:18px;font-weight:400;font-variant-numeric:tabular-nums}
      .sl-body{display:flex;flex:1;flex-direction:column;gap:12px;min-height:0}
      .sl-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-bottom:40px}
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
      .sl-task__title{display:flex;align-items:flex-start;gap:8px;min-width:0;font-size:14px;line-height:20px;font-weight:500;overflow-wrap:anywhere}
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
      .sl-settings{display:flex;flex:1;flex-direction:column;gap:16px;min-height:0;max-width:640px;padding-top:8px;overflow-y:auto}
      .sl-settings__group{display:flex;flex-direction:column;gap:12px;padding:16px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:12px}
      .sl-settings__title{margin:0;font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary)}
      .sl-settings__field{display:flex;flex-direction:column;gap:4px;min-width:0}
      .sl-settings__field label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
      .sl-settings__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .sl-settings__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .sl-memory-usage{display:flex;flex:none;align-items:center;flex-wrap:wrap;gap:4px 14px;min-width:0;padding:8px 0;border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-memory-tools{display:flex;flex:none;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap}
      .sl-memory-filters{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px}
      .sl-input{box-sizing:border-box;height:28px;min-width:180px;max-width:100%;padding:0 8px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px}
      .sl-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .sl-memory{display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px 8px;border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-memory__head{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;min-width:0}
      .sl-memory__head .sl-check{align-self:flex-start;margin-top:2px}
      .sl-check{flex:none;width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
      .sl-check:disabled{cursor:not-allowed}
      .sl-task__title .sl-check{margin-top:3px}
      .sl-batch{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-batch .sl-hint{flex:1 1 auto}
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
        .sl-settings__grid{grid-template-columns:minmax(0,1fr)}
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
      const [tab, setTab] = useState('tasks')
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
      const [settingsPhase, setSettingsPhase] = useState('loading')
      const [settingsCatalog, setSettingsCatalog] = useState(undefined)
      const [settingsLimits, setSettingsLimits] = useState(undefined)
      const [workerProvider, setWorkerProvider] = useState('')
      const [workerModel, setWorkerModel] = useState('')
      const [workerEffort, setWorkerEffort] = useState('')
      const [maxWorkers, setMaxWorkers] = useState('3')
      const [settingsPending, setSettingsPending] = useState(false)
      const [settingsError, setSettingsError] = useState('')
      const [settingsNotice, setSettingsNotice] = useState('')
      const [selectedTasks, setSelectedTasks] = useState([])
      const [selectedMemory, setSelectedMemory] = useState([])
      const [batch, setBatch] = useState('')
      const [batchPending, setBatchPending] = useState(false)
      const [batchError, setBatchError] = useState('')
      const active = useRef(null)
      const headingId = useId()

      const readMemoryView = async signal => {
        const response = await fetch('/superagent-lite/memory', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store', signal,
        })
        if (!response.ok) throw new Error('Memory unavailable')
        const value = await response.json()
        if (!Array.isArray(value?.records)) throw new Error('Invalid memory list')
        return {
          records: value.records.filter(record => record?.id && MEMORY_CATEGORIES.includes(record.category)),
          injection: value.injection?.profile && Array.isArray(value.injection.profile.recordIds)
            ? value.injection.profile : undefined,
        }
      }

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
            const view = await readMemoryView(controller.signal)
            if (controller.signal.aborted) return
            setMemories(view.records)
            setMemoryInjection(view.injection)
            setMemoryPhase('ready')
          } catch {
            if (!controller.signal.aborted) {
              setMemories([])
              setMemoryInjection(undefined)
              setMemoryPhase('error')
            }
          }
        }
        async function loadSettings() {
          try {
            const response = await fetch('/superagent-lite/settings', {
              method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            })
            if (!response.ok) throw new Error('Settings unavailable')
            const value = await response.json()
            if (controller.signal.aborted) return
            const loaded = value?.settings ?? {}
            const selected = loaded.workerModel ?? {}
            setWorkerProvider(typeof selected.provider === 'string' ? selected.provider : '')
            setWorkerModel(typeof selected.model === 'string' ? selected.model : '')
            setWorkerEffort(typeof selected.reasoningEffort === 'string' ? selected.reasoningEffort : '')
            setMaxWorkers(String(loaded.maxWorkers ?? 3))
            setSettingsCatalog(value?.catalog)
            setSettingsLimits(value?.limits?.maxWorkers)
            setSettingsPhase('ready')
          } catch {
            if (!controller.signal.aborted) setSettingsPhase('error')
          }
        }
        void load()
        void loadMemory()
        void loadSettings()
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
      const deletableTask = task => task.queued === true || task.status !== 'running' || task.unconfirmed === true
      const selectedTaskRows = tasks.filter(task => selectedTasks.includes(task.id) && deletableTask(task))
      const selectedMemoryRows = memories.filter(record => selectedMemory.includes(memoryKey(record)))

      const refresh = () => {
        active.current?.abort()
        setPhase('loading')
        setMemoryPhase('loading')
        setSettingsPhase('loading')
        setSettingsError('')
        setSettingsNotice('')
        setSettingsPending(false)
        setOpenFailed(false)
        setError('')
        setNotice('')
        setMemoryEditing('')
        setMemoryConfirm('')
        setMemoryPending('')
        setMemoryError('')
        setMemoryNotice('')
        setSelectedTasks([])
        setSelectedMemory([])
        setBatch('')
        setBatchError('')
        setBatchPending(false)
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
        setSelectedMemory(current => current.filter(value => value !== memoryKey(record)))
      }
      const cancelMemoryEdit = () => {
        setMemoryEditing('')
        setMemoryText('')
      }
      const toggleTaskSelection = taskId => setSelectedTasks(current => current.includes(taskId)
        ? current.filter(value => value !== taskId) : [...current, taskId])
      const toggleMemorySelection = key => setSelectedMemory(current => current.includes(key)
        ? current.filter(value => value !== key) : [...current, key])
      const clearSelection = () => {
        setSelectedTasks([])
        setSelectedMemory([])
      }
      const openBatch = kind => {
        setBatch(kind)
        setBatchError('')
        setDialog(null)
      }
      const memoryRequest = async (record, action, extra = {}) => {
        const body = { action, category: record.category, id: record.id, ...extra }
        if (record.category === 'team') {
          body.teamId = record.teamId
          body.projectRoot = record.projectRoot
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
        return value
      }
      const memoryAction = async (record, action) => {
        const key = memoryKey(record)
        setMemoryPending(key)
        setMemoryError('')
        setMemoryNotice('')
        try {
          const extra = action === 'update'
            ? { [record.category === 'private' ? 'credentialRef' : 'content']: memoryText } : {}
          const value = await memoryRequest(record, action, extra)
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
            await readMemoryView().then(view => {
              setMemories(view.records)
              setMemoryInjection(view.injection)
            }).catch(() => {})
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
      const confirmBatch = async () => {
        if (!batch) return
        setBatchPending(true)
        setBatchError('')
        if (batch === 'tasks') {
          setError('')
          const removed = []
          const failed = []
          for (const task of selectedTaskRows) {
            try {
              await removeTask(task.id)
              removed.push(task.id)
            } catch (error) {
              failed.push({ id: task.id, message: typeof error?.message === 'string' && error.message ? error.message : t('actionFailed') })
            }
          }
          if (removed.length > 0) {
            setTasks(current => current.filter(task => !removed.includes(task.id)))
            setNotice(t('batchTasksDeleted'))
          }
          setSelectedTasks(failed.map(item => item.id))
          if (failed.length > 0) {
            const message = [...new Set(failed.map(item => item.message))].join('; ')
            setError(message)
            setBatchError(message)
          } else {
            setBatch('')
          }
          setBatchPending(false)
          return
        }
        if (batch !== 'memory') {
          setBatchPending(false)
          return
        }
        setMemoryError('')
        const removed = []
        const failed = []
        for (const record of selectedMemoryRows) {
          try {
            await memoryRequest(record, 'delete')
            removed.push(record)
          } catch (error) {
            failed.push({ record, message: typeof error?.message === 'string' && error.message ? error.message : t('memoryFailed') })
          }
        }
        const removedKeys = new Set(removed.map(memoryKey))
        if (removed.length > 0) {
          setMemories(current => current.filter(record => !removedKeys.has(memoryKey(record))))
          setMemoryInjection(current => current ? {
            ...current,
            recordIds: current.recordIds.filter(id => !removed.some(record => record.category === 'profile' && record.id === id)),
          } : current)
          setMemoryNotice(t('batchMemoryDeleted'))
        }
        setSelectedMemory(failed.map(item => memoryKey(item.record)))
        if (failed.length > 0) {
          const message = [...new Set(failed.map(item => item.message))].join('; ')
          setMemoryError(message)
          setBatchError(message)
        } else {
          setBatch('')
        }
        if (removed.some(record => record.category === 'profile')) {
          await readMemoryView().then(view => {
            setMemories(view.records)
            setMemoryInjection(view.injection)
          }).catch(() => {})
        }
        setBatchPending(false)
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
      const saveSettings = async () => {
        const provider = workerProvider.trim()
        const name = workerModel.trim()
        const effort = workerEffort.trim()
        if ((provider || name || effort) && (!provider || !name)) {
          setSettingsError(t('settingsInvalid'))
          return
        }
        const limit = Number(maxWorkers)
        const min = settingsLimits?.min ?? 1
        const max = settingsLimits?.max ?? 16
        if (!Number.isInteger(limit) || limit < min || limit > max) {
          setSettingsError(t('settingsInvalid'))
          return
        }
        setSettingsPending(true)
        setSettingsError('')
        setSettingsNotice('')
        try {
          const response = await fetch('/superagent-lite/settings', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workerModel: provider ? { provider, model: name, ...(effort ? { reasoningEffort: effort } : {}) } : null,
              maxWorkers: limit,
            }),
          })
          let value
          try {
            value = await response.json()
          } catch {
            value = undefined
          }
          if (!response.ok) throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('settingsFailed'))
          const saved = value?.settings ?? {}
          const selected = saved.workerModel ?? {}
          setWorkerProvider(typeof selected.provider === 'string' ? selected.provider : '')
          setWorkerModel(typeof selected.model === 'string' ? selected.model : '')
          setWorkerEffort(typeof selected.reasoningEffort === 'string' ? selected.reasoningEffort : '')
          setMaxWorkers(String(saved.maxWorkers ?? limit))
          setSettingsNotice(t('settingsSaved'))
        } catch (actionError) {
          setSettingsError(typeof actionError?.message === 'string' && actionError.message ? actionError.message : t('settingsFailed'))
        } finally {
          setSettingsPending(false)
        }
      }
      const mergedTask = (task, value) => {
        const view = value?.view
        const git = view?.git ?? {
          ...task.git,
          merged: true, unmerged: false,
          canMerge: false, canPublish: false, canReview: false, canDelete: true,
          mergeReason: 'This branch is already merged',
          publishReason: 'This branch is already merged',
          reviewReason: 'This task is already merged',
        }
        return {
          ...task,
          status: view?.status ?? 'completed',
          git,
          ...(typeof value?.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
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
          if (action === 'merge') {
            setTasks(current => current.map(item => item.id === task.id ? mergedTask(item, value) : item))
          } else {
            refresh()
          }
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
        const deletable = deletableTask(task)
        return h('li', { key: task.id, className: 'sl-task' },
          h('div', { className: 'sl-task__stage' }, statusMark(task.status)),
          h('div', { className: 'sl-task__body' },
            h('div', { className: 'sl-task__title' },
              h('input', {
                className: 'sl-check', type: 'checkbox',
                checked: selectedTasks.includes(task.id),
                disabled: busy || !deletable,
                title: deletable ? undefined : t('deleteTaskUnavailable'),
                'aria-label': `${t('selectTask')}: ${task.title || task.id}`,
                onChange: () => toggleTaskSelection(task.id),
              }),
              h('span', null, task.title || task.id)),
            h('div', { className: 'sl-task__meta' },
              chip('team', task.teamId),
              chip('project', task.projectRoot),
              updated && h('span', { className: 'sl-lv' },
                h('span', { className: 'sl-lv__label' }, t('updated')),
                h('span', { className: 'sl-lv__value' }, updated)),
              task.unconfirmed && h('span', { className: 'sl-tag', 'data-tone': 'warning' }, t('unconfirmed')),
              task.queued && h('span', { className: 'sl-tag', 'data-tone': 'neutral' }, t('queued')),
              task.land && h('span', { className: 'sl-tag', 'data-tone': 'success' }, t('landAuthorized')),
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
            h('input', {
              key: 'select', className: 'sl-check', type: 'checkbox',
              checked: selectedMemory.includes(key),
              disabled: pending || editing,
              'aria-label': `${t('selectMemory')}: ${value || record.id}`,
              onChange: () => toggleMemorySelection(key),
            }),
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
                    key: 'confirm', type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger',
                    disabled: pending, onClick: () => void memoryAction(record, 'delete'),
                  }, t('memoryConfirmDelete'))
                  : h('button', {
                    key: 'delete', type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger',
                    disabled: pending || editing,
                    onClick: () => {
                      setMemoryConfirm(key)
                      setMemoryEditing('')
                      setMemoryError('')
                      setMemoryNotice('')
                    },
                  }, icon('trash'), t('memoryDelete')),
                confirming && h('button', {
                  key: 'cancel-delete', type: 'button', className: 'sl-btn',
                  disabled: pending, onClick: () => setMemoryConfirm(''),
                }, t('memoryCancel')),
              ]),
            pending && h('span', { key: 'pending', className: 'sl-hint' }, t('working'))))
      }

      const batchDialog = () => {
        if (!batch) return null
        const memory = batch === 'memory'
        const count = memory ? selectedMemoryRows.length : selectedTaskRows.length
        const title = memory ? t('batchMemoryTitle') : t('batchTasksTitle')
        return h('div', { className: 'sl-modal-backdrop' },
          h('div', { className: 'sl-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
            h('h2', null, title),
            h('p', null, memory ? t('batchMemoryHint') : t('batchTasksHint')),
            h('p', { className: 'sl-hint' }, `${t('selectedCount')} ${count}`),
            batchError && h('p', { role: 'alert', className: 'sl-error' }, batchError),
            h('div', { className: 'sl-modal__actions' },
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline', disabled: batchPending,
                onClick: () => {
                  setBatch('')
                  setBatchError('')
                },
              }, t('cancel')),
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--primary',
                disabled: batchPending || count === 0, onClick: () => void confirmBatch(),
              }, t('confirmDelete')))))
      }

      const taskView = tab === 'tasks'
      const memoryView = tab === 'memory'
      const settingsView = tab === 'settings'
      const tasksTabId = `${headingId}-tasks-tab`
      const memoryTabId = `${headingId}-memory-tab`
      const settingsTabId = `${headingId}-settings-tab`
      const settingsGroups = Array.isArray(settingsCatalog?.groups) ? settingsCatalog.groups : []
      const settingsProviders = settingsGroups.map(group => group.id)
      const selectedGroup = settingsGroups.find(group => group.id === workerProvider.trim())
      const settingsModels = selectedGroup?.models ?? []
      const selectedModel = settingsModels.find(candidate => candidate.id === workerModel.trim())
      const settingsEfforts = selectedModel?.reasoning?.efforts ?? []
      const settingsDefault = settingsCatalog?.default
      const settingsDefaultLabel = settingsDefault
        ? `${settingsDefault.provider} / ${settingsDefault.model}${settingsDefault.reasoningEffort ? ` · ${settingsDefault.reasoningEffort}` : ''}`
        : undefined
      const settingsField = (label, control) => h('div', { className: 'sl-settings__field' },
        h('label', { htmlFor: control.props?.id }, t(label)), control)
      const settingsInput = (label, id, list, value, set) => settingsField(label, h('input', {
        className: 'sl-input', id, list, value, placeholder: t('modelInherit'), spellCheck: false,
        onChange: event => set(event.target.value),
      }))
      const settingsViewPanel = () => h('div', { className: 'sl-body', role: 'tabpanel', 'aria-labelledby': settingsTabId },
        settingsPhase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
        settingsPhase === 'error' && h('p', { className: 'sl-error', role: 'alert' }, t('settingsLoadFailed')),
        settingsPhase === 'ready' && h('div', { className: 'sl-settings' },
          h('p', { className: 'sl-hint' },
            settingsDefaultLabel ? t('defaultModel', { model: settingsDefaultLabel }) : t('defaultModelUnavailable')),
          h('section', { className: 'sl-settings__group' },
            h('h2', { className: 'sl-settings__title' }, t('workerModel')),
            h('p', { className: 'sl-hint' }, t('workerModelHint')),
            h('div', { className: 'sl-settings__grid' },
              settingsInput('modelProvider', `${headingId}-provider`, `${headingId}-providers`, workerProvider, setWorkerProvider),
              settingsInput('modelName', `${headingId}-model`, `${headingId}-models`, workerModel, setWorkerModel),
              settingsInput('modelEffort', `${headingId}-effort`, `${headingId}-efforts`, workerEffort, setWorkerEffort)),
            h('datalist', { id: `${headingId}-providers` },
              ...settingsProviders.map(provider => h('option', { key: provider, value: provider }))),
            h('datalist', { id: `${headingId}-models` },
              ...settingsModels.map(model => h('option', { key: model.id, value: model.id }, model.name))),
            h('datalist', { id: `${headingId}-efforts` },
              ...settingsEfforts.map(effort => h('option', { key: effort.id, value: effort.id }, effort.name)))),
          h('section', { className: 'sl-settings__group' },
            h('h2', { className: 'sl-settings__title' }, t('maxWorkers')),
            h('p', { className: 'sl-hint' }, t('maxWorkersHint')),
            settingsField('maxWorkers', h('input', {
              id: `${headingId}-max-workers`, className: 'sl-input', type: 'number', value: maxWorkers,
              min: settingsLimits?.min ?? 1, max: settingsLimits?.max ?? 16,
              onChange: event => setMaxWorkers(event.target.value),
            }))),
          settingsError && h('p', { className: 'sl-error', role: 'alert' }, settingsError),
          settingsNotice && h('p', { className: 'sl-notice', role: 'status' }, settingsNotice),
          h('div', { className: 'sl-settings__actions' },
            h('button', {
              type: 'button', className: 'sl-btn sl-btn--primary', disabled: settingsPending,
              onClick: () => void saveSettings(),
            }, t('saveSettings')))))
      return h('section', { className: 'sl-board', 'aria-labelledby': headingId },
        h('style', null, styles),
        h('div', { className: 'sl-column' },
          h('header', { className: 'sl-head' },
            h('div', { className: 'sl-head__text' },
              h('h1', { id: headingId }, t(taskView ? 'title' : memoryView ? 'memoryTitle' : 'settingsTitle')),
              h('p', { className: 'sl-intro' }, t(taskView ? 'intro' : memoryView ? 'memoryIntro' : 'settingsIntro'))),
            h('div', { className: 'sl-toolbar' },
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline',
                onClick: refresh,
                disabled: taskView ? phase === 'loading' : memoryView ? memoryPhase === 'loading' : settingsPhase === 'loading',
              }, icon('refresh'), t('refresh')))),
          h('div', { className: 'sl-tabs', role: 'tablist', 'aria-label': t('views') },
            h('button', {
              id: tasksTabId, type: 'button', role: 'tab', className: 'sl-tab',
              'aria-selected': taskView,
              onClick: () => setTab('tasks'),
            }, t('title')),
            h('button', {
              id: memoryTabId, type: 'button', role: 'tab', className: 'sl-tab',
              'aria-selected': memoryView,
              onClick: () => setTab('memory'),
            }, t('memoryTitle'),
            memories.length > 0 && h('span', { className: 'sl-tab__count' }, String(memories.length))),
            h('button', {
              id: settingsTabId, type: 'button', role: 'tab', className: 'sl-tab',
              'aria-selected': settingsView,
              onClick: () => setTab('settings'),
            }, t('settingsTitle'))),
          taskView
            ? h('div', { className: 'sl-body', role: 'tabpanel', 'aria-labelledby': tasksTabId },
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
              selectedTaskRows.length > 0 && h('div', { className: 'sl-batch' },
                h('span', { className: 'sl-hint' }, `${t('selectedCount')} ${selectedTaskRows.length}`),
                h('button', {
                  type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger', disabled: batchPending,
                  onClick: () => openBatch('tasks'),
                }, icon('trash'), t('deleteSelected')),
                h('button', {
                  type: 'button', className: 'sl-btn', disabled: batchPending, onClick: clearSelection,
                }, t('clearSelection'))),
              phase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
              phase === 'error' && h('p', { className: 'sl-error', role: 'alert' }, t('loadFailed')),
              openFailed && h('p', { className: 'sl-error', role: 'alert' }, t('openFailed')),
              error && h('p', { className: 'sl-error', role: 'alert' }, error),
              notice && h('p', { className: 'sl-notice', role: 'status' }, notice),
              phase === 'ready' && tasks.length === 0 && h('p', { className: 'sl-hint', role: 'status' }, t('empty')),
              phase === 'ready' && tasks.length > 0 && shown.length === 0 &&
                h('p', { className: 'sl-hint', role: 'status' }, t(category ? 'emptyCategory' : 'noMatch')),
              shown.length > 0 && h('div', { className: 'sl-scroll' },
                h('div', { className: 'sl-groups' },
                  ...groups.map(group => h('section', { key: group.key, className: 'sl-group' },
                    h('h2', { className: 'sl-group__title' },
                      statusLabel(group.key),
                      h('span', { className: 'sl-group__count' }, String(group.tasks.length))),
                    h('ul', { className: 'sl-list' }, ...group.tasks.map(taskRow)))))))
            : memoryView ? h('div', { className: 'sl-body', role: 'tabpanel', 'aria-labelledby': memoryTabId },
              memoryPhase === 'ready' && h('div', { className: 'sl-memory-usage', 'aria-label': t('memoryUsage') },
                ...MEMORY_CATEGORIES.map(key => h('span', { key, className: 'sl-lv' },
                  h('span', { className: 'sl-lv__label' }, t(`memoryUsage.${key}`)),
                  h('span', { className: 'sl-lv__value' }, String(memoryCounts[key]))))),
              memoryInjection && h('p', { className: 'sl-hint' },
                `${t('memoryInjection')} ${memoryInjection.recordIds.length}/${memoryInjection.limit} ${t('memoryInjectionTail')}`),
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
                  h('span', { className: 'sl-filter__count' }, String(memoryCounts[key]))))),
                h('input', {
                  className: 'sl-input', type: 'search', value: memorySearch,
                  placeholder: t('memorySearch'), 'aria-label': t('memorySearch'),
                  onChange: event => setMemorySearch(event.target.value),
                })),
              selectedMemoryRows.length > 0 && h('div', { className: 'sl-batch' },
                h('span', { className: 'sl-hint' }, `${t('selectedCount')} ${selectedMemoryRows.length}`),
                h('button', {
                  type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger', disabled: batchPending,
                  onClick: () => openBatch('memory'),
                }, icon('trash'), t('deleteSelected')),
                h('button', {
                  type: 'button', className: 'sl-btn', disabled: batchPending, onClick: clearSelection,
                }, t('clearSelection'))),
              memoryError && h('p', { role: 'alert', className: 'sl-error' }, memoryError),
              memoryNotice && h('p', { role: 'status', className: 'sl-notice' }, memoryNotice),
              memoryPhase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
              memoryPhase === 'error' && h('p', { role: 'alert', className: 'sl-error' }, t('memoryLoadFailed')),
              memoryPhase === 'ready' && memories.length === 0 &&
                h('p', { role: 'status', className: 'sl-hint' }, t('memoryEmpty')),
              memoryPhase === 'ready' && memories.length > 0 && shownMemory.length === 0 &&
                h('p', { className: 'sl-hint', role: 'status' }, t('memoryNoMatch')),
              shownMemory.length > 0 && h('div', { className: 'sl-scroll' },
                h('ul', { className: 'sl-list' }, ...shownMemory.map(memoryRow))))
            : settingsViewPanel()
        ),
        dialogView(),
        batchDialog())
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
