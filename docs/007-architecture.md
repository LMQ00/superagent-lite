# 007 架构

这份文档把 [001 领域模型](001-domain.md) 的概念映射到文件、服务和数据。先读「核心流程」和「依赖规则」，再把「模块」与「测试」两张表当索引用。它建立在 [000 原则](000-philosophy.md) 到 [006 部署](006-deployment.md) 之上。

## 核心流程

Host 插件 `index.js` 管理 Worker 生命周期和面板路由；Router 插件 `router.js` 注册路由工具。merge 任务的目标分支合入由 `src/merge-tool.js` 执行，最终合入 base branch 仍走 Worker 的 shell 落地围栏。两个入口都通过 `ctx` 使用 DSH 服务，源文件不 import DSH 包（`index.js:1-159`、`router.js:1-9`）。

```mermaid
flowchart TB
  U[用户输入] --> R[Router Session]
  R -->|dispatch_worker / continue_worker| D[src/dispatch.js / src/continue.js]
  D --> T[(Task 记录)]
  D --> W[Worker Session]
  W --> WT[Worktree]
  W -->|review_worker_commit| RV[src/review.js]
  RV --> HR[只读 Reviewer]
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
```

## 核心模块

### `index.js`

Host 生命周期入口。`agent/created` 为 Worker Session 找到 Task，把 `starting` 或 `resuming` 改为 `running`，安装工具守卫，按条件注册 `create_worktree`、`review_worker_commit`、消息和报告工具（`index.js:38-98`）。它为已认领的 Reviewer 注册 `submit_review`，并注册 `/superagent-lite/tasks`、`/superagent-lite/git` 和 `/superagent-lite/worker-settings` 三个路由（`index.js:16-44`）。启动队列在 Task 结束和 Worker 释放名额时调用 `pumpWorkers`。

`subagent/end` 落定 change 和 merge 任务：`review-required`、`awaiting-merge`、`failed` 或 `delivery-blocked`；report 任务未交报告则 `failed`（`index.js:119-151`）。`session/event` 只把事件交给派发守卫（`index.js:115-117`）。它不决定路由，也不编辑项目文件。

### `router.js`

装载时注册 `dispatch_worker` 和 `continue_worker`（`router.js:7-9`）。`dispatch_worker` 的 `mode=merge` 把目标分支解析后写入 Task 的 `mergeBranches`，并启动一个新的 merge worker（`src/dispatch.js:13-131`）。它不持有 Task 记录。

### `src/task-store.js`

Task JSON 的唯一存储模块。默认根目录 `~/.dsh/superagent-lite`，创建 `tasks/` 和 `tasks/sessions/`；记录以 `0600` 原子写入，按根和键串行化；创建时强制 Team 与 Project 一对一；提供 Session ID 到 Task 的反查（`src/task-store.js:34-138`）。

### `src/dispatch.js`

校验参数；`mode=answer` 直接返回未委派，不建 Worktree、不建 Task、不写 Task 记录。其余模式从 Router agent 与 call ID 派生 Task ID，读取项目根、base commit、base branch 和工作区状态，写 `queued` 记录，建立 Session 映射，交给启动队列在名额内启动。启动失败把 Task 标为 `failed`（`src/dispatch.js:44-115`、`src/launch-queue.js`）。

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

提供 `worktreeHead`：检查仓库根、分支、干净工作区和 HEAD（`src/review.js:42-52`）。`runReview` 检查净改动，创建审查范围，启动只读 Reviewer，从 Reviewer 的 `submit_review` 取回裁决（内容「通过」是通过，其他内容记为意见），校验证据并复核 HEAD 后写入 Review（`src/review.js:12-34`、`src/review.js:69-123`）。`review_worker_commit` 和面板的审查动作共用 `runReview`；Reviewer 的提示词不包含 diff（`src/review.js:54-67`）。

### `src/review-scope.js`

定义 Reviewer 的「改动」范围：Worktree 加 `base..head`。它校验文件路径、符号链接、`.git`、绝对路径、git 子命令、版本参数、flag、只读命令和 workdir，并记录是否真的读过 diff 或改动文件（`src/review-scope.js:1-231`）。

### `src/helper-guard.js`

维护待认领 helper 队列，安装只读 guard。Reviewer 继承 Worker 工具集，因此 guard 把 shell 限制在只读模式。没有审查范围时放行只读工具集（`structured_output`、`read`、`read_image`、`glob`、`grep`、`read_page`、`web_fetch`、`web_search`、`x_search`、`job_output`、`job_list`）和受限 shell；带审查范围时进一步收窄到 `structured_output`、`read`、`read_image`、`glob`、`grep`、`bash`、`pwsh`，再套 `review-scope`（`src/helper-guard.js:4-23`、`src/helper-guard.js:73-107`）。

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

