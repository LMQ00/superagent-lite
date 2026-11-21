# Superagent 轻量版

一个 DeepSeek Harness 插件：把项目工作从对话里分派出去，交给在独立 Worktree 中执行、提交并接受只读审查的 worker。一次输入只做一次调度决定，router 不替 worker 干活。

- router 收到输入后调用 `dispatch_worker` 派工，或调用 `continue_worker` 追加要求；不需要项目工作时直接回答并写明理由。
- worker 在独立分支和 Worktree 中修改文件，提交后调用 `review_worker_commit`，由一个只读子代理审查该提交。
- 审查通过的分支由你在面板里合并或发送 PR：GitHub 项目按审查过的 SHA 合并 PR；没有 GitHub origin 的项目用 `/merge-worker` 本地合并。
- 只读的诊断、分析、查找走 `mode=report`：不建分支、不提交、不审查，worker 用 `report_task` 把结论和证据交回 router。

## 安装

前置：DSH `0.2.2-rc.3`、Node.js 24.9 或更新、Git。发布到 GitHub 还需要已登录 `github.com` 的 `gh`。

```bash
git clone https://github.com/LMQ00/superagent-lite.git
cd superagent-lite
npm test
```

`npm test` 全部通过（`fail 0`）后再安装：

1. 打开 DSH Web 的插件管理器，点「添加插件」。
2. 输入本仓库的本地绝对路径，安装并启用这个 bundle。
3. 新建会话，在预设里选「Superagent 轻量版」。

安装成功后，新会话的预设列表出现「Superagent 轻量版」。

## 使用

在「Superagent 轻量版」会话里直接说清要改什么。router 用一句话回复是否已派工和下一步；实现细节留在 worker 的报告里，不刷在对话里。

- 同一个未发布任务需要补充或修改时，继续在 router 会话里说；`continue_worker` 会把要求送给同一个 worker。
- 只读的诊断、分析、查找直接问；router 用 report 模式派工，任务结束后不留分支和提交。
- 换一个业务目标就是新任务，router 会派新的 worker，即使和正在跑的任务改同一批文件。
- 合并与发送 PR 需要 router 会话仍在运行，并且该会话有完整文件访问权限。

## 面板与 Git 管理

侧栏打开「项目任务」。面板顶部只有刷新按钮；有任务时出现团队和项目筛选。

- 任务行显示标题、任务 ID、状态、团队、项目、更新时间和 router/worker 会话按钮；有 PR 时给出链接。状态是「未确认」表示记录还在进行中，但对应的 worker 会话已经不在了。
- 下方「Pull requests」按 Open / Merged / Closed 分栏列出 worker 分支的 PR：状态图标、编号、作者、分支、审查与未合并标记、评论/检查角标；展开行可看提交、改动文件和合并/发送按钮，按钮被禁用时给出原因。
- 「合并到 <基础分支>」要求审查提交仍是分支 HEAD。GitHub 项目会复用或新开该 HEAD 的 PR 再合并它；没有 GitHub origin 的项目走本地合并：目标分支已检出、工作区干净、预检无冲突。合并由你点击触发，router 和 worker 都不会合并。
- 「发送 PR」只适用于 GitHub 项目：`origin` 必须是同一个 GitHub fetch/push 仓库，`gh` 已登录。推送固定在审查过的 SHA 上；PR 被关闭或分支头变动都会停在「交付受阻」，不会自动重试。必需检查与分支保护在合并 PR 时仍然生效。
- 面板读取任务时不写文件；合并和发送 PR 由你点击触发。面板不会自动刷新，操作失败时错误文本显示在 Git 区域。

## 当前限制

- 绑定 DSH `0.2.2-rc.3`；同一 `worktrees` 服务只由这个 bundle 挂载，启用前确认没有第二个 bundle 挂载它。
- router 与 worker 都不推送、不合并；只有你在面板里的操作或 `/merge-worker` 命令能授权本地合并。
- GitHub 项目通过 PR 合并；没有 GitHub origin 的项目走 `/merge-worker` 本地合并。
- GitHub 发送要求 `origin`、`gh` 登录、必需的 CI 检查，以及账号的合并权限；分支保护仍然生效。
- 插件自身没有暂停、队列或任务数上限；每个任务一个 Worktree，多个任务可以同时跑。Worktree 隔离工作文件，不是操作系统账号或凭据的隔离边界。
- 面板没有设置页，也不自动刷新；行为配置在 `cordis.patch.yml` 和代码里。
- worker 的原始回合事件归档在 `~/.dsh/superagent-lite/memory/archive/`，可能包含敏感对话内容，不能通过插件的模型工具检索。
- 审查不再接收整份 patch：reviewer 在 `base..head` 和 Worktree 范围内自行读 diff，范围外的读取会被拒绝。
- 只报告任务不产生分支或提交；需要改文件时重新派工。

## 文档

按顺序读，每份只建立在它前面几份之上。

- [001 领域模型](docs/001-domain.md)
- [002 规则与权限](docs/002-rules.md)
- [003 生命周期](docs/003-lifecycle.md)
- [004 配置与提示词](docs/004-config-prompts.md)
- [005 界面](docs/005-panel.md)
- [006 部署](docs/006-deployment.md)
- [007 架构](docs/007-architecture.md)

## 开发

`npm test` 运行全部测试。
