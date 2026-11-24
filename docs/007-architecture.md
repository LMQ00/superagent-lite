# 007 架构

这份文档把 [001 领域模型](001-domain.md) 的概念映射到文件、服务和数据。先读「核心流程」和「依赖规则」，再把「模块」与「测试」两张表当索引用。它建立在 [000 原则](000-philosophy.md) 到 [006 部署](006-deployment.md) 之上。

## 核心流程

Host 插件 `index.js` 管理 Worker 生命周期、记忆注入和面板路由；Router 插件 `router.js` 注册路由工具和全局记忆上下文。merge 任务的目标分支合入由 `src/merge-tool.js` 执行，最终合入 base branch 仍走 Worker 的 shell 落地围栏。两个入口都通过 `ctx` 使用 DSH 服务，源文件不 import DSH 包（`index.js:1-159`、`router.js:1-9`）。

```mermaid
flowchart TB
  U[用户输入] --> R[Router Session]
  R -->|dispatch_worker / continue_worker| D[src/dispatch.js / src/continue.js]
  D --> T[(Task 记录)]
  D --> W[Worker Session]
  W --> WT[Worktree]
  W -->|review_worker_commit| RV[src/review.js]
  RV --> HR[独立 Reviewer]
  HR -->|submit_review| RV
  W -->|message_router| R
  T --> G[src/git-actions.js]
  G --> M[src/merge.js]
  G --> T[src/merge-tool.js]
  G --> GH[src/github.js]
  G --> RV
  M --> P[Project checkout]
  GH --> PR[Pull request]
  T --> B[src/board.js]
  B --> C[client.js 面板]
  C -->|merge、publish、review、delete-branch、delete-task| B
  R --> TG[src/turn-guard.js]
  W -->|最终报告| ME[src/memory.js]
  W -->|每轮 turn/end| AR[(原始归档)]
  ME -.->|读取原始会话| W
  ME --> MS[src/memory-store.js]
  MS --> MF[(全局 + 项目记忆、skill、全局知识库)]
  MS -.->|项目 + 全局注入| W
  MS -.->|全局注入| R
  MS -.->|审查时注入| RV
```

## 核心模块

### `index.js`

Host 生命周期入口。`agent/created` 为 Worker Session 找到 Task，把 `starting` 或 `resuming` 改为 `running`，安装工具守卫，按条件注册 `create_worktree`、`review_worker_commit`、消息和报告工具，并注册 `knowledge_query` 与 `knowledge_get`（`index.js`）。它为已认领的 Reviewer 注册 `submit_review`、`knowledge_query` 和 `knowledge_get`，为 memory 角色注册这两个读取工具与 `knowledge_write`；并注册 `/superagent-lite/tasks`、`/superagent-lite/git` 和 `/superagent-lite/worker-settings` 三个路由。它把项目 + 全局记忆注册为 Worker 的必需运行时上下文，并在 Worker 创建时读取。启动队列在 Task 结束和 Worker 释放名额时调用 `pumpWorkers`。

`subagent/end` 落定 change 和 merge 任务：`review-required`、`awaiting-merge`、`failed` 或 `delivery-blocked`；report 任务未交报告则 `failed`。`session/event` 把事件交给派发守卫，并在 Worker 的 `turn/end` 触发原始归档。它不决定路由，也不编辑项目文件。

### `router.js`

装载时先刷新并注册全局记忆上下文，再注册 `dispatch_worker` 和 `continue_worker`。Router 只读取全局记忆；Router 预设的 skill 根也只保留全局 skill 根。`dispatch_worker` 的 `mode=merge` 把目标分支解析后写入 Task 的 `mergeBranches`：同一 Router Session 和 Project 没有运行中的 merge worker 时启动一个新的；有则把目标追加到该 Task 并给 worker 发送 follow-up（`src/dispatch.js:13-131`）。它不持有 Task 记录。

### `src/memory.js`

