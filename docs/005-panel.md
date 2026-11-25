# 005 界面

在 DeepSeek Harness Web 的侧栏打开「项目任务」，面板有「项目任务」「设置」「记忆系统」「分支 / worktree」四个标签页。任务标签页监督 Router、Worker 和分支；设置标签页保存 worker 模型和并发上限；记忆系统标签页浏览当前项目的记忆、全局/项目 skill 和全局知识库，用搜索框本地过滤，并可删除单条记忆字段、memory 管理的 skill 或知识条目；分支 / worktree 标签页只列本插件创建的 Worktree 和 `sl-*` 工作分支，并可分别删除。任务标签页可以停止运行中或排队中的 Task，也可以勾选多条记录后一次删除。四个标签页各自加载，任务列表在自己的滚动区内滚动，不把整页撑长。它建立在 [001 领域模型](001-domain.md) 到 [004 配置与提示词](004-config-prompts.md) 之上。

## 三个问题

任务标签页回答两个问题：

1. 现在有哪些 Task，各属于六个面板状态中的哪一个？
2. 哪个 Task 正在等人操作 —— 审查、合并或发送 PR，卡在哪里？

## 一套状态

任务列表是唯一的状态分类来源。六个面板状态是**未合并**、**运行中**、**未审查**、**已完成**、**失败**、**仅回答**。它们互斥、覆盖全部 Task，并按这个顺序作为筛选项和分组标题出现。另有一个「排队中」筛选项，用来单独筛出等待并发名额的 Task；它不是第七个状态，排队中的 Task 仍属于运行中，也计入运行中的计数和分组。面板状态不是 Task 存储值，而是由 [003 生命周期](003-lifecycle.md) 从存储状态、worker 分支、审查记录和 Pull request 事实推导出来的（`src/status.js:6-34`）。停止后的 Task 存储为 `cancelled`，仍归入「失败」分组，但行内带中性的「已取消」标签，和真正的 worker/交付失败区分。每行的「删除任务」先停止运行中或排队中的 Task、确认 worker 已停，再移除任务记录和 worker 会话映射；合并或发布中的 Task 禁用该按钮。勾选多行后也可以一次删除所选任务；worker 分支和工作树不会被删除。

| 状态 | 出现的条件 | 行内动作 |
| --- | --- | --- |
| 未合并 | 当前 worker HEAD 已审查通过且尚未合并 | 合并、提交 PR、删除分支 |
| 运行中 | Worker、排队中的 Worker 或交付动作正在进行；排队中的 Task 带「排队中」标签，记录失联时带「未确认」标签 | 会话链接；停止；删除任务；worker 分支还在时「删除分支」禁用 |
| 未审查 | Worker 提交了 HEAD，但没有通过的审查；非 Git 任务结束但工作区审查未通过 | 审查（仅 Git 任务）、删除分支（仅 Git 任务） |
| 已完成 | 已审查的 HEAD 已合并，Worker 结束时没有可交付的提交，非 Git 任务审查通过，或非失败 Task 的 worker 分支已被删除 | worker 分支还在时「删除分支」 |
| 失败 | Worker 回合、交付动作或 Task 失败；带「已取消」标签的行是用户停止 | 会话链接；显示保存的失败原因；worker 分支还在时「删除分支」 |
| 仅回答 | report 任务交回了报告 | 会话链接 |

非 Git 任务没有分支、Worktree、提交和 `git` 字段视图，因此没有合并、提交 PR、审查、删除分支这些 Git 动作；审查通过后行状态直接是「已完成」。面板读取时依旧从任务记录和审查事实推导状态，不新增第七个状态。

面板读取 Task 时会修正过期的 `review-required`、`delivery-blocked` 或 `failed`：当前 HEAD 已审查时改为 `awaiting-merge`；也会采纳同一 Project 的另一个 Task 为同一 commit 记录的通关审查。

## 区块

