# 003 生命周期

这份文档跟着一个已受理的 Task 从派发走到结束。它建立在 [001 领域模型](001-domain.md) 和 [002 规则与权限](002-rules.md) 之上。

## 阶段

Task 记录只保存一个生命周期状态；面板不直接显示它，而是用存储状态、worker 分支、审查记录和 Pull request 事实推导出六个面板状态（`src/status.js:6-34`、`src/git-actions.js:276-390`）。推导回答的是「现在这个人能对这个 Task 做什么」。

| 面板状态 | 成立条件（从上往下读） |
| --- | --- |
| `running` / 运行中 | 存储状态是 `queued`、`starting`、`running`、`resuming`、`publishing` 或 `merging` |
| `completed` / 已完成 | 存储状态是 `merged`；或 worker HEAD 是基础分支 tip 的祖先；或 reviewed HEAD 的精确 PR 是 `MERGED`；或非失败 Task 的 worker 分支已被删除 |
| `failed` / 失败 | 精确 PR 是 `CLOSED`，或存储状态是 `cancelled`、`interrupted`、`merge-conflict` |
| `unmerged` / 未合并 | 当前 worker HEAD 有通过的审查且尚未合并；同一 Project 的另一个 Task 为同一 commit 记录的审查也算，面板会把它写回本 Task |
| `completed` / 已完成 | Worker 回合以 `completed` 结束，且分支在基础 commit 之后没有提交，没有可审查的内容 |
| `unreviewed` / 未审查 | worker 分支有提交，且当前 HEAD 没有通过的审查 |
| `failed` / 失败 | 其他失败存储值（`failed`、`delivery-blocked`） |
| `answer` / 仅回答 | Task 是 report 模式且存储为 `completed`；report 任务其余情况显示运行中或失败 |

存储状态为 `review-required`、`delivery-blocked` 或 `failed`，而当前 HEAD 已有通过的审查时，面板读取会把 Task 修正为 `awaiting-merge`；存储为 `review-required` 且 HEAD 已合并时修正为 `merged`（`src/git-actions.js:313-317`）。

存储阶段表从上往下读，第一条成立的条件就是记录的生命周期阶段。精确匹配的合并 PR 可以覆盖存储的交付状态，`unconfirmed` 由面板在读取时计算。

| 阶段 | 成立条件 | 面板状态 |
| --- | --- | --- |
| `unconfirmed` | 存储状态是 `starting`、`running` 或 `resuming`，但没有活着的 Worker agent | `running`，带「未确认」标签 |
| `merged` | 存储状态是 `merged`；或 reviewed HEAD 的精确 PR 是 `MERGED` | `completed` |
| `delivery-blocked` | 存储状态是 `delivery-blocked`，且 HEAD 未通过审查 | `failed` |
| `merging` | 存储状态是 `merging` | `running` |
| `publishing` | 存储状态是 `publishing` | `running` |
| `awaiting-ci` | 存储状态是 `awaiting-ci` | `unmerged` |
| `merge-queued` | 存储状态是 `merge-queued` | `unmerged` |
| `awaiting-merge` | 存储状态是 `awaiting-merge` | `unmerged` |
| `review-required` | 存储状态是 `review-required`，或覆盖的 commit 没有通过的审查 | `unreviewed`；分支没有提交时是 `completed` |
| `completed` | 存储状态是 `completed` | report 任务是 `answer`，其余是 `completed` |
| `failed` | 存储状态是 `failed`，且 HEAD 未通过审查 | `failed` |
| `resuming` | 存储状态是 `resuming`，且有活着的 Worker agent | `running` |
| `running` | 存储状态是 `running`，且有活着的 Worker agent | `running` |
| `starting` | 存储状态是 `starting`，且有活着的 Worker agent | `running` |
| `queued` | 存储状态是 `queued`，等待并发名额；可在面板取消 | `running`，带「排队中」标签 |

存储阶段表以 worker 分支仍存在为默认前提。worker 分支已删除的 Task 不再按分支推导面板状态：非失败的 Task 显示为已完成，失败 Task 保持失败（`src/git-actions.js:288-293`）。

面板字典还识别 `ready`、`merge-queued`、`merge-conflict`、`interrupted`、`cancelled` 的文案；活动 Task 不写这些值。排队取消会留下 `cancelled` 墓碑，`worker_status` 用它报告已取消任务，面板列表仍不显示（`client.js:14-15`、`client.js:64-65`、`src/status.js:8-10`、`src/task-store.js`、`src/worker-status.js`）。

