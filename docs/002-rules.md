# 002 规则与权限

这份文档决定谁能发起工作、每个角色能碰什么、审查与 Git 操作各需要什么条件。它建立在 [001 领域模型](001-domain.md) 之上。

## 两条路径

新工作与已有工作走不同入口，互不接管。

### 新工作

用户输入先得到一次 `dispatch_worker` 调用。这个调用在 Router 回答前记录本回合的派发决定。

- `mode` 必填，取值 `change`、`report`、`answer` 或 `merge`（`src/validation.js:1-47`）。
- `mode=answer` 不派 worker：Router 直接回答，不建 Worktree、不建 Task、不写 Task 记录（`src/validation.js:6`、`src/dispatch.js:47`）。
- `mode=change`、`mode=report` 或 `mode=merge` 创建一个 Task 和一个 Worker Session。`title` 1–120 字符，`task` 1–20,000 字符，`teamId` 匹配 `[a-zA-Z0-9][a-zA-Z0-9._-]*` 且最多 64 字符（`src/validation.js:21-53`）。
- `mode=change` 和 `mode=merge` 还要求 `worktreeName`：1–4 个英文小写 kebab-case 短词，最多 32 字符，如 `fix-plan-color`；中文标题要翻译成英文，不能用中文、拼音或通用名。它决定新 Task 的 Worktree 和 worker 分支名（`src/validation.js:9-16`、`src/worktree-tool.js:42-46`）。
- Task ID 是 `[agent.id, callId]` 的 SHA-256 前 16 位十六进制（`src/dispatch.js:50`）。
- 同一对 `agent.id` 与 `callId` 再次派发时：已有 Task 若不在 `starting` 或 `failed`，直接返回该 Task；处于这两个状态则报 `Dispatch <id> is already being established; inspect the task board before retrying`（`src/dispatch.js:51-58`）。
- Task 属于另一个 Router Session 时拒绝：`Task id is already owned by another Session`（`src/dispatch.js:53`）。
- 派发前读取项目根、基础 commit、基础分支和工作区状态；除 `?? .agents/worktrees/.gitignore` 外有未提交改动就拒绝（`src/dispatch.js:82-88`）。
- `mode=merge` 还要求 `land=true` 和非空 `branches`；每项是分支名或 16 位 Task ID，最多 20 项。Task ID 会按本 Router Session 和 Project 解析成 worker 分支，目标分支必须存在且不能是 base branch（`src/validation.js:5-48`、`src/dispatch.js:13-43`）。
- 首个 Task 固定 Team 与 Project 的一对一关系；之后改配任一侧都报 `The project and team must retain their existing one-to-one assignment`（`src/task-store.js:70-75`）。
- 新 worker 受面板「设置」的并发上限约束：名额内启动，超出写为 `queued` 并按创建顺序等待；review 是 worker 的子代理，不占额外名额（`src/worker-settings.js`、`src/launch-queue.js`）。

### 已有工作

`continue_worker` 把追加要求送给已经存在且未发布的 Task。`dispatch_worker` 的 `mode=merge` 在已有运行中的 merge worker 时，把新请求追加到同一个 Task。