面板顶部有「项目任务」「设置」「记忆系统」「分支 / worktree」四个标签页，没有单独的 Git 交付区。每个标签页的区块如下。

| 区块 | 显示什么 |
| --- | --- |
| 标签栏 | 「项目任务」「设置」「记忆系统」「分支 / worktree」四个标签 |
| 头部 | 当前标签页的标题、一行说明、刷新按钮 |
| 任务筛选 | 仅「项目任务」标签页：「全部」加六个状态筛选项和计数，再加「排队中」筛选项和计数；团队、项目下拉框缩小同一批任务。选中「排队中」时列表只保留排队中的 Task，并按「排队中」一个分组显示 |
| 任务列表 | 仅「项目任务」标签页：每个非空状态一个标题和计数，顺序同上；组内是 Task 行，行首复选框用于批量删除，有 worker 分支的行有「删除分支」，运行中或排队中的行有「停止」；选中「排队中」筛选时这些标签和按钮保持不变。列表在自己的滚动区内滚动 |
| 设置 | 仅「设置」标签页：DSH 当前默认模型、worker 模型的服务商/模型/推理强度、并发 worker 上限和保存按钮 |
| 记忆系统 | 仅「记忆系统」标签页：搜索框、项目下拉框，全局记忆的用户画像，项目记忆的责任和定位，memory 管理的全局/项目 skill，全局知识库条目及更新时间；分组是带标题、说明和计数的卡片；有内容的字段、skill 和条目带行内「删除」；长字段和知识条目默认截断，skill 默认折叠 |
| 分支 / worktree | 仅「分支 / worktree」标签页：只读说明，以及本插件创建的对象列表；每行显示分支名、Worktree 路径、所属项目和对应任务标题/ID/状态（没有任务记录时注明） |
| 提示 | 任务标签页显示加载失败、空列表、无结果、动作错误或完成提示；有勾选时显示「已选择 N」「删除所选」和「清除选择」。设置标签页显示加载失败、校验错误和保存成功提示。记忆系统标签页显示加载失败、未保存字段、没有可确定项目的提示、空知识库、搜索无匹配和删除结果。分支 / worktree 标签页显示加载失败、空列表、动作错误和删除结果 |
| 弹窗 | 合并、提交 PR、删除分支、删除 Worktree、删除任务、批量删除或删除记忆内容的窗口，一次只开一个 |

加载中、空列表和筛选无结果各有独立文字。刷新按钮中止进行中的加载、清空任务和设置标签页的旧提示与勾选，并重新加载任务和设置；记忆系统标签页和分支 / worktree 标签页在选中时读取，在对应标签页刷新会重新读取。面板不做常规自动刷新；任务列表里还有「排队中」的任务时，面板每 3 秒静默轮询任务列表（不进入加载态），名额释放后该行就地转为运行中，选择的筛选保持不变（`client.js:390`、`client.js:489-522`）。记忆系统标签页的搜索只过滤已加载内容，不发请求、不进入加载态。

## 单条记录怎么读

| 部分 | 行为 |
| --- | --- |
| 选择 | Task 标题前的复选框；正在合并或发布的 Task 不可勾选（`client.js:919-986`） |
| 状态 | 六个状态之一，带状态点或 spinner；「未确认」是运行中 Task 的警告标签，「排队中」表示正在等待并发名额，「已取消」表示用户停止，三者都不是第七个状态。失联的 `starting`、`running` 或 `resuming` 超过 2 分钟没有 Worker Session 时，插件启动扫描和派发、Task 结束、停止任务、Worker 释放名额或保存设置触发的队列检查会读 Review、分支和 Worktree HEAD 后把它回收为「未合并」或失败；之后的读取显示回收后的状态而不是一直「未确认」（`client.js:581-588`、`client.js:947-950`、`src/launch-queue.js:54-109`、`index.js:278-281`） |
| 标题 | 标题；没有标题时显示 Task ID |
| 团队与项目 | Team 名和项目根 |
| 更新时间 | 存储的 `updatedAt`，缺失时用 `createdAt`，按本地时间 |
| 失败原因 | 失败 Task 上显示保存的失败文本 |
| ID | 16 位 Task ID |
| Router 会话 | 按 Session ID 打开 |
| Worker 会话 | 用父、子 Session ID 打开（`client.js:955`） |
| Pull request | 在新标签打开；只渲染 `https://github.com/<owner>/<repo>/pull/<number>` 形式（`client.js:304-314`） |

