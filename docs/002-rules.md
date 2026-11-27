# 002 规则与权限

这份文档决定谁能发起工作、每个角色能碰什么、审查与 Git 操作各需要什么条件。它建立在 [001 领域模型](001-domain.md) 之上。

## 两条路径

新工作与已有工作走不同入口，互不接管；只询问 worker 或任务状态时走 `worker_status`，不创建也不延续工作。

### 新工作

用户输入先得到一次 `dispatch_worker` 调用。这个调用在 Router 回答前记录本回合的派发决定。

- `mode` 必填，取值 `change`、`report`、`answer` 或 `merge`（`src/validation.js:1-75`）。
- `mode=answer` 不派 worker：Router 直接回答，不建 Worktree、不建 Task、不写 Task 记录（`src/validation.js:38-41`、`src/dispatch.js:195-196`）。
- `mode=change`、`mode=report` 或 `mode=merge` 创建一个 Task 和一个 Worker Session。`title` 1–120 字符，`task` 1–20,000 字符，`teamId` 匹配 `[a-zA-Z0-9][a-zA-Z0-9._-]*` 且最多 64 字符（`src/validation.js:42-66`）。
- `mode=change` 和 `mode=merge` 还要求 `worktreeName`：1–4 个英文小写 kebab-case 短词，最多 32 字符，如 `fix-plan-color`；中文标题要翻译成英文，不能用中文、拼音或通用名。Git 项目用它决定新 Task 的 Worktree 和 worker 分支名，非 Git 项目只记录该字段、不创建 Worktree（`src/validation.js:9-18`、`src/worktree-tool.js:42-46`、`src/dispatch.js`）。
- Task ID 是 `[agent.id, callId]` 的 SHA-256 前 16 位十六进制（`src/dispatch.js:197`）。
- 同一对 `agent.id` 与 `callId` 再次派发时：已有 Task 若不在 `starting` 或 `failed`，直接返回该 Task；处于这两个状态则报 `Dispatch <id> is already being established; inspect the task board before retrying`（`src/dispatch.js:197-205`）。
- Task 属于另一个 Router Session 时拒绝：`Task id is already owned by another Session`（`src/dispatch.js:199`）。
- 派发时先识别项目根：属于 Git 仓库就读取基础 commit、基础分支和工作区状态，除 `?? .agents/worktrees/.gitignore` 外有未提交改动就拒绝；不属于任何 Git 仓库时把当前目录作为项目根，Task 记录 `git: false`，不要求 commit、分支或干净工作区（`src/dispatch.js:130-144`）。
- 非 Git 项目支持 `change` 和 `report`：worker 直接在工作区执行，没有 Worktree、提交、合并或推送；`mode=merge` 与 `land=true` 需要 Git 仓库，派发时直接拒绝（`src/dispatch.js`）。
- `mode=merge` 还要求 `land=true` 和非空 `branches`；每项是分支名或 16 位 Task ID，最多 20 项。Task ID 会按本 Router Session 和 Project 解析成 worker 分支，目标分支必须存在且不能是 base branch（`src/validation.js:7-54`、`src/dispatch.js:14-44`）。
- 首个 Task 固定 Team 与 Project 的一对一关系；之后改配任一侧都报 `The project and team must retain their existing one-to-one assignment`（`src/task-store.js:74-79`）。
- 新 worker 受面板「设置」的并发上限约束：名额内启动，超出写为 `queued` 并按创建顺序等待；review 是 worker 的子代理，不占 worker 名额，但和 worker 一起计入 DSH Host 的 `maxActiveSubagents`（默认 8）。Host 报 `ACTIVATION_LIMIT_REACHED` 时把记录写回 `queued` 并结束本轮启动，下一次 `pumpWorkers` 再试，不把 Task 记为失败。`starting`、`running` 或 `resuming` 超过 2 分钟没有活着的 Worker Session 时，插件启动扫描和下一次 `pumpWorkers` 会读事实后回收：Review 通过、分支存在且 Worktree HEAD 仍等于 reviewed HEAD 的落为 `awaiting-merge`，否则落为 `failed` 并写明是无 turn/end 还是会话在恢复前结束；失联的 `starting`/`resuming` 同时释放名额，有活着 Session 的记录不受影响。面板可以停止运行中或排队中的 Task：状态写成 `cancelled`，worker 被中断，名额立即释放（`src/worker-settings.js`、`src/launch-queue.js:54-120`、`src/launch-queue.js:206-228`、`src/subagent-capacity.js`、`index.js:390-394`、`src/worker-stop.js`）。
- `images` 可选，是本地 PNG/JPEG/WebP/GIF 路径数组，按 Router 当前目录解析；插件交给 Host 附件存储后把附件引用写进 Task，worker 启动时附在首条消息文本之后。`mode=answer` 不产生 worker 消息，带 `images` 会被拒绝（`src/validation.js:34-44`、`src/dispatch.js:216-228`、`src/launch-queue.js:150-162`、`src/message-images.js:54-90`）。
- 只询问 worker 或任务状态时，Router 用 `worker_status` 查询本会话派发的任务，不新建 Task；任务被停止或排队 worker 开始执行时，Router 收到后台状态通知。

### 已有工作

`continue_worker` 把追加要求送给已经存在且未发布的 Task。`dispatch_worker` 的 `mode=merge` 在已有运行中的 merge worker 时，把新请求追加到同一个 Task。