- 调用者必须是该 Task 的 Router Session；`taskId` 必须是 16 位小写十六进制；要求 1–20,000 字符（`src/continue.js:133-139`）。
- 只有同一个 Deliverable 和目标的补充或修正才继续；不同业务目标即使看起来相关也新建 Task（`src/continue.js:118-126`）。例如再改一次提示词措辞可以继续，改变派发消息的结构是新任务。合并请求也是新任务：即使点名已有任务，也走 `dispatch_worker mode=merge`，不续派该任务；没有运行中的 merge worker 时新建 worker，已有则追加。
- Worker agent 正在运行时，发送一条短的要求更新，让 Worker 判断是否属于本 Task；不属于就不执行，并在最终报告里带上未应用的 follow-up（`src/continue.js:143-159`）。
- Worker 空闲时，发送精简续派发消息：任务标识（Task ID、分支、Worktree、base）、不可变规则，以及标明为本次唯一权威指令的 Follow-up；不再整段重发原始需求。只有检测到 Worker 会话上下文被压缩（compact checkpoint）时才回放原需求。Task 处于 `awaiting-merge`、`review-required` 或 `failed` 且已有 Worktree 时，先标为 `resuming`；旧 Review 记录保留，批准是否仍有效只看 `review.head` 是否等于当前 HEAD（`src/continue.js:10-28`、`src/continue.js:35-71`、`src/continue.js:161-176`）。
- follow-up 先写入 `task.followUps` 再发送；发送失败删除该条。发送失败到已结束的 Task 时标为 `failed`；发送失败到运行中的 Task 保持 `running`（`src/continue.js:99-116`、`src/continue.js:174-189`）。
- `land=true` 只能来自用户本轮明确授权，写入 `task.land`、`task.landAuthorizedAt` 和 `task.landAuthorizedVia`；在 `continue_worker` 里它只授权推送和 PR，不授权合并；发送失败时回滚这次新增的授权（`src/continue.js:73-93`、`src/continue.js:129-189`）。
- 已发布的 Task 不继续；发布后的下一个输入是新工作。

### 不交叉

- `dispatch_worker` 不恢复已有 Task；`mode=merge` 是唯一会把新请求追加给运行中 Worker 的派发路径。
- `continue_worker` 不创建 Task 或 Worktree。
- 文件重叠不是合并工作的理由；新目标有自己的 Worker、Worktree 和分支，合并路径会拒绝冲突（`src/validation.js:1-16`、`src/git-actions.js:199-208`）。

## 授权级别

| 级别 | 授予方式 | 允许什么 | 默认 |
| --- | --- | --- | --- |
| 观察 | 作为 Router Session | 读取输入，调用 `dispatch_worker` 和 `continue_worker` | 每个输入 |
| 委派 | `dispatch_worker` 且 `mode=change`、`mode=report` 或 `mode=merge` | 创建一个 Task 和一个 Worker Session，或把 merge 请求追加给运行中的 merge worker | 否；需要决定 |
| 编辑 | change 任务中调用 `create_worktree` | 在分配的 Worktree 工作；未进入前其他工具被拦 | 否；Worker 必须先进入 Worktree |
| 审查 | 提交后调用 `review_worker_commit` | 读取已提交 diff 并启动一个独立 reviewer；reviewer 不能写改文件或改变分支 | 否；需要干净的已提交 Worktree |
| 报告 | report 任务中调用 `report_task` | 带着结论结束 Task | 否；仅 report 任务 |
| 落地 | change/report 派发或续派发时携带 `land=true` | change worker 可推送指派分支、开 PR；只限指派分支与 reviewed HEAD | 否；未携带时不推送、不开 PR、不合并 |
| 合并 | 用户直接指示时由 router 派发 `mode=merge`：没有运行中的 merge worker 就新派发，已有则追加；面板任务行的合并操作 | merge worker 先把 `mergeBranches` 合入自己的 worktree 分支并审查合并结果，再把 reviewed commit 本地合入 base branch；面板直接把 reviewed HEAD 合入所选分支，不需要 `gh` | 否；需要明确授权、审查通过的 HEAD、干净的项目 checkout 和 full access |
| 发送 PR | 用户在面板点击「提交 PR」 | 推送 reviewed HEAD 到所选 GitHub remote 并打开或复用该 HEAD 的 Pull request | 否；需要任务已结束 Worker 工作、审查通过的 HEAD、`gh` 账号、GitHub remote 和 full access |
| 删除分支 | 用户在已完成的 Task 行点击「删除分支」 | 移除已合并的 worker Worktree 并删除分支 | 否；需要明确点击和已合并的 HEAD |
| 取消排队 | 安装 owner 在「排队中」的 Task 行点击「取消」 | 原子地只移除仍为 `queued` 的 Task 记录和会话映射，之后不会再被派发；任务已离开队列时拒绝 | 否；需要明确点击，运行中或已交付的 Task 没有入口 |
| 删除任务 | 安装 owner 在面板点击「删除任务」或批量「删除所选」 | 移除所选 Task 记录和各自的 worker 会话映射，保留 worker 分支和 Worktree | 否；需要明确点击，运行中或合并/发布中的 Task 除外 |
| 修改设置 | owner 在面板「设置」保存 | 保存 worker 模型和并发上限，只影响之后启动的 worker | 否；需要 owner 明确点击 |
| 提取记忆 | change worker 的最终 `message_router` 报告送达后自动触发一次 | memory 角色读取 Worker 原始会话，写回全局/项目记忆和 skill；知识库通过 `knowledge_write` 写入 | 否；每个 Worker Session 最多一次，失败不阻塞报告 |