## 执行

### Worker Session

`dispatch_worker` 先写 `queued` 记录，再由启动队列在并发名额内标记为 `starting`，通过 `ctx.subagents.startActivation` 启动一个 Worker Session（`src/dispatch.js:105-131`、`src/launch-queue.js`）。启动成功后队列向 Router 注入一条后台状态通知，说明排队任务已开始；Router 也可随时用 `worker_status` 查询。change、report 和 merge 模式都走同一条启动路径；`mode=merge` 遇到同一 Router Session 和 Project 已有运行中的 merge worker 时，不启动新 Session，而是把目标追加到该 Task 并给 worker 发送 follow-up。

| 属性 | 值 |
| --- | --- |
| Session ID | 启动前生成的随机 UUID，写入 Task 并建立 Session 映射 |
| Agent 名 | `sl-<taskId>` |
| 标签 | `<teamId>: <title>` |
| 工作目录 | Project 根 |
| 预设 | `superagent-lite-worker` |
| 投递 | `parent`，Router 接收 Worker 报告 |
| 深度 | `ctx.subagents.resolveMaxDepth()` |
| 首条消息 | `buildWorkerPrompt` 生成的任务消息 |

Host 创建 Worker agent 后，`agent/created` 通过 Session 映射找到 Task，核对父 Session，并把 `starting` 或 `resuming` 改为 `running`（`index.js:38-50`、`src/task-store.js:149-166`）。同一事件安装工具守卫、注册 Worker 工具和知识库查询工具，并把项目 + 全局记忆注册为必需的运行时上下文（`index.js:51-145`、`src/memory.js`）。

Worker 调用 `create_worktree` 后，worktree 服务从记录的 base commit 创建隔离检出，目录和分支名为 `sl-<worktreeName>-<Task ID 前 12 位>`；Task 保存 `path`、`branch`、`baseCommit`、`repositoryRoot`、`sourceBranch`，状态改为 `running`，工作目录切到 Worktree（`src/worktree-tool.js:42-57`）。已有 Worktree 时只重新进入（`src/worktree-tool.js:28-37`）。merge 任务的 `task.mergeBranches` 由派发时解析，运行中收到的新 merge 请求会追加到同一列表；worker 用 `merge_branch` 把记录的目标分支合入自己的 worktree 分支，不直接改 base branch（`src/dispatch.js:13-48`、`src/merge-tool.js:13-64`）。

Worker 的 subagent 结束时冻结；冻结后所有工具被拒，包括消息工具（`index.js:98`、`index.js:119-122`）。

### Reviewer

`review_worker_commit` 启动独立子代理，标签 `Independent code review`，工作目录为 Worktree，delivery 为 `caller`，深度 2（`src/review.js:61-76`）。

Reviewer 收到保存的需求、follow-up 文本、项目 + 全局记忆、base 与 head commit、Worktree 路径；提示词明确不附 diff，Reviewer 自己运行 `git diff <base>..<head>` 或 `git show <head>` 并读取改动文件（`src/review.js:56-71`）。helper 守卫在子代理创建前登记改动范围，创建后只拒绝写改文件的工具和会改变分支或历史的 git 命令（`src/review.js:87`、`src/helper-guard.js:105-117`）。审查结束复核 Worktree 的分支、干净工作区和 HEAD 未移动（`src/review.js:120`、`src/review.js:44-54`）。

Reviewer 用 `submit_review` 记录裁决：内容「通过」是通过，其他内容记为审查意见。工具确认裁决存在、Reviewer 实际读过改动、Worker HEAD 未移动后，才写入 `review.head`、`review.reviewerSessionId`、`review.approved`（`src/review.js:109-122`）。

面板的 `review` 动作从活着的 Worker Session 对 `unreviewed` 的 HEAD 运行同一审查；通过后 Task 修正为 `awaiting-merge`，有意见则落到 `review-required`（`src/git-actions.js:398-419`）。

### Memory 角色

memory 角色是独立 helper 子代理，标签 `Distill memory`，delivery 为 `caller`，深度 2（`src/memory.js`）。它直接读取 Worker 的完整会话记录，不使用 worker 提交的摘要；最终报告工具（`message_router`、`report_task`）保留工具名但省略参数（`src/memory.js`）。