- 调用者必须是该 Task 的 Router Session；`taskId` 必须是 16 位小写十六进制；要求 1–20,000 字符（`src/continue.js:245-251`）。
- 只有同一个 Deliverable 和目标的补充或修正才继续；不同业务目标即使看起来相关也新建 Task（`src/continue.js:231`）。例如再改一次提示词措辞可以继续，改变派发消息的结构是新任务。合并请求也是新任务：即使点名已有任务，也走 `dispatch_worker mode=merge`，不续派该任务；没有运行中的 merge worker 时新建 worker，已有则追加。
- Worker agent 正在运行时，发送一条短的要求更新，让 Worker 判断是否属于本 Task；不属于就不执行，并在最终报告里带上未应用的 follow-up（`src/continue.js:256-274`）。
- Task 处于 `queued` 或 `starting` 时还没有 Worker 回合可唤醒：`continue_worker` 不投递、不记录 follow-up、不授予 `land`，返回明确的「稍后再试」，Router 应在 Worker 启动后重试（`src/continue.js:275-277`）。
- Worker 空闲或已结束时，发送精简续派发消息：任务标识（Task ID、分支、Worktree、base）、不可变规则，以及标明为本次唯一权威指令的 Follow-up；不再整段重发原始需求。change 续派发先要求用 `knowledge_query` 查知识库；非 Git 项目改为项目目录、非 Git 说明、直接修改和再次审查的规则；report 任务改为只读检查、允许联网检索和以 `report_task` 结束的规则。只有检测到 Worker 会话上下文被压缩（compact checkpoint）时才回放原需求。Task 处于 `awaiting-merge`、`review-required`、`failed` 或 `resuming` 时先标为 `resuming`；不再要求 Task 已有 Worktree，BLOCKED 在创建 Worktree 前就结束的 Git Task 也能恢复，续派发消息会要求 Worker 先创建 Worktree。已经合并、已删除 worker 分支、记录的 Worktree 已不存在，或处于交付中的 Task 仍拒绝恢复（`src/continue.js:59-81`、`src/continue.js:83-190`、`src/continue.js:278-289`）。
- follow-up 先写入 `task.followUps` 再发送；发送失败删除该条。发送失败时，只有本次把已结束 Task 重新打开的才标为 `failed`；运行中的保持 `running`，恢复中的保持 `resuming`（`src/continue.js:210-227`、`src/continue.js:278-306`）。
- `land=true` 只能来自用户本轮明确授权，写入 `task.land`、`task.landAuthorizedAt` 和 `task.landAuthorizedVia`；在 `continue_worker` 里它只授权推送和 PR，不授权合并；非 Git 项目拒绝 `land=true`；发送失败时回滚这次新增的授权（`src/continue.js:251-255`、`src/continue.js:278-306`）。
- `images` 可选，按 Router 当前目录解析成本地图片并附在续派消息文本之后；运行中的更新和空闲恢复都支持。附件读取或保存失败时整次续派失败，不发送半条消息（`src/continue.js:255`、`src/continue.js:257-274`、`src/continue.js:294-298`）。
- 已发布的 Task 不继续；发布后的下一个输入是新工作。

### 不交叉

- `dispatch_worker` 不恢复已有 Task；`mode=merge` 是唯一会把新请求追加给运行中 Worker 的派发路径。
- `continue_worker` 不创建 Task 或 Worktree。
- 文件重叠不是合并工作的理由；新目标有自己的 Worker、Worktree 和分支，合并路径会拒绝冲突（`src/validation.js:3-18`、`src/git-actions.js:201-210`）。

## 授权级别

| 级别 | 授予方式 | 允许什么 | 默认 |
| --- | --- | --- | --- |
| 观察 | 作为 Router Session | 读取输入，调用 `dispatch_worker` 和 `continue_worker`；只问状态时调用 `worker_status` | 每个输入 |
| 委派 | `dispatch_worker` 且 `mode=change`、`mode=report` 或 `mode=merge` | 创建一个 Task 和一个 Worker Session，或把 merge 请求追加给运行中的 merge worker | 否；需要决定 |
| 编辑 | change 任务中调用 `create_worktree`（仅 Git 项目） | Git 项目在分配的 Worktree 工作，未进入前除只读的 `knowledge_query` / `knowledge_get` 外其他工具被拦；非 Git 项目直接使用项目根 | 否；Git 项目 Worker 必须先进入 Worktree（只读知识库查询除外），非 Git 项目无需进入 |
| 审查 | 完成后调用 `review_worker_commit` | Git 项目读取已提交 diff，非 Git 项目读取当前项目文件和工作区内容，并启动一个独立 reviewer；reviewer 不能写改文件或改变分支 | 否；Git 项目需要干净的已提交 Worktree |
| 报告 | report 任务中调用 `report_task` | 带着结论结束 Task | 否；仅 report 任务 |
| 落地 | change/report 派发或续派发时携带 `land=true` | change worker 可推送指派分支、开 PR；只限指派分支与 reviewed HEAD | 否；未携带时不推送、不开 PR、不合并 |
| 合并 | 用户直接指示时由 router 派发 `mode=merge`：没有运行中的 merge worker 就新派发，已有则追加；面板任务行的合并操作 | merge worker 先把 `mergeBranches` 合入自己的 worktree 分支并审查合并结果，再把 reviewed commit 本地合入 base branch；面板直接把 reviewed HEAD 合入所选分支，不需要 `gh` | 否；需要明确授权、审查通过的 HEAD、干净的项目 checkout 和 full access |
| 发送 PR | 用户在面板点击「提交 PR」 | 推送 reviewed HEAD 到所选 GitHub remote 并打开或复用该 HEAD 的 Pull request | 否；需要任务已结束 Worker 工作、审查通过的 HEAD、`gh` 账号、GitHub remote 和 full access |
| 删除分支 | 用户在仍有 worker 分支的 Task 行点击「删除分支」 | 删除 worker 分支；登记且干净的 Worktree 一并移除 | 否；需要明确点击，运行中的 Task、脏 Worktree、被其他 Worktree 检出的分支和无法移除的 Worktree 拒绝 |
| 停止任务 | 安装 owner 在运行中或排队中的 Task 行点击「停止」 | 在 Task 锁内把 `queued`、`starting`、`running`、`resuming` 写成 `cancelled` 终态，中断 Worker Session 当前执行并立即释放并发名额；记录保留在面板，重复停止返回同一状态 | 否；需要明确点击，已结束的 Task 拒绝；停止不会删除记录、分支或 Worktree |
| 删除任务 | 安装 owner 在面板点击「删除任务」或批量「删除所选」 | 先停止运行中或排队中的 Task 并等待 worker 离开运行态，再移除所选 Task 记录和各自的 worker 会话映射，保留 worker 分支和 Worktree | 否；需要明确点击，正在合并或发布的 Task 除外 |
| 修改设置 | owner 在面板「设置」保存 | 保存 worker 模型和并发上限，只影响之后启动的 worker | 否；需要 owner 明确点击 |
| 提取记忆 | change worker 的最终 `message_router` 报告送达后自动触发一次 | Host 把完整 Worker 会话写成可读归档并把路径、任务、角色、分支等元信息发给 memory；memory 自己按路径读取后写回全局/项目记忆和 skill；skill 只通过会话里的 catalog 获知 description，触发消息只列 skill 名称和作者（`author: memory` 或 `none`），不写路径、description 或正文，需要正文时按名调用 `skill` 工具；知识库通过 `knowledge_write` 写入；没有可复用内容就不写，不把写入条数当指标 | 否；每个 Worker Session 最多一次，失败不阻塞报告 |