定义记忆字段、注入文本、memory 角色提示词、提取流程、全局知识库查询/读取/写入工具和轮次归档。Worker 和 Reviewer 读取项目 + 全局记忆；Router 只读取全局记忆。memory 角色读取 Worker 的会话记录，但最终报告工具的参数不进入 transcript；知识库通过 `knowledge_query` / `knowledge_get` 读取、通过 `knowledge_write` 写入，只有 memory 角色能写（`src/memory.js`）。

### `src/memory-store.js`

保存全局记忆、项目记忆、全局知识库、全局/项目 skill 文件和原始归档；项目 skill 目录同时写入 `.git/info/exclude`，避免弄脏项目 checkout。Worker 和 Reviewer 创建时会在各自 scope 注册一个 project-skill provider，从项目 checkout 读取项目 skill，供 catalog 使用。全局记忆和知识库各是一个 JSON 文档；项目记忆按规范化项目根哈希分文件；字段校验上限 4,000 字符，skill description 最多 500 字符，知识条目最多 200 条；写入使用临时文件 + rename，目录 `0700`、文件 `0600`；skill 写成 DSH 兼容的 `SKILL.md`；归档位于 `task/archive/`（`src/memory-store.js`）。

### `src/task-store.js`

Task JSON 的唯一存储模块。默认根目录 `~/.dsh/superagent-lite`，创建 `tasks/` 和 `tasks/sessions/`；记录以 `0600` 原子写入，按根和键串行化；创建时强制 Team 与 Project 一对一；提供 Session ID 到 Task 的反查。`cancelQueuedTask` 在同一 Task 锁内复核状态仍为 `queued`，再删除记录和会话映射；状态已变化时抛错，避免取消与启动队列竞争（`src/task-store.js:34-181`）。

### `src/dispatch.js`

校验参数；`mode=answer` 直接返回未委派，不建 Worktree、不建 Task、不写 Task 记录。其余模式从 Router agent 与 call ID 派生 Task ID，读取项目根、base commit、base branch 和工作区状态，写 `queued` 记录，建立 Session 映射，交给启动队列在名额内启动。启动失败把 Task 标为 `failed`。`mode=merge` 先按 Router 和 Project 串行，找到有活 Worker Session 的运行中 merge Task 时把目标追加到 `mergeBranches`、把请求记入 `followUps` 并发送 follow-up；没有才创建新 Task（`src/dispatch.js:44-115`、`src/launch-queue.js`）。

### `src/continue.js`

把 follow-up 送给运行中的 Worker 或空闲 Worker。运行中发短更新；空闲时发精简续派发消息（任务标识、不可变规则、唯一权威的 Follow-up），仅在检测到上下文压缩时回放原需求。已结束的 Task 先改 `resuming`，保留旧 Review 记录；follow-up 先记录，发送失败回滚（`src/continue.js:1-192`）。

压缩检测读取 Worker Session 的推导消息，找 `compact-checkpoint` 来源；活着的 Worker 直接读 Session，未加载的 Worker 通过 `ctx.sessionQuery.inspectSession` 读取持久化会话，不重新挂载。两个入口都不可用时保守地不回放原需求。

### `src/worker-prompt.js`

生成 change 和 report 两种任务消息。它统一 `Project team`、`Base branch`、`Task`、`Requirements`、模式段和 `Before` / `During` / `After` / `Reporting` 段（`src/worker-prompt.js:1-69`）。

### `src/turn-guard.js`

按 Session 和回合统计用户输入与成功的派发决定。完成回合没有决定时，在 idle 后插入提醒；每个输入最多 2 次；只对 `superagent-lite` 预设生效（`src/turn-guard.js:1-133`）。

### `src/worktree-tool.js`

通过 `ctx.worktrees.create` 从 base commit 创建 Worktree，名字为 `sl-<worktreeName>-<Task ID 前 12 位>`，保存 `path`、`branch`、`baseCommit`、`repositoryRoot`、`sourceBranch`，并把 Worker 工作目录切过去。第二次调用只重新进入（`src/worktree-tool.js:23-64`）。

### `src/landing.js`