| 属性 | 值 |
| --- | --- |
| 触发 | change worker 的最终 `message_router` 报告送达后自动触发一次；每个 Worker Session 最多一次 |
| 输入 | Worker 的完整对话记录（含各轮 follow-up）：`[user]`、`[assistant]`、`[tool call]`、`[tool result]` 条目；单条最多 4,000 字符，tool call 参数最多 500 字符，总长最多 60,000 字符，超长保留首尾 |
| 输出 | 全局 `userProfile`、`sharedSkillDescription`/`sharedSkillContent`；项目 `responsibilities`、`positioning`、`projectSkillDescription`/`projectSkillContent`；每个字段最多 4,000 字符，skill description 最多 500 字符 |
| 知识库 | 用 `knowledge_query` 按关键词查编号和上下文片段，再用 `knowledge_get` 按编号取完整条目；用 `knowledge_write` 新增、纠正或删除；只有 memory 角色能写 |
| 不提取 | 密码、API key、token、凭据、个人数据、任务状态、一次性进度和指令 |
| 写入 | 只覆盖非空且与当前值不同的字段；skill 需要 description 和 content 都非空；全局写 `memory/global.json`，项目写 `memory/projects/<hash>.json`，skill 写对应的 `SKILL.md` |
| 空结果 | 没有非空更新时不写；触发失败只记录警告，不阻塞最终报告 |

自动触发发生在报告送达之后，属于 Worker Session 而不是 Task 状态；它不改变 Task 状态或 Review 记录（`src/message-router.js`、`index.js`）。

写入的 skill 只对之后新派发的 Worker/Reviewer 可见。已运行或已结束的 Worker/Reviewer 会话保留启动时的 skill catalog：只由 memory 管理的 skill 变化构成的 catalog 更新会被拦截，不会因为 memory 写入而收到变更提醒并继续行动。归属来源是 memory store 写入 skill 时登记的名单（按全局和项目根分开记录），并列的第二个项目 skill 也按同一规则处理；未登记的其他 skill 变化照常发布（`src/skill-catalog.js`、`src/memory-store.js`、`index.js`）。安装 owner 可以在「记忆系统」标签页逐条删除记忆字段、memory skill 或知识条目；删除 skill 与写入一样只影响之后派发的会话，删除全局记忆字段后 Router 的全局记忆缓存立即刷新（`src/memory-panel.js`、`src/memory.js`）。

### 原始归档

Worker 每个回合结束时归档整个回合。`archiveWorkerTurn` 从 `turn/end` 向前找到同 `turn` 的 `turn/start`，取出这轮的完整事件，写到 `~/.dsh/superagent-lite/task/archive/<session+seq hash>.json`（`src/memory.js`、`src/memory-store.js`）。

| 字段 | 内容 |
| --- | --- |
| `turn` | Worker 回合号 |
| `startSeq`、`endSeq` | 该回合起止事件序号 |
| `references` | 每个事件从 1 开始的轮内编号、Session 序号和事件类型 |
| `events` | 完整事件快照 |

归档只由 Host 写入，模型工具没有读取入口；同一来源再次写入会覆盖该来源的记录。

## 并发

