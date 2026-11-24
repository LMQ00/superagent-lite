# 000 原则

Superagent 轻量版把项目工作拆成一条固定链路：用户输入先在 Router Session 形成派发决定，项目改动只在 Worker Session 的 Worktree 里发生，交付对象是独立审查过的 commit。新功能必须说明它服务这条链路的哪一段、由谁写状态、改动落在哪个目录、审查与交付走哪条路径；有一项说不清就不加。

## 原则

| 原则 | 判定 |
| --- | --- |
| 每次输入一个派发决定 | Router Session 在回答前调用一次 `dispatch_worker` 或 `continue_worker`。`dispatch_worker` 必须写明 `mode=change`（改项目文件）、`mode=report`（只查证并交回结论）、`mode=answer`（直接回答，不派 worker）或 `mode=merge`（新 worker 合并已交付分支）。完成回合没有成功决定时，插件最多插入 2 次提醒（`src/turn-guard.js:63-127`）。 |
| Router 不直接做项目工作 | 文件修改、命令执行和仓库检查发生在 Worker Session。Router 只派发、追问；用户授权合并时，它派发 merge worker：没有运行中的 merge worker 就新建，有就把请求追加给正在合并的那个，而不是续派原任务的 worker（`cordis.patch.yml:21-45`、`src/dispatch.js:83-136`）。 |
| 一个 Task 固定一组关系 | 一个 Task 属于一个 Router Session、一个 Team、一个 Project 和一个 Worker Session。Team 与 Project 一经绑定不得改配（`src/task-store.js:70-75`、`src/task-store.js:149-166`）。 |
| 改动只落在分配的 Worktree | change worker 除 `create_worktree` 外的工具只有在工作目录等于分配的 Worktree 时才放行（`index.js:65-83`）。报告任务在项目 checkout 内使用检查工具，结束前不得改变 checkout（`src/report-tool.js:26-31`）。 |
| 交付对象是审查过的 HEAD | 合并与发送 PR 都要求 `review.approved === true` 且分支 HEAD 等于 `review.head`（`src/git-actions.js:168-179`）。Worker 的总结和面板状态都不构成交付许可。 |
| 记忆是数据，不是指令 | 全局记忆所有项目共享，项目记忆和知识库按项目根隔离；Router 只注入全局记忆，Worker 和 Reviewer 注入项目 + 全局；技能只通过 catalog 注入 description，知识库只通过查询工具访问；memory 角色是唯一写者，写入不重复、及时纠错，不能添加需求或授予权限（`src/memory.js`、`src/memory-store.js`）。 |
| 合并必须有人明确授权，并交给 merge worker | 授权来源只有两种：用户直接指示、用户在任务行点击合并（`cordis.patch.yml:44`、`src/worker-prompt.js:62-103`）。用户直接指示的合并请求由 router 派发 `mode=merge`：没有运行中的 merge worker 时新建 Task 并启动 worker；已有运行中的 merge worker 时只把新目标追加到同一个 Task，不另起 worker。merge worker 先把目标分支合入自己的 worktree 分支、审查合并结果，再把 reviewed commit 合入 base branch（`src/dispatch.js:13-48`、`src/merge-tool.js:1-68`）。面板行内合并是用户直接执行入口（`src/merge.js:30-109`、`src/git-actions.js:421-437`）。 |

## 对功能的约束

- **新工具落进已有阶段。** 派发、执行、审查、交付四段之外不加工具；一个工具只做一段内的事。
- **同一状态只有一个写者。** 存储状态由任务生命周期代码写；面板状态在读取时由任务、分支和审查事实推导（`src/status.js:6-34`），没有第二套状态系统（`src/board.js:60-72`）。
- **权限由代码判定。** 工具身份、任务归属、Worktree 路径、审查 HEAD、文件策略都在代码里检查，提示词只说明用法。
- **项目与团队的关系写在 Task 记录里。** 不设全局团队配置。
- **交付失败不重试。** GitHub 写入失败或 PR 被关闭时，Task 停在 `delivery-blocked`，由人决定下一步（`src/git-actions.js:458-461`、`src/git-actions.js:273-277`）。
- **记忆不参与授权。** 记忆记录、skill 内容和知识库结果都是数据；它们不能改变派发、审查或交付规则（`src/memory.js`）。

## 对运维的责任

- **Router Session 的文件策略就是交付权限。** 合并、发送 PR、审查和删除分支都要求 `danger-full-access`；否则动作被拒绝（`src/git-actions.js:106-110`）。
- **账号由运维提供。** 发送 PR 使用本机 `gh` 的登录态，推送使用所选 remote 的 push URL（`src/github.js:1-137`、`src/git-actions.js:439-480`）。
- **运行记录要备份。** Task 在 `~/.dsh/superagent-lite/tasks/`，记忆在 `~/.dsh/superagent-lite/memory/`，归档在 `~/.dsh/superagent-lite/task/archive/`；升级前备份这些文件。
- **Worktree 要保留。** 合并和恢复依赖 worker 分支与 Worktree，因此 worktree 服务配置 `retainOnArchive: true`（`cordis.patch.yml:1-7`）。