保存每个 Task 的落地状态：dispatch 写入 `land` 和 `mode`，create_worktree 写入分支，review 与面板写入 reviewed HEAD，continue 可追加推送/PR 授权。`index.js` 的 shell guard 用它检查 `git push`、`git merge`、`gh pr create` 和 `gh pr merge`；未授权、未审查或越界时返回拒绝原因。`git merge` 只对 `mode=merge` 的 Task 开放，change/report 任务即使有 `land` 也不能合并（`src/landing.js:1-416`、`src/worker-prompt.js:62-103`）。

### `src/review.js`

提供 `worktreeHead`：检查仓库根、分支、干净工作区和 HEAD（`src/review.js:44-54`）。`runReview` 检查净改动，读取项目 + 全局记忆，创建改动范围，启动独立 Reviewer（只禁写改工具与改变分支或历史的 git 命令），从 Reviewer 的 `submit_review` 取回裁决（内容「通过」是通过，其他内容记为意见），校验证据并复核 HEAD 后写入 Review（`src/review.js:12-34`、`src/review.js:73-127`）。`review_worker_commit` 和面板的审查动作共用 `runReview`；Reviewer 的提示词不包含 diff（`src/review.js:56-71`）。

### `src/review-scope.js`

定义 Reviewer 的「改动」：Worktree 加 `base..head`。Reviewer 可以读取任意文件和运行任意命令；它只拒绝会改变 git 分支或历史的子命令，并记录 Reviewer 是否真的读过 diff 或改动文件（`src/review-scope.js:1-283`）。

### `src/helper-guard.js`

维护待认领 helper 队列并安装 guard。记忆对话没有审查范围，保持只读：放行只读工具集（`structured_output`、`read`、`read_image`、`glob`、`grep`、`read_page`、`web_fetch`、`web_search`、`x_search`、`job_output`、`job_list`、`knowledge_query`、`knowledge_get`）和受限 shell，并强制 Session 的 `read-only` 沙箱；`knowledge_write` 只对 memory 角色放行。Reviewer 带审查范围时改用审查 guard：除写改工具外全部放行，shell 命令只交给 `review-scope` 检查 git 分支变更（`src/helper-guard.js:4-23`、`src/helper-guard.js:76-117`）。

### `src/delivery.js`

合并与发送 PR 共用的交付前置校验。`deliverableHead` 要求 Task 已结束 Worker 工作（`awaiting-merge` 或 `awaiting-ci`）、有 worker 分支和 Worktree、`review.approved === true` 且当前 HEAD 等于 `review.head`；`assertStillDeliverable` 在准备阶段复核状态与 Review，防止续派发或新提交从准备窗口混入。发送 PR 额外的 GitHub 账号与 remote 校验留在 `src/git-actions.js`（`src/delivery.js:1-19`）。

### `src/merge-tool.js`

merge worker 的 `merge_branch` 工具。它只接受 Task 的 `mergeBranches` 中的分支，把目标分支用 `git merge --no-ff --log` 合入该 Worker 自己的 worktree 分支，目标分支的 commit 摘要随合并提交进入历史；冲突时保留 merge 现场并列出冲突文件，由 Worker 解决、提交后继续。它不写共享 checkout，也不改 Task 状态（`src/merge-tool.js:1-68`）。

### `src/merge.js`

实现本地合并和分支删除。`mergeWorkerBranch` 先用共用的 `deliverableHead` 校验交付前提，再检查目标分支、干净 checkout 和 `merge-tree` 预检，切到所选目标，执行 `git merge --no-ff --log -m "Merge branch '<worker branch>'" -m '<task title>'`，让 base branch 历史保留分支的功能性 commit 及其摘要，复核目标后切回，记录 `merging`、`merged` 或 `delivery-blocked`（`src/merge.js:30-109`）。同一 Project 根的合并和删除在此排队，共享 checkout 不会被两个合并同时切换；`deleteWorkerBranch` 移除已合并的 Worktree 并删除分支（`src/merge.js:14-26`、`src/merge.js:113-142`）。用户直接指示的合并由 router 派发 `mode=merge` 的 worker，不续派原任务。

### `src/git-actions.js`