会话按钮打不开时显示打开失败提示。没有 Worker Session 的 Task 不显示 Worker 按钮；面板没有会话打开能力时，标签显示为文本。

## 行内动作

按钮前置条件不满足时禁用，原因放在 `title` 提示里。动作执行期间行内显示「处理中…」，按钮保持禁用。合并和删除分支成功后关闭弹窗，并用 Host 返回的最新任务视图就地更新该行，不重新加载列表、不离开面板；停止成功后用 Host 返回的 `cancelled` 状态就地更新该行；分支 / worktree 标签页的删除成功后就地更新该行；删除任务成功后关闭弹窗并就地移除该行；其他动作成功时关闭弹窗并重新加载列表。成功都显示 Host 返回的消息；失败时显示 Host 的错误文本，没有消息时显示「操作失败。」（`client.js:856-918`）。

### 合并

打开弹窗，列出项目 checkout 的本地分支（排除 worker 分支），预选 Task 的 base branch。确认后发送选中的目标分支。合并是本地 `git merge --no-ff --log`，合并提交写明 worker 分支与任务标题，并记录分支上的功能性 commit 摘要；不需要 `gh` 账号，完成后 checkout 回到原来的分支。Host 在响应里返回合并后的任务视图，面板据此就地把该行改为已完成（`client.js:856-1034`、`src/merge.js:30-109`、`src/git-actions.js:414-442`）。这是用户直接合并入口，不经过 merge worker；用户直接指示的合并由 router 派发 `mode=merge`（已有运行中的 merge worker 时追加给它），合入的是该 worker 的 reviewed merge commit。

按钮要求当前 HEAD 审查通过、尚未合并、项目 checkout 干净且检出在分支上。目标冲突、checkout 脏、HEAD 移动或任务已离开可交付状态都会带原因拒绝（`src/git-actions.js:310-318`、`src/delivery.js:7-19`）。

### 提交 PR

打开弹窗，先检查 GitHub 账号。没有登录的 `gh` 时显示「需要 gh 账号：」和 `gh` 错误，不能提交。有账号时列出 checkout 的 remote 及其对应的 GitHub 仓库，由用户选择仓库。确认后把 reviewed HEAD 推到该 remote，并创建或复用 Pull request（`client.js:856-918`、`client.js:878-883`、`src/git-actions.js:432-477`）。发送 PR 与合并共用状态、审查和 HEAD 前置校验，唯一额外条件是 GitHub 账号和 remote；Host 在执行前会再验证 `gh auth status`（`src/delivery.js:7-19`、`src/git-actions.js:435-444`）。

当前 HEAD 未审查、项目没有 GitHub remote、Task 已合并或 PR 已关闭时按钮禁用。已有同一 HEAD 的 Pull request 时直接复用，不重复创建。

### 审查

从对应的 Worker Session 对已提交的 HEAD 启动一次独立审查，并记录裁决。Reviewer 用 `submit_review` 填内容，内容为「通过」就是通过，其他内容记为审查意见。按钮要求 HEAD 未审查、有提交、Worker Session 仍活着；没有会话时禁用并给出原因（`client.js:971-974`、`client.js:769-782`、`src/git-actions.js:398-419`）。

### 删除分支