## 准入

| 模式 | 选择方式 | Worktree | 修改项目文件 | 提交 | 请求审查 | 结束方式 |
| --- | --- | --- | --- | --- | --- | --- |
| `change` | `dispatch_worker` 传 `mode=change` | Git 项目必须；非 Git 项目无 | 可以；Git 项目限定在 Worktree，非 Git 项目直接在工作区 | Git 项目可以；非 Git 项目不提交 | 可以，直到通过 | `review_worker_commit`，然后 Worker 报告；Git 项目以 reviewed commit 结束，非 Git 项目审查通过即完成 |
| `report` | `dispatch_worker` 传 `mode=report` | 无 | 不修改 | 不提交 | 不审查 | `report_task` |
| `merge` | `dispatch_worker` 传 `mode=merge` | 必须 | 只在解决合并冲突时修改 | 合并提交 | 可以，直到通过 | `review_worker_commit`，然后把 reviewed commit 合入 base branch |
| `answer` | `dispatch_worker` 传 `mode=answer` | 无 | 不修改 | 不提交 | 不审查 | Router 直接回答，不建 Task |

## Router 规则

Router Session 运行 `superagent-lite` 预设。派发守卫只对该预设生效（`src/turn-guard.js:89-93`）。

- 每个用户输入需要当前回合内一次成功的 `dispatch_worker`、`continue_worker` 或 `worker_status` 结果。失败的工具结果不算；`mode=answer` 的成功结果算（`src/turn-guard.js:73-108`）。
- 完成回合没有决定时，等 agent 空闲后插入提醒。提醒是 `source.kind = superagent-lite-reminder` 的用户角色消息，不是新输入（`src/turn-guard.js:7`、`src/turn-guard.js:33-51`）。
- 每个输入最多提醒 2 次；新的用户输入重置预算（`src/turn-guard.js:3-7`、`src/turn-guard.js:56-70`）。
- Router 从输入本身判断，不检查仓库、不运行项目命令；项目工作交给 Worker。
- Router 只在派发、续派、只查询 worker 状态或用户要求加载 skill 时调用别的工具；全局记忆由运行时上下文注入，没有模型侧记忆工具。
- 任务停止和排队 worker 开始执行会以 `source.kind = superagent-lite-worker-status` 的用户角色消息注入 Router 的下一模型步；它不唤醒新回合、不算新输入，Router 需要当前全量状态时调用 `worker_status`（`src/worker-status.js`、`src/launch-queue.js`、`index.js`）。
- 派发参数在碰文件前完成校验：`mode` 必填，`title` 1–120 字符，`task` 1–20,000 字符，`teamId` 1–64 字符；change 和 merge 还要求英文 `worktreeName`（`src/dispatch.js:45-51`、`src/validation.js:3-62`）。
- 合并只在用户明确授权后执行：直接指示或面板的合并操作。直接指示的合并请求默认派发 `mode=merge` 的新 worker，不续派分支所属的 Task（`cordis.patch.yml:31-32`、`src/dispatch.js:26-49`）。

## Worker 规则

