# 005 界面

在 DeepSeek Harness Web 的侧栏打开「项目任务」，面板有「项目任务」「设置」两个标签页。任务标签页监督 Router、Worker 和分支；设置标签页保存 worker 模型和并发上限。任务标签页可以勾选多条记录后一次删除。任务和设置各自加载，任务列表在自己的滚动区内滚动，不把整页撑长。它建立在 [001 领域模型](001-domain.md) 到 [004 配置与提示词](004-config-prompts.md) 之上。

## 三个问题

打开面板回答两个问题：

1. 现在有哪些 Task，各属于六个面板状态中的哪一个？
2. 哪个 Task 正在等人操作 —— 审查、合并或发送 PR，卡在哪里？

## 一套状态

任务列表是唯一的状态分类来源。六个面板状态是**未合并**、**运行中**、**未审查**、**已完成**、**失败**、**仅回答**。它们互斥、覆盖全部 Task，并按这个顺序作为筛选项和分组标题出现。面板状态不是 Task 存储值，而是由 [003 生命周期](003-lifecycle.md) 从存储状态、worker 分支、审查记录和 Pull request 事实推导出来的（`src/status.js:6-34`）。每行的「删除任务」移除任务记录和 worker 会话映射；运行中的 Task 禁用该按钮，失联的「未确认」Task 可以删除。勾选多行后也可以一次删除所选任务；worker 分支和工作树不会被删除。

| 状态 | 出现的条件 | 行内动作 |
| --- | --- | --- |
| 未合并 | 当前 worker HEAD 已审查通过且尚未合并 | 合并、提交 PR |
| 运行中 | Worker 或交付动作正在进行；记录失联时带「未确认」标签 | 只显示会话链接 |
| 未审查 | Worker 提交了 HEAD，但没有通过的审查 | 审查 |
| 已完成 | 已审查的 HEAD 已合并，或 Worker 结束时没有可交付的提交 | 合并后的 worker 分支还在时显示「删除分支」 |
| 失败 | Worker 回合、交付动作或 Task 失败 | 会话链接；显示保存的失败原因 |
| 仅回答 | report 任务交回了报告 | 会话链接 |

面板读取 Task 时会修正过期的 `review-required`、`delivery-blocked` 或 `failed`：当前 HEAD 已审查时改为 `awaiting-merge`；也会采纳同一 Project 的另一个 Task 为同一 commit 记录的通关审查。

## 区块

面板顶部有「项目任务」「设置」两个标签页，没有单独的 Git 交付区。每个标签页的区块如下。

| 区块 | 显示什么 |
| --- | --- |
| 标签栏 | 「项目任务」「设置」两个标签 |
| 头部 | 当前标签页的标题、一行说明、刷新按钮 |
| 任务筛选 | 仅「项目任务」标签页：「全部」加六个状态筛选项和计数；团队、项目下拉框缩小同一批任务 |
| 任务列表 | 仅「项目任务」标签页：每个非空状态一个标题和计数，顺序同上；组内是 Task 行，行首复选框用于批量删除。列表在自己的滚动区内滚动 |
| 设置 | 仅「设置」标签页：DSH 当前默认模型、worker 模型的服务商/模型/推理强度、并发 worker 上限和保存按钮 |
| 提示 | 任务标签页显示加载失败、空列表、无结果、动作错误或完成提示；有勾选时显示「已选择 N」「删除所选」和「清除选择」。设置标签页显示加载失败、校验错误和保存成功提示 |
| 弹窗 | 合并、提交 PR、删除分支、删除任务或批量删除的窗口，一次只开一个 |

加载中、空列表和筛选无结果各有独立文字。刷新按钮中止进行中的加载、清空两个标签页的旧提示和勾选并重新加载。面板不会自动刷新（`client.js:247-285`、`client.js:660-700`）。

## 单条记录怎么读