提供 `GET /superagent-lite/tasks`、`DELETE /superagent-lite/tasks?taskId=`、`GET /superagent-lite/git?taskId=` 和 `POST /superagent-lite/git`。只允许 owner，投影公开 Task 字段，叠加推导出的面板状态，标记 `unconfirmed`，拒绝删除运行中的 Task 并删除记录与 worker 会话映射，限制 JSON body 4 KB，校验合并目标或 PR remote，并把动作拒绝映射为 `409`；还提供 JSON body 读取工具（`src/board.js:1-150`）。

### `src/report-tool.js`

结束 report 任务：检查活跃 Worker、report 模式、没有 Worktree、HEAD 仍在 base commit、checkout 未变，把结论和证据发给 Router，并写入 `completed`（`src/report-tool.js:1-44`）。

### `src/message-router.js`

把 Worker 的最终结论发给 Router，要求活跃 Worker 和 1–4,000 字符文本（`src/message-router.js:1-25`）。

### `client.js`

浏览器面板。注册 `main` 和 `sidebar.panellist` 槽位与 `superagent-lite` 字典；加载任务，按六个面板状态分组和过滤，按 Team/Project 缩小任务，渲染会话和 PR 链接，提交 merge、publish、review、delete-branch 和 delete-task 动作，并支持勾选多条任务后批量删除。合并弹窗选择本地目标分支；提交 PR 弹窗检查 `gh` 账号并选择 remote；审查从 Worker Session 启动；删除分支弹窗确认分支和工作树移除；删除任务弹窗确认移除面板记录。面板不显示设置分组（`client.js:1-709`）。它不 import Node 模块，状态只在 React 内。

## 依赖规则

- `index.js` 和 `router.js` 是唯一插件入口。`src/` 不 import 这两个入口或 `client.js`。
- `client.js` 只在浏览器运行，通过模块加载器使用 `react`、`slots` 和 `locale`。
- 没有源文件 import `@deepseek-ai/*` 包。Host 能力通过 `ctx` 服务提供：`subagents`、`tools`、`worktrees`、`subprocess`、`agents`、`agentPresets`、`sandboxPolicy`、`workingDirectory`、`webServer`、`connection`（`index.js:16`、`router.js:4`）。
- `src/process.js` 是唯一进程启动器；所有 `git` 和 `gh` 调用经它执行（`src/process.js:7-35`）。
- `src/task-store.js` 是唯一 Task 记录存储模块；其他模块调用 `createTask`、`updateTask`、`readTask`、`removeTask`、`listTasks`、`linkWorkerSession` 或 `taskForSession`（`src/task-store.js:157-161`）。
- `src/helper-guard.js` 是唯一 helper 计数器和只读 guard 安装者（`src/helper-guard.js:25-107`）。
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
| `src/dispatch.js` | 校验派发；`mode=answer` 直接返回，`change`/`report` 创建 Task 记录并启动 Worker Session。 |
| `src/git-actions.js` | 构建面板视图，执行合并、发送 PR、审查和删除分支动作。 |
| `src/github.js` | 把 reviewed commit 交付到所选 GitHub remote 的 Pull request。 |
| `src/helper-guard.js` | 计数待认领 helper，并把它们限制在只读工具和审查范围内。 |
| `src/landing.js` | 持有 Task 的落地授权与 reviewed HEAD，检查 Worker shell 的 push、PR 与 merge 范围。 |
| `src/launch-queue.js` | 按并发上限启动或排队 Worker；新启动的 Worker 使用保存的模型。 |
| `src/merge.js` | 实现本地 `--no-ff --log` 合并（保留分支提交摘要）和分支删除。 |
| `src/merge-tool.js` | merge worker 的 `merge_branch` 工具：把记录的目标分支合入自己的 worktree 分支，冲突留给 Worker 解决。 |
| `src/message-router.js` | 把 Worker 的最终结论发给 Router。 |
| `src/process.js` | 以过滤环境和有界输出运行 git 与 gh。 |
| `src/report-tool.js` | 以结论和证据结束 report 任务。 |
| `src/review.js` | 检查已提交 diff，运行只读 Reviewer，接收 `submit_review` 并记录裁决。 |
| `src/review-scope.js` | 定义 Reviewer 可读的 Worktree 与 `base..head` 范围并执行放行检查。 |
| `src/task-store.js` | 读写 Task 记录和 Worker Session 映射，删除记录与映射。 |
| `src/settings-panel.js` | 提供 owner-only worker 设置读写端点，并校验模型目录。 |
| `src/turn-guard.js` | 要求 Router 每个输入一个派发决定并发送提醒。 |
| `src/validation.js` | 校验派发参数。 |
| `src/worker-settings.js` | 保存 worker 模型和并发上限，校验字段并返回 `agentOptions`。 |
| `src/worker-prompt.js` | 生成 change 和 report 任务消息。 |
| `src/worktree-tool.js` | 创建或进入 Task 的 Worktree，并保存元数据。 |