- Git 项目的 change worker 必须先调用一次 `create_worktree`；除 `create_worktree`、只读的 `knowledge_query` / `knowledge_get` 和建 Worktree 失败时用于上报 BLOCKED 的 `message_router` 外，工作目录不在分配的 Worktree 时所有工具被拦。非 Git 项目不注册可用的 `create_worktree`，工作目录从一开始就是项目根（`index.js:99-296`、`src/dispatch.js`）。
- Git 项目的 `create_worktree` 向 worktree 服务请求名字 `sl-<worktreeName>-<taskId 前 12 位>` 的 Worktree，目录和分支同名，例如 `sl-fix-plan-color-0123456789ab`（`src/worktree-tool.js:42-46`）。旧 Task 没有 `worktreeName` 时沿用原命名 `sl-<team slug>-<taskId>`。实际分支名取服务返回值，写入 `task.worktree.branch`（`src/worktree-tool.js:48-55`）。非 Git 项目调用 `create_worktree` 会被拒绝。
- 已存在 Worktree 时再次调用只重新进入，不创建第二个（`src/worktree-tool.js:27-37`）。
- Worker 的 subagent 结束时冻结，之后不能用任何工具，包括消息工具（`index.js:280-283`、`index.js:186`）。
- Worker 的 `bash`/`pwsh` 在工具守卫里检查落地命令：未授权时 `git push`、`gh pr create`、`gh pr merge`、`git merge` 被拒；change worker 授权后仍只允许指派分支、reviewed HEAD 和本任务记录的 PR。`git merge` 只对 `mode=merge` 的 Task 开放，且只允许把本任务的 reviewed commit 从项目 checkout 合入 base branch；merge worker 用 `merge_branch` 把目标分支合入自己的 worktree 分支，不经过 shell 合并（`index.js:224-243`、`src/landing.js:374-388`、`src/merge-tool.js:13-64`）。
- `review_worker_commit`、`merge_branch` 和 `message_router` 在 Worker 活跃时就注册，不再等 Worktree：首个 step 就能看到它们。`message_router` 与只读知识库工具在 Worktree 之前也被守卫放行，建 Worktree 失败时 Worker 仍能上报 BLOCKED；`review_worker_commit` / `merge_branch` 在缺 Worktree、状态不符或目标不在 `task.mergeBranches` 时由 execute 明确拒绝。非 Git 项目的工作区就是项目根。`report_task` 只对活跃的 report 任务可用（`index.js:244-279`、`index.js:224-243`）。
- report worker 在项目 checkout 中可使用 `read`、`glob`、`grep`、`read_image`、`bash`、`pwsh`、`todo_write`、`skill`，在 checkout 之外可使用只读检索工具 `web_search`、`web_fetch`、`read_page`、`x_search`、`job_output`、`job_list`、`knowledge_query`、`knowledge_get`，并以 `report_task` 结束；写改文件、创建 Worktree 等其他工具被拒绝（`index.js:224-243`）。
- report worker 的任务消息要求按仓库 `AGENTS.md` 的约定执行，但该约定不能扩大 report 的只读授权，也不能放宽不建 Worktree、不改文件、不提交和不审查的边界（`src/worker-prompt.js:37-63`）。
- Git 项目的 `report_task` 要求 HEAD 仍等于基础 commit，且 checkout 除 `?? .agents/worktrees/.gitignore` 外没有改动（`src/report-tool.js:23-33`）。非 Git 项目没有 HEAD 和工作区状态可校验，`report_task` 直接交付结论。
- `report_task.images` 可选，是 worker 当前目录下的本地图片路径；插件保存附件后把它们附在结论文本之后发给 Router（`src/report-tool.js:11-17`、`src/report-tool.js:37-38`）。
- `message_router` 的报告 1–4,000 字符；Worker 在工作结束时发一次，不发过程进度；报告和审查请求都可以携带本地图片。`COMPLETED` 只用于已审查且相关检查通过的实现，需要等待的任务不能报 `COMPLETED`（`src/message-router.js:7-28`、`src/message-images.js`）。
- 不属于本 Task 的 follow-up 不执行，并在最终报告里说明。运行中的 Task 仍然完整时报告 `COMPLETED` 并带上未应用的 follow-up；恢复后的 Task 的 follow-up 不属于本 Task 时报告 `BLOCKED`（`src/worker-prompt.js:63-70`）。

## Review 规则

- Git 项目的 `review_worker_commit` 要求 Task 处于 `running`、已有 Worktree、工作区干净、HEAD 不是基础 commit、基础 commit 是 HEAD 的祖先，且 base..head 有净改动；非 Git 项目只要求 Task 处于 `running` 和项目根存在（`src/review.js:170-189`、`src/review.js:91-166`）。
- Reviewer 是独立子代理，标签 `Independent code review`，工作目录为 Worktree（非 Git 项目为项目根），delivery 为 `caller`，深度 2（`src/review.js:91-141`）。
- Git 项目 Reviewer 收到保存的需求、follow-up 文本、项目 + 全局记忆、base 与 head commit、Worktree 路径；**diff 不放进提示词**，Reviewer 自己读 `base..head` 和改动文件（`src/review.js:59-89`）。非 Git 项目收到需求、follow-up、项目 + 全局记忆和项目根，提示词说明没有 commit/diff，Reviewer 读取当前项目文件和工作区内容。
- `review_worker_commit.images` 可选，按 Worker 当前目录解析成本地图片，附在审查提示词文本之后；附件失败时本次审查不启动（`src/review.js:170-183`、`src/review.js:91-141`）。
- 审查针对已提交的 diff，或非 Git 项目的当前工作区内容；follow-up 只作上下文；只有具体的正确性、回归或缺少测试问题才阻止通过，风格偏好不阻止（`src/review.js:59-89`）。
- Reviewer 用 `submit_review` 记录裁决：内容「通过」是通过，其他内容记为审查意见。只有已认领的 Reviewer 能调用它，且一个审查只能提交一次（`src/review.js:17-39`）。Reviewer 可以用 `knowledge_query` 和 `knowledge_get` 查询全局知识，但不能写入。
- 工具拿到裁决后，还要确认 Reviewer 实际读过改动（Git 项目为 diff 或改动文件，非 Git 项目为项目文件）、Git 项目 Worker HEAD 没有移动，才写入 `review.head`、`review.reviewerSessionId` 和 `review.approved`；非 Git 项目写入工作区标识 `workspace`（`src/review.js:151-166`、`src/review.js:182-184`）。
- 面板的 `review` 动作对 `unreviewed` 的 Git Task 运行同一审查，要求 Worker Session 仍活着；通过写 `awaiting-merge`，有意见写 `review-required`。非 Git Task 没有分支，面板不提供该动作（`src/git-actions.js:403-425`）。
- 通过的审查属于它的 commit。同一 Project 的另一个 Task 当前 HEAD 就是该 commit 时，面板读取可以采纳这条审查（`src/git-actions.js:259-276`、`src/git-actions.js:293-305`）。
- 审查没有通过不直接改 Task 状态；Worker 修完再提交（非 Git 项目则继续改文件）、再次请求审查。Worker 结束时仍未通过，Task 才落到 `review-required`；非 Git 项目审查通过后结束时落到 `completed`（`index.js:358-366`）。