## 准入

| 模式 | 选择方式 | Worktree | 修改项目文件 | 提交 | 请求审查 | 结束方式 |
| --- | --- | --- | --- | --- | --- | --- |
| `change` | `dispatch_worker` 传 `mode=change` | 必须 | 可以，限定在 Worktree | 可以 | 可以，直到通过 | `review_worker_commit`，然后 Worker 报告 |
| `report` | `dispatch_worker` 传 `mode=report` | 无 | 不修改 | 不提交 | 不审查 | `report_task` |
| `merge` | `dispatch_worker` 传 `mode=merge` | 必须 | 只在解决合并冲突时修改 | 合并提交 | 可以，直到通过 | `review_worker_commit`，然后把 reviewed commit 合入 base branch |
| `answer` | `dispatch_worker` 传 `mode=answer` | 无 | 不修改 | 不提交 | 不审查 | Router 直接回答，不建 Task |

## Router 规则

Router Session 运行 `superagent-lite` 预设。派发守卫只对该预设生效（`src/turn-guard.js:89-93`）。

- 每个用户输入需要当前回合内一次成功的 `dispatch_worker` 或 `continue_worker` 结果。失败的工具结果不算；`mode=answer` 的成功结果算（`src/turn-guard.js:73-108`）。
- 完成回合没有决定时，等 agent 空闲后插入提醒。提醒是 `source.kind = superagent-lite-reminder` 的用户角色消息，不是新输入（`src/turn-guard.js:7`、`src/turn-guard.js:33-51`）。
- 每个输入最多提醒 2 次；新的用户输入重置预算（`src/turn-guard.js:3-7`、`src/turn-guard.js:56-70`）。
- Router 从输入本身判断，不检查仓库、不运行项目命令；项目工作交给 Worker。
- Router 只在派发、续派或用户要求加载 skill 时调用别的工具；全局记忆由运行时上下文注入，没有模型侧记忆工具。
- 派发参数在碰文件前完成校验：`mode` 必填，`title` 1–120 字符，`task` 1–20,000 字符，`teamId` 1–64 字符；change 和 merge 还要求英文 `worktreeName`（`src/dispatch.js:44-50`、`src/validation.js:1-53`）。
- 合并只在用户明确授权后执行：直接指示或面板的合并操作。直接指示的合并请求默认派发 `mode=merge` 的新 worker，不续派分支所属的 Task（`cordis.patch.yml:31-32`、`src/dispatch.js:25-48`）。

## Worker 规则

