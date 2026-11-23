# Superagent 轻量版

一个 DeepSeek Harness 插件：把项目工作从对话里分派出去，交给在独立 Worktree 中执行、提交并接受只读审查的 worker。一次输入只做一次调度决定，router 不替 worker 干活。

- router 收到输入后调用 `dispatch_worker` 并写明 `mode`：`change` 改项目文件，`report` 让 worker 只查证并交回结论，`answer` 直接回答且不派 worker、不建任务，`merge` 让新派发的 merge worker 合并已交付分支；同一未发布任务的补充用 `continue_worker`。
- worker 在独立分支和 Worktree 中修改文件，提交后调用 `review_worker_commit`，由一个只读子代理审查该提交。
- 审查通过的分支默认停在 reviewed commit；change worker 携带 `land=true` 时只可推送指派分支或开 PR。用户明确授权合并时，router 派发新的 merge worker：它先把目标分支合入自己的 worktree 分支，审查合并结果，再把 reviewed commit 本地合入 base branch。你也可以在面板合并或发送 PR：合并始终是本地 `git merge --no-ff`，不需要 `gh`；发送 PR 时选择一个 GitHub remote，推送审查过的 SHA。
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
- 换一个业务目标就是新任务，router 会派新的 worker，即使和正在跑的任务改同一批文件。合并请求也是新任务：即使点名了已有任务，router 也派新的 merge worker，不续派该任务原来的 worker。
- 合并与发送 PR 需要动作执行时 Session 具有完整文件访问权限；本地合并还需要 router 会话仍在运行。

## 面板

侧栏打开「项目任务」。面板分「项目任务」和「记忆」两个标签页，任务列表和记忆列表各自在滚动区里滚动，页面本身不会被撑长。任务列表是唯一的状态分类来源：顶部有刷新按钮，有任务时出现「全部」加未合并、运行中、未审查、已完成、失败、仅回答六个状态筛选和团队、项目筛选，下面按这六类分组。

- 状态由任务记录加事实推导：当前提交已审查未合并是「未合并」；提交没有通过审查是「未审查」；已合并或 worker 完成但没有提交是「已完成」；审查记录属于同一项目的另一个任务、但提交相同，也只算已审查，并写回本任务。
- 任务行显示状态、标题、团队、项目、更新时间、任务 ID、router/worker 会话按钮和失败原因；有 PR 时给出链接。「未确认」标签表示记录仍在进行中，但对应的 worker 会话已经不在了。
- 未合并行有「合并」和「提交 PR」。合并弹窗列出项目工作区的本地分支供你选择，确认后只做本地 `git merge --no-ff`，不需要 `gh` 账号；合并完成后已完成行出现「删除分支」，确认后移除工作树并删除该修改分支。
- 每行有「删除任务」：运行中的任务不能删除，失联的「未确认」任务可以；确认后只移除任务记录和 worker 会话映射，worker 分支、工作树和记忆归档都会保留。
- 任务行和记忆行都有复选框：勾选若干条后出现「删除所选」，确认一次即可批量删除；运行中的任务不能勾选。批量删除任务同样只移除任务记录和 worker 会话映射。
- 「提交 PR」先检查 `gh` 账号，再从 remote 列表选择 GitHub 仓库。推送固定在审查过的 SHA 上；已有同一提交的 PR 就复用。PR 被关闭时任务显示「失败」，分支头变动会让审查记录过期、回到「未审查」，都不会自动重试。
- 未审查行有「审查」：从对应 worker 会话直接启动一次独立审查。reviewer 用 `submit_review` 填内容，填「通过」就是通过审查，其他内容记为审查意见。
- 没有单独的「Git 交付」区块。面板读取任务时会修正过期的审查/合并状态并回填同一提交的审查记录；合并成功后按 Host 返回的最新视图就地更新该任务行，不重新加载列表，面板不会自动刷新，操作失败时错误文本显示在任务列表上方。

## 记忆