## 记忆规则

| 作用域 | 内容 | 写入者 | 读者 |
| --- | --- | --- | --- |
| 全局 | `userProfile`、共享 skill | memory 角色 | Router、Worker、Reviewer、面板（可删除） |
| 项目 | `responsibilities`、`positioning`、项目 skill | memory 角色 | Worker、Reviewer、面板（可删除） |
| 全局知识库 | 可复用、广泛适用的知识 | memory 角色（`knowledge_write`） | Worker、Reviewer、memory 角色（`knowledge_query` / `knowledge_get`）、面板（可删除） |

- 全局记忆在 `~/.dsh/superagent-lite/memory/global.json`；项目记忆在 `~/.dsh/superagent-lite/memory/projects/<sha256(项目根)>.json`；全局知识库在 `~/.dsh/superagent-lite/memory/knowledge.json`；原始归档在 `~/.dsh/superagent-lite/task/archive/`（`src/memory-store.js`、`src/memory.js`）。
- 不同项目的项目记忆和项目 skill 互相不可见；全局记忆、全局 skill 和知识库所有项目共享（`src/memory-store.js`）。
- 全局 skill 写在 `~/.agents/skills/<skill名>/SKILL.md`，项目 skill 写在项目 checkout 的 `.dsh/skills/<skill名>/SKILL.md`，每个 skill 一个目录；项目 skill 目录会追加到 `.git/info/exclude`。项目 skill 由 Worker 作用域的 provider 读取，因此不会弄脏 report 和 merge 要求的干净 checkout。
- memory 写入的 skill 在 frontmatter 带 `author: memory`，不同内容用不同名字；写入的 skill 名与已有非 memory 作者 skill 冲突时拒绝写入，不静默覆盖；同一次更新内重复名字也拒绝。既有的固定名字 `superagent-shared-memory` / `superagent-project-memory` 在没有 author 时仍可读取和更新，写入时补上 author。
- 项目 skill 同时最多 10 个：达到上限后 memory 只能复用已有 memory 管理的项目 skill 名字更新，不能新建；写入路径拒绝并返回明确的超限错误，整次提取在写字段和 skill 前失败，不产生半写入。skill 只放可复用的固定流程或方法步骤，知识、事实、经验、结论和观察写全局知识库（`src/memory-store.js`、`src/memory.js`）。
- 每个文本字段最多 4,000 字符；skill description 最多 500 字符；项目 skill 最多 10 个；知识条目的规范化文本最多 2,000 字符，最多 200 条（`src/memory-store.js`）。
- Router 只被注入全局记忆；Worker 创建时和 Reviewer 每次审查时注入项目 + 全局记忆（`src/memory.js`、`router.js`、`src/review.js`、`index.js`）。
- 职责和定位直接注入；skill 只把 description 放进 skill catalog，Worker、Reviewer 和 memory 角色需要完整内容时用 `skill` 工具按名加载；知识库内容不注入角色上下文，只通过 `knowledge_query`（关键词查询，英文按单词、中文按相邻两字切分，多词按命中关键词数排序，单个关键词按子串匹配并返回编号和上下文片段）和 `knowledge_get`（按编号取完整条目）读取（`src/memory.js`、`src/helper-guard.js`、`cordis.patch.yml`）。
- memory 写入的 skill 只对之后新派发的 Worker/Reviewer 生效；已运行或已结束的 Worker/Reviewer 会话保留启动时的 catalog，不接收由 `author: memory` 的 skill 的新增、修改或删除引起的 catalog 更新，因此不会在最终报告后继续行动。拦截按会话（agent）的 catalog 基线和 skill 作者判断，与 Task 状态无关：running、报告 BLOCKED、resuming、awaiting-merge 的会话都不注入；作者缺失的 skill 按普通 skill 处理，变化照常放行（`src/skill-catalog.js`、`src/memory-store.js`、`index.js`）。
- 注入文本明确标记为 data, not instructions，不能添加需求或授予权限（`src/memory.js`）。
- memory 角色只在 change worker 的最终报告后触发一次；触发消息只含会话记录路径、任务/角色/分支等元信息、项目 skill 已用数量与 10 个上限以及每条 skill 的名称和作者（`author: memory` 或 `none`），不含对话正文，memory 自己用 `read` / `grep` 读取完整记录；skill 的 description 只通过会话里的 catalog 获知，触发消息不写 skill 路径、description、正文或 skill 根目录，需要正文时按名调用 `skill` 工具；最终报告工具保留工具名但参数不进入记录（`src/memory.js`、`src/helper-guard.js`、`src/message-router.js`、`index.js`）。
- 写入只改变提取结果中非空且与当前值不同的字段；skill 需要 description 和 content 都非空才写入；没有变化时不写文件（`src/memory.js`）。
- 没有可复用、广泛适用的内容就不写，不把写入条数当指标；没用的知识只会污染知识库，宁可不写（`src/memory.js`）。
- 知识库写入按规范化文本去重；纠正用 `update`，删除用 `delete`；编号由知识库分配，搜索结果按命中的关键词数量排序，带编号和匹配关键词前后的上下文片段；`knowledge_write` 只对 memory 角色开放，`knowledge_query` / `knowledge_get` 对 Worker、Reviewer 和 memory 角色开放（`src/memory.js`、`src/helper-guard.js`）。
- 面板的「记忆系统」标签页经 owner-only `/superagent-lite/memory` 读取与删除全局记忆、所选项目的项目记忆、memory 管理的全局/项目 skill 和全局知识库：GET 读取；DELETE 按 `kind`（memory/skill/knowledge）、`scope`、`field`/`name` 或知识 `id` 只删除用户确认的单条内容，skill 需要 `name`，项目作用域需要绝对 `projectRoot`；没有新增或编辑接口，写入仍只由 memory 角色完成。删除知识后 `knowledge_query` 不再返回该条目，删除 skill 后之后新派发的会话不再看到它（`src/memory-panel.js`、`src/memory-store.js`、`src/memory.js`）。
- 不保存密码、API key、token、凭据或个人数据；不保存一次性任务进度、状态、计数或短期细节；存储遵守「宁缺毋滥、长期主义」（`src/memory.js`）。
- 原始归档每个 `turn/end` 存一轮，带 Session 序号和轮内 `reference` 编号；memory 触发时另写一份 `task/archive/sessions/<sha256(Session ID)>.md` 完整会话记录并把路径交给 memory；两者都只由 Host 写入，Git 与非 Git 项目走同一位置，其他模型工具没有专用读取入口（`src/memory.js`、`src/memory-store.js`）。

