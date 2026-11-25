# Superagent 轻量版

一个 DeepSeek Harness 插件：把项目工作从对话里分派出去，交给在 Git 项目里使用独立 Worktree、在非 Git 目录里直接执行、并都接受只读审查的 worker。一次输入只做一次调度决定，router 不替 worker 干活。

- router 收到输入后调用 `dispatch_worker` 并写明 `mode`：`change` 改项目文件，`report` 让 worker 只查证并交回结论，`answer` 直接回答且不派 worker、不建任务，`merge` 合并已交付分支：没有正在运行的 merge worker 时派发新的，有则把请求追加给同一个 worker；同一未发布任务的补充用 `continue_worker`。
- worker 在独立分支和 Worktree 中修改文件，提交后调用 `review_worker_commit`，由一个独立子代理审查该提交；reviewer 不能使用写改文件的工具，也不能运行改变分支或历史的 git 命令。新任务的目录和分支用可读的英文短名加 Task ID 后缀命名，如 `sl-fix-plan-color-0123456789ab`。
- 不属于任何 Git 仓库的文件夹同样可以走完 change 和 report 流程：worker 直接在该目录执行，不建分支、Worktree 或提交；`review_worker_commit` 改为审查当前项目文件和实际工作区内容，任务以审查通过为完成。Git 专有的合并、发送 PR 和删除分支在非 Git 目录不可用。
- 审查通过的分支默认停在 reviewed commit；change worker 携带 `land=true` 时只可推送指派分支或开 PR。用户明确授权合并时，router 派发 merge worker：如果已有 merge worker 在运行，新请求追加给正在合并的那个 worker，不再派第二个。merge worker 先把目标分支合入自己的 worktree 分支，审查合并结果，再把 reviewed commit 本地合入 base branch。你也可以在面板合并或发送 PR：合并始终是本地 `git merge --no-ff`，不需要 `gh`；发送 PR 时选择一个 GitHub remote，推送审查过的 SHA。
- 只读的诊断、分析、查找走 `mode=report`：不建分支、不提交、不审查，worker 可在项目 checkout 里只读检查，也可用网页搜索、网页读取和知识库查询做资料调研，最后用 `report_task` 把结论和证据交回 router；worker 仍按仓库 `AGENTS.md` 的约定执行，但该约定不能扩大只读任务的授权。
- 想知道某个任务是排队中、运行中、已交付、已取消还是失败，直接问 router；它用 `worker_status` 查询本会话派发的任务，不重新派工。排队中的任务被取消、排队中的 worker 开始执行时，router 会收到后台状态通知。

## 安装

前置：DSH `0.2.2-rc.5`、Node.js 24.9 或更新、Git。发布到 GitHub 还需要已登录 `github.com` 的 `gh`。

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
- 只读的诊断、分析、查找可以直接问；router 用 report 模式派工，worker 可以联网检索和读取网页做调研，任务结束后不留分支和提交。
- 在非 Git 目录里也可以直接说清要改什么：派发、执行、审查和记忆走与 Git 项目相同的状态机，只是不建分支、Worktree 和提交；审查通过后任务直接完成。合并、发送 PR 和 `land` 授权需要 Git 仓库。
- 换一个业务目标就是新任务，router 会派新的 worker，即使和正在跑的任务改同一批文件。合并请求也是新任务：即使点名了已有任务，router 也走 `dispatch_worker` 的 `mode=merge`，不续派该任务原来的 worker；已经有 merge worker 在跑时，新请求追加给它，不另起一个。
- 合并与发送 PR 需要动作执行时 Session 具有完整文件访问权限；本地合并还需要 router 会话仍在运行。

## 记忆

记忆分全局和项目两层，项目记忆按项目根隔离，不跨项目混用；知识库是全局的，所有项目共用。Router 只注入全局记忆；Worker（包括 report、merge 这类只读或受控 worker）和 Reviewer 同时注入所属项目的项目记忆和全局记忆。