- change worker 必须先调用一次 `create_worktree`；除 `create_worktree` 外，工作目录不在分配的 Worktree 时所有工具被拦（`index.js:57-66`）。
- `create_worktree` 向 worktree 服务请求名字 `sl-<worktreeName>-<taskId 前 12 位>` 的 Worktree，目录和分支同名，例如 `sl-fix-plan-color-0123456789ab`（`src/worktree-tool.js:42-46`）。旧 Task 没有 `worktreeName` 时沿用原命名 `sl-<team slug>-<taskId>`。实际分支名取服务返回值，写入 `task.worktree.branch`（`src/worktree-tool.js:48-55`）。
- 已存在 Worktree 时再次调用只重新进入，不创建第二个（`src/worktree-tool.js:27-37`）。
- Worker 的 subagent 结束时冻结，之后不能用任何工具，包括消息工具（`index.js:121`、`index.js:98`）。
- Worker 的 `bash`/`pwsh` 在工具守卫里检查落地命令：未授权时 `git push`、`gh pr create`、`gh pr merge`、`git merge` 被拒；change worker 授权后仍只允许指派分支、reviewed HEAD 和本任务记录的 PR。`git merge` 只对 `mode=merge` 的 Task 开放，且只允许把本任务的 reviewed commit 从项目 checkout 合入 base branch；merge worker 用 `merge_branch` 把目标分支合入自己的 worktree 分支，不经过 shell 合并（`index.js:65-83`、`src/landing.js:374-388`、`src/merge-tool.js:13-64`）。
- `review_worker_commit` 和 `message_router` 只在 Worker 活跃且位于 Worktree 时可用；`merge_branch` 只对活跃的 merge 任务开放，目标必须来自 `task.mergeBranches`；`report_task` 只对活跃的 report 任务可用（`index.js:65-98`）。
- report worker 在项目 checkout 中只能使用 `read`、`glob`、`grep`、`read_image`、`bash`、`todo_write`、`knowledge_query`、`skill`，并以 `report_task` 结束；其他工具被拒绝（`index.js:67-73`）。
- `report_task` 要求 HEAD 仍等于基础 commit，且 checkout 除 `?? .agents/worktrees/.gitignore` 外没有改动（`src/report-tool.js:21-31`）。
- `message_router` 的报告 1–4,000 字符；Worker 在工作结束时发一次，不发过程进度。`COMPLETED` 只用于已审查且相关检查通过的实现，需要等待的任务不能报 `COMPLETED`（`src/message-router.js:6-25`）。
- 不属于本 Task 的 follow-up 不执行，并在最终报告里说明。运行中的 Task 仍然完整时报告 `COMPLETED` 并带上未应用的 follow-up；恢复后的 Task 的 follow-up 不属于本 Task 时报告 `BLOCKED`（`src/worker-prompt.js:61-68`）。

## Review 规则

- `review_worker_commit` 要求 Task 处于 `running`、已有 Worktree、工作区干净、HEAD 不是基础 commit、基础 commit 是 HEAD 的祖先，且 base..head 有净改动（`src/review.js:71-78`）。
- Reviewer 是独立子代理，标签 `Independent code review`，工作目录为 Worktree，delivery 为 `caller`，深度 2（`src/review.js:61-76`）。
- Reviewer 收到保存的需求、follow-up 文本、项目 + 全局记忆、base 与 head commit、Worktree 路径；**diff 不放进提示词**，Reviewer 自己读 `base..head` 和改动文件（`src/review.js:56-71`）。
- 审查针对已提交的 diff；follow-up 只作上下文；只有具体的正确性、回归或缺少测试问题才阻止通过，风格偏好不阻止（`src/review.js:24-29`）。
- Reviewer 用 `submit_review` 记录裁决：内容「通过」是通过，其他内容记为审查意见。只有已认领的 Reviewer 能调用它，且一个审查只能提交一次（`src/review.js:6-34`、`src/review.js:125-140`）。Reviewer 可以用 `knowledge_query` 查询项目知识，但不能写入。
- 工具拿到裁决后，还要确认 Reviewer 实际读过改动、Worker HEAD 没有移动，才写入 `review.head`、`review.reviewerSessionId` 和 `review.approved`（`src/review.js:109-122`）。
- 面板的 `review` 动作对 `unreviewed` 的 Task 运行同一审查，要求 Worker Session 仍活着；通过写 `awaiting-merge`，有意见写 `review-required`（`src/git-actions.js:386-407`）。
- 通过的审查属于它的 commit。同一 Project 的另一个 Task 当前 HEAD 就是该 commit 时，面板读取可以采纳这条审查（`src/git-actions.js:254-269`）。
- 审查没有通过不直接改 Task 状态；Worker 修完再提交、再次请求审查。Worker 结束时仍未通过，Task 才落到 `review-required`（`index.js:136-139`）。