### 审查限制

Reviewer 可以查看任意文件、运行命令和测试；只有两条限制：不能使用写改文件的工具，不能创建或改变 git 分支、历史或仓库状态。以下规则由 `src/helper-guard.js` 和 `src/review-scope.js` 执行。

| 项目 | 放行 | 拒绝 |
| --- | --- | --- |
| 工具 | 除写改工具外的全部继承工具，包括 `submit_review`、`read`、`read_image`、`glob`、`grep`、`bash`、`pwsh`、网络与 job 工具（`src/helper-guard.js:119-131`） | `write`、`edit`、`apply_patch`、`str_replace_editor`（`src/helper-guard.js:26`） |
| Git 子命令 | 读取与检查类命令，如 `diff`、`show`、`log`、`status`、`blame` | `init`、`commit`、`merge`、`rebase`、`cherry-pick`、`revert`、`reset`、`checkout`、`switch`、`branch`、`tag`、`stash`、`push`、`fetch`、`pull`、`am`、`update-ref`、`symbolic-ref`、`worktree`、`filter-branch`、`replace`、`commit-tree`（`src/review-scope.js:15-19`、`src/review-scope.js:123-130`） |
| 命令形态 | 任意 shell 命令，包括管道、重定向、引号、后台运行、任意 workdir 和沙箱参数；`sh -c`、`bash -lc`、`pwsh -Command`、`env`、`sudo`、`xargs` 等包装中的命令同样检查 | 包装或分段后出现的被禁 git 子命令 |
| 路径 | Worktree（非 Git 项目为项目根）内外均可，绝对路径、符号链接和 `.git` 不再额外拦截 | 由写改工具完成的文件写入 |
| 证据 | 必须实际读过改动：Git 项目为一次 `git diff base..head`、带 patch 的 `git log base..head`、`git show <head>`，或对改动文件的 `read`、`read_image`、`grep` 调用；非 Git 项目为对项目根内任意文件的 `read`、`read_image`、`grep`（`src/review-scope.js:260-281`） | 没有证据的裁决被拒绝：Git 项目为 `The reviewer did not inspect the committed change; read the base..head diff or a changed file before deciding`，非 Git 项目为 `The reviewer did not inspect the project files; read a file in the project folder before deciding`（`src/review.js:120`） |

- 命令检查会跳过 git 的全局选项（如 `-c`、`-C`、`--git-dir`、`--work-tree`）再取子命令，所以 `git -C <path> commit` 同样被拒。
- 审查结束后仍会复核 Worktree 的分支、干净工作区和 HEAD；HEAD 变动时审查失败并需重跑（`src/review.js:122`、`src/review.js:46-56`）。

## Git 操作规则

合并只在用户明确授权后执行：直接指示或面板任务行的合并操作。worker 默认不推送、不合并；只有任务记录里的 `land` 授权才允许推送、开 PR 或合并 reviewed commit。直接指示的合并请求走 `mode=merge`：默认派发新 merge worker，已有运行中的 merge worker 时把目标追加给它；change worker 的 `land` 授权只覆盖推送和 PR。未授权时 Router 和 Worker 都不合并，Worker 停在审查过的 commit（`cordis.patch.yml:31-32`、`src/worker-prompt.js:64-107`、`src/landing.js:63-71`）。