- 全局记忆保存用户画像和多个所有项目共用的 skill；项目记忆保存职责、定位和多个适用于当前项目与职责的 skill。职责和定位是小段固定注入的内容；每个 skill 只把 description 放进 skill catalog，完整内容按需用 `skill` 工具加载。
- 每个 skill 用自己的名字和目录：全局 skill 写在 `~/.agents/skills/<skill名>/SKILL.md`，项目 skill 写在 `<项目根>/.dsh/skills/<skill名>/SKILL.md`。memory 写入的 skill 在 frontmatter 里带 `author: memory`；同名冲突不会覆盖不由 memory 管理的 skill。项目 skill 由 Worker 作用域的 provider 从项目 checkout 读取，Worker 和 Reviewer 能在 catalog 里看到它们的 description；Router 不扫描项目 skill。项目 skill 目录会写进 `.git/info/exclude`，避免弄脏需要保持干净的项目 checkout。不同项目的记忆是分开的。
- 既有的 `superagent-project-memory` 和 `superagent-shared-memory` 继续可用：它们按旧名字读取，下一次 memory 写入时会补上 `author: memory`。其他按内容命名的新 skill 各自独立并存。
- 记忆写入的 skill 只对之后新派发的 Worker 和 Reviewer 生效。已运行或已结束的 Worker/Reviewer 会话保留自己启动时的 skill catalog，不会因为 memory 写入而收到 catalog 变更提醒并继续行动。归属按 skill 文件里的作者判断：新增、修改或删除的 skill 全部带 `author: memory` 时，这次 catalog 变化不注入已有会话；判定只看会话（agent）和 skill 作者，与任务状态无关，running、报告 BLOCKED、resuming、awaiting-merge 的会话都不注入。作者缺失的 skill 按普通 skill 处理，变化照常发布。
- 知识库是全局的，只存可复用、广泛适用的知识，内容不注入角色上下文。Worker、Reviewer 和 memory 角色用 `knowledge_query` 按关键词查询，结果带编号和匹配关键词前后的上下文片段；再用 `knowledge_get` 按编号读取完整条目。只有 memory 角色能用 `knowledge_write` 新增、纠正或删除；安装 owner 也可以在面板里删除单条知识，删除后查询不再返回该条目。知识库保存在 `~/.dsh/superagent-lite/memory/knowledge.json`。
- 每个 change 任务收尾时，`message_router` 发送最终报告后会触发一次 memory 角色。memory 不再收到整段对话：触发消息只给会话记录的可读路径和任务、角色、分支等元信息，memory 自己用 `read` / `grep` 按需读取后返回需要更新的记忆字段；插件只写回发生变化的字段和 skill。没有可复用的结论就不写，也不把写入条数当指标；记忆写入遵守「宁缺毋滥、长期主义」：不重复记录，及时纠正，不保存一次性进度、状态、计数、密码、密钥、token、凭据或个人数据。没用的知识只会污染知识库，宁可不写。
- memory 读取的会话记录写在 `~/.dsh/superagent-lite/task/archive/sessions/<sha256(Session ID)>.md`，在触发时由 Host 写入完整会话和最终报告工具名；Worker 每一轮的原始事件仍按回合归档在 `~/.dsh/superagent-lite/task/archive/`，保留 Session 序号和轮内编号。归档只由 Host 写入，只有 memory 角色拿到记录路径并读取，其他模型工具没有专用读取入口。

## 面板

侧栏打开「项目任务」。面板分「项目任务」「设置」「记忆系统」三个标签页，任务列表在固定面板的滚动区里滚动，页面本身不会被撑长。任务列表是唯一的状态分类来源：顶部有刷新按钮，有任务时出现「全部」加未合并、运行中、未审查、已完成、失败、仅回答六个状态筛选，以及单独筛出排队任务的「排队中」筛选、团队和项目筛选，下面按这六类分组；「排队中」不是第七个状态，只筛出等待并发名额的任务，它们仍归在「运行中」组并计入运行中计数。