## 记忆规则

| 作用域 | 内容 | 写入者 | 读者 |
| --- | --- | --- | --- |
| 全局 | `userProfile`、共享 skill | memory 角色 | Router、Worker、Reviewer、面板（只读） |
| 项目 | `responsibilities`、`positioning`、项目 skill、知识库 | memory 角色 | Worker、Reviewer、面板（只读） |

- 全局记忆在 `~/.dsh/superagent-lite/memory/global.json`；项目记忆在 `~/.dsh/superagent-lite/memory/projects/<sha256(项目根)>.json`；知识库在 `~/.dsh/superagent-lite/memory/knowledge/<sha256(项目根)>.json`；原始归档在 `~/.dsh/superagent-lite/task/archive/`（`src/memory-store.js`、`src/memory.js`）。
- 不同项目的项目记忆、项目 skill 和知识库互相不可见；全局记忆和全局 skill 所有项目共享（`src/memory-store.js`）。
- 项目 skill 写在项目 checkout 的 `.dsh/skills/`，并追加到 `.git/info/exclude`；它由 Worker 作用域的 provider 读取，因此不会弄脏 report 和 merge 要求的干净 checkout。
- 每个文本字段最多 4,000 字符；skill description 最多 500 字符；知识条目的规范化文本最多 2,000 字符，最多 200 条（`src/memory-store.js`）。
- Router 只被注入全局记忆；Worker 创建时和 Reviewer 每次审查时注入项目 + 全局记忆（`src/memory.js`、`router.js`、`src/review.js`、`index.js`）。
- 职责和定位直接注入；skill 只把 description 放进 skill catalog，完整内容按需用 `skill` 工具加载；知识库不整体注入，只通过 `knowledge_query` 查询（`src/memory.js`、`cordis.patch.yml`）。
- memory 写入的 skill 只对之后新派发的 Worker/Reviewer 生效；已运行或已结束的 Worker/Reviewer 会话保留启动时的 catalog，不接收只由 memory skill 变化引起的 catalog 更新，因此不会在最终报告后继续行动（`src/skill-catalog.js`、`index.js`）。
- 注入文本明确标记为 data, not instructions，不能添加需求或授予权限（`src/memory.js`）。
- memory 角色只在 change worker 的最终报告后触发一次，读取完整原始会话；最终报告工具的参数不进入 transcript（`src/memory.js`、`src/message-router.js`、`index.js`）。
- 写入只改变提取结果中非空且与当前值不同的字段；skill 需要 description 和 content 都非空才写入；没有变化时不写文件（`src/memory.js`）。
- 知识库写入按规范化文本去重；纠正用 `update`，删除用 `delete`；`knowledge_write` 只对 memory 角色开放，`knowledge_query` 对 Worker、Reviewer 和 memory 角色开放（`src/memory.js`、`src/helper-guard.js`）。
- 面板的「记忆系统」标签页经 owner-only `GET /superagent-lite/memory` 只读读取全局记忆、所选项目的项目记忆和知识库；没有写入接口，记忆仍只由 memory 角色维护（`src/memory-panel.js`）。
- 不保存密码、API key、token、凭据或个人数据；不保存一次性任务进度、状态、计数或短期细节；存储遵守「宁缺毋滥、长期主义」（`src/memory.js`）。
- 原始归档每个 `turn/end` 存一轮，带 Session 序号和轮内 `reference` 编号；只由 Host 写入，模型工具没有读取入口（`src/memory.js`、`src/memory-store.js`）。