### 合并与发送 PR 的共同前提

| 条件 | 说明 |
| --- | --- |
| 状态 | Task 已结束 Worker 工作（`awaiting-merge` 或 `awaiting-ci`）（`src/delivery.js:7-13`） |
| 审查 | `review.approved === true`，且 worker 分支当前 HEAD 等于 `review.head`（`src/delivery.js:7-13`） |
| 文件策略 | 动作执行时解析出的 Session 文件策略必须是 `danger-full-access`（`src/git-actions.js:112-116`） |
| 任务模式 | report 任务没有 Git 操作（`src/git-actions.js:570`） |
| Task 记录 | 面板 Git 动作端点只接受 16 位任务 ID 和 `merge`、`publish`、`review`、`delete-branch`；分支 / worktree 标签页另有 `GET`/`DELETE /superagent-lite/branches`（`kind=worktree|branch`）；停止任务走 `/superagent-lite/tasks` 的 `POST`（`action=stop`），任务删除走同一路径的 `DELETE`（`src/board.js:23-120`、`src/board.js:175-234`、`src/branches-panel.js`） |

合并与发送 PR 共用 `deliverableHead`：状态、Worktree、审查和 HEAD 按同一套判定；执行前再用 `assertStillDeliverable` 复核状态与 Review。发送 PR 只额外要求 `gh auth status --hostname github.com` 成功，且所选 remote 指向 GitHub 仓库；写权限由 push 本身验证（`src/delivery.js:7-19`、`src/git-actions.js:429-441`）。

### 本地合并

合并始终是本地合并，GitHub 项目也一样；插件不再通过 `gh pr merge` 合并 PR。

1. 由用户直接指示后 router 派发的 `mode=merge` 任务（运行中的 merge worker 会收到追加目标）、面板任务行的合并动作触发。merge worker 先用 `merge_branch` 把目标分支合入自己的 worktree 分支、审查合并结果，再按本流程合入 base branch；面板动作通过 Task 的 Router Session 解析文件策略（`src/merge-tool.js:13-64`、`src/git-actions.js:112-116`）。
2. Task 必须已结束 Worker 工作，有 worker 分支和 Worktree，`review.approved === true`，且当前 HEAD 等于 `review.head`（`src/delivery.js:7-13`）。
3. 目标分支必须是合法的本地分支名，且不能是 worker 分支本身（`src/merge.js:35-38`）。
4. 项目 checkout 必须干净（除 `?? .agents/worktrees/.gitignore` 外），并且检出一个分支（`src/git-actions.js:203-211`、`src/merge.js:46-48`）。
5. 用 `git merge-tree --write-tree refs/heads/<target> <head>` 做冲突预检；冲突时报 `Merge would conflict; the target was not changed`（`src/merge.js:49-53`）。
6. 需要时切到目标分支，确认仍在目标分支且工作区干净，用 `assertStillDeliverable` 复核状态与 Review 后把 Task 标为 `merging`；执行 `git merge --no-ff --log --no-overwrite-ignore -m "Merge branch '<worker branch>'" -m '<task title>' <head>`；`--log` 把分支上的功能性 commit 摘要写进合并提交，然后标为 `merged` 并记录 `mergeTarget`（`src/merge.js:64-83`、`src/delivery.js:16-19`）。
7. 合并执行失败时标为 `delivery-blocked`；最后把 checkout 切回原来的分支，切换失败时在结果里说明（`src/merge.js:78-108`）。

同一 Router Session 和 Project 同时只有一个 merge worker：新的 merge 请求追加给运行中的那个，避免两个 worker 同时把 reviewed commit 合入共享 checkout。面板的合并、Worktree 删除和分支删除按 Project 根串行（`src/merge.js:14-26`）；merge worker 把目标分支合入自己的 worktree，不占共享 checkout（`src/merge-tool.js:13-64`）。

### 发送 PR

发送 PR 与本地合并共用同一套前置校验（`src/delivery.js:7-19`）：

- Task 已结束 Worker 工作（`awaiting-merge` 或 `awaiting-ci`）、有 worker 分支和 Worktree、`review.approved === true`、当前 HEAD 等于 `review.head`、文件策略为 full access。
- 唯一额外条件是 GitHub：`gh auth status --hostname github.com` 必须成功，所选 remote 的 fetch 与 push URL 必须指向同一 GitHub 仓库；写权限由 push 本身验证（`src/git-actions.js:429-441`）。
- 面板先读取 remote 列表，用户选择一个 GitHub remote；没登录 `gh` 时弹窗不能提交（`src/git-actions.js:246-254`、`client.js:980-1011`）。
- 已有精确匹配且打开的 PR 时复用；已有精确匹配且已合并的 PR 时记为 `merged`；已关闭时拒绝（`src/git-actions.js:442-452`）。
- 准备阶段用 `assertStillDeliverable` 复核状态与 Review 后把 Task 标为 `publishing`，把 reviewed HEAD 推送到所选 remote 的 push URL 和 `refs/heads/<worker branch>`，再创建 base 为 `task.baseBranch` 的 PR（`src/git-actions.js:453-459`、`src/github.js:64-99`）。
- PR 打开后 Task 标为 `awaiting-ci`；发送命令失败时标为 `delivery-blocked`。GitHub 写入不自动重试（`src/git-actions.js:471-474`）。

必需检查和分支保护由 GitHub 执行；插件不预先查询检查状态，只同步 PR 状态并展示检查汇总（`src/git-actions.js:18-34`、`src/git-actions.js:151-201`）。