推导每个 Task 的六个面板状态，采纳同一 commit 由另一个 Task 记录的通过审查，读取本地分支、remote 和 `gh` 账号，并执行面板的 `merge`、`publish`、`review` 和 `delete-branch`。它缓存 PR 事实 30 秒，把精确 PR 状态同步进 Task，用共用的 `deliverableHead` 检查状态、审查和 HEAD，再检查目标或 remote，按 Task 串行化动作；发送 PR 额外检查 `gh` 账号；状态推导和审查索引在 `src/status.js`（`src/git-actions.js:66-543`）。

### `src/github.js`

把 remote URL 解析为 GitHub 仓库，把 reviewed commit 推送到所选 remote，打开或复用针对 base branch 的 PR，并复核精确 HEAD 和 base。它是唯一的 GitHub 写路径（`src/github.js:1-137`）。

### `src/process.js`

通过 `ctx.subprocess` 运行 `git` 和 `gh`，过滤 `GIT_*` 和 `GH_DEBUG` 环境，禁用提示和 hooks，限制输出 65,536 字节（`src/process.js:7-36`）。同步 `runCommandSync` 只供 worker shell guard 在命令执行前读取分支和 HEAD（`src/process.js:38-48`、`src/landing.js:71-80`）。

### `src/board.js`

提供 `GET /superagent-lite/tasks`、`DELETE /superagent-lite/tasks?taskId=`、`GET /superagent-lite/git?taskId=` 和 `POST /superagent-lite/git`。只允许 owner，投影公开 Task 字段，叠加推导出的面板状态，标记 `unconfirmed`，拒绝删除运行中的 Task 并删除记录与 worker 会话映射；对 `queued` Task 的 `DELETE` 走原子取消路径，状态已变化时返回 `409`。限制 JSON body 4 KB，校验合并目标或 PR remote，并把动作拒绝映射为 `409`；还提供 JSON body 读取工具（`src/board.js:1-163`）。

### `src/report-tool.js`

结束 report 任务：检查活跃 Worker、report 模式、没有 Worktree、HEAD 仍在 base commit、checkout 未变，把结论和证据发给 Router，并写入 `completed`（`src/report-tool.js:1-44`）。

### `src/message-router.js`

把 Worker 的最终结论发给 Router，要求活跃 Worker 和 1–4,000 字符文本；送达后触发 change 任务的 memory 提取（`src/message-router.js`）。

### `client.js`

浏览器面板。注册 `main` 和 `sidebar.panellist` 槽位与 `superagent-lite` 字典；加载任务，按六个面板状态分组和过滤，按 Team/Project 缩小任务，渲染会话和 PR 链接，提交 merge、publish、review、delete-branch、cancel-queued 和 delete-task 动作，并支持勾选多条任务后批量删除。取消排队只对 `queued` 行出现，成功后直接移除该行，不弹窗、不重新加载列表。合并弹窗选择本地目标分支；提交 PR 弹窗检查 `gh` 账号并选择 remote；审查从 Worker Session 启动；删除分支弹窗确认分支和工作树移除；删除任务弹窗确认移除面板记录。记忆系统标签页只读展示全局/项目记忆和全局知识库；任务列表里还有排队中的 Task 时，面板每 3 秒静默轮询任务列表并就地更新，名额释放后该行转为运行中；其他时候不轮询。面板不显示设置分组（`client.js:1-923`）。它不 import Node 模块，状态只在 React 内。

## 依赖规则