凡是任务记录里还有 worker 分支的行都显示「删除分支」，不要求分支已合并：已合并、已发布 PR 和未合并的分支都可以删除。任务处于运行中（`queued`、`starting`、`running`、`resuming`、`publishing`、`merging`）时按钮禁用，原因放在 `title`。打开确认弹窗显示分支名；未合并的分支额外提示删除会丢弃分支及其工作树且不可恢复；确认弹窗只读任务行里的分支信息，不读取分支历史。确认后 Host 拒绝仍在运行的任务、有未提交改动的工作树、被其他工作树检出的分支、工作树移除失败以及移除后仍存在的工作树，并返回明确错误；其余情况先移除该 Task 的干净 Worktree，再删除分支，记录 `branchDeletedAt` 并清空 `worktree`。删除后未失败的 Task 按已完成显示，失败 Task 保持失败；Host 返回该行最新视图，面板就地更新并隐藏按钮，不重新加载列表（`client.js:856-918`、`client.js:975-979`、`client.js:847-855`、`src/git-actions.js:288-293`、`src/git-actions.js:341-342`、`src/git-actions.js:502-521`、`src/merge.js:112-170`）。

### 分支 / worktree

标签页只列本插件创建的 Worktree 和 `sl-*` 工作分支，沿用任务已有状态；用户自己的分支、其他 Worktree 和 master 不出现。每行显示分支名、Worktree 路径、对应任务与状态。「删除 worktree」只移除工作树并保留分支；分支下的工作树移除后「删除分支」才可用。两个动作都有确认弹窗并写明不可恢复；成功后只就地更新该行，不刷新页面、不重新加载列表。任务仍在运行时两个按钮都禁用并给出原因，服务端也会拒绝（`client.js:1073-1228`、`src/branches-panel.js:15-68`、`src/git-actions.js:603-701`、`src/merge.js:175-216`）。

### 停止任务

运行中或排队中的 Task 行显示「停止」，其他状态没有这个按钮。点击后不打开确认弹窗，直接向 `/superagent-lite/tasks` 发送 `POST`，body 为 `{"taskId":"<id>","action":"stop"}`；成功后该行保留在列表里，状态按 Host 返回的 `cancelled` 就地更新为「失败」分组并加上「已取消」标签，显示「任务已停止；worker 已中断，并发名额已释放。」，不刷新页面、不重新加载列表；在「排队中」筛选下操作后该行离开排队列表，筛选显示空状态。服务端只接受 owner，在 Task 锁内把 `queued`、`starting`、`running` 或 `resuming` 写成 `cancelled`，调用 `ctx.subagents.interrupt` 中断 Worker 当前执行，并立即触发启动队列；已经取消的 Task 重复停止返回 200，不会报错。停止不删除记录、Session 映射、worker 分支或 Worktree，也不会恢复已停止的 Task（`client.js:704-735`、`client.js:956-960`、`src/board.js:23-69`、`src/task-store.js:126-146`、`src/worker-stop.js`、`src/worker-control.js:5-20`）。

「已取消」是明确的用户停止终态，不是 worker 回合失败：停止写入 `cancelled` 和 `cancelledAt`，没有失败原因，也不会自动恢复；worker 失败（`failed`）和交付阻塞（`delivery-blocked`、`merge-conflict`）由回合或交付事件写入并保留失败原因。

### 删除任务

每行都显示「删除任务」。正在合并或发布（存储状态 `merging` 或 `publishing`）时按钮禁用，原因放在 `title`。点击后打开确认弹窗；任务仍运行或排队时，弹窗说明会先停止 worker，确认后发送 `DELETE /superagent-lite/tasks?taskId=<id>`。Host 先在 Task 锁内停止任务并中断 worker，再等待 worker 离开运行态；等待超过 10 秒返回 `409` 并保留记录。确认已停后移除任务记录和 worker 会话映射，不删除 worker 分支或 Worktree；面板关闭弹窗并就地移除该行（`client.js:856-918`、`client.js:980-984`、`src/board.js:70-120`、`src/worker-control.js:22-42`、`src/task-store.js:107-124`）。