| 部分 | 行为 |
| --- | --- |
| 选择 | Task 标题前的复选框；运行中且 Worker Session 仍活着的 Task 不可勾选（`client.js:503-552`） |
| 状态 | 六个状态之一，带状态点或 spinner；「未确认」是运行中 Task 的警告标签，不是第七个状态（`client.js:503-512`） |
| 标题 | 标题；没有标题时显示 Task ID |
| 团队与项目 | Team 名和项目根 |
| 更新时间 | 存储的 `updatedAt`，缺失时用 `createdAt`，按本地时间 |
| 失败原因 | 失败 Task 上显示保存的失败文本 |
| ID | 16 位 Task ID |
| Router 会话 | 按 Session ID 打开 |
| Worker 会话 | 用父、子 Session ID 打开（`client.js:528-529`） |
| Pull request | 在新标签打开；只渲染 `https://github.com/<owner>/<repo>/pull/<number>` 形式（`client.js:183-190`） |

会话按钮打不开时显示打开失败提示。没有 Worker Session 的 Task 不显示 Worker 按钮；面板没有会话打开能力时，标签显示为文本。

## 行内动作

按钮前置条件不满足时禁用，原因放在 `title` 提示里。动作执行期间行内显示「处理中…」，按钮保持禁用。合并成功后关闭弹窗，并用 Host 返回的最新任务视图就地更新该行，不重新加载列表、不离开面板；其他动作成功时关闭弹窗并重新加载列表。成功都显示 Host 返回的消息；失败时显示 Host 的错误文本，没有消息时显示「操作失败。」（`client.js:556-629`）。

### 合并

打开弹窗，列出项目 checkout 的本地分支（排除 worker 分支），预选 Task 的 base branch。确认后发送选中的目标分支。合并是本地 `git merge --no-ff --log`，合并提交写明 worker 分支与任务标题，并记录分支上的功能性 commit 摘要；不需要 `gh` 账号，完成后 checkout 回到原来的分支。Host 在响应里返回合并后的任务视图，面板据此就地把该行改为已完成（`client.js:642-716`、`src/merge.js:30-109`、`src/git-actions.js:414-442`）。这是用户直接合并入口，不经过 merge worker；用户直接指示的合并由 router 派发 `mode=merge`（已有运行中的 merge worker 时追加给它），合入的是该 worker 的 reviewed merge commit。

按钮要求当前 HEAD 审查通过、尚未合并、项目 checkout 干净且检出在分支上。目标冲突、checkout 脏、HEAD 移动或任务已离开可交付状态都会带原因拒绝（`src/git-actions.js:308-316`、`src/delivery.js:7-19`）。

### 提交 PR

打开弹窗，先检查 GitHub 账号。没有登录的 `gh` 时显示「需要 gh 账号：」和 `gh` 错误，不能提交。有账号时列出 checkout 的 remote 及其对应的 GitHub 仓库，由用户选择仓库。确认后把 reviewed HEAD 推到该 remote，并创建或复用 Pull request（`client.js:556-600`、`src/git-actions.js:432-477`）。发送 PR 与合并共用状态、审查和 HEAD 前置校验，唯一额外条件是 GitHub 账号和 remote；Host 在执行前会再验证 `gh auth status`（`src/delivery.js:7-19`、`src/git-actions.js:435-444`）。

当前 HEAD 未审查、项目没有 GitHub remote、Task 已合并或 PR 已关闭时按钮禁用。已有同一 HEAD 的 Pull request 时直接复用，不重复创建。

### 审查

从对应的 Worker Session 对已提交的 HEAD 启动一次独立审查，并记录裁决。Reviewer 用 `submit_review` 填内容，内容为「通过」就是通过，其他内容记为审查意见。按钮要求 HEAD 未审查、有提交、Worker Session 仍活着；没有会话时禁用并给出原因（`client.js:540-543`、`src/git-actions.js:398-419`）。

### 删除分支

只在已完成的 Task 且 worker 分支仍存在时出现。打开确认弹窗；若 Worktree 已登记且干净，先移除 Worktree，再删除分支。已合并的 PR 即使其 commit 不是本地 base 分支的祖先也算已合并。删除后 Task 仍是已完成，按钮消失（`src/merge.js:113-142`）。

