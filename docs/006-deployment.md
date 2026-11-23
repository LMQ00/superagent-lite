# 006 部署

使用这份文档安装、配置、升级和排障 Superagent 轻量版 bundle。它建立在 [001 领域模型](001-domain.md) 到 [005 界面](005-panel.md) 之上。

## 运行什么

Bundle 运行在一个 DeepSeek Harness Web 进程内，增加两个预设、一个 worktree 服务、路由工具、Worker 工具、Task 与 Memory 存储、记忆对话角色和面板。它不启动独立守护进程，也不开放自己的端口（`cordis.patch.yml:1-123`、`index.js:15-31`）。

| 组件 | 作用 |
| --- | --- |
| DSH Web Host | 运行插件、Session 和面板 |
| `@local/superagent-lite` bundle | 提供预设、工具、HTTP 路由、Task 存储和 Memory 存储 |
| Worktree 服务 | 为每个 Task 创建并保留一个 Worktree |
| 记忆对话 | 为 change worker 把结论提炼成四类记忆 |
| GitHub CLI `gh` | 可选；只为面板的「提交 PR」动作服务；合并是本地 Git 操作，不需要账号 |
| GitHub remote | 可选；发送 PR 需要，合并不需要 |

## 前置条件

| 要求 | 值 |
| --- | --- |
| DeepSeek Harness | `0.2.2-rc.3`，即 `package.json` 的 `engines.dsh` |
| Node.js | 24.9 或更新，跟随 DSH 引擎要求 |
| Git | 支持 `git merge-tree --write-tree HEAD HEAD` 的版本 |
| GitHub CLI | 发送 PR 需要；`gh auth status --hostname github.com` 必须成功 |
| 项目 checkout | 已检出的 Git 仓库，当前有分支 |

Bundle 自带 worktree 服务，不要与另一个挂载 worktree 服务的 bundle 同时启用。

## 安装

仓库没有运行时依赖，不需要 `npm install`。

```bash
git clone https://github.com/LMQ00/superagent-lite.git
cd superagent-lite
npm test
git merge-tree --write-tree HEAD HEAD >/dev/null && echo "merge-tree ok"
```

`npm test` 以 `fail 0` 结束；`merge-tree ok` 确认 Git 能力。然后安装 bundle：

1. 打开 DSH Web 的插件管理器。
2. 点「添加插件」。
3. 输入本仓库的绝对路径并安装。
4. 在插件管理器里启用这个 bundle。
5. 新建 Session，在预设里选择「Superagent 轻量版」或「Superagent 轻量版 worker」。

安装成功的判据：预设列表出现两个预设，侧栏出现「项目任务」。Bundle 会插入自己的 worktree 服务，目录 `.agents/worktrees`，名字前缀 `sl-`，`retainOnArchive: true`（`cordis.patch.yml:1-7`）。

## 配置

Bundle 没有设置页，配置是 `cordis.patch.yml` 和源文件。

| 键 | 必填 | 含义 |
| --- | --- | --- |
| `worktree.directory` | 是，默认 `.agents/worktrees` | Worktree 在项目内的创建目录 |
| `worktree.namePrefix` | 是，默认 `sl-` | Worktree 名字前缀 |
| `worktree.retainOnArchive` | 是，默认 `true` | Session 归档后保留 worker 分支和检出 |
| Router `preset.id` | 是，`superagent-lite` | Router 预设 ID |
| Worker `preset.id` | 是，`superagent-lite-worker` | Worker 预设 ID |
| `engines.dsh` | 是，`0.2.2-rc.3` | Bundle 面向的 Host 版本 |

外部设置单独完成：

| 设置 | 用于 | 做法 |
| --- | --- | --- |
| Session 文件策略 | 合并、发送 PR、审查、删除分支 | 把 Router Session 设为 full access；动作检查 `danger-full-access` |
| GitHub remote | 发送 PR | `git remote -v` 显示一个 remote，fetch 与 push URL 指向同一个 GitHub 仓库；面板列出 remote 供选择 |
| `gh` 登录 | 发送 PR | `gh auth status --hostname github.com` |
| GitHub 分支保护与必需检查 | 在 GitHub 上合并 PR | 在 GitHub 仓库设置；插件不预检检查状态 |
| Host 补丁 | 任务消息卡片 | 见 [HOST-PATCH](HOST-PATCH.md) 和 [HOST-PATCH-AGENT-MESSAGE](HOST-PATCH-AGENT-MESSAGE.md)；不打补丁也能运行 |

## 启停与状态