合并或发布正在执行（存储状态为 `merging` 或 `publishing`）时，服务端拒绝删除；空 ID 或未知 ID 分别返回 400 和 404。

### 批量删除

每条 Task 前都有复选框。勾选后列表上方出现「已选择 N」「删除所选」和「清除选择」；点「删除所选」打开一次确认弹窗，确认后逐条调用 `DELETE /superagent-lite/tasks?taskId=<id>`。正在合并或发布的 Task 复选框禁用，不能进入批量选择；运行中或排队中的 Task 可以勾选，删除时会先停止再删除（`client.js:384-387`、`client.js:571-580`、`client.js:1058-1083`）。

成功的记录立即从列表移除并显示完成提示；部分失败时确认弹窗保留，展示 Host 返回的错误，成功的记录已经移除，失败项保持勾选，关闭弹窗后错误也显示在列表上方。批量删除任务不删除 worker 分支或 Worktree。运行中或排队中的 Task 也可以在行内用「停止」立即中断并保留记录。

## 分支 / worktree

「分支 / worktree」标签页把本插件创建的隔离对象单独列出来，回答「哪些 Worktree 和 `sl-*` 分支还在、分别属于哪个任务、能不能安全清掉」。它不重新分类任务，也不读取用户自己的 Git 分支。

| 项 | 行为 |
| --- | --- |
| 只列本插件对象 | 对象来自任务记录里出现的 Git 项目根：只取 `<项目根>/.agents/worktrees/` 下的 Worktree（且分支名以 `sl-` 开头）和本地 `refs/heads/` 中的 `sl-*` 工作分支；你自己的分支、其他 Worktree 和 master 不进入清单，也无法通过该端点删除。项目根下没有任务记录时，该项目的对象不会被发现（`src/git-actions.js:603-701`） |
| 每行内容 | 分支名、Worktree 路径（没有时显示「无 worktree」）、项目根、对应任务标题和 16 位 ID，以及任务在六个面板状态中的状态；找不到任务记录时显示「无任务记录」（`client.js:1413-1455`） |
| 删除 worktree | 只移除该 Worktree 的检出，保留 `sl-*` 分支；确认弹窗写明 Worktree 路径和不可恢复。删除后该行保留，路径变为「无 worktree」，「删除分支」随之可用。有未提交改动、移除失败或移除后仍存在的 Worktree 会被拒绝（`src/merge.js:175-197`） |
| 删除分支 | 只在该分支没有 Worktree 检出时可用（不管是自己的还是别处的 Worktree）；有 Worktree 时按钮禁用并说明先删除 Worktree，服务端也会拒绝。确认弹窗写明分支名和不可恢复；删除成功后该行移除，任务记录清空 `worktree` 并记录 `branchDeletedAt`，任务标签页把非失败任务显示为已完成（`src/merge.js:199-216`、`src/git-actions.js:682-700`） |
| 运行中的任务 | 任务处于 `queued`、`starting`、`running`、`resuming`、`publishing`、`merging` 时，「删除 worktree」和「删除分支」都禁用并给出原因；服务端也会按 Task 状态拒绝（`src/git-actions.js:608-657`、`src/merge.js:175-200`） |
| 就地更新 | 两个删除动作成功后不刷新页面、不重新加载列表：删除 Worktree 用 Host 返回的最新行替换当前行，删除分支直接移除当前行；成功提示用 Host 返回的消息，失败时错误同时显示在标签页和确认弹窗里（`client.js:764-812`） |
| 权限 | 端点 `/superagent-lite/branches` 只允许安装 owner；GET 返回对象清单，DELETE 用 `kind=worktree`（`projectRoot`、`branch`、绝对 `path`）或 `kind=branch`（`projectRoot`、`branch`）删除。未知 kind、相对项目根、非 `sl-*` 分支或 Worktree 缺绝对路径返回 400；拒绝删除或 Git 读取失败返回 409（`src/branches-panel.js:15-68`） |

## 设置

