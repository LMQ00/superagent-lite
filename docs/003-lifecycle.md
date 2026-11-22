# 003 生命周期

这份文档跟着一个已受理的 Task 从派发走到结束。它建立在 [001 领域模型](001-domain.md) 和 [002 规则与权限](002-rules.md) 之上。

## 阶段

Task 记录只保存一个生命周期状态；面板不直接显示它，而是用存储状态、worker 分支、审查记录和 Pull request 事实推导出六个面板状态（`src/status.js:6-34`、`src/git-actions.js:283-392`）。推导回答的是「现在这个人能对这个 Task 做什么」。

| 面板状态 | 成立条件（从上往下读） |
| --- | --- |
| `running` / 运行中 | 存储状态是 `starting`、`running`、`resuming`、`publishing` 或 `merging` |
| `completed` / 已完成 | 存储状态是 `merged`；或 worker HEAD 是基础分支 tip 的祖先；或 reviewed HEAD 的精确 PR 是 `MERGED` |
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

面板字典还识别 `ready`、`merge-queued`、`merge-conflict`、`interrupted`、`cancelled` 的文案；当前没有生命周期代码写这些值（`client.js:8-15`、`src/status.js:8-10`）。

## 执行

### Worker Session

`dispatch_worker` 先写 `starting` 记录，再通过 `ctx.subagents.startActivation` 启动一个 Worker Session（`src/dispatch.js:69-100`）。

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

Host 创建 Worker agent 后，`agent/created` 通过 Session 映射找到 Task，核对父 Session，并把 `starting` 或 `resuming` 改为 `running`（`index.js:42-52`、`src/task-store.js:110-124`）。同一事件安装工具守卫、注册 Worker 工具和 profile 上下文（`index.js:53-92`）。

Worker 调用 `create_worktree` 后，worktree 服务从记录的 base commit 创建隔离检出；Task 保存 `path`、`branch`、`baseCommit`、`repositoryRoot`、`sourceBranch`，状态改为 `running`，工作目录切到 Worktree（`src/worktree-tool.js:39-57`）。已有 Worktree 时只重新进入（`src/worktree-tool.js:27-37`）。

Worker 的 subagent 结束时冻结；冻结后所有工具被拒，包括记忆和消息工具（`index.js:114-116`、`index.js:58-59`）。

### Reviewer

`review_worker_commit` 启动独立子代理，标签 `Independent code review`，工作目录为 Worktree，delivery 为 `caller`，深度 2（`src/review.js:61-76`）。

Reviewer 收到保存的需求、follow-up 文本、base 与 head commit、Worktree 路径；提示词明确不附 diff，Reviewer 自己运行 `git diff <base>..<head>` 或 `git show <head>` 并读取改动文件（`src/review.js:20-32`）。helper 守卫在子代理创建前登记审查范围，创建后安装只读工具边界（`src/review.js:59`、`src/helper-guard.js:25-41`）。

Reviewer 用 `submit_review` 记录裁决：内容「通过」是通过，其他内容记为审查意见。工具确认裁决存在、Reviewer 实际读过改动、Worker HEAD 未移动后，才写入 `review.head`、`review.reviewerSessionId`、`review.approved`（`src/review.js:109-122`）。

面板的 `review` 动作从活着的 Worker Session 对 `unreviewed` 的 HEAD 运行同一审查；通过后 Task 修正为 `awaiting-merge`，有意见则落到 `review-required`（`src/git-actions.js:398-419`）。

### 记忆对话

记忆对话是独立 helper 子代理，标签 `Distill memory`，delivery 为 `caller`，深度 2（`src/memory.js:112-124`）。它收到选定结论，返回四个数组；插件逐条写入对应分类（`src/memory.js:126-140`）。

| 属性 | 值 |
| --- | --- |
| 触发 | change worker 调用 `extract_memory`，或最终 `message_router` 报告送达后自动触发一次 |
| 输入 | 选定且不含密钥的结论，1–5,000 字符；自动触发使用报告文本 |
| 提取上限 | 1 条 private 凭据引用、3 条 public 结论、1 条 profile 事实、3 条 team 事实；每条最多 500 字符 |
| 不提取 | 密钥、个人数据、对话细节、任务状态和指令 |
| 写入 | private、public、profile 使用 Host `memory` 角色；team 使用 Task 的 Team 与规范化 Project 根；每条记录保存触发事件的 Session ID 和序号 |
| 空结果 | 空数组不写记录；profile 写入后刷新注入上下文；自动触发失败只记录警告，显式 `extract_memory` 把错误返回 Worker |

自动触发发生在报告送达之后，属于 Worker Session 而不是 Task 状态；它不改变 Task 状态或 Review 记录（`src/message-router.js:16-25`、`index.js:78-87`）。

### 原始归档

Worker 每个回合结束时归档整个回合。`archiveWorkerTurn` 从 `turn/end` 向前找到同 `turn` 的 `turn/start`，取出这轮的完整事件，写入一条不可变记录（`src/memory.js:212-225`）。

| 字段 | 内容 |
| --- | --- |
| `sessionId`、`seq` | Worker Session ID 与轮次结束序号 |
| `turn`、`startSeq`、`endSeq` | 轮次编号与事件范围 |
| `references` | 按事件顺序编号的 `reference`（从 1 开始）、Session `seq` 和事件类型 |
| `events` | 完整事件快照 |

归档位于 `~/.dsh/superagent-lite/memory/archive/`，文件名是 Session 与结束序号的哈希；同一来源重复写入相同数据是幂等的，不同数据会报错（`src/memory-store.js:312-340`）。归档只由 Host 写入，模型工具没有读取入口。

## 并发