插件没有独立进程和 CLI，因此没有进程退出码。启停随 bundle 和 DSH Web 进程。

| 操作 | 做法 |
| --- | --- |
| 启动 | 启用 bundle，启动 DSH Web |
| 重载 | 禁用再启用 bundle，或重启 DSH Web |
| 停止 | 禁用 bundle，或停止 DSH Web |
| 任务状态 | 打开「项目任务」；6 个状态分组见 [005 界面](005-panel.md)，顺序由 [003 生命周期](003-lifecycle.md) 定义 |
| 行内动作 | 未合并提供合并和提交 PR；未审查提供审查；已完成提供删除分支。失败动作显示后端错误，Task 保留已存储的生命周期状态 |
| 记忆 | 面板列出 private、public、profile、team 的记录、计数、调用方式和当前 profile 注入；编辑和删除只在 owner 点击时生效 |
| 记录位置 | `~/.dsh/superagent-lite/`，分为 `tasks/` 和 `memory/` |
| 日志 | 不写独立日志文件；插件警告进 DSH Host 日志，Task 错误还写入 `failure` 字段 |

面板 HTTP 端点的状态码：

| 码 | 含义 |
| --- | --- |
| `200` | 列表、Git 动作或记忆动作成功 |
| `400` | 任务 ID、记忆动作、分类、记录 ID、字段或 JSON 请求体格式不对 |
| `403` | 请求者不是安装 owner；其他准入拒绝使用 Host 返回的拒绝码 |
| `404` | 记忆记录不存在，或 Git 详情找不到 Task |
| `405` | 方法不被该端点接受 |
| `409` | Git 动作被拒绝或失败，或记忆存储拒绝动作 |
| `413` | Git 动作请求体超过 4 KB，或记忆动作超过 32 KB |
| `415` | 动作请求体不是 `application/json` |

## 设置

1. 确认 `node --version` 满足 DSH 引擎要求，且 `git merge-tree --write-tree HEAD HEAD` 成功。
2. 安装并启用 bundle，新建「Superagent 轻量版」Session。
3. 打开目标仓库为工作目录，确认已检出分支且 `git status` 干净。
4. 需要发送 PR 时，配置一个 GitHub remote，运行 `gh auth status --hostname github.com`，并至少配置一个必需检查。
5. 需要合并或发送 PR 时，把 Router Session 设为 full access。
6. 先问一个只读问题：Router 应直接回答，不启动 Worker。
7. 再要求一个小的文件改动：面板应把审查通过的 Task 显示为「未合并」，并出现「合并」和「提交 PR」；如果审查未通过，先显示「未审查」。
8. 打开记忆区：有记录时列出，owner 点击编辑或删除后立即生效。

## 升级

1. 备份 `~/.dsh/superagent-lite/`。
2. 等运行中的 Worker 结束。
3. 在仓库执行 `git pull --ff-only`。
4. 运行 `npm test`，确认 `fail 0`。
5. 重载或重启 DSH Web。
6. 打开「项目任务」，确认已有 Task 和分支仍在列表里。

升级不改写 Task 或 Memory 记录，它们留在 `~/.dsh/superagent-lite/`。重启时仍在运行的 Worker 可能显示「未确认」；Worker Session 可用时可以用 `continue_worker` 继续，否则需要重新派发（`src/board.js:18-26`）。

回滚：停用 bundle，检出上一个 commit，必要时恢复备份，再重载 DSH Web。

## 排障