### 审查限制

Reviewer 可以查看任意文件、运行命令和测试；只有两条限制：不能使用写改文件的工具，不能运行会改变 git 分支或历史的命令。以下规则由 `src/helper-guard.js` 和 `src/review-scope.js` 执行。

| 项目 | 放行 | 拒绝 |
| --- | --- | --- |
| 工具 | 除写改工具外的全部继承工具，包括 `submit_review`、`read`、`read_image`、`glob`、`grep`、`bash`、`pwsh`、网络与 job 工具（`src/helper-guard.js:105-117`） | `write`、`edit`、`apply_patch`、`str_replace_editor`（`src/helper-guard.js:23`） |
| Git 子命令 | 读取与检查类命令，如 `diff`、`show`、`log`、`status`、`blame` | `commit`、`merge`、`rebase`、`cherry-pick`、`revert`、`reset`、`checkout`、`switch`、`branch`、`tag`、`stash`、`push`、`fetch`、`pull`、`am`、`update-ref`、`symbolic-ref`、`worktree`、`filter-branch`、`replace`、`commit-tree`（`src/review-scope.js:15-19`、`src/review-scope.js:123-130`） |
| 命令形态 | 任意 shell 命令，包括管道、重定向、引号、后台运行、任意 workdir 和沙箱参数；`sh -c`、`bash -lc`、`pwsh -Command`、`env`、`sudo`、`xargs` 等包装中的命令同样检查 | 包装或分段后出现的被禁 git 子命令 |
| 路径 | Worktree 内外均可，绝对路径、符号链接和 `.git` 不再额外拦截 | 由写改工具完成的文件写入 |
| 证据 | 必须实际读过改动：一次 `git diff base..head`、带 patch 的 `git log base..head`、`git show <head>`，或对改动文件的 `read`、`read_image`、`grep` 调用（`src/review-scope.js:260-281`） | 没有证据的裁决被拒绝：`The reviewer did not inspect the committed change; read the base..head diff or a changed file before deciding`（`src/review.js:118`） |

- 命令检查会跳过 git 的全局选项（如 `-c`、`-C`、`--git-dir`、`--work-tree`）再取子命令，所以 `git -C <path> commit` 同样被拒。
- 审查结束后仍会复核 Worktree 的分支、干净工作区和 HEAD；HEAD 变动时审查失败并需重跑（`src/review.js:120`、`src/review.js:44-54`）。

## Git 操作规则

合并只在用户明确授权后执行：直接指示或面板任务行的合并操作。worker 默认不推送、不合并；只有任务记录里的 `land` 授权才允许推送、开 PR 或合并 reviewed commit。直接指示的合并请求走 `mode=merge`：默认派发新 merge worker，已有运行中的 merge worker 时把目标追加给它；change worker 的 `land` 授权只覆盖推送和 PR。未授权时 Router 和 Worker 都不合并，Worker 停在审查过的 commit（`cordis.patch.yml:31-32`、`src/worker-prompt.js:62-103`、`src/landing.js:63-71`）。

### 合并与发送 PR 的共同前提

| 条件 | 说明 |
| --- | --- |
| 状态 | Task 已结束 Worker 工作（`awaiting-merge` 或 `awaiting-ci`）（`src/delivery.js:7-13`） |
| 审查 | `review.approved === true`，且 worker 分支当前 HEAD 等于 `review.head`（`src/delivery.js:7-13`） |
| 文件策略 | 动作执行时解析出的 Session 文件策略必须是 `danger-full-access`（`src/git-actions.js:106-110`） |
| 任务模式 | report 任务没有 Git 操作（`src/git-actions.js:541`） |
| Task 记录 | 面板 Git 动作端点只接受 16 位任务 ID 和 `merge`、`publish`、`review`、`delete-branch`；任务删除和排队取消走 `/superagent-lite/tasks` 的 `DELETE`（`src/board.js:106-162`、`src/board.js:14-55`） |