面板的「设置」标签页保存 worker 默认值。

「设置」标签页读取并保存 `~/.dsh/superagent-lite/worker-settings.json`，只允许安装 owner 操作。加载时显示 DSH 当前默认模型；模型目录不可用时仍允许填写已知的服务商和模型。

| 项 | 行为 |
| --- | --- |
| Worker 模型 | 服务商、模型和可选的推理强度三个输入框，带模型目录建议；三项都留空时保存 `null`，新 worker 跟随 DSH 默认模型（`src/settings-panel.js`、`src/worker-settings.js`） |
| 并发 worker 上限 | 1–16，默认 3；超出的新 Task 显示「排队中」，有空闲名额后按创建顺序启动；review 是 worker 的子代理，不占额外名额；失联的 `starting`、`running` 或 `resuming` 超过 2 分钟会在启动和下一次队列检查中按交付事实回收为「未合并」或失败，失联的 `starting`/`resuming` 不再占名额（`src/launch-queue.js:50-86`） |
| 保存 | 只影响之后启动的 worker；已有 worker 保持原模型。失败原因显示在保存按钮上方 |

bundle 组成和提示词文字仍在 `cordis.patch.yml` 与 [004 配置与提示词](004-config-prompts.md) 列出的源文件里；设置页不编辑提示词。记忆没有写入或编辑入口：全局/项目记忆、memory 管理的 skill 和全局知识库由 memory 角色维护，记忆系统标签页只能逐条删除；Worker、Reviewer 和 memory 角色通过 `knowledge_query` / `knowledge_get` 读取。

## 记忆系统

「记忆系统」标签页展示记忆、memory 管理的 skill 和全局知识库，并允许安装 owner 删除单条内容；写入仍只由 memory 角色在 change 任务收尾时完成。聊天里 memory 的触发请求仍显示为「收到任务消息」卡片，但正文只有会话记录路径、任务/角色/分支等元信息和读取指引，不内联对话正文（`docs/HOST-PATCH.md`、`src/memory.js`）。

| 项 | 行为 |
| --- | --- |
| 搜索 | 标签页顶部的搜索框按关键词本地过滤已加载内容：全局/项目记忆字段、skill 的名字/description/正文、知识条目文本和编号；匹配不区分大小写，只更新当前标签页，不发请求、不清空数据、不刷新页面，清空关键词后恢复全部内容；无匹配时显示「没有匹配关键词的记忆内容。」 |
| 项目 | 下拉框列出任务记录里的项目根，默认选中最近更新的任务所属项目；没有任务可确定项目时只显示全局记忆、全局 skill 和全局知识库并给出提示 |
| 全局记忆 | 用户画像（`userProfile`）；未保存的字段显示「未保存」；有内容时行内「删除」；超过约 3 行的长文本默认截断，按「展开」看全文 |
| 项目记忆 | 责任（`responsibilities`）和定位（`positioning`），按项目根隔离；有内容时行内「删除」；长文本与全局记忆一样默认截断、按需展开 |
| 全局/项目 skill | 按名字列出由 memory 管理的 skill（frontmatter 带 `author: memory`，旧固定名字在迁移前也显示），默认折叠为名字和 description 摘要，点摘要才展开完整正文；每个 skill 有「删除」按钮，确认后调用 `DELETE /superagent-lite/memory?kind=skill&scope=…&name=…`（项目 skill 再带 `projectRoot`），只移除该 skill 的目录和 `SKILL.md`，就地更新当前标签页，不重新加载列表、不刷新页面 |
| 知识库 | 全局的，不随项目切换；按条目显示文本和更新时间，带条目计数；没有条目时显示空状态，长条目默认截断、按需展开。内容在标签页自己的滚动区内滚动；有内容时行内「删除」 |
| 删除 | 行内「删除」打开确认弹窗，写明要删除的字段、skill 或条目；确认后发送 `DELETE /superagent-lite/memory`，成功后只更新当前标签页里的数据、显示完成提示，不重新加载标签页、不刷新页面 |
| 刷新 | 标签页选中时读取；在该标签页刷新重新读取，切换项目立即重新读取，不刷新页面、不离开面板 |
| 权限 | 只有安装 owner 能读取和删除；端点 `/superagent-lite/memory` 接受 GET 和 DELETE，非 owner 返回 403；DELETE 支持 `kind=memory`/`skill`/`knowledge`：未知 kind/scope/field、skill 缺 `name`、知识缺 `id`、非法项目根或项目作用域缺绝对 `projectRoot` 返回 400；存储读取或删除失败返回 409 |