worker 的每一轮对话历史按轮次完整归档在 `~/.dsh/superagent-lite/memory/archive/`，每个事件带会话序号和轮内编号，作为原始参照物保留；记忆系统只保存提取出的结论。

「记忆」标签页是记忆系统的入口：它列出私有、公共知识库、用户画像与环境、团队知识库四类记录，显示每类的条数和调用方式，可以按分类筛选，也可以按内容、ID、团队或项目搜索。

- 私有：只保存凭据引用名，按需调用，应该极少；编辑时改的是引用名，不是密钥值。
- 公共知识库：只保存客观知识结论，按需调用。
- 用户画像与环境：每轮注入 router 和 worker 的上下文；面板显示当前注入的记录数和“每条最多 500 字符、最多 6 条”的限制。
- 团队知识库：按团队和项目隔离，只有同团队、同项目的 worker 能读取。
- 删除需要二次确认。可以逐条删除，也可以勾选多条后一次删除所选记录。编辑和删除都是你在面板里的明确动作，只从本安装的 owner 会话生效。
- 写入先去重再覆盖：同一分类、同一 Team/Project 内，完全相同或等价的事实不新增；旧结论不正确时用新事实覆盖原记录并保留记录 ID；只有真正的新事实才新增。相似度是词面启发式，表述完全不同的语义改写需要显式编辑。
- 每个 change 任务收尾时，`message_router` 发送最终报告后会触发「记忆对话」（memory）；它自己读取 worker 的完整对话（保留首尾，单条消息和总长度有上限），按四类提炼并写回，而不是由 worker 另外提交一段摘要。没有可复用的结论就不写记录。

原始架构图按编号保存在 [docs/diagrams](docs/diagrams/)：001 术语与主流程、002 预设流程、003 记忆系统。

## 当前限制

- 绑定 DSH `0.2.2-rc.3`；同一 `worktrees` 服务只由这个 bundle 挂载，启用前确认没有第二个 bundle 挂载它。
- router 与 worker 默认不推送、不合并；只有任务记录里的 `land` 授权才允许推送、开 PR 或合并 reviewed commit，且必须由用户在派发或续派发时明确给出。用户明确授权合并时，默认由新派发的 merge worker 执行；change worker 的续派发只授权推送和 PR，不授权合并。面板合并动作和 `/merge-worker` 仍是用户直接触发的本地合并入口。
- 合并始终是本地 Git 操作，不需要 `gh` 账号；发送 PR 要求一个 fetch 与 push URL 指向同一 GitHub 仓库的 remote，以及已登录的 `gh`。
- 发送 PR 后由 GitHub 执行必需检查和分支保护；插件不预先查询检查状态。
- 插件自身没有暂停、队列或任务数上限；每个任务一个 Worktree，多个任务可以同时跑。Worktree 隔离工作文件，不是操作系统账号或凭据的隔离边界。
- 面板没有设置页，也不自动刷新；行为配置在 `cordis.patch.yml` 和代码里。
- worker 的原始回合事件归档在 `~/.dsh/superagent-lite/memory/archive/`，可能包含敏感对话内容，不能通过插件的模型工具检索。
- 审查不接收整份 patch：reviewer 在 `base..head` 和 Worktree 范围内自行读 diff，范围外的读取会被拒绝。
- 只报告任务不产生分支或提交；需要改文件时重新派工。

## 文档

按顺序读，每份只建立在它前面几份之上。

- [000 原则](docs/000-philosophy.md)
- [001 领域模型](docs/001-domain.md)
- [002 规则与权限](docs/002-rules.md)
- [003 生命周期](docs/003-lifecycle.md)
- [004 配置与提示词](docs/004-config-prompts.md)
- [005 界面](docs/005-panel.md)
- [006 部署](docs/006-deployment.md)
- [007 架构](docs/007-architecture.md)
- [008 手册](docs/008-cookbook.md)
- [009 一键落地](docs/009-land-all.md)
- [架构原图](docs/diagrams/README.md)（001 术语与主流程、002 预设流程、003 记忆系统）

## 开发

`npm test` 运行全部测试。