合并与发送 PR 共用 `deliverableHead`：状态、Worktree、审查和 HEAD 按同一套判定；执行前再用 `assertStillDeliverable` 复核状态与 Review。发送 PR 只额外要求 `gh auth status --hostname github.com` 成功，且所选 remote 指向 GitHub 仓库；写权限由 push 本身验证（`src/delivery.js:7-19`、`src/git-actions.js:427-439`）。

### 本地合并

合并始终是本地合并，GitHub 项目也一样；插件不再通过 `gh pr merge` 合并 PR。

1. 由用户直接指示后 router 派发的 `mode=merge` 任务（运行中的 merge worker 会收到追加目标）、面板任务行的合并动作触发。merge worker 先用 `merge_branch` 把目标分支合入自己的 worktree 分支、审查合并结果，再按本流程合入 base branch；面板动作通过 Task 的 Router Session 解析文件策略（`src/merge-tool.js:13-64`、`src/git-actions.js:106-110`）。
2. Task 必须已结束 Worker 工作，有 worker 分支和 Worktree，`review.approved === true`，且当前 HEAD 等于 `review.head`（`src/delivery.js:7-13`）。
3. 目标分支必须是合法的本地分支名，且不能是 worker 分支本身（`src/merge.js:35-38`）。
4. 项目 checkout 必须干净（除 `?? .agents/worktrees/.gitignore` 外），并且检出一个分支（`src/git-actions.js:201-209`、`src/merge.js:46-48`）。
5. 用 `git merge-tree --write-tree refs/heads/<target> <head>` 做冲突预检；冲突时报 `Merge would conflict; the target was not changed`（`src/merge.js:49-53`）。
6. 需要时切到目标分支，确认仍在目标分支且工作区干净，用 `assertStillDeliverable` 复核状态与 Review 后把 Task 标为 `merging`；执行 `git merge --no-ff --log --no-overwrite-ignore -m "Merge branch '<worker branch>'" -m '<task title>' <head>`；`--log` 把分支上的功能性 commit 摘要写进合并提交，然后标为 `merged` 并记录 `mergeTarget`（`src/merge.js:64-83`、`src/delivery.js:16-19`）。
7. 合并执行失败时标为 `delivery-blocked`；最后把 checkout 切回原来的分支，切换失败时在结果里说明（`src/merge.js:78-108`）。

同一 Router Session 和 Project 同时只有一个 merge worker：新的 merge 请求追加给运行中的那个，避免两个 worker 同时把 reviewed commit 合入共享 checkout。面板的合并和分支删除按 Project 根串行（`src/merge.js:14-26`）；merge worker 把目标分支合入自己的 worktree，不占共享 checkout（`src/merge-tool.js:13-64`）。

### 发送 PR

发送 PR 与本地合并共用同一套前置校验（`src/delivery.js:7-19`）：

- Task 已结束 Worker 工作（`awaiting-merge` 或 `awaiting-ci`）、有 worker 分支和 Worktree、`review.approved === true`、当前 HEAD 等于 `review.head`、文件策略为 full access。
- 唯一额外条件是 GitHub：`gh auth status --hostname github.com` 必须成功，所选 remote 的 fetch 与 push URL 必须指向同一 GitHub 仓库；写权限由 push 本身验证（`src/git-actions.js:427-439`）。
- 面板先读取 remote 列表，用户选择一个 GitHub remote；没登录 `gh` 时弹窗不能提交（`src/git-actions.js:244-252`、`client.js:577-608`）。
- 已有精确匹配且打开的 PR 时复用；已有精确匹配且已合并的 PR 时记为 `merged`；已关闭时拒绝（`src/git-actions.js:440-450`）。
- 准备阶段用 `assertStillDeliverable` 复核状态与 Review 后把 Task 标为 `publishing`，把 reviewed HEAD 推送到所选 remote 的 push URL 和 `refs/heads/<worker branch>`，再创建 base 为 `task.baseBranch` 的 PR（`src/git-actions.js:451-457`、`src/github.js:77-113`）。
- PR 打开后 Task 标为 `awaiting-ci`；发送命令失败时标为 `delivery-blocked`。GitHub 写入不自动重试（`src/git-actions.js:469-472`）。

