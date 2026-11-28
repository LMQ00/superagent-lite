window.__ModuleLoader__.load({
  id: '@lmq00/superagent-lite',
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
        unconfirmed: 'Not confirmed', landAuthorized: 'Landing authorized',
        merge: 'Merge', publish: 'Send pull request', review: 'Review', deleteBranch: 'Delete branch', deleteTask: 'Delete task',
        mergeTitle: 'Merge into a branch', mergeTarget: 'Merge target', publishTitle: 'Send a pull request',
        publishRemote: 'Repository', ghRequired: 'A GitHub account is required:',
        noBranch: 'No merge target is available.', noRemote: 'No repository is available.',
        deleteTitle: 'Delete the worker branch', deleteHint: 'The reviewed commit is merged. Delete the worker branch and its worktree.',
        deleteUnmergedHint: 'This worker branch is not merged. Deleting it discards the branch and its worktree; this cannot be undone.',
        deleteTaskTitle: 'Delete the task', deleteTaskHint: 'A running or queued worker is stopped first, then the task record is removed from this panel. Any worker branch and worktree are kept.',
        deleteTaskUnavailable: 'A merge or publication is in progress; wait for it to finish before deleting the task.',
        selectTask: 'Select task', selectedCount: 'Selected',
        clearSelection: 'Clear selection', deleteSelected: 'Delete selected',
        batchTasksTitle: 'Delete selected tasks',
        batchTasksHint: 'The selected task records will be removed from this panel. Running or queued workers are stopped first. Any worker branch and worktree are kept.',
        batchTasksDeleted: 'Selected tasks deleted.',
        stop: 'Stop', stopTitle: 'Stop the worker and release its concurrency slot', stopDone: 'Task stopped; the worker was interrupted and its concurrency slot is free.',
        confirmMerge: 'Merge', confirmPublish: 'Send', confirmDelete: 'Delete', cancel: 'Cancel',
        working: 'Working…', dialogLoading: 'Loading…', actionFailed: 'The action failed.',
        actionDone: 'Action completed.', reviewApproved: 'Review approved.', reviewRejected: 'Review requested changes:',
        failure: 'Failure',
        cancelled: 'Cancelled',
        views: 'Panel views',
        workerSettingsTitle: 'Settings', workerSettingsIntro: 'Defaults for dispatched workers. Saved settings apply to new workers only.',
        workerSettingsLoadFailed: 'Could not load settings. Try refreshing.',
        workerSettingsSaved: 'Settings saved.', workerSettingsFailed: 'The settings action failed.',
        workerModel: 'Worker model', workerModelHint: 'Leave blank to inherit the DSH default model.',
        modelProvider: 'Provider', modelName: 'Model', modelEffort: 'Reasoning effort (optional)',
        modelInherit: 'Inherit the DSH default',
        defaultModel: 'DSH default: {model}', defaultModelUnavailable: 'The DSH default model is unavailable',
        maxWorkers: 'Concurrent workers', maxWorkersHint: 'Tasks beyond the limit wait in the queue. Reviews do not count.',
        saveSettings: 'Save', settingsInvalid: 'Enter a provider and model, or leave all three model fields blank.',
        queued: 'Queued',
        memoryTab: 'Memory', memoryTitle: 'Memory',
        memoryIntro: 'View and delete saved project memory, memory-managed skills and global/project knowledge. The memory role maintains them when a task ends.',
        memoryProjectLabel: 'Project', memoryGlobal: 'Global memory', memoryProject: 'Project memory',
        memoryKnowledge: 'Global knowledge base', memoryProjectKnowledge: 'Project knowledge base',
        memoryUserProfile: 'User profile',
        memoryResponsibilities: 'Responsibilities', memoryPositioning: 'Positioning',
        memoryGlobalSkills: 'Global skills', memoryProjectSkills: 'Project skills',
        memoryNotSaved: 'Not saved', memoryEmptyKnowledge: 'No knowledge entries yet.',
        memoryEmptyProjectKnowledge: 'No project knowledge entries yet.',
        memoryLoadFailed: 'Could not load memory. Try refreshing.',
        memoryNoProject: 'No task identifies a project yet; only global memory and knowledge are shown.',
        memoryDelete: 'Delete', memoryDeleteTitle: 'Delete memory content',
        memoryDeleteHint: 'The selected content is removed from memory storage and cannot be restored.',
        memoryDeleteFieldHint: 'The saved memory field is cleared.',
        memoryDeleteSkillHint: 'Later sessions no longer see this skill:',
        memoryDeleteKnowledgeHint: 'The entry is removed from the knowledge base, so queries no longer return it.',
        memoryDeleted: 'Memory content deleted.', memoryDeleteFailed: 'Could not delete the memory content.',
        memorySearch: 'Search memory', memorySearchPlaceholder: 'Filter memory, skills and knowledge…',
        memoryNoMatch: 'No memory content matches the search.',
        memoryGlobalHint: 'Shared by all projects.', memoryProjectHint: 'Scoped to the current project.',
        memoryKnowledgeHint: 'Shared by all projects and queried on demand.',
        memoryProjectKnowledgeHint: 'Saved for this project only and queried on demand.',
        memoryExpand: 'Show more', memoryCollapse: 'Show less',
        branchesTab: 'Branches', branchesTitle: 'Branches / worktrees',
        branchesIntro: 'Lists only the worktrees this plugin created under .agents/worktrees and its sl-* worker branches. Your own branches, other worktrees and master never appear here.',
        branchesLoadFailed: 'Could not load branches. Try refreshing.',
        branchesEmpty: 'No worktrees or branches created by this plugin.',
        branchesOnlyPlugin: 'Only plugin-created worktrees and sl-* branches are shown or deletable here.',
        branchesProject: 'Project', branchesWorktree: 'Worktree', branchesTask: 'Task',
        branchesNoTask: 'No task record', branchesNoWorktree: 'No worktree',
        deleteWorktree: 'Delete worktree', deleteWorktreeTitle: 'Delete the worktree',
        deleteBoth: 'Delete worktree and branch', deleteBothTitle: 'Delete the worktree and branch',
        deleteBranchTitle: 'Delete the branch',
        deleteWorktreeHint: 'Removes this worktree and keeps its worker branch. This cannot be undone.',
        deleteBothHint: 'Removes this worktree and deletes its worker branch in one step. Commits on the branch that are not merged into the base branch are lost; this cannot be undone.',
        deleteBranchHint: 'Deletes this worker branch. Its worktree is already removed; the branch cannot be restored.',
        branchesDeleted: 'Done.', branchesDeleteFailed: 'Could not delete it.',
        hostReadonlyTitle: 'Desktop runtime is read-only; task card patch unavailable',
        hostReadonlyBody: 'This DSH runs from a read-only app.asar, so the plugin cannot patch its bundled Chat client or subagent package. Dispatch, review and report messages will appear as plain text; tasks, reviews and delivery still work.',
        hostReadonlyDiagnostic: 'Diagnostic: runtime directory {dir}',
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
        unconfirmed: '未确认', landAuthorized: '已授权落地',
        merge: '合并', publish: '提交 PR', review: '审查', deleteBranch: '删除分支', deleteTask: '删除任务',
        mergeTitle: '合并到分支', mergeTarget: '目标分支', publishTitle: '提交 PR',
        publishRemote: '提交仓库', ghRequired: '需要 gh 账号：',
        noBranch: '没有可选的合并目标分支。', noRemote: '没有可选的仓库。',
        deleteTitle: '删除修改分支', deleteHint: '已审查的提交已合并，可删除该修改分支及其工作树。',
        deleteUnmergedHint: '该修改分支尚未合并，删除会丢弃该分支及其工作树，且无法恢复。',
        deleteTaskTitle: '删除任务', deleteTaskHint: '运行中或排队中的 worker 会先被停止，确认停止后再从面板移除任务记录；worker 分支和工作树（如有）会保留。',
        deleteTaskUnavailable: '合并或发布正在进行，结束后才能删除任务。',
        selectTask: '选择任务', selectedCount: '已选择',
        clearSelection: '清除选择', deleteSelected: '删除所选',
        batchTasksTitle: '删除所选任务',
        batchTasksHint: '所选任务记录将从面板移除；运行中或排队中的 worker 会先被停止；worker 分支和工作树（如有）会保留。',
        batchTasksDeleted: '所选任务已删除。',
        stop: '停止', stopTitle: '停止 worker 并释放并发名额', stopDone: '任务已停止；worker 已中断，并发名额已释放。',
        confirmMerge: '合并', confirmPublish: '提交', confirmDelete: '删除', cancel: '取消',
        working: '处理中…', dialogLoading: '正在加载…', actionFailed: '操作失败。',
        actionDone: '操作已完成。', reviewApproved: '审查已通过。', reviewRejected: '审查未通过：',
        failure: '失败原因',
        cancelled: '已取消',
        views: '面板分区',
        workerSettingsTitle: '设置', workerSettingsIntro: '派发 worker 的默认值。保存后只影响新启动的 worker。',
        workerSettingsLoadFailed: '无法加载设置，请重试。',
        workerSettingsSaved: '设置已保存。', workerSettingsFailed: '设置操作失败。',
        workerModel: 'Worker 模型', workerModelHint: '留空时跟随 DSH 默认模型。',
        modelProvider: '服务商', modelName: '模型', modelEffort: '推理强度（可选）',
        modelInherit: '继承 DSH 默认值',
        defaultModel: 'DSH 当前默认：{model}', defaultModelUnavailable: 'DSH 默认模型暂不可用',
        maxWorkers: '并发 worker 上限', maxWorkersHint: '超过上限的任务排队等待；review 不计入并发。',
        saveSettings: '保存', settingsInvalid: '请填写服务商和模型，或把三个模型字段都留空。',
        queued: '排队中',
        memoryTab: '记忆系统', memoryTitle: '记忆系统',
        memoryIntro: '查看并删除保存的项目记忆、由 memory 管理的 skill 和全局/项目知识库。记忆由 memory 角色在任务收尾时写入。',
        memoryProjectLabel: '项目', memoryGlobal: '全局记忆', memoryProject: '项目记忆',
        memoryKnowledge: '全局知识库', memoryProjectKnowledge: '项目知识库', memoryUserProfile: '用户画像',
        memoryResponsibilities: '责任', memoryPositioning: '定位',
        memoryGlobalSkills: '全局 skill', memoryProjectSkills: '项目 skill',
        memoryNotSaved: '未保存', memoryEmptyKnowledge: '暂无知识库条目。',
        memoryEmptyProjectKnowledge: '暂无项目知识库条目。',
        memoryLoadFailed: '无法加载记忆，请重试。',
        memoryNoProject: '当前没有任务可确定项目，只显示全局记忆和知识库。',
        memoryDelete: '删除', memoryDeleteTitle: '删除记忆内容',
        memoryDeleteHint: '所选内容会从记忆存储中删除，且无法恢复。',
        memoryDeleteFieldHint: '该记忆字段会被清空。',
        memoryDeleteSkillHint: '之后新派发的会话不再看到该 skill：',
        memoryDeleteKnowledgeHint: '该条目会从知识库删除，之后的查询不再返回它。',
        memoryDeleted: '记忆内容已删除。', memoryDeleteFailed: '无法删除记忆内容，请重试。',
        memorySearch: '搜索记忆', memorySearchPlaceholder: '按关键词筛选记忆、skill 和知识库…',
        memoryNoMatch: '没有匹配关键词的记忆内容。',
        memoryGlobalHint: '所有项目共享。', memoryProjectHint: '仅在当前项目生效。',
        memoryKnowledgeHint: '所有项目共享，按需查询。',
        memoryProjectKnowledgeHint: '仅保存给当前项目，按需查询。',
        memoryExpand: '展开', memoryCollapse: '收起',
        branchesTab: '分支 / worktree', branchesTitle: '分支 / worktree',
        branchesIntro: '只列出本插件在 .agents/worktrees 下创建的 worktree 和 sl-* 工作分支；你自己的分支、其他 worktree 和 master 不会出现在这里。',
        branchesLoadFailed: '无法加载分支和 worktree，请重试。',
        branchesEmpty: '本插件没有创建 worktree 或分支。',
        branchesOnlyPlugin: '这里只显示和删除本插件创建的 worktree 与 sl-* 分支。',
        branchesProject: '项目', branchesWorktree: 'worktree', branchesTask: '任务',
        branchesNoTask: '无任务记录', branchesNoWorktree: '无 worktree',
        deleteWorktree: '删除 worktree', deleteWorktreeTitle: '删除 worktree',
        deleteBoth: '删除 worktree 和分支', deleteBothTitle: '删除 worktree 和分支',
        deleteBranchTitle: '删除分支',
        deleteWorktreeHint: '会移除这个 worktree，保留对应的 worker 分支；此操作无法恢复。',
        deleteBothHint: '会同时移除这个 worktree 的检出并删除对应的 worker 分支；分支上尚未合并的提交会一并丢失，且无法恢复。',
        deleteBranchHint: '会删除这个 worker 分支；对应 worktree 已移除，分支删除后无法恢复。',
        branchesDeleted: '操作已完成。', branchesDeleteFailed: '无法删除，请重试。',
        hostReadonlyTitle: '桌面版内置运行时只读，任务卡补丁不可用',
        hostReadonlyBody: '当前 DSH 从只读的 app.asar 运行，插件无法改写内置的 Chat 客户端和子代理包，派发、审查和报告消息会显示为普通文本；任务执行、审查和交付不受影响。',
        hostReadonlyDiagnostic: '诊断：运行时目录 {dir}',
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
      .sl-alert{display:flex;flex-direction:column;gap:2px;margin:0;padding:10px 12px;border:0.5px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,transparent);border-radius:10px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);overflow-wrap:anywhere}
      .sl-alert strong{font-weight:600;color:var(--dsw-alias-state-warn-primary)}
      .sl-alert p{margin:0;color:var(--dsw-alias-label-secondary)}
      .sl-alert .sl-alert__diagnostic{margin-top:2px;font-family:var(--dsw-font-mono,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
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
      .sl-worker-settings{display:flex;flex:1;flex-direction:column;gap:16px;min-height:0;max-width:640px;padding-top:8px;overflow-y:auto}
      .sl-worker-settings__group{display:flex;flex-direction:column;gap:12px;padding:16px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:12px}
      .sl-worker-settings__title{margin:0;font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary)}
      .sl-worker-settings__field{display:flex;flex-direction:column;gap:4px;min-width:0}
      .sl-worker-settings__field label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
      .sl-worker-settings__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .sl-worker-settings__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .sl-memory{display:flex;flex-direction:column;gap:12px;min-width:0}
      .sl-memory__section{display:flex;flex-direction:column;min-width:0;overflow:hidden;border:0.5px solid var(--dsw-alias-settings-card-stroke);border-radius:12px;background:var(--dsw-alias-settings-card-fill)}
      .sl-memory__head{display:flex;align-items:baseline;gap:8px;padding:12px 14px 0;min-width:0}
      .sl-memory__title{margin:0;font-size:14px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
      .sl-memory__count{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
      .sl-memory__sub{margin:0;padding:2px 14px 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);border-bottom:0.5px solid var(--dsw-alias-border-l3);overflow-wrap:anywhere}
      .sl-memory__search{position:relative;display:flex;flex:1 1 240px;align-items:center;min-width:0;max-width:420px;color:var(--dsw-alias-label-tertiary)}
      .sl-memory__search svg{position:absolute;inset-inline-start:9px;pointer-events:none}
      .sl-memory__search .sl-input{width:100%;min-width:0;padding-inline:30px 26px}
      .sl-memory__more{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;margin-top:2px;padding:2px 0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
      .sl-memory__more:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}
      .sl-memory__more:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .sl-memory-field{display:flex;flex-direction:column;gap:4px;padding:10px 14px;border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-memory-field:last-child{border-bottom:0}
      .sl-memory-field__head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
      .sl-memory-field__label{margin:0;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-tertiary)}
      .sl-memory-field__value{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere}
      .sl-memory-field__value--clamped{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3}
      .sl-memory-entry{display:flex;flex-direction:column;gap:4px;padding:10px 14px;border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-memory-entry:last-child{border-bottom:0}
      .sl-memory-entry__head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-width:0}
      .sl-memory-entry__toggle{display:flex;flex:1;align-items:flex-start;gap:6px;min-width:0;margin:0;padding:0;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer}
      .sl-memory-entry__toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .sl-memory-entry__chevron{flex:none;margin-top:2px;color:var(--dsw-alias-label-tertiary)}
      .sl-memory-entry__summary{display:flex;flex:1;flex-direction:column;gap:2px;min-width:0;padding-inline-start:20px}
      .sl-memory-entry__body{display:flex;flex:1;flex-direction:column;gap:2px;min-width:0}
      .sl-memory-entry__name{display:block;font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
      .sl-memory-entry__toggle:hover .sl-memory-entry__name{color:var(--dsw-alias-label-primary)}
      .sl-memory-entry__text{display:block;margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;overflow-wrap:anywhere}
      .sl-memory-entry__text--clamped{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}
      .sl-memory-entry__content{margin:0;padding:6px 0 0 20px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere}
      .sl-memory-entry__meta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-caption)}
      .sl-memory-skills{display:flex;flex-direction:column;gap:2px;padding:8px 14px 10px}
      .sl-memory-skills__title{margin:0;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-tertiary)}
      .sl-memory .sl-list{margin:0}
      .sl-memory__hint{margin:0;padding:10px 14px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
      .sl-input{box-sizing:border-box;height:28px;min-width:180px;max-width:100%;padding:0 8px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px}
      .sl-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .sl-check{flex:none;width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
      .sl-check:disabled{cursor:not-allowed}
      .sl-task__title .sl-check{margin-top:3px}
      .sl-batch{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--dsw-alias-border-l3)}
      .sl-batch .sl-hint{flex:1 1 auto}
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
        .sl-filters,.sl-scope{width:100%}
        .sl-scope{margin-inline-start:0}
        .sl-worker-settings__grid{grid-template-columns:minmax(0,1fr)}
      }
      @media (prefers-reduced-motion:reduce){
        .sl-spinner g{animation:none}
      }
    `

    const CATEGORY_ORDER = ['unmerged', 'running', 'unreviewed', 'completed', 'failed', 'answer']
    const QUEUE_POLL_MS = 3000
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
        cancel: 'M6 6l12 12M18 6L6 18',
        search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
        chevronRight: 'M9 6l6 6-6 6',
        chevronDown: 'M6 9l6 6 6-6',
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
      const [memoryProject, setMemoryProject] = useState('')
      const [memoryPhase, setMemoryPhase] = useState('loading')
      const [memory, setMemory] = useState({
        global: {}, knowledge: { global: [], project: [] }, skills: { global: [], project: [] },
      })
      const [memoryError, setMemoryError] = useState('')
      const [memoryNotice, setMemoryNotice] = useState('')
      const [memoryDialog, setMemoryDialog] = useState(null)
      const [memoryDialogError, setMemoryDialogError] = useState('')
      const [memoryPending, setMemoryPending] = useState(false)
      const [memoryQuery, setMemoryQuery] = useState('')
      const [memoryExpanded, setMemoryExpanded] = useState({})
      const [branches, setBranches] = useState([])
      const [branchPhase, setBranchPhase] = useState('loading')
      const [branchError, setBranchError] = useState('')
      const [branchNotice, setBranchNotice] = useState('')
      const [branchDialog, setBranchDialog] = useState(null)
      const [branchDialogError, setBranchDialogError] = useState('')
      const [branchPending, setBranchPending] = useState(false)
      const [selectedTasks, setSelectedTasks] = useState([])
      const [batch, setBatch] = useState('')
      const [batchPending, setBatchPending] = useState(false)
      const [batchError, setBatchError] = useState('')
      const [host, setHost] = useState(undefined)
      const active = useRef(null)
      const headingId = useId()
      const queuedPending = phase === 'ready' && tasks.some(task => task.queued === true)

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
            setHost(value.host?.readonly === true ? value.host : undefined)
            setTeam(current => rows.some(task => task.teamId === current) ? current : '')
            setProject(current => rows.some(task => task.projectRoot === current) ? current : '')
            setMemoryProject(current => rows.some(task => task.projectRoot === current)
              ? current : (rows.find(task => typeof task.projectRoot === 'string' && task.projectRoot)?.projectRoot ?? ''))
            setPhase('ready')
          } catch {
            if (!controller.signal.aborted) {
              setTasks([])
              setPhase('error')
            }
          }
        }
        async function loadSettings() {
          try {
            const response = await fetch('/superagent-lite/worker-settings', {
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
        void loadSettings()
        return () => controller.abort()
      }, [revision])

      useEffect(() => {
        if (tab !== 'memory' || phase === 'loading') return () => {}
        const controller = new AbortController()
        setMemoryPhase('loading')
        setMemoryError('')
        setMemoryNotice('')
        async function load() {
          try {
            const query = memoryProject ? `?projectRoot=${encodeURIComponent(memoryProject)}` : ''
            const response = await fetch(`/superagent-lite/memory${query}`, {
              method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            })
            if (!response.ok) throw new Error('Memory unavailable')
            const value = await response.json()
            if (!value || typeof value.global !== 'object' || value.global === null ||
                !value.knowledge || typeof value.knowledge !== 'object' ||
                !Array.isArray(value.knowledge.global) || !Array.isArray(value.knowledge.project)) {
              throw new Error('Invalid memory view')
            }
            if (controller.signal.aborted) return
            const skills = value.skills && typeof value.skills === 'object' ? value.skills : {}
            const skillList = list => (Array.isArray(list) ? list : [])
              .filter(skill => skill && typeof skill.name === 'string' && typeof skill.description === 'string')
              .map(skill => ({
                name: skill.name,
                description: skill.description,
                content: typeof skill.content === 'string' ? skill.content : '',
              }))
            const knowledgeList = list => (Array.isArray(list) ? list : [])
              .filter(entry => entry && typeof entry.id === 'string' && typeof entry.text === 'string')
            setMemory({
              global: value.global,
              project: value.project && typeof value.project === 'object' ? value.project : undefined,
              knowledge: {
                global: knowledgeList(value.knowledge.global),
                project: knowledgeList(value.knowledge.project),
              },
              skills: { global: skillList(skills.global), project: skillList(skills.project) },
            })
            setMemoryPhase('ready')
          } catch {
            if (!controller.signal.aborted) setMemoryPhase('error')
          }
        }
        void load()
        return () => controller.abort()
      }, [revision, phase, memoryProject, tab])

      useEffect(() => {
        if (tab !== 'branches') return () => {}
        const controller = new AbortController()
        setBranchPhase('loading')
        setBranchError('')
        setBranchNotice('')
        async function load() {
          try {
            const response = await fetch('/superagent-lite/branches', {
              method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            })
            if (!response.ok) throw new Error('Branch list unavailable')
            const value = await response.json()
            if (!Array.isArray(value?.branches)) throw new Error('Invalid branch list')
            if (controller.signal.aborted) return
            setBranches(value.branches.filter(row => row && typeof row.branch === 'string' && typeof row.projectRoot === 'string'))
            setBranchPhase('ready')
          } catch {
            if (!controller.signal.aborted) setBranchPhase('error')
          }
        }
        void load()
        return () => controller.abort()
      }, [revision, tab])

      // A queued Task is waiting for a concurrency slot that only the Host can
      // open. Poll silently while one is listed so the row leaves the queue in
      // place, without a page refresh or a loading state.
      useEffect(() => {
        if (!queuedPending) return undefined
        const controller = new AbortController()
        let timer
        let stopped = false
        const schedule = () => {
          if (!stopped) timer = setTimeout(poll, QUEUE_POLL_MS)
        }
        async function poll() {
          try {
            const response = await fetch('/superagent-lite/tasks', {
              method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            })
            if (!response.ok) throw new Error('Task list unavailable')
            const value = await response.json()
            if (stopped || !Array.isArray(value?.tasks)) throw new Error('Invalid task list')
            const rows = value.tasks.filter(task => typeof task?.id === 'string')
            setTasks(rows)
            setTeam(current => rows.some(task => task.teamId === current) ? current : '')
            setProject(current => rows.some(task => task.projectRoot === current) ? current : '')
            setMemoryProject(current => rows.some(task => task.projectRoot === current)
              ? current : (rows.find(task => typeof task.projectRoot === 'string' && task.projectRoot)?.projectRoot ?? ''))
            if (rows.some(task => task.queued === true)) schedule()
          } catch {
            schedule()
          }
        }
        schedule()
        return () => {
          stopped = true
          controller.abort()
          clearTimeout(timer)
        }
      }, [queuedPending])

      const optionsFor = key => [...new Set(tasks.map(task => task[key]).filter(value => typeof value === 'string' && value))]
        .sort((a, b) => a.localeCompare(b))
      const scoped = tasks.filter(task => (!team || task.teamId === team) && (!project || task.projectRoot === project))
      const queuedCount = scoped.filter(task => task.queued === true).length
      const categoryCounts = CATEGORY_ORDER.reduce((counts, key) => {
        counts[key] = scoped.filter(task => task.status === key).length
        return counts
      }, {})
      // "Queued" is a filter over the running status, not a seventh panel
      // status: the Running count and group still include queued Tasks.
      const matchesCategory = (task, key) => key === 'queued' ? task.queued === true : task.status === key
      const shown = category ? scoped.filter(task => matchesCategory(task, category)) : scoped
      const groups = (category ? [category] : CATEGORY_ORDER)
        .map(key => ({ key, tasks: shown.filter(task => matchesCategory(task, key)) }))
        .filter(group => group.tasks.length > 0)

      const deletableTask = task => task.deletable !== false
      const selectedTaskRows = tasks.filter(task => selectedTasks.includes(task.id) && deletableTask(task))

      const refresh = () => {
        active.current?.abort()
        setPhase('loading')
        setSettingsPhase('loading')
        setSettingsError('')
        setSettingsNotice('')
        setSettingsPending(false)
        setMemoryPhase('loading')
        setMemoryError('')
        setMemoryNotice('')
        setMemoryDialog(null)
        setMemoryDialogError('')
        setMemoryPending(false)
        setMemoryExpanded({})
        setBranchPhase('loading')
        setBranchError('')
        setBranchNotice('')
        setBranchDialog(null)
        setBranchDialogError('')
        setBranchPending(false)
        setOpenFailed(false)
        setError('')
        setNotice('')
        setSelectedTasks([])
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
      const toggleTaskSelection = taskId => setSelectedTasks(current => current.includes(taskId)
        ? current.filter(value => value !== taskId) : [...current, taskId])
      const clearSelection = () => {
        setSelectedTasks([])
      }
      const openBatch = kind => {
        setBatch(kind)
        setBatchError('')
        setDialog(null)
      }
      const statusLabel = status => t(Object.hasOwn(dictionaries.en, `status.${status}`) ? `status.${status}` : 'status.failed')
      const filterLabel = key => key === 'queued' ? t('queued') : statusLabel(key)
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
      const memoryDeleteUrl = target => {
        const url = new URL('/superagent-lite/memory', 'http://localhost')
        url.searchParams.set('kind', target.kind)
        if (target.scope) url.searchParams.set('scope', target.scope)
        if (target.field) url.searchParams.set('field', target.field)
        if (target.id) url.searchParams.set('id', target.id)
        if (target.name) url.searchParams.set('name', target.name)
        if (target.projectRoot) url.searchParams.set('projectRoot', target.projectRoot)
        return `${url.pathname}${url.search}`
      }
      const openMemoryDialog = target => {
        setMemoryError('')
        setMemoryNotice('')
        setMemoryDialogError('')
        setMemoryDialog(target)
      }
      const toggleMemoryExpanded = key => setMemoryExpanded(current => ({ ...current, [key]: !current[key] }))
      const isLongMemoryText = value => value.length > 120 || value.split('\n').length > 3
      const confirmMemoryDelete = async () => {
        if (!memoryDialog) return
        const target = memoryDialog
        setMemoryPending(true)
        setMemoryDialogError('')
        try {
          const response = await fetch(memoryDeleteUrl(target), {
            method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
          })
          let value
          try {
            value = await response.json()
          } catch {
            value = undefined
          }
          if (!response.ok) {
            throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('memoryDeleteFailed'))
          }
          setMemory(current => {
            if (target.kind === 'knowledge') {
              const scope = target.scope === 'project' ? 'project' : 'global'
              return {
                ...current,
                knowledge: {
                  ...current.knowledge,
                  [scope]: (current.knowledge?.[scope] ?? []).filter(entry => entry.id !== target.id),
                },
              }
            }
            if (target.kind === 'skill') {
              return {
                ...current,
                skills: {
                  ...current.skills,
                  [target.scope]: (current.skills?.[target.scope] ?? []).filter(skill => skill.name !== target.name),
                },
              }
            }
            if (target.scope === 'global') {
              return { ...current, global: { ...current.global, [target.field]: '' } }
            }
            return { ...current, project: current.project ? { ...current.project, [target.field]: '' } : current.project }
          })
          setMemoryDialog(null)
          setMemoryNotice(t('memoryDeleted'))
        } catch (actionError) {
          const message = typeof actionError?.message === 'string' && actionError.message
            ? actionError.message : t('memoryDeleteFailed')
          setMemoryError(message)
          setMemoryDialogError(message)
        } finally {
          setMemoryPending(false)
        }
      }
      const sameBranchRow = (left, right) => left.projectRoot === right.projectRoot && left.branch === right.branch
      const branchDeleteUrl = (kind, row) => {
        const url = new URL('/superagent-lite/branches', 'http://localhost')
        url.searchParams.set('kind', kind)
        url.searchParams.set('projectRoot', row.projectRoot)
        url.searchParams.set('branch', row.branch)
        if (kind !== 'branch' && row.path) url.searchParams.set('path', row.path)
        return `${url.pathname}${url.search}`
      }
      const confirmBranchDelete = async () => {
        if (!branchDialog) return
        const { kind, row } = branchDialog
        setBranchPending(true)
        setBranchDialogError('')
        try {
          const response = await fetch(branchDeleteUrl(kind, row), {
            method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
          })
          let value
          try {
            value = await response.json()
          } catch {
            value = undefined
          }
          if (!response.ok) {
            throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('branchesDeleteFailed'))
          }
          // A deleted worktree keeps its branch row and only loses the path; a
          // deleted branch removes the row. Neither action reloads the list.
          if (kind === 'worktree') {
            setBranches(current => current.map(item => sameBranchRow(item, row)
              ? (value?.row ?? {
                ...item, path: undefined, canDeleteWorktree: false, canDeleteBranch: true,
                worktreeReason: 'This branch has no worktree to delete', branchReason: undefined,
              })
              : item))
          } else {
            setBranches(current => current.filter(item => !sameBranchRow(item, row)))
          }
          setBranchDialog(null)
          setBranchNotice(typeof value?.message === 'string' && value.message ? value.message : t('branchesDeleted'))
        } catch (actionError) {
          const message = typeof actionError?.message === 'string' && actionError.message
            ? actionError.message : t('branchesDeleteFailed')
          setBranchError(message)
          setBranchDialogError(message)
        } finally {
          setBranchPending(false)
        }
      }
      const stopTask = async task => {
        setPending(`${task.id}:stop`)
        setError('')
        setNotice('')
        try {
          const response = await fetch('/superagent-lite/tasks', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ taskId: task.id, action: 'stop' }),
          })
          let value
          try {
            value = await response.json()
          } catch {
            value = undefined
          }
          if (!response.ok) throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('actionFailed'))
          setTasks(current => current.map(item => item.id === task.id ? {
            ...item,
            status: 'failed',
            cancelled: true,
            queued: false,
            unconfirmed: false,
            stoppable: false,
            ...(typeof value?.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
          } : item))
          setNotice(t('stopDone'))
        } catch (actionError) {
          setError(typeof actionError?.message === 'string' && actionError.message ? actionError.message : t('actionFailed'))
        } finally {
          setPending('')
        }
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
          const response = await fetch('/superagent-lite/worker-settings', {
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
          if (!response.ok) throw new Error(typeof value?.error === 'string' && value.error ? value.error : t('workerSettingsFailed'))
          const saved = value?.settings ?? {}
          const selected = saved.workerModel ?? {}
          setWorkerProvider(typeof selected.provider === 'string' ? selected.provider : '')
          setWorkerModel(typeof selected.model === 'string' ? selected.model : '')
          setWorkerEffort(typeof selected.reasoningEffort === 'string' ? selected.reasoningEffort : '')
          setMaxWorkers(String(saved.maxWorkers ?? limit))
          setSettingsNotice(t('workerSettingsSaved'))
        } catch (actionError) {
          setSettingsError(typeof actionError?.message === 'string' && actionError.message ? actionError.message : t('workerSettingsFailed'))
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
      const branchDeletedTask = (task, value) => {
        const view = value?.view
        return {
          ...task,
          status: view?.status ?? task.status,
          git: view?.git,
          ...(typeof value?.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
        }
      }
      const openDialog = async (kind, task) => {
        setDialog({ kind, task })
        setDialogData({ phase: 'loading' })
        setDialogChoice('')
        setDialogError('')
        if (kind === 'delete-task' || kind === 'delete') {
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
          } else if (action === 'delete-branch') {
            setTasks(current => current.map(item => item.id === task.id ? branchDeletedTask(item, value) : item))
          } else if (action === 'delete-task') {
            setTasks(current => current.filter(item => item.id !== task.id))
            setSelectedTasks(current => current.filter(id => id !== task.id))
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
              task.cancelled && h('span', { className: 'sl-tag', 'data-tone': 'neutral' }, t('cancelled')),
              task.land && h('span', { className: 'sl-tag', 'data-tone': 'success' }, t('landAuthorized')),
              h('code', { className: 'sl-code', title: task.id }, task.id)),
            task.failure && h('p', { className: 'sl-task__failure', title: task.failure }, `${t('failure')}: ${task.failure}`),
            h('div', { className: 'sl-task__actions' },
              session('router', task.parentSessionId),
              session('worker', task.workerSessionId, address),
              task.stoppable && h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger', disabled: busy,
                title: t('stopTitle'),
                onClick: () => void stopTask(task),
              }, icon('cancel'), t('stop')),
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
              git?.branch && h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger',
                disabled: busy || !git.canDelete, title: git.deleteReason,
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
        else if (kind === 'delete') body = h('p', null,
          `${t(task.git?.merged ? 'deleteHint' : 'deleteUnmergedHint')} `, h('code', null, task.git?.branch ?? ''))
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
      const batchDialog = () => {
        if (!batch) return null
        const count = selectedTaskRows.length
        return h('div', { className: 'sl-modal-backdrop' },
          h('div', { className: 'sl-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('batchTasksTitle') },
            h('h2', null, t('batchTasksTitle')),
            h('p', null, t('batchTasksHint')),
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

      const filters = tasks.length > 0 && h('div', { className: 'sl-filters' },
        h('div', { className: 'sl-filter-group', role: 'group', 'aria-label': t('taskFilters') },
          h('button', {
            type: 'button', className: 'sl-filter', 'aria-pressed': category === '',
            onClick: () => setCategory(''),
          }, t('all'), h('span', { className: 'sl-filter__count' }, String(scoped.length))),
          ...CATEGORY_ORDER.map(key => h('button', {
            key, type: 'button', className: 'sl-filter', 'aria-pressed': category === key,
            onClick: () => setCategory(key),
          }, statusLabel(key), h('span', { className: 'sl-filter__count' }, String(categoryCounts[key])))),
          h('button', {
            type: 'button', className: 'sl-filter', 'aria-pressed': category === 'queued',
            onClick: () => setCategory('queued'),
          }, t('queued'), h('span', { className: 'sl-filter__count' }, String(queuedCount)))),
        h('div', { className: 'sl-scope' },
          filter('team', 'allTeams', 'teamId', team, setTeam),
          filter('project', 'allProjects', 'projectRoot', project, setProject)))
      const selection = selectedTaskRows.length > 0 && h('div', { className: 'sl-batch' },
        h('span', { className: 'sl-hint' }, `${t('selectedCount')} ${selectedTaskRows.length}`),
        h('button', {
          type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger', disabled: batchPending,
          onClick: () => openBatch('tasks'),
        }, icon('trash'), t('deleteSelected')),
        h('button', {
          type: 'button', className: 'sl-btn', disabled: batchPending, onClick: clearSelection,
        }, t('clearSelection')))
      const list = shown.length > 0 && h('div', { className: 'sl-scroll' },
        h('div', { className: 'sl-groups' },
          ...groups.map(group => h('section', { key: group.key, className: 'sl-group' },
            h('h2', { className: 'sl-group__title' },
              filterLabel(group.key),
              h('span', { className: 'sl-group__count' }, String(group.tasks.length))),
            h('ul', { className: 'sl-list' }, ...group.tasks.map(taskRow))))))

      const taskView = tab === 'tasks'
      const settingsView = tab === 'settings'
      const tasksTabId = `${headingId}-tasks-tab`
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
      const settingsField = (label, control) => h('div', { className: 'sl-worker-settings__field' },
        h('label', { htmlFor: control.props?.id }, t(label)), control)
      const settingsInput = (label, id, list, value, set) => settingsField(label, h('input', {
        className: 'sl-input', id, list, value, placeholder: t('modelInherit'), spellCheck: false,
        onChange: event => set(event.target.value),
      }))
      const settingsViewPanel = () => h('div', { className: 'sl-body', role: 'tabpanel', 'aria-labelledby': settingsTabId },
        settingsPhase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
        settingsPhase === 'error' && h('p', { className: 'sl-error', role: 'alert' }, t('workerSettingsLoadFailed')),
        settingsPhase === 'ready' && h('div', { className: 'sl-worker-settings' },
          h('p', { className: 'sl-hint' },
            settingsDefaultLabel ? t('defaultModel', { model: settingsDefaultLabel }) : t('defaultModelUnavailable')),
          h('section', { className: 'sl-worker-settings__group' },
            h('h2', { className: 'sl-worker-settings__title' }, t('workerModel')),
            h('p', { className: 'sl-hint' }, t('workerModelHint')),
            h('div', { className: 'sl-worker-settings__grid' },
              settingsInput('modelProvider', `${headingId}-provider`, `${headingId}-providers`, workerProvider, setWorkerProvider),
              settingsInput('modelName', `${headingId}-model`, `${headingId}-models`, workerModel, setWorkerModel),
              settingsInput('modelEffort', `${headingId}-effort`, `${headingId}-efforts`, workerEffort, setWorkerEffort)),
            h('datalist', { id: `${headingId}-providers` },
              ...settingsProviders.map(provider => h('option', { key: provider, value: provider }))),
            h('datalist', { id: `${headingId}-models` },
              ...settingsModels.map(model => h('option', { key: model.id, value: model.id }, model.name))),
            h('datalist', { id: `${headingId}-efforts` },
              ...settingsEfforts.map(effort => h('option', { key: effort.id, value: effort.id }, effort.name)))),
          h('section', { className: 'sl-worker-settings__group' },
            h('h2', { className: 'sl-worker-settings__title' }, t('maxWorkers')),
            h('p', { className: 'sl-hint' }, t('maxWorkersHint')),
            settingsField('maxWorkers', h('input', {
              id: `${headingId}-max-workers`, className: 'sl-input', type: 'number', value: maxWorkers,
              min: settingsLimits?.min ?? 1, max: settingsLimits?.max ?? 16,
              onChange: event => setMaxWorkers(event.target.value),
            }))),
          settingsError && h('p', { className: 'sl-error', role: 'alert' }, settingsError),
          settingsNotice && h('p', { className: 'sl-notice', role: 'status' }, settingsNotice),
          h('div', { className: 'sl-worker-settings__actions' },
            h('button', {
              type: 'button', className: 'sl-btn sl-btn--primary', disabled: settingsPending,
              onClick: () => void saveSettings(),
            }, t('saveSettings')))))
      const memoryView = tab === 'memory'
      const memoryTabId = `${headingId}-memory-tab`
      const branchView = tab === 'branches'
      const branchesTabId = `${headingId}-branches-tab`
      const memoryProjects = optionsFor('projectRoot')
      const memoryDeleteButton = target => h('button', {
        type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger',
        title: `${t('memoryDelete')}: ${target.label}`,
        'aria-label': `${t('memoryDelete')}: ${target.label}`,
        disabled: memoryPending,
        onClick: () => openMemoryDialog(target),
      }, icon('trash'), t('memoryDelete'))
      const memoryField = (label, value, target) => {
        const key = `memory:${target.scope}:${target.field}`
        const open = memoryExpanded[key] === true
        const long = isLongMemoryText(value)
        return h('div', { className: 'sl-memory-field' },
          h('div', { className: 'sl-memory-field__head' },
            h('h3', { className: 'sl-memory-field__label' }, t(label)),
            value && target && memoryDeleteButton(target)),
          h('p', {
            className: value
              ? `sl-memory-field__value${long && !open ? ' sl-memory-field__value--clamped' : ''}`
              : 'sl-hint',
          }, value || t('memoryNotSaved')),
          long && h('button', {
            type: 'button', className: 'sl-memory__more', 'aria-expanded': open,
            'aria-label': `${t(open ? 'memoryCollapse' : 'memoryExpand')}: ${t(label)}`,
            onClick: () => toggleMemoryExpanded(key),
          }, icon(open ? 'chevronDown' : 'chevronRight'), t(open ? 'memoryCollapse' : 'memoryExpand')))
      }
      const memorySkillEntry = (skill, scope) => {
        const key = `skill:${scope}:${skill.name}`
        const open = memoryExpanded[key] === true
        const hasContent = typeof skill.content === 'string' && skill.content !== ''
        const summary = h('span', { className: 'sl-memory-entry__body' },
          h('span', { className: 'sl-memory-entry__name' }, skill.name),
          h('span', { className: `sl-memory-entry__text${open ? '' : ' sl-memory-entry__text--clamped'}` }, skill.description))
        return h('li', { key: skill.name, className: 'sl-memory-entry' },
          h('div', { className: 'sl-memory-entry__head' },
            hasContent
              ? h('button', {
                  type: 'button', className: 'sl-memory-entry__toggle', 'aria-expanded': open,
                  'aria-label': `${t(open ? 'memoryCollapse' : 'memoryExpand')}: ${skill.name}`,
                  onClick: () => toggleMemoryExpanded(key),
                }, h('span', { className: 'sl-memory-entry__chevron' },
                  icon(open ? 'chevronDown' : 'chevronRight')), summary)
              : h('span', { className: 'sl-memory-entry__summary' }, summary),
            memoryDeleteButton({
              kind: 'skill', scope, name: skill.name, label: skill.name,
              ...(scope === 'project' ? { projectRoot: memoryProject } : {}),
            })),
          open && hasContent && h('p', { className: 'sl-memory-entry__content' }, skill.content))
      }
      const memoryEntry = (entry, scope) => {
        const key = `knowledge:${scope}:${entry.id}`
        const open = memoryExpanded[key] === true
        const updated = displayTime(entry.updatedAt)
        const long = isLongMemoryText(entry.text)
        return h('li', { key: entry.id, className: 'sl-memory-entry' },
          h('div', { className: 'sl-memory-entry__head' },
            h('p', {
              className: `sl-memory-entry__text${long && !open ? ' sl-memory-entry__text--clamped' : ''}`,
            }, entry.text),
            memoryDeleteButton({
              kind: 'knowledge', scope, id: entry.id, label: `#${entry.id}`,
              ...(scope === 'project' ? { projectRoot: memoryProject } : {}),
            })),
          (updated || long) && h('div', { className: 'sl-memory-entry__meta' },
            updated && h('span', { className: 'sl-lv' },
              h('span', { className: 'sl-lv__label' }, t('updated')),
              h('span', { className: 'sl-lv__value' }, updated)),
            long && h('button', {
              type: 'button', className: 'sl-memory__more', 'aria-expanded': open,
              'aria-label': `${t(open ? 'memoryCollapse' : 'memoryExpand')}: #${entry.id}`,
              onClick: () => toggleMemoryExpanded(key),
            }, icon(open ? 'chevronDown' : 'chevronRight'), t(open ? 'memoryCollapse' : 'memoryExpand'))))
      }
      const memorySection = (title, hint, count, ...children) => h('section', { className: 'sl-memory__section' },
        h('div', { className: 'sl-memory__head' },
          h('h2', { className: 'sl-memory__title' }, t(title)),
          typeof count === 'number' && h('span', { className: 'sl-memory__count' }, String(count))),
        h('p', { className: 'sl-memory__sub' }, t(hint)),
        ...children)
      const memoryViewPanel = () => {
        const global = memory.global ?? {}
        const project = memory.project
        const skills = memory.skills ?? {}
        const query = memoryQuery.trim().toLowerCase()
        const matches = (...values) => query === '' ||
          values.some(value => typeof value === 'string' && value.toLowerCase().includes(query))
        const knowledgeOf = scope => (Array.isArray(memory.knowledge?.[scope]) ? memory.knowledge[scope] : [])
          .filter(entry => matches(entry.text, entry.id))
        const globalKnowledge = knowledgeOf('global')
        const projectKnowledge = knowledgeOf('project')
        const globalSkills = (Array.isArray(skills.global) ? skills.global : [])
          .filter(skill => matches(skill.name, skill.description, skill.content))
        const projectSkills = (Array.isArray(skills.project) ? skills.project : [])
          .filter(skill => matches(skill.name, skill.description, skill.content))
        const globalFields = [{
          label: 'memoryUserProfile',
          value: typeof global.userProfile === 'string' ? global.userProfile : '',
          target: { kind: 'memory', scope: 'global', field: 'userProfile', label: t('memoryUserProfile') },
        }].filter(field => matches(field.value))
        const projectFields = project ? [{
          label: 'memoryResponsibilities',
          value: typeof project.responsibilities === 'string' ? project.responsibilities : '',
          target: { kind: 'memory', scope: 'project', projectRoot: memoryProject, field: 'responsibilities', label: t('memoryResponsibilities') },
        }, {
          label: 'memoryPositioning',
          value: typeof project.positioning === 'string' ? project.positioning : '',
          target: { kind: 'memory', scope: 'project', projectRoot: memoryProject, field: 'positioning', label: t('memoryPositioning') },
        }].filter(field => matches(field.value)) : []
        const matchesAny = globalFields.length + globalSkills.length + projectFields.length +
          projectSkills.length + globalKnowledge.length + projectKnowledge.length > 0
        return h('div', { className: 'sl-body', role: 'tabpanel', 'aria-labelledby': memoryTabId },
          h('div', { className: 'sl-filters' },
            h('label', { className: 'sl-memory__search' },
              icon('search'),
              h('input', {
                className: 'sl-input', type: 'search', value: memoryQuery,
                placeholder: t('memorySearchPlaceholder'), 'aria-label': t('memorySearch'),
                spellCheck: false, onChange: event => setMemoryQuery(event.target.value),
              })),
            memoryProjects.length > 0 && h('label', { className: 'sl-field sl-scope' },
              h('span', null, t('memoryProjectLabel')),
              h('select', {
                className: 'sl-select', value: memoryProject,
                onChange: event => setMemoryProject(event.target.value),
              }, ...memoryProjects.map(root => h('option', { key: root, value: root }, root))))),
          memoryPhase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
          memoryPhase === 'error' && h('p', { className: 'sl-error', role: 'alert' }, t('memoryLoadFailed')),
          memoryError && h('p', { className: 'sl-error', role: 'alert' }, memoryError),
          memoryNotice && h('p', { className: 'sl-notice', role: 'status' }, memoryNotice),
          memoryPhase === 'ready' && !project && h('p', { className: 'sl-hint' }, t('memoryNoProject')),
          memoryPhase === 'ready' && h('div', { className: 'sl-scroll' },
            !matchesAny && h('p', { className: 'sl-memory__hint', role: 'status' }, t('memoryNoMatch')),
            matchesAny && h('div', { className: 'sl-memory' },
              (globalFields.length > 0 || globalSkills.length > 0) && memorySection(
                'memoryGlobal', 'memoryGlobalHint',
                globalFields.length + globalSkills.length,
                ...globalFields.map(field => memoryField(field.label, field.value, field.target)),
                globalSkills.length > 0 && h('div', { className: 'sl-memory-skills' },
                  h('h3', { className: 'sl-memory-skills__title' }, t('memoryGlobalSkills')),
                  h('ul', { className: 'sl-list' },
                    ...globalSkills.map(skill => memorySkillEntry(skill, 'global'))))),
              project && (projectFields.length > 0 || projectSkills.length > 0) && memorySection(
                'memoryProject', 'memoryProjectHint',
                projectFields.length + projectSkills.length,
                ...projectFields.map(field => memoryField(field.label, field.value, field.target)),
                projectSkills.length > 0 && h('div', { className: 'sl-memory-skills' },
                  h('h3', { className: 'sl-memory-skills__title' }, t('memoryProjectSkills')),
                  h('ul', { className: 'sl-list' },
                    ...projectSkills.map(skill => memorySkillEntry(skill, 'project'))))),
              (!query || globalKnowledge.length > 0) && memorySection(
                'memoryKnowledge', 'memoryKnowledgeHint', globalKnowledge.length,
                globalKnowledge.length === 0
                  ? h('p', { className: 'sl-memory__hint', role: 'status' }, t('memoryEmptyKnowledge'))
                  : h('ul', { className: 'sl-list' },
                    ...globalKnowledge.map(entry => memoryEntry(entry, 'global')))),
              project && (!query || projectKnowledge.length > 0) && memorySection(
                'memoryProjectKnowledge', 'memoryProjectKnowledgeHint', projectKnowledge.length,
                projectKnowledge.length === 0
                  ? h('p', { className: 'sl-memory__hint', role: 'status' }, t('memoryEmptyProjectKnowledge'))
                  : h('ul', { className: 'sl-list' },
                    ...projectKnowledge.map(entry => memoryEntry(entry, 'project')))))))
      }
      const memoryDialogView = () => {
        if (!memoryDialog) return null
        const target = memoryDialog
        const hint = target.kind === 'knowledge' ? t('memoryDeleteKnowledgeHint')
          : target.kind === 'skill' ? t('memoryDeleteSkillHint') : t('memoryDeleteFieldHint')
        return h('div', { className: 'sl-modal-backdrop' },
          h('div', { className: 'sl-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('memoryDeleteTitle') },
            h('h2', null, t('memoryDeleteTitle')),
            h('p', null, t('memoryDeleteHint')),
            h('p', null, hint, ' ', h('code', null, target.label)),
            memoryDialogError && h('p', { role: 'alert', className: 'sl-error' }, memoryDialogError),
            h('div', { className: 'sl-modal__actions' },
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline', disabled: memoryPending,
                onClick: () => {
                  setMemoryDialog(null)
                  setMemoryDialogError('')
                },
              }, t('cancel')),
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--primary', disabled: memoryPending,
                onClick: () => void confirmMemoryDelete(),
              }, t('confirmDelete')))))
      }
      const branchRow = row => {
        const task = row.task && typeof row.task === 'object' ? row.task : undefined
        const path = typeof row.path === 'string' && row.path ? row.path : undefined
        const status = task && typeof task.status === 'string' ? task.status : undefined
        return h('li', { key: `${row.projectRoot}\0${row.branch}`, className: 'sl-task' },
          h('div', { className: 'sl-task__stage' },
            status ? statusMark(status) : h('span', { className: 'sl-hint' }, t('branchesNoTask'))),
          h('div', { className: 'sl-task__body' },
            h('div', { className: 'sl-task__title' },
              h('code', { className: 'sl-code', title: row.branch }, row.branch)),
            h('div', { className: 'sl-task__meta' },
              chip('branchesProject', row.projectRoot),
              chip('branchesWorktree', path ?? t('branchesNoWorktree')),
              task && chip('branchesTask', task.title || task.id),
              task && h('code', { className: 'sl-code', title: task.id }, task.id)),
            h('div', { className: 'sl-task__actions' },
              ...(path
                ? [
                    h('button', {
                      type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger',
                      disabled: branchPending || !row.canDeleteWorktree,
                      title: row.canDeleteWorktree ? undefined : row.worktreeReason,
                      onClick: () => setBranchDialog({ kind: 'worktree', row }),
                    }, icon('trash'), t('deleteWorktree')),
                    h('button', {
                      type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger',
                      disabled: branchPending || !row.canDeleteBoth,
                      title: row.canDeleteBoth ? undefined : row.bothReason,
                      onClick: () => setBranchDialog({ kind: 'worktree-and-branch', row }),
                    }, icon('trash'), t('deleteBoth')),
                  ]
                : [
                    h('button', {
                      type: 'button', className: 'sl-btn sl-btn--outline sl-btn--danger',
                      disabled: branchPending || !row.canDeleteBranch,
                      title: row.canDeleteBranch ? undefined : row.branchReason,
                      onClick: () => setBranchDialog({ kind: 'branch', row }),
                    }, icon('trash'), t('deleteBranch')),
                  ]),
              branchPending && h('span', { className: 'sl-hint' }, t('working')))))
      }
      const branchesViewPanel = () => h('div', { className: 'sl-body', role: 'tabpanel', 'aria-labelledby': branchesTabId },
        h('p', { className: 'sl-hint' }, t('branchesOnlyPlugin')),
        branchPhase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
        branchPhase === 'error' && h('p', { className: 'sl-error', role: 'alert' }, t('branchesLoadFailed')),
        branchError && h('p', { className: 'sl-error', role: 'alert' }, branchError),
        branchNotice && h('p', { className: 'sl-notice', role: 'status' }, branchNotice),
        branchPhase === 'ready' && branches.length === 0 && h('p', { className: 'sl-hint', role: 'status' }, t('branchesEmpty')),
        branchPhase === 'ready' && branches.length > 0 && h('div', { className: 'sl-scroll' },
          h('div', { className: 'sl-groups' },
            h('section', { className: 'sl-group' },
              h('h2', { className: 'sl-group__title' }, t('branchesTab'),
                h('span', { className: 'sl-group__count' }, String(branches.length))),
              h('ul', { className: 'sl-list' }, ...branches.map(branchRow))))))
      const branchDialogView = () => {
        if (!branchDialog) return null
        const { kind, row } = branchDialog
        const title = kind === 'worktree' ? t('deleteWorktreeTitle')
          : kind === 'worktree-and-branch' ? t('deleteBothTitle') : t('deleteBranchTitle')
        return h('div', { className: 'sl-modal-backdrop' },
          h('div', { className: 'sl-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
            h('h2', null, title),
            h('p', null, t(kind === 'worktree' ? 'deleteWorktreeHint'
              : kind === 'worktree-and-branch' ? 'deleteBothHint' : 'deleteBranchHint')),
            h('p', null, h('code', null, kind === 'branch' ? row.branch : `${row.branch} · ${row.path ?? ''}`)),
            branchDialogError && h('p', { role: 'alert', className: 'sl-error' }, branchDialogError),
            h('div', { className: 'sl-modal__actions' },
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline', disabled: branchPending,
                onClick: () => {
                  setBranchDialog(null)
                  setBranchDialogError('')
                },
              }, t('cancel')),
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--primary', disabled: branchPending,
                onClick: () => void confirmBranchDelete(),
              }, t('confirmDelete')))))
      }
      return h('section', { className: 'sl-board', 'aria-labelledby': headingId },
        h('style', null, styles),
        h('div', { className: 'sl-column' },
          h('header', { className: 'sl-head' },
            h('div', { className: 'sl-head__text' },
              h('h1', { id: headingId },
                t(taskView ? 'title' : settingsView ? 'workerSettingsTitle' : memoryView ? 'memoryTitle' : 'branchesTitle')),
              h('p', { className: 'sl-intro' },
                t(taskView ? 'intro' : settingsView ? 'workerSettingsIntro' : memoryView ? 'memoryIntro' : 'branchesIntro'))),
            h('div', { className: 'sl-toolbar' },
              h('button', {
                type: 'button', className: 'sl-btn sl-btn--outline',
                onClick: refresh,
                disabled: taskView ? phase === 'loading'
                  : settingsView ? settingsPhase === 'loading'
                    : memoryView ? memoryPhase === 'loading' : branchPhase === 'loading',
              }, icon('refresh'), t('refresh')))),
          h('div', { className: 'sl-tabs', role: 'tablist', 'aria-label': t('views') },
            h('button', {
              id: tasksTabId, type: 'button', role: 'tab', className: 'sl-tab',
              'aria-selected': taskView,
              onClick: () => setTab('tasks'),
            }, t('title')),
            h('button', {
              id: settingsTabId, type: 'button', role: 'tab', className: 'sl-tab',
              'aria-selected': settingsView,
              onClick: () => setTab('settings'),
            }, t('workerSettingsTitle')),
            h('button', {
              id: memoryTabId, type: 'button', role: 'tab', className: 'sl-tab',
              'aria-selected': memoryView,
              onClick: () => setTab('memory'),
            }, t('memoryTab')),
            h('button', {
              id: branchesTabId, type: 'button', role: 'tab', className: 'sl-tab',
              'aria-selected': branchView,
              onClick: () => setTab('branches'),
            }, t('branchesTab'))),
          taskView
            ? h('div', { className: 'sl-body', role: 'tabpanel', 'aria-labelledby': tasksTabId },
              host?.readonly === true && h('div', { className: 'sl-alert', role: 'status' },
                h('strong', null, t('hostReadonlyTitle')),
                h('p', null, t('hostReadonlyBody')),
                typeof host.dshDir === 'string' && host.dshDir &&
                  h('p', { className: 'sl-alert__diagnostic' }, t('hostReadonlyDiagnostic', { dir: host.dshDir }))),
              filters,
              selection,
              phase === 'loading' && h('p', { className: 'sl-hint', role: 'status' }, t('loading')),
              phase === 'error' && h('p', { className: 'sl-error', role: 'alert' }, t('loadFailed')),
              openFailed && h('p', { className: 'sl-error', role: 'alert' }, t('openFailed')),
              error && h('p', { className: 'sl-error', role: 'alert' }, error),
              notice && h('p', { className: 'sl-notice', role: 'status' }, notice),
              phase === 'ready' && tasks.length === 0 && h('p', { className: 'sl-hint', role: 'status' }, t('empty')),
              phase === 'ready' && tasks.length > 0 && shown.length === 0 &&
                h('p', { className: 'sl-hint', role: 'status' }, t(category ? 'emptyCategory' : 'noMatch')),
              list)
            : settingsView ? settingsViewPanel() : memoryView ? memoryViewPanel() : branchesViewPanel()),
        dialogView(),
        batchDialog(),
        memoryDialogView(),
        branchDialogView())
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