- `index.js` 和 `router.js` 是唯一插件入口。`src/` 不 import 这两个入口或 `client.js`。
- `client.js` 只在浏览器运行，通过模块加载器使用 `react`、`slots` 和 `locale`。
- 没有源文件 import `@deepseek-ai/*` 包。Host 能力通过 `ctx` 服务提供：`subagents`、`tools`、`worktrees`、`subprocess`、`agents`、`agentPresets`、`sandboxPolicy`、`workingDirectory`、`systemPrompt`、`webServer`、`connection`。
- `src/process.js` 是唯一进程启动器；所有 `git` 和 `gh` 调用经它执行（`src/process.js:7-35`）。
- `src/task-store.js` 是唯一 Task 记录存储模块；其他模块调用 `createTask`、`updateTask`、`readTask`、`removeTask`、`cancelQueuedTask`、`listTasks`、`linkWorkerSession` 或 `taskForSession`（`src/task-store.js:177-181`）。
- `src/helper-guard.js` 是唯一 helper 计数器和只读 guard 安装者（`src/helper-guard.js`）。
- `src/memory-store.js` 是唯一记忆、知识、skill 文件和归档存储模块；`src/memory.js` 是唯一记忆提示词、提取流程和知识工具模块。
- `src/github.js` 和 `src/merge.js` 是面板的交付写路径；`src/merge-tool.js` 是 merge worker 的目标分支合入路径；授权 Worker 的 shell 落地由 `index.js` 的 guard 经 `src/landing.js` 检查（`src/github.js:77-137`、`src/merge.js:30-142`、`src/merge-tool.js:13-64`、`src/landing.js:387-416`）。
- `src/status.js` 是唯一把存储状态、Git 事实和审查记录变成面板状态的地方（`src/status.js:6-49`）。

### 状态写者

| 转换 | 写者 |
| --- | --- |
| → `starting` | `src/dispatch.js` |
| → `running`，agent 创建后 | `index.js` |
| → `running`，Worktree 保存后 | `src/worktree-tool.js` |
| → `resuming` | `src/continue.js` |
| → `review-required` | `index.js` |
| → `awaiting-merge` | `index.js`；`src/git-actions.js` 在读取时修正 |
| → `merging` | `src/merge.js` |
| → `merged`，本地合并 | `src/merge.js` |
| → `merged`，精确 PR 已合并 | `src/git-actions.js` |
| → `merged`，worker HEAD 已包含在基础分支 | `src/git-actions.js`，读取时；HEAD 不是基础 commit，且存储状态属于交付状态 |
| → `publishing` | `src/git-actions.js` |
| → `awaiting-ci` | `src/github.js`；`src/git-actions.js` 在读取时修正 |
| → `delivery-blocked`，审查后 HEAD 检查失败 | `index.js` |
| → `delivery-blocked`，发送失败 | `src/git-actions.js` |
| → `delivery-blocked`，本地合并失败 | `src/merge.js` |
| → `delivery-blocked`，精确 PR 关闭 | `src/git-actions.js` |
| `review` 记录，面板审查后 | `src/git-actions.js` 经 `src/review.js` |
| `worktree` 清空，删除分支后 | `src/merge.js` |
| → `completed` | `src/report-tool.js` |
| → `failed`，派发失败 | `src/dispatch.js` |
| → `failed`，Worker 回合失败 | `index.js` |
| → `failed`，follow-up 发送失败 | `src/continue.js` |
| `unconfirmed` | `src/board.js`，只在读取时计算 |

## 模块