- 一个 Task 只有一个 Worker Session；follow-up 复用该 Session，不占第二个名额（`src/task-store.js:149-166`）。
- 并发 worker 上限来自面板「设置」，默认 3，范围 1–16；设置只影响之后启动的 worker（`src/worker-settings.js`、`src/launch-queue.js`）。
- 名额内立即启动；超出上限的 Task 写为 `queued`，按创建时间排队，Worker 结束或失联释放名额后启动。面板在存在排队任务时每 3 秒静默轮询任务列表，该行随后就地转为运行中，不需要整页刷新；任务列表的「排队中」筛选可以单独筛出这些 Task，筛选后仍保留「排队中」标签和取消按钮。排队中的 Worker 开始执行时，启动队列向 Router 注入后台状态通知；排队中的 Task 也可以取消：面板发送既有 `DELETE /superagent-lite/tasks?taskId=`，服务端在同一 Task 锁内确认状态仍是 `queued` 后移除活动记录和会话映射，留下 `cancelled` 墓碑供 `worker_status` 查询，并通知 Router；已经离开队列的 Task 返回 `409`，不会在取消后继续启动。Reviewer 是 Worker 的子代理，不创建 Task，也不占额外名额（`src/launch-queue.js`、`index.js:166-206`、`client.js:438-472`、`src/board.js:14-55`、`src/task-store.js:122-144`、`src/worker-status.js`）。
- `mode=merge` 例外：同一 Router Session 和 Project 只有一个活着的 merge worker，新的 merge 请求追加给它，并发的 merge 派发按 Router 和 Project 排队；没有活 Worker Session 的残留运行中 Task 不参与追加（`src/dispatch.js`）。
- 同一 Project 的多个 Task 各用自己的 Worktree 并行（`cordis.patch.yml:1-7`）。
- 嵌套深度由 Host 的子代理上限约束；Reviewer 和 memory 角色都以深度 2 启动（`src/review.js`、`src/memory.js`）。
- 面板的 Git 动作按 Task ID 串行，单次 HTTP 超时 15 分钟（`src/git-actions.js:81-88`、`src/board.js:157`）。
- 面板的合并和分支删除按 Project 根串行，共享 checkout 不会被两个面板动作同时切换；merge worker 的目标分支合并发生在自己的 worktree 内，不占共享 checkout（`src/merge.js:14-26`、`src/merge-tool.js:13-64`）。
- Worktree 服务配置 `retainOnArchive: true`，Worker 结束后保留分支和检出，供恢复和交付读取（`cordis.patch.yml:1-7`）。

## 结束条件

change 和 merge 任务的 Worker 回合按以下顺序落定（`index.js:119-151`）：

| 条件 | 结果 |
| --- | --- |
| Worker 未以 `completed` 结束或没有 Worktree | `failed` |
| Worker 结束但没有通过的 Review | `review-required` |
| Review 通过，但结束后的 HEAD 不再等于 reviewed HEAD | `review-required` |
| Review 通过且 HEAD 仍匹配 | `awaiting-merge` |
| 结束后的 HEAD 检查抛错 | `delivery-blocked` |

续派发不清空 Review：`continue_worker` 只把状态改为 `resuming`，保留 `review` 记录；Worker 回合结束时再按上表比较 `review.head` 与当前 HEAD，HEAD 变化则旧批准自动失效，HEAD 未变则旧批准仍然有效。

`awaiting-merge` 是 Worker 工作的结束，不是 Task 的结束。merge worker 自己把 reviewed merge commit 合入 base branch 后，目标分支的提交就成为 base branch 的祖先；面板读取这些原任务时按「已包含在基础分支」收尾。Task 到 `merged` 的路径有三种：

- 用户明确授权后由 merge worker（没有运行中的就新派发，已有则追加目标）把 reviewed merge commit 合入 base branch（`src/merge-tool.js:13-64`、`src/landing.js:370-388`）；也可以由面板行内合并执行本地 `git merge --no-ff --log`，合并提交带上分支的功能性 commit 信息（`src/merge.js:30-109`、`src/git-actions.js:409-425`）。
- 精确匹配的 PR 在 GitHub 上被合并，面板读取时同步为 `merged`（`src/git-actions.js:190-194`、`src/git-actions.js:309-317`）。
- 面板读取时发现 worker HEAD 不是基础 commit，且已包含在基础分支中；只有存储状态属于 `review-required`、`awaiting-merge`、`awaiting-ci`、`merge-queued`、`publishing`、`merging`、`delivery-blocked` 时才回写 `merged`（`src/git-actions.js:13`、`src/git-actions.js:151-160`、`src/git-actions.js:316-324`）。没有自有提交的分支不算合并。

report 任务在 `report_task` 执行时到 `completed`；回合结束仍未调用 `report_task` 时到 `failed`，失败原因是 `Report-only task ended without report_task`（`src/report-tool.js:34-41`、`index.js:128-131`）。

安装 owner 也可以从面板删除 Task 记录。删除移除记录和 worker 会话映射，不结束 Worker Session，也不回收 worker 分支或 Worktree；Worker Session 还活着的运行中 Task、`merging` 或 `publishing` 中的 Task 不能删除（`src/board.js:11-48`、`src/task-store.js:103-121`）。