### 删除任务

每行都显示「删除任务」。Task 处于运行中且 Worker Session 还活着时按钮禁用；「未确认」的运行中 Task 没有活着的 Worker，可以删除。点击后打开确认弹窗，确认后发送 `DELETE /superagent-lite/tasks?taskId=<id>`，移除任务记录和 worker 会话映射，不删除 worker 分支或 Worktree（`client.js:361-372`、`client.js:548-575`、`src/board.js:14-45`、`src/task-store.js:103-121`）。

合并或发布正在执行（存储状态为 `merging` 或 `publishing`）时，服务端拒绝删除；空 ID 或未知 ID 分别返回 400 和 404。

### 批量删除

每条 Task 前都有复选框。勾选后列表上方出现「已选择 N」「删除所选」和「清除选择」；点「删除所选」打开一次确认弹窗，确认后逐条调用 `DELETE /superagent-lite/tasks?taskId=<id>`。运行中且 Worker Session 仍活着的 Task 复选框禁用，不能进入批量选择；「未确认」的运行中 Task 可以勾选（`client.js:287-288`、`client.js:374-401`、`client.js:602-623`）。

成功的记录立即从列表移除并显示完成提示；部分失败时确认弹窗保留，展示 Host 返回的错误，成功的记录已经移除，失败项保持勾选，关闭弹窗后错误也显示在列表上方。批量删除任务不删除 worker 分支或 Worktree。

## 设置

面板的「设置」标签页保存 worker 默认值。

「设置」标签页读取并保存 `~/.dsh/superagent-lite/worker-settings.json`，只允许安装 owner 操作。加载时显示 DSH 当前默认模型；模型目录不可用时仍允许填写已知的服务商和模型。

| 项 | 行为 |
| --- | --- |
| Worker 模型 | 服务商、模型和可选的推理强度三个输入框，带模型目录建议；三项都留空时保存 `null`，新 worker 跟随 DSH 默认模型（`src/settings-panel.js`、`src/worker-settings.js`） |
| 并发 worker 上限 | 1–16，默认 3；超出的新 Task 显示「排队中」，有空闲名额后按创建顺序启动；review 是 worker 的子代理，不占额外名额（`src/launch-queue.js`） |
| 保存 | 只影响之后启动的 worker；已有 worker 保持原模型。失败原因显示在保存按钮上方 |

bundle 组成和提示词文字仍在 `cordis.patch.yml` 与 [004 配置与提示词](004-config-prompts.md) 列出的源文件里；设置页不编辑提示词。记忆没有单独的面板或设置入口：全局/项目记忆、skill 和知识库只由 memory 角色维护，Worker 和 Reviewer 通过运行时上下文与 `knowledge_query` 读取。

## 设计原则

1. **一套状态系统。** 六个任务状态负责分类；没有第二个 Git 页签或状态列表重复它们。Git 动作属于任务行及其弹窗（`src/status.js:6`）。
2. **只回答三个问题。** 每个区块对应一个问题；不改变决定的数量或行去掉。
3. **监督而不是静默交付。** 每次刷新只发一个 GET，可能修正过期的任务状态或采纳匹配的审查记录。读取不碰项目文件；合并、发送 PR、删除分支和删除任务只在用户明确确认的动作里写（`src/board.js:7-45`、`src/git-actions.js:283-375`）。
4. **一行一个动作并给出原因。** 按钮禁用时说明缺什么，用户不必翻文档才知道为什么。
5. **诚实状态。** Worker Session 不在时显示「未确认」；已合并显示「已完成」；已审查未合并显示「未合并」；缺审查显示「未审查」。
6. **链接而不复制。** 会话在对应 Session 里，审查在 GitHub 上，面板只给链接。
7. **安全目标。** 只跟随同源面板请求和 GitHub PR URL，其他协议不渲染（`client.js:231-238`）。
8. **显式刷新。** 面板在打开和点击刷新时加载，不轮询、不后台拉取。
9. **仅 owner。** 不是安装 owner 的请求拿不到任务数据（`src/board.js:7-11`）。