| 路径 | 职责 |
| --- | --- |
| `src/board.js` | 提供 owner-only 任务列表、任务删除与 Git 动作 HTTP 端点，并投影面板视图。 |
| `src/status.js` | 推导六个面板状态，并按 Project 与 commit 索引通过的审查。 |
| `src/continue.js` | 把 follow-up 送给运行中或空闲 Worker，处理恢复记录和发送失败回滚。 |
| `src/delivery.js` | 合并与发送 PR 共用的状态、审查和 HEAD 前置校验。 |
| `src/dispatch.js` | 校验派发；`mode=answer` 直接返回，`change`/`report` 创建 Task 记录并启动 Worker Session；`mode=merge` 把新请求追加给运行中的 merge worker，没有才新派发。 |
| `src/git-actions.js` | 构建面板视图，执行合并、发送 PR、审查和删除分支动作。 |
| `src/github.js` | 把 reviewed commit 交付到所选 GitHub remote 的 Pull request。 |
| `src/helper-guard.js` | 计数待认领 helper；记忆对话保持只读，Reviewer 只禁写改工具与改变分支的 git 命令。 |
| `src/landing.js` | 持有 Task 的落地授权与 reviewed HEAD，检查 Worker shell 的 push、PR 与 merge 范围。 |
| `src/launch-queue.js` | 按并发上限启动或排队 Worker；新启动的 Worker 使用保存的模型。 |
| `src/merge.js` | 实现本地 `--no-ff --log` 合并（保留分支提交摘要）和分支删除。 |
| `src/merge-tool.js` | merge worker 的 `merge_branch` 工具：把记录的目标分支合入自己的 worktree 分支，冲突留给 Worker 解决。 |
| `src/memory.js` | 定义记忆字段、注入文本、memory 角色提示词、提取流程、全局知识库查询/读取/写入工具和轮次归档。 |
| `src/memory-store.js` | 保存全局/项目记忆、全局知识库、全局/项目 skill 文件和原始归档，并执行字段校验与原子写入。 |
| `src/memory-panel.js` | 提供 owner-only 只读记忆端点，返回全局记忆、所请求项目的记忆和全局知识库条目。 |
| `src/message-router.js` | 把 Worker 的最终结论发给 Router。 |
| `src/process.js` | 以过滤环境和有界输出运行 git 与 gh。 |
| `src/report-tool.js` | 以结论和证据结束 report 任务。 |
| `src/review.js` | 检查已提交 diff，运行独立 Reviewer，接收 `submit_review` 并记录裁决。 |
| `src/review-scope.js` | 记录 Reviewer 是否读过改动，并拒绝会改变 git 分支或历史的命令。 |
| `src/task-store.js` | 读写 Task 记录和 Worker Session 映射，删除记录与映射，并按锁取消仍在排队的 Task。 |
| `src/settings-panel.js` | 提供 owner-only worker 设置读写端点，并校验模型目录。 |
| `src/skill-catalog.js` | 稳定已运行 Worker/Reviewer 会话的 skill catalog，拦截只由 memory skill 变化构成的 catalog 更新。 |
| `src/turn-guard.js` | 要求 Router 每个输入一个派发决定并发送提醒。 |
| `src/validation.js` | 校验派发参数。 |
| `src/worker-settings.js` | 保存 worker 模型和并发上限，校验字段并返回 `agentOptions`。 |
| `src/worker-prompt.js` | 生成 change 和 report 任务消息。 |
| `src/worktree-tool.js` | 创建或进入 Task 的 Worktree，并保存元数据。 |

## 测试