| 现象 | 原因与修法 |
| --- | --- |
| `Project checkout has uncommitted changes; commit or stash them before dispatching workers` | 提交或 stash 项目 checkout；唯一允许的脏行是 `?? .agents/worktrees/.gitignore` |
| `Create the assigned project worktree before using any other tool.` | Worker 在 `create_worktree` 前用了别的工具；让它先创建或进入 Worktree |
| `This worker is frozen.` | Worker 的 subagent 已结束；用 `continue_worker` 恢复 Task，或重新派发 |
| `This worker has no matching project task` | 当前 Session 不是该 Task 的 Worker；重新派发，不要复用 Session |
| `Dispatch <id> is already being established; inspect the task board before retrying` | 同一派发对应的 Task 处于 `starting` 或 `failed`；查看「项目任务」后用新输入派发 |
| `The router Session is not running` | 本地合并需要 Router Session 保持运行 |
| `Git delivery is unavailable under the current Session file policy` | 把 Router Session 设为 full access |
| `The merge target branch "<name>" was not found` | 在合并弹窗里选择一个存在的本地分支 |
| `The selected remote is not a single GitHub fetch/push repository` | 选择一个 fetch 和 push URL 指向同一 GitHub 仓库的 remote |
| `The worker Session is not running; open its conversation to review the commit there` | 审查动作需要活着的 Worker Session；恢复或重新派发该 Task |
| `Delete the worker branch only after the task is merged` | 先合并 reviewed HEAD，再删除分支 |
| `No reviewed local commit is ready for delivery` | 先调用 `review_worker_commit` 并修完问题；合并与发送 PR 共用这条前置校验 |
| `The worker branch no longer matches its reviewed commit` | 审查后又有提交；重新审查新 HEAD |
| `The reviewer did not inspect the committed change; read the base..head diff or a changed file before deciding` | Reviewer 没有读改动；重新运行审查，让它读 `base..head` 或改动文件 |
| `Merge would conflict; the target was not changed` | 把基础分支合并进 worker 分支并重新审查；插件没有改目标 |
| `The project checkout has uncommitted changes` | 合并前提交或 stash 项目 checkout 的改动 |
| `The worker worktree has uncommitted changes; commit or remove them before deleting the branch` | 删除分支前清理 worker Worktree |
| `Only settled, unpublished worktrees can be resumed` | Task 没有可恢复的 Worktree，或状态不是 `awaiting-merge`、`review-required`、`failed`；重新派发 |
| `This task does not belong to the current router Session.` | 在派发该 Task 的 Router Session 里运行 `/merge-worker` |
| `Local merge is unavailable under this Session file policy.` | 把 Router Session 设为 full access |
| `Only a task that finished its worker turn can be delivered` | Task 处于 `resuming`、`running`、`publishing`、`merging`、`failed`、`delivery-blocked` 等非交付状态；等 Worker 回合结束或刷新面板后重试 |
| `The task left its deliverable state during preparation` | 交付准备期间 Task 被续派发或状态变化；重新确认后重试，本次没有执行写操作 |
| `The review changed during delivery` | 准备期间 Review 被替换或 HEAD 移动；重新审查当前 HEAD |
| `GitHub authentication is required to publish: ...` | 运行 `gh auth login` 后重试；本地合并不需要 `gh` |
| `Usage: /merge-worker <task ID>` | 传一个 16 位十六进制 Task ID |
| `Report-only tasks must leave the project checkout unchanged` | 还原 checkout 改动后再调用 `report_task` |
| `Report-only task ended without report_task` | 回合结束前必须调用 `report_task`；重新派发报告任务 |
| `Only the active worker for this task can message its router` | `message_router` 是 Worker 工具，Router 不能调用 |
| `Memory is not available to this Session` | 记忆工具需要活跃 Worker 在 Worktree 内，或 Router Session |
| `A memory update or delete action, category and record id are required` | 面板请求缺少字段；刷新面板后重试 |
| `Team memory requires teamId and projectRoot` | team 记录缺少所属 Team 与 Project；刷新面板让行带上两者 |
| `Memory record not found` | 记录已在别处删除或 ID 过期；刷新面板 |
| `Memory content must contain 1–16000 characters` | 把内容控制在 1–16,000 字符 |
| `Memory extraction did not finish` | 重新运行 `extract_memory`；记忆对话必须返回四个分类数组 |
| `Memory fact exceeded 500 characters` | 拆分或缩短事实，单条不超过 500 字符 |
| `Memory extraction returned too many private facts` | 每次私有输出最多 1 条凭据引用 |
| `The reviewer did not submit a usable verdict` | 重新运行审查；Reviewer 必须调用 `submit_review` 写「通过」或具体意见 |
| `The pull request was closed; reopen it or dispatch a new task` | 在 GitHub 重新打开 PR，或派发新任务 |
| `This branch is already merged` | 分支已合并；不需要再执行合并或发送 |
| `Pull request <number> merged, but the project checkout could not be fast-forwarded: ...` | PR 已合并但 checkout 快进失败；在项目 checkout 手动 `git pull --ff-only` |
| `The pull request could not be opened for the reviewed commit` | 检查 `gh` 登录、分支权限和 PR 状态后重试 |
| `GitHub did not report the pull request as merged` | 在 GitHub 确认 PR 状态和 `gh` 权限 |
| `Worktree created at ..., but task metadata could not be saved` | 检查 `~/.dsh/superagent-lite/tasks/` 的写入权限和磁盘空间 |
| `... output exceeded N bytes` | `git` 或 `gh` 输出超过插件上限；缩小命令范围或输出 |