排版沿用 DSH Web 设置页和插件清单页已有的做法：搜索框带放大镜图标、放在内容上方的筛选行；分区使用「标题 + 计数 + 一行说明」的卡片头；卡片使用 `--dsw-alias-settings-card-stroke` / `--dsw-alias-settings-card-fill`，正文用 label-secondary / label-tertiary 分层；折叠摘要用带 chevron 和 `aria-expanded` 的按钮，description 折叠时截断、展开时显示全文；删除动作固定在行尾。这样与面板的设置页卡片和任务列表的分隔线、按钮层级保持一致，不引入新的视觉体系。

记忆和知识读取自 `~/.dsh/superagent-lite/memory/`，skill 读取自全局 skill 根和 `<项目根>/.dsh/skills/<skill名>/SKILL.md`（`src/memory-store.js`）。删除记忆字段会清空该字段；删除 skill 会移除该 skill 的目录和 `SKILL.md`，不动其他 skill；删除知识条目会从知识库文件移除，之后的 `knowledge_query` 不再返回它。删除全局记忆后 Router 注入的全局记忆缓存随之刷新。面板不新增或编辑这些文件。

## 设计原则

1. **一套状态系统。** 六个任务状态负责分类；「分支 / worktree」标签页只列本插件对象并沿用这些状态，不新增第七个状态或第二套分类，任务行的 Git 动作仍属于任务行及其弹窗（`src/status.js:6`）。
2. **只回答该问的问题。** 任务标签页回答任务状态和下一步动作，分支 / worktree 标签页回答哪些本插件对象还在、能否清掉；不为凑视图增加无关信息。
3. **监督而不是静默交付。** 每次刷新只发只读 GET，可能修正过期的任务状态或采纳匹配的审查记录。读取不碰项目文件；合并、发送 PR、删除分支、删除 Worktree、停止任务、删除任务和删除记忆内容只在用户明确确认的动作里写（`src/board.js:16-150`、`src/git-actions.js:276-380`、`src/git-actions.js:502-521`、`src/memory-panel.js`、`src/branches-panel.js:15-68`）。
4. **一行一个动作并给出原因。** 按钮禁用时说明缺什么，用户不必翻文档才知道为什么。
5. **诚实状态。** Worker Session 不在时显示「未确认」；已合并显示「已完成」；已审查未合并显示「未合并」；缺审查显示「未审查」。
6. **链接而不复制。** 会话在对应 Session 里，审查在 GitHub 上，面板只给链接。
7. **安全目标。** 只跟随同源面板请求和 GitHub PR URL，其他协议不渲染（`client.js:304-314`）。
8. **显式刷新，排队例外。** 面板在打开和点击刷新时加载，不做常规轮询；只有列表里还有「排队中」的 Task 时，才静默轮询任务列表，让名额释放后的行就地转为运行中。
9. **仅 owner。** 不是安装 owner 的请求拿不到任务数据、分支 / Worktree 数据或记忆数据（`src/board.js:16-22`、`src/memory-panel.js`、`src/branches-panel.js:15-21`）。
10. **记忆由 owner 删除。** 记忆系统标签页只读取内容并删除用户明确确认的单条记忆、memory 管理的 skill 或知识；新增和编辑仍只由 memory 角色完成（`src/memory-panel.js`、`src/memory.js`）。