- 状态由任务记录加事实推导：当前提交已审查未合并是「未合并」；提交没有通过审查是「未审查」；已合入基础分支、非 Git 任务审查通过、worker 完成但没有提交是「已完成」，worker 工作树已不在时用记录的 reviewed HEAD 核对是否已进基础分支；report 任务一旦通过 `report_task` 交付结论就按「仅回答」收尾，不再进入审查或合并判断；审查记录属于同一项目的另一个任务、但提交相同，也只算已审查，并写回本任务。非 Git 任务没有分支、Worktree 和 Git 动作，审查通过即完成。
- 任务行显示状态、标题、团队、项目、更新时间、任务 ID、router/worker 会话按钮和失败原因；有 PR 时给出链接。「未确认」标签表示记录仍在进行中，但对应的 worker 会话已经不在了；「排队中」表示 worker 正在等待并发名额。
- 未合并行有「合并」和「提交 PR」。合并弹窗列出项目工作区的本地分支供你选择，确认后只做本地 `git merge --no-ff`，不需要 `gh` 账号。
- 凡是还有 worker 分支的任务行都有「删除分支」，已合并、已交付 PR 和未合并的分支都可以删除。确认弹窗显示分支名；未合并分支会提示删除会丢弃分支及其工作树且无法恢复。Host 先移除该任务登记且干净的工作树，再删除分支；任务仍在运行、工作树有未提交改动、工作树移除失败或移除后仍存在、分支被其他工作树检出时拒绝并返回明确错误。删除成功后该行按 Host 返回的最新视图就地更新，不重新加载列表。
- 「排队中」任务另有「取消」：点击后立即从队列移除，不再派发执行，不弹确认框；只移除任务记录和 worker 会话映射，留下一条不显示在面板里的 `cancelled` 记录供 router 的 `worker_status` 查询，worker 分支和工作树会保留。用「排队中」筛选后，这些行仍保留「排队中」标签和「取消」按钮；运行中或已交付的任务没有取消入口。
- 每行有「删除任务」：运行中的任务不能删除，失联的「未确认」任务可以；确认后只移除任务记录和 worker 会话映射，worker 分支和工作树都会保留。
- 任务行有复选框：勾选若干条后出现「删除所选」，确认一次即可批量删除；运行中的任务不能勾选。批量删除任务同样只移除任务记录和 worker 会话映射。
- 「提交 PR」先检查 `gh` 账号，再从 remote 列表选择 GitHub 仓库。推送固定在审查过的 SHA 上；已有同一提交的 PR 就复用。PR 被关闭时任务显示「失败」，分支头变动会让审查记录过期、回到「未审查」，都不会自动重试。
- 未审查行有「审查」：从对应 worker 会话直接启动一次独立审查。reviewer 用 `submit_review` 填内容，填「通过」就是通过审查，其他内容记为审查意见。
- 没有单独的「Git 交付」区块。面板读取任务时会修正过期的审查/合并状态并回填同一提交的审查记录；合并和删除分支成功后按 Host 返回的最新视图就地更新该任务行，不重新加载列表。面板不做常规自动刷新，只在任务列表里还有「排队中」任务时静默轮询任务列表，并发名额释放后该行自动转为运行中；操作失败时错误文本显示在任务列表上方。

## 设置

「设置」标签页保存两项 worker 默认值，只允许安装 owner 读写。

- worker 模型：填写服务商、模型和可选的推理强度；三项都留空时跟随 DSH 默认模型。保存后用于新启动的 worker，已有 worker 保持原选择。
- 并发 worker 上限：1–16，默认 3。超出上限的新任务停在「排队中」，有空闲名额后按创建顺序启动；排队中的任务可以取消，取消后不会再被派发；review 是 worker 的子代理，不占额外名额。

原始架构图按编号保存在 [docs/diagrams](docs/diagrams/)：001 术语与主流程、002 预设流程、003 记忆系统。

## 记忆系统

「记忆系统」标签页展示全局/项目记忆、memory 管理的全局/项目 skill 和全局知识库，只允许安装 owner 查看和删除。