必需检查和分支保护由 GitHub 执行；插件不预先查询检查状态，只同步 PR 状态并展示检查汇总（`src/git-actions.js:18-32`、`src/git-actions.js:149-199`）。

### 审查、删除分支、取消排队与删除任务

- 面板的 `review` 动作对未合并、HEAD 未审查且有提交的 Task 运行一次独立审查；Worker Session 必须还活着。通过写 `awaiting-merge`，有意见写 `review-required`（`src/git-actions.js:390-412`）。
- 面板的 `delete-branch` 只用于 `merged` 的 Task。Worktree 已登记且干净时先 `git worktree remove`，再 `git branch -D`；随后记录 `branchDeletedAt` 并清空 `worktree`（`src/merge.js:113-142`）。
- 面板的「取消」只出现在「排队中」的 Task 行，向 `/superagent-lite/tasks` 发送 `DELETE`；服务端在 Task 锁内复核状态仍为 `queued` 后原子移除记录和会话映射，已经离开队列时返回 `409`，不启动 Worker（`src/board.js:11-40`、`src/task-store.js:122-144`）。
- 面板的「删除任务」向 `/superagent-lite/tasks` 发送 `DELETE`，只接受 owner 和 16 位任务 ID。Worker Session 还活着的运行中 Task、正在合并或发布的 Task 被拒绝；其余 Task 删除记录和 worker 会话映射，分支和 Worktree 保留（`src/board.js:11-48`、`src/task-store.js:103-121`）。
- 读取面板时会采纳同一 Project 的另一个 Task 为同一 commit 记录的通过审查，把 reviewed HEAD 写回本 Task（`src/git-actions.js:255-299`）。

### 并发与幂等

- 面板的 merge、publish、review 和 delete-branch 按 Task ID 串行；同一 Task 的重复动作不会并行执行（`src/git-actions.js:83-92`、`src/git-actions.js:537-547`）。
- 删除 Task 与同一 Task 的状态写入在 `src/task-store.js` 中按记录串行，先读后删；第二次删除返回未找到（`src/task-store.js:103-121`）。
- 面板一次 Git 动作的 HTTP 超时为 15 分钟，请求体上限 4 KB（`src/board.js:138`、`src/board.js:157`）。

## 版本

Task 在创建和审查时固定自己的条件：保存的需求、父 Session、Team、Project、基础 commit 和 reviewed HEAD。改提示词或规则不会重写运行中的 Task；之后的回合和新派发使用新文本（`src/dispatch.js:69-87`、`src/review.js:56-71`、`src/continue.js:136`）。

Git 动作执行时会重新检查 Task 和 checkout；HEAD 移动、分支变化、目标脏或有新提交时停止动作，不使用过期审查（`src/git-actions.js:560-579`、`src/merge.js:23-43`）。

## 不完成时

无法完成的 Task 记录 `failed`、`review-required` 或 `delivery-blocked`；面板显示对应状态，由用户决定下一步（`index.js:119-151`）。

无法继续的 Worker 报告 `BLOCKED`：具体阻塞、已经尝试的内容、需要人提供的一个决定或资源。工作未完成但可继续的报告 `INCOMPLETE` 并说明剩下什么（`src/worker-prompt.js:61-68`）。