### 审查、删除分支、停止任务与删除任务

- 面板的 `review` 动作对未合并、HEAD 未审查且有提交的 Task 运行一次独立审查；Worker Session 必须还活着。通过写 `awaiting-merge`，有意见写 `review-required`（`src/git-actions.js:403-425`）。
- 面板的 `delete-branch` 适用于仍有 worker 分支的 Task，不要求已合并。运行中（`queued`、`starting`、`running`、`resuming`、`publishing`、`merging`）的 Task 拒绝；Worktree 已登记且干净时先 `git worktree remove`，仍有未提交改动、被其他 Worktree 检出、移除失败或移除后仍存在时拒绝并返回错误；随后 `git branch -D`，记录 `branchDeletedAt` 并清空 `worktree`（`src/merge.js:121-170`）。删除后非失败的 Task 面板显示为已完成，失败 Task 保持失败；Host 响应带回最新行视图，供面板就地更新（`src/git-actions.js:290-295`、`src/git-actions.js:504-523`）。
- 面板的「分支 / worktree」标签页只从任务记录所属的 Git 项目读取 `<项目根>/.agents/worktrees/` 下的 Worktree 和本地 `sl-*` 分支；用户自己的分支、其他 Worktree 和 master 不进入清单，也无法通过该端点删除。`GET /superagent-lite/branches` 返回对象清单；`DELETE` 用 `kind=worktree`（带绝对 `path`）只移除 Worktree 并保留分支，用 `kind=branch` 删除没有 Worktree 检出的 `sl-*` 分支并记录 `branchDeletedAt`、清空 `worktree`。运行中的 Task、脏 Worktree、仍被 Worktree 检出的分支和未知对象都会被拒绝（400/409），两个动作都只允许 owner（`src/branches-panel.js:15-68`、`src/git-actions.js:603-701`、`src/merge.js:175-216`）。
- 面板的「停止」出现在运行中或排队中的 Task 行，向 `/superagent-lite/tasks` 发送 `POST`，body 为 `{"taskId":"<id>","action":"stop"}`。服务端只接受 owner 和 16 位任务 ID，在 Task 锁内复核状态仍为 `queued`、`starting`、`running` 或 `resuming` 后写成 `cancelled`，调用 `ctx.subagents.interrupt` 中断当前 Worker 回合，并立即 `pumpWorkers` 让排队任务启动；已经 `cancelled` 时重复停止返回 200，其他已结束状态返回 `409`。停止保留记录、Session 映射、分支和 Worktree（`src/board.js:23-69`、`src/task-store.js:126-146`、`src/worker-stop.js`、`src/worker-control.js:5-20`）。
- 面板的「删除任务」向 `/superagent-lite/tasks` 发送 `DELETE`，只接受 owner 和 16 位任务 ID。运行中或排队中的 Task 先走同一停止路径，并等待 Worker 离开运行态（10 秒超时后返回 `409`、不删除）；`merging` 或 `publishing` 中的 Task 直接拒绝；其余 Task 删除记录和 worker 会话映射，分支和 Worktree 保留（`src/board.js:70-120`、`src/worker-control.js:22-42`、`src/task-store.js:107-124`）。
- 读取面板时会采纳同一 Project 的另一个 Task 为同一 commit 记录的通过审查，把 reviewed HEAD 写回本 Task（`src/git-actions.js:259-276`、`src/git-actions.js:293-305`）。

### 并发与幂等

- 面板的 merge、publish、review 和 delete-branch 按 Task ID 串行；同一 Task 的重复动作不会并行执行（`src/git-actions.js:87-96`、`src/git-actions.js:564-579`）。
- 删除 Task 与同一 Task 的状态写入在 `src/task-store.js` 中按记录串行，先停止、等待再删；第二次删除返回未找到。停止与启动队列也共用同一 Task 锁，停止写入 `cancelled` 后队列不会再把该 Task 改为 `starting`（`src/task-store.js:95-146`）。
- 面板一次 Git 动作的 HTTP 超时为 15 分钟，请求体上限 4 KB（`src/board.js:209`、`src/board.js:228`）。

## 版本

Task 在创建和审查时固定自己的条件：保存的需求、父 Session、Team、Project、基础 commit 和 reviewed HEAD。改提示词或规则不会重写运行中的 Task；之后的回合和新派发使用新文本（`src/dispatch.js:70-88`、`src/review.js:58-73`、`src/continue.js:83-190`）。

Git 动作执行时会重新检查 Task 和 checkout；HEAD 移动、分支变化、目标脏或有新提交时停止动作，不使用过期审查（`src/git-actions.js:564-579`、`src/merge.js:24-44`）。

## 不完成时

无法完成的 Task 记录 `failed`、`review-required` 或 `delivery-blocked`；用户主动停止的 Task 记录 `cancelled`，worker 被中断且名额释放。面板显示对应状态，由用户决定下一步（`index.js:330-376`、`src/worker-stop.js`）。失联的 `starting`、`running` 或 `resuming` 不需要人工清理：超过 2 分钟没有活着的 Worker Session 后，插件启动和下一次 `pumpWorkers` 会读 Review、分支与 Worktree HEAD 后落为 `awaiting-merge` 或 `failed`，并释放并发名额（`src/launch-queue.js:54-120`、`index.js:390-394`）。

无法继续的 Worker 报告 `BLOCKED`：具体阻塞、已经尝试的内容、需要人提供的一个决定或资源。工作未完成但可继续的报告 `INCOMPLETE` 并说明剩下什么（`src/worker-prompt.js:61-73`）。