| 测试 | 覆盖什么 |
| --- | --- |
| `test/board.test.js` | owner 准入、公开字段投影、排队标记与失联标记、推导面板状态、任务删除、排队取消、动作校验和状态码。 |
| `test/client.test.js` | 槽位注册、中英渲染、六状态分组与筛选、排队标记与名额释放后的就地更新、会话导航、合并/提交 PR/审查/删除分支/删除任务弹窗、任务批量删除、排队取消、设置标签页、记忆标签页和错误。 |
| `test/continue.test.js` | 运行中、空闲和已结束 Task 的 follow-up 路径、精简续派发结构、压缩回放、记录顺序和发送失败回滚。 |
| `test/git-actions.test.js` | 推导状态、审查采纳、本地合并与分支删除、remote 选择、面板审查和 PR 状态同步。 |
| `test/github.test.js` | GitHub 仓库解析和 reviewed SHA 发送。 |
| `test/helper-composition.test.js` | 已安装 DSH 服务下的 helper 边界和只读沙箱。 |
| `test/helper-guard.test.js` | helper 认领、记忆只读工具与 shell 限制、Reviewer 只禁写改工具。 |
| `test/helper-wiring.test.js` | `agent/created` 只为预期 helper 安装只读守卫。 |
| `test/memory.test.js` | memory 角色提示词、全局 + 项目提取、skill 写入、纠正覆盖、空结果、transcript 上限、知识工具、注入文本、归档和 schema。 |
| `test/memory-store.test.js` | 全局和项目记忆读写、按项目隔离、字段校验、全局知识库去重/片段/纠正/删除、skill 文件、归档和损坏文件拒绝。 |
| `test/memory-wiring.test.js` | 最终报告触发提取、Worker 注入项目 + 全局记忆、知识工具只读/写入边界、Router 只注入全局记忆、归档、提取失败不影响报告，以及 memory 写 skill 后已结束 Worker 不再收到 catalog 更新。 |
| `test/memory-panel.test.js` | 记忆只读端点的 owner 准入、项目根校验、全局/项目记忆与全局知识库返回和读取失败。 |
| `test/skill-catalog.test.js` | 新会话获得 memory skill catalog，已运行 Worker 会话拦截全局/项目 memory skill 的 catalog 更新，其他 skill 变化和 Router 会话不受影响。 |
| `test/host-patch.test.js` | agent-message 任务卡 Host 补丁的检查、重复应用和回滚。 |
| `test/host.test.js` | 已安装 DSH 集成：schema、Worktree、Review 和报告。 |
| `test/dispatch-merge.test.js` | `mode=merge` 的分支/Task ID 解析、授权与目标校验、追加到运行中的 merge worker、并发排队和发送失败回滚。 |
| `test/merge-tool.test.js` | merge worker 的目标分支合并、冲突保留和 worktree 状态限制。 |
| `test/land-all.test.js` | 双方纯新增时保留两边、同一行改写与 add/add 冲突时停下、按计划顺序合并和测试失败即停。 |
| `test/landing.test.js` | 未授权与授权后的 push/PR/merge 检查、分支与 reviewed HEAD 范围、跨任务授权和伪造授权。 |
| `test/landing-wiring.test.js` | Worker shell guard 的安装、真实拒绝与放行、跨任务隔离。 |
| `test/worker-settings.test.js` | 设置默认值与校验、模型覆盖、并发排队、排队取消、review 不占名额和设置端点。 |
| `test/preset-injection.test.js` | Router 预设挂载 agent instructions，Worker 预设保留自己的配置。 |
| `test/process.test.js` | git/gh 默认 65,536 字节上限、自定义上限和超限报错。 |
| `test/prompt-config.test.js` | Router 提示词的回复、合并授权，以及提示词与文档的一致性。 |
| `test/report-only.test.js` | report 任务的完成、无分支提交、伪造 Worktree 拒绝、报告提示词，以及 `mode=answer` 无 Task/Worker/命令副作用。 |
| `test/review-scope.test.js` | Reviewer 可自由读取，改变分支的 git 命令被拒，diff/改动文件算证据。 |
| `test/review.test.js` | Reviewer 提示词不带 diff、无证据裁决被拒、读改动文件算证据。 |
| `test/routing-rule.test.js` | 两个路由工具把不同目标挡在 `continue_worker` 外，persona 与工具描述说明三种 mode。 |
| `test/status.test.js` | 六个面板状态、优先级和审查索引。 |
| `test/task-store.test.js` | Task 记录私有写入、Session 反查、删除记录与映射、排队取消和路径形 ID 拒绝。 |
| `test/turn-guard.test.js` | 每个输入一个决定、提醒预算、idle 投递和中止处理。 |
| `test/validation.test.js` | `mode` 必填、`answer` 直接返回，以及 change/report/merge 的参数规则和 `worktreeName` 校验。 |
| `test/wiring.test.js` | `apply` 把 `turn/end` 与 idle 接到派发提醒。 |
| `test/worker-prompt.test.js` | change 与 report 任务消息、段顺序和范围限制。 |
| `test/worktree-tool.test.js` | 可读 Worktree 与分支名、重复调用重新进入，以及旧 Task 的原命名回退。 |

## 持久化

Task 文件在 `~/.dsh/superagent-lite/`，Worktree 在各项目下。