## 测试

| 测试 | 覆盖什么 |
| --- | --- |
| `test/board.test.js` | owner 准入、公开字段投影、推导面板状态、任务删除、动作校验和状态码。 |
| `test/client.test.js` | 槽位注册、中英渲染、六状态分组与筛选、会话导航、合并/提交 PR/审查/删除分支/删除任务弹窗、任务批量删除、设置标签页和错误。 |
| `test/continue.test.js` | 运行中、空闲和已结束 Task 的 follow-up 路径、精简续派发结构、压缩回放、记录顺序和发送失败回滚。 |
| `test/git-actions.test.js` | 推导状态、审查采纳、本地合并与分支删除、remote 选择、面板审查和 PR 状态同步。 |
| `test/github.test.js` | GitHub 仓库解析和 reviewed SHA 发送。 |
| `test/helper-composition.test.js` | 已安装 DSH 服务下的 helper 边界和只读沙箱。 |
| `test/helper-guard.test.js` | helper 认领、只读工具白名单和 shell 限制。 |
| `test/helper-wiring.test.js` | `agent/created` 只为预期 helper 安装只读守卫。 |
| `test/host-patch.test.js` | agent-message 任务卡 Host 补丁的检查、重复应用和回滚。 |
| `test/host.test.js` | 已安装 DSH 集成：schema、Worktree、Review 和报告。 |
| `test/dispatch-merge.test.js` | `mode=merge` 的分支/Task ID 解析、授权与目标校验。 |
| `test/merge-tool.test.js` | merge worker 的目标分支合并、冲突保留和 worktree 状态限制。 |
| `test/land-all.test.js` | 双方纯新增时保留两边、同一行改写与 add/add 冲突时停下、按计划顺序合并和测试失败即停。 |
| `test/landing.test.js` | 未授权与授权后的 push/PR/merge 检查、分支与 reviewed HEAD 范围、跨任务授权和伪造授权。 |
| `test/landing-wiring.test.js` | Worker shell guard 的安装、真实拒绝与放行、跨任务隔离。 |
| `test/worker-settings.test.js` | 设置默认值与校验、模型覆盖、并发排队、review 不占名额和设置端点。 |
| `test/preset-injection.test.js` | Router 预设挂载 agent instructions，Worker 预设保留自己的配置。 |
| `test/process.test.js` | git/gh 默认 65,536 字节上限、自定义上限和超限报错。 |
| `test/prompt-config.test.js` | Router 提示词的回复、合并授权，以及提示词与文档的一致性。 |
| `test/report-only.test.js` | report 任务的完成、无分支提交、伪造 Worktree 拒绝、报告提示词，以及 `mode=answer` 无 Task/Worker/命令副作用。 |
| `test/review-scope.test.js` | Reviewer 文件读取、符号链接和只读命令的范围限制。 |
| `test/review.test.js` | Reviewer 提示词带范围不带 diff、无证据裁决被拒、读改动文件算证据。 |
| `test/routing-rule.test.js` | 两个路由工具把不同目标挡在 `continue_worker` 外，persona 与工具描述说明三种 mode。 |
| `test/status.test.js` | 六个面板状态、优先级和审查索引。 |
| `test/task-store.test.js` | Task 记录私有写入、Session 反查、删除记录与映射和路径形 ID 拒绝。 |
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
| `message_router` | Worker | 把最终结论发给 Router |

| 端点 | 方法 | 用途 |
| --- | --- | --- |
| `/superagent-lite/tasks` | `GET` | 返回 owner 可见的 Task 列表和推导出的面板状态 |
| `/superagent-lite/tasks` | `DELETE` | 删除一个已结束 Task 的记录和 worker 会话映射 |
| `/superagent-lite/git` | `GET` | 返回一个 Task 的提交、改动文件、本地分支、remote 和 `gh` 账号 |
| `/superagent-lite/git` | `POST` | 执行 `merge`、`publish`、`review` 或 `delete-branch` |
| `/superagent-lite/worker-settings` | `GET`、`POST` | 读取 worker 设置和模型目录，或保存 worker 模型与并发上限 |

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