- 一个 Task 只有一个 Worker Session；follow-up 复用该 Session，不占第二个名额（`src/task-store.js:110-124`）。
- 插件没有队列和任务上限。每次派发立即启动 Worker；同一 Project 的多个 Task 各用自己的 Worktree 并行（`cordis.patch.yml:1-7`）。
- 嵌套深度由 Host 的子代理上限约束；Reviewer 和记忆对话以深度 2 启动（`src/review.js:64`、`src/memory.js:115-119`）。
- 面板的 Git 动作按 Task ID 串行，单次 HTTP 超时 15 分钟（`src/git-actions.js:81-88`、`src/board.js:97`）。
- 同一 Project 根的合并和分支删除跨 Task 串行，面板和 `/merge-worker` 共用同一个队列；不同 Project 互不等待（`src/merge.js:14-26`）。
- Worktree 服务配置 `retainOnArchive: true`，Worker 结束后保留分支和检出，供恢复和交付读取（`cordis.patch.yml:1-7`）。

## 结束条件

change 任务的 Worker 回合按以下顺序落定（`index.js:114-146`）：

| 条件 | 结果 |
| --- | --- |
| Worker 未以 `completed` 结束或没有 Worktree | `failed` |
| Worker 结束但没有通过的 Review | `review-required` |
| Review 通过，但结束后的 HEAD 不再等于 reviewed HEAD | `review-required` |
| Review 通过且 HEAD 仍匹配 | `awaiting-merge` |
| 结束后的 HEAD 检查抛错 | `delivery-blocked` |

`awaiting-merge` 是 Worker 工作的结束，不是 Task 的结束。Task 到 `merged` 的路径有三种：

- 用户明确授权后由面板行内合并或 `/merge-worker` 执行本地 `git merge --no-ff`（`src/merge.js:30-103`、`src/git-actions.js:421-437`）。
- 精确匹配的 PR 在 GitHub 上被合并，面板读取时同步为 `merged`（`src/git-actions.js:190-194`、`src/git-actions.js:309-317`）。
- 面板读取时发现 worker HEAD 不是基础 commit，且已包含在基础分支中；只有存储状态属于 `review-required`、`awaiting-merge`、`awaiting-ci`、`merge-queued`、`publishing`、`merging`、`delivery-blocked` 时才回写 `merged`（`src/git-actions.js:13`、`src/git-actions.js:151-160`、`src/git-actions.js:316-324`）。没有自有提交的分支不算合并。

report 任务在 `report_task` 执行时到 `completed`；回合结束仍未调用 `report_task` 时到 `failed`，失败原因是 `Report-only task ended without report_task`（`src/report-tool.js:34-41`、`index.js:123-125`）。

不需要 Worker 的输入不是 Task：`dispatch_worker` 返回 `delegate=false` 和理由，回合直接回答（`src/dispatch.js:48-49`）。

## 失败与恢复

### Worker 回合失败

回合没有以 `completed` 结束，或 change 任务没有 Worktree，Task 落为 `failed`，记录 `stopReason` 和 `finishedAt`；Worker 冻结（`index.js:122-129`）。

已有 Worktree 的 `failed` Task 可以用 `continue_worker` 恢复。从未拿到 Worktree 的 Task，包括 report 任务，不能恢复，只能重新派发（`src/continue.js:82-90`）。

### 审查未通过

Review 记录保留 `approved: false`，Task 落为 `review-required`。Worker 修完问题、再次提交并再次调用审查工具。`continue_worker` 会把 Task 改为 `resuming`，清空旧 Review，再发送完整任务消息和 follow-up（`src/continue.js:82-95`）。

### Host 重启或插件重载

Task 和 Memory 记录保存在 `~/.dsh/superagent-lite/`，Worktree 保存在项目的 `.agents/worktrees/`。存储状态仍在 `starting`、`running` 或 `resuming` 但没有活着的 Worker Session 时，面板显示「运行中」并带「未确认」标签（`src/board.js:16-31`）。

`continue_worker` 可以唤醒空闲 Worker；派发调用遇到 `starting` 或 `failed` 的同名 Task 会被拒绝，需要新的输入（`src/dispatch.js:53-60`）。

### GitHub 交付失败

发送 PR 失败时，Task 标为 `delivery-blocked`，错误写入 `failure`；已创建的 PR 保留链接。精确匹配的 PR 在交付状态中被关闭时也落为 `delivery-blocked`；精确 PR 已合并时落为 `merged`（`src/git-actions.js:195-205`、`src/git-actions.js:476-479`）。

GitHub 写入不自动重试。PR 尚未创建时的发送失败可以从 `delivery-blocked` 重试；一旦 `prUrl` 已存在，再次发送会复用同一 HEAD 的 PR（`src/github.js:83-95`）。

### 本地合并失败

预检失败时 Task 仍是 `awaiting-merge`，用户可以修正目标 checkout 后重试。`git merge` 已经执行但失败时，Task 标为 `delivery-blocked`，并提示检查目标；之后不再是 `awaiting-merge`，面板合并会拒绝，直到用户处理目标并开始新的工作（`src/merge.js:52-103`）。

### follow-up 发送失败

发送失败会删除刚记录的要求。目标是已结束的 Task 时标为 `failed`；目标是运行中的 Task 时保持 `running`（`src/continue.js:29-46`、`src/continue.js:91-103`）。

### 未完成的工作

无法继续的 Worker 报告 `BLOCKED`：具体阻塞、已经尝试的内容、需要人提供的一个决定或资源。工作未完成但可继续的报告 `INCOMPLETE`，并说明剩下什么。`message_router` 的文本不设置 Task 状态，状态由生命周期事件写（`src/worker-prompt.js:61-68`、`index.js:114-146`）。