| 记录 | 路径 | 写者 |
| --- | --- | --- |
| Task | `tasks/<id>.json` | `src/task-store.js` |
| Worker Session 映射 | `tasks/sessions/<sha256(sessionId)>.json` | `src/dispatch.js` 通过 `linkWorkerSession` |
| Worktree | `<project>/.agents/worktrees/` | worktree 服务 |
| 全局记忆 | `memory/global.json` | `src/memory.js` 经 `src/memory-store.js` |
| 项目记忆 | `memory/projects/<sha256(projectRoot)>.json` | `src/memory.js` 经 `src/memory-store.js` |
| 全局知识库 | `memory/knowledge.json` | `knowledge_write` 经 `src/memory-store.js` |
| 全局 skill | `~/.agents/skills/superagent-shared-memory/SKILL.md` | `src/memory.js` 经 `src/memory-store.js` |
| 项目 skill | `<project>/.dsh/skills/superagent-project-memory/SKILL.md` | `src/memory.js` 经 `src/memory-store.js` |
| 原始归档 | `task/archive/<sha256(sessionId+seq)>.json` | `index.js` 的 `session/event` 经 `src/memory.js` |

目录以 `0700` 创建，文件以 `0600` 写入（`src/task-store.js:34-57`）。

## 对外接口

| 工具 | 调用方 | 用途 |
| --- | --- | --- |
| `dispatch_worker` | Router | 记录派发决定；`answer` 直接回答，`change`/`report`/`merge` 启动 Worker；change/merge 必须给出英文 `worktreeName` |
| `continue_worker` | Router | 给同一 Task 发 follow-up |
| `create_worktree` | change worker | 创建或进入 Task 的 Worktree |
| `review_worker_commit` | change worker | 审查干净的已提交 diff |
| `submit_review` | Reviewer helper | 记录裁决；内容「通过」即通过 |
| `report_task` | report worker | 结束 report 任务并交回结论 |
| `message_router` | Worker | 把最终结论发给 Router；送达后触发 change 任务的 memory 提取 |
| `knowledge_query` | Worker、Reviewer、memory 角色 | 按关键词查询全局知识库，返回编号和匹配关键词前后的上下文片段；只读 |
| `knowledge_get` | Worker、Reviewer、memory 角色 | 按 `knowledge_query` 返回的编号读取完整知识条目；只读 |
| `knowledge_write` | memory 角色 | 新增、纠正或删除全局知识；只有 memory 角色可见 |

| 端点 | 方法 | 用途 |
| --- | --- | --- |
| `/superagent-lite/tasks` | `GET` | 返回 owner 可见的 Task 列表和推导出的面板状态 |
| `/superagent-lite/tasks` | `DELETE` | 删除一个已结束 Task 的记录和 worker 会话映射；对 `queued` Task 原子取消并拒绝已离开队列的任务 |
| `/superagent-lite/git` | `GET` | 返回一个 Task 的提交、改动文件、本地分支、remote 和 `gh` 账号 |
| `/superagent-lite/git` | `POST` | 执行 `merge`、`publish`、`review` 或 `delete-branch` |
| `/superagent-lite/worker-settings` | `GET`、`POST` | 读取 worker 设置和模型目录，或保存 worker 模型与并发上限 |
| `/superagent-lite/memory` | `GET` | 只读返回全局记忆、所选项目的项目记忆和全局知识库条目 |

| 接口 | 值 |
| --- | --- |
| 侧栏槽位 | `sidebar.panellist`，面板标签「项目任务」 |
| 主槽位 | `main` |
| Locale 命名空间 | `superagent-lite` |
| 包导出 | `.`、`./router`、`./locale/*.json`、`./icon`、`./client` |
| DSH bundle patch | `./cordis.patch.yml` |
| DSH client | Web 平台、立即注入，依赖 layout、sidebar、workspace 和 locale |

## 配置更新

| 变更 | 生效时机 |
| --- | --- |
| `cordis.patch.yml` | 下一次 bundle 加载 |
| `src/` 里的工具文字 | bundle 加载后的下一次拼装回合 |
| `client.js` 字典 | 下一次客户端 bundle 加载 |
| Task 记录 | 下一次面板加载；面板会修正已审查的 HEAD 并采纳同一 commit 的审查 |
| GitHub remote 与 PR 事实 | PR 事实缓存 30 秒；面板刷新在缓存过期后重新读取 |