面板的「删除分支」不要求 Task 已合并。它只在一个 Task 仍有 worker 分支时出现；运行中的 Task 不能删除分支。删除先移除该 Task 登记且干净的工作树，再删除分支，记录 `branchDeletedAt` 并清空 `worktree`；工作树有未提交改动、被其他工作树检出、移除失败或移除后仍存在时拒绝。删除后非失败的 Task 显示为已完成，失败 Task 保持失败（`src/merge.js:121-170`、`src/git-actions.js:288-293`）。

不需要 Worker 的输入不是 Task：`dispatch_worker` 收到 `mode=answer` 时直接返回未委派，不建 Worktree、不建 Task、不写 Task 记录，回合直接回答（`src/dispatch.js:63`）。

## 失败与恢复

### Worker 回合失败

回合没有以 `completed` 结束，或 change/merge 任务没有 Worktree，Task 落为 `failed`，记录 `stopReason` 和 `finishedAt`；Worker 冻结（`index.js:119-151`）。

已有 Worktree 的 `failed` Task 可以用 `continue_worker` 恢复。从未拿到 Worktree 的 Task，包括 report 任务，不能恢复，只能重新派发（`src/continue.js:127-134`）。

### 审查未通过

Review 记录保留 `approved: false`，Task 落为 `review-required`。Worker 修完问题、再次提交并再次调用审查工具。`continue_worker` 会把 Task 改为 `resuming`，保留旧 Review 记录，再发送精简续派发消息：任务标识、不可变规则和唯一权威的 follow-up；只有检测到上下文被压缩时才回放原需求。之后 HEAD 是否仍等于 `review.head` 决定旧批准是否有效，HEAD 变化时旧批准自动失效（`src/continue.js:126-148`、`src/continue.js:12-68`）。

### Host 重启或插件重载

Task 记录保存在 `~/.dsh/superagent-lite/`，Worktree 保存在项目的 `.agents/worktrees/`。存储状态仍在 `starting`、`running` 或 `resuming` 但没有活着的 Worker Session 时，面板显示「运行中」并带「未确认」标签；`queued` 显示「排队中」，不算未确认（`src/board.js:60-74`）。排队取消的 `cancelled` 墓碑保存在 `tasks/cancelled/`，只供 `worker_status` 查询。这样的残留 merge Task 不会被新的 merge 请求追加；新的请求会新派发 merge worker。

`continue_worker` 可以唤醒空闲 Worker；派发调用遇到 `starting` 或 `failed` 的同名 Task 会被拒绝，需要新的输入；已有 `queued` 的同名 Task 直接返回，不重复入队（`src/dispatch.js:51-58`）。

### GitHub 交付失败

发送 PR 失败时，Task 标为 `delivery-blocked`，错误写入 `failure`；已创建的 PR 保留链接。精确匹配的 PR 在交付状态中被关闭时也落为 `delivery-blocked`；精确 PR 已合并时落为 `merged`（`src/git-actions.js:149-199`、`src/git-actions.js:469-472`）。发送 PR 与合并共用同一套状态、审查和 HEAD 前置校验，唯一额外条件是 `gh` 登录和 GitHub remote（`src/delivery.js:7-19`）。

GitHub 写入不自动重试。PR 尚未创建时的发送失败可以从 `delivery-blocked` 重试；一旦 `prUrl` 已存在，再次发送会复用同一 HEAD 的 PR（`src/github.js:83-95`）。

### 本地合并失败

预检失败时 Task 仍是 `awaiting-merge`，用户可以修正目标 checkout 后重试。`git merge` 已经执行但失败时，Task 标为 `delivery-blocked`，并提示检查目标；之后不再是 `awaiting-merge`，面板合并会拒绝，直到用户处理目标并开始新的工作（`src/merge.js:49-108`）。

### follow-up 发送失败

发送失败会删除刚记录的要求。目标是已结束的 Task 时标为 `failed`；目标是运行中的 Task 时保持 `running`（`src/continue.js:74-90`、`src/continue.js:142-147`）。

### 未完成的工作

无法继续的 Worker 报告 `BLOCKED`：具体阻塞、已经尝试的内容、需要人提供的一个决定或资源。工作未完成但可继续的报告 `INCOMPLETE`，并说明剩下什么。`message_router` 的文本不设置 Task 状态，状态由生命周期事件写（`src/worker-prompt.js:61-68`、`index.js:94-98`、`index.js:119-151`）。