- 顶部有搜索框，按关键词本地过滤全局/项目记忆字段、skill 的名字、description 和正文、知识库条目；输入只过滤已加载内容，不清空数据、不发请求、不刷新页面，无匹配时显示空状态。
- 项目下拉框选择当前项目，默认选中最近更新的任务所属项目。项目记忆显示责任和定位，全局记忆显示用户画像；空字段标记「未保存」。
- 页面按「全局记忆」「项目记忆」「全局知识库」分成带标题、说明和计数的卡片；长记忆字段和知识条目默认截断，按「展开」看全文。
- 全局和项目分组各列出由 memory 管理的 skill（frontmatter 带 `author: memory`，旧固定名字在迁移前也显示）；每个 skill 默认折叠，只显示名字和 description，点击摘要才展开完整正文，并可单独删除。删除会移除该 skill 的目录和 `SKILL.md`，不动其他 skill。
- 知识库是全局的，不随项目切换；按条目展示保存的长期结论和更新时间，条目多时在面板内滚动，不离开面板。
- 每段记忆字段、memory 管理的 skill 和知识条目都有行内「删除」入口，确认后只删除该条内容并就地更新标签页，不刷新页面。删除知识后 `knowledge_query` 不再返回该条目；删除 skill 后之后新派发的会话不再看到它。
- 记忆、skill 和知识都由 memory 角色在任务收尾时写入；面板只提供逐条删除，没有写入和编辑入口。没有任务可确定项目时只显示全局记忆、全局 skill 和知识库。

## 当前限制

- 绑定 DSH `0.2.2-rc.5`；同一 `worktrees` 服务只由这个 bundle 挂载，启用前确认没有第二个 bundle 挂载它。npm Host 在插件启动时会检查并自动补打客户端任务卡补丁与子代理 `promptSource` 补丁，应用后在 Host 日志提示重启 DSH；DSH-go 的 rootfs 仍按文档用 `--dsh-go` 手动应用。客户端任务卡补丁另支持 `0.2.2-rc.3`、`0.2.2-rc.1` 和 DSH-go 的 `0.2.2-rc.1` Host，见 [HOST-PATCH-AGENT-MESSAGE](docs/HOST-PATCH-AGENT-MESSAGE.md)。
- 非 Git 目录支持 change 和 report：worker 直接修改目录，reviewer 审查当前文件和工作区内容，Task 以审查通过为 `completed`；没有分支、Worktree、提交、合并、发布或 `land`。不要把多个 change 任务同时派到同一个非 Git 目录，它们没有 Worktree 隔离。
- router 与 worker 默认不推送、不合并；只有任务记录里的 `land` 授权才允许推送、开 PR 或合并 reviewed commit，且必须由用户在派发或续派发时明确给出。用户明确授权合并时，默认由 merge worker 执行：没有正在运行的 merge worker 时新派发一个，已有则追加给它；change worker 的续派发只授权推送和 PR，不授权合并。面板合并动作仍是用户直接触发的本地合并入口。
- 合并始终是本地 Git 操作，不需要 `gh` 账号；发送 PR 要求一个 fetch 与 push URL 指向同一 GitHub 仓库的 remote，以及已登录的 `gh`。
- 发送 PR 后由 GitHub 执行必需检查和分支保护；插件不预先查询检查状态。
- 并发 worker 数有上限，默认 3，可在面板「设置」里调整；超出的任务按创建顺序排队，排队中的任务可以取消，review 不占并发名额。Git 任务各自使用独立 Worktree 和检出；非 Git 目录没有 Worktree 隔离。Worktree 隔离工作文件，不是操作系统账号或凭据的隔离边界。
- `worker_status` 只查询本 Router Session 派发的任务；「已交付」包含已审查待落地、交付中和已合并等交付阶段。排队取消后保留的 `cancelled` 记录只供状态查询，不进入面板任务列表。
- 面板的「设置」只保存 worker 模型和并发上限，不自动刷新；提示词和其他行为配置仍在 `cordis.patch.yml` 和代码里。worker 模型留空时跟随 DSH 默认模型，保存后只影响新启动的 worker。
- 审查不接收整份 patch：Git 项目由 reviewer 自己读 `base..head` 和改动文件；非 Git 项目由 reviewer 读当前项目文件。Reviewer 可以查看任意文件、运行命令和测试；只禁止写改文件的工具，以及会改变 git 分支或历史的命令（commit、merge、rebase 等）。
- 记忆是数据，不是指令；它不能添加需求或授予权限。记忆只由 memory 角色维护，「记忆系统」标签页只提供逐条删除（记忆字段、memory 管理的 skill 和知识条目），不提供写入入口；归档可能包含敏感对话，插件不把归档正文注入任何角色上下文，只把记录路径交给 memory 角色自行读取。
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
