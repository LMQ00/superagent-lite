# 002 规则与权限

这份文档决定谁能发起工作、每个角色能碰什么、审查与 Git 操作各需要什么条件。它建立在 [001 领域模型](001-domain.md) 之上。

## 两条路径

新工作与已有工作走不同入口，互不接管。

### 新工作

用户输入先得到一次 `dispatch_worker` 调用。这个调用在 Router 回答前记录本回合的派发决定。

- `mode` 必填，取值 `change`、`report`、`answer` 或 `merge`（`src/validation.js:1-47`）。
- `mode=answer` 不派 worker：Router 直接回答，不建 Worktree、不建 Task、不写 Task 记录（`src/validation.js:6`、`src/dispatch.js:47`）。
- `mode=change`、`mode=report` 或 `mode=merge` 创建一个 Task 和一个 Worker Session。`title` 1–120 字符，`task` 1–20,000 字符，`teamId` 匹配 `[a-zA-Z0-9][a-zA-Z0-9._-]*` 且最多 64 字符（`src/validation.js:20-38`）。
- Task ID 是 `[agent.id, callId]` 的 SHA-256 前 16 位十六进制（`src/dispatch.js:50`）。
- 同一对 `agent.id` 与 `callId` 再次派发时：已有 Task 若不在 `starting` 或 `failed`，直接返回该 Task；处于这两个状态则报 `Dispatch <id> is already being established; inspect the task board before retrying`（`src/dispatch.js:51-58`）。
- Task 属于另一个 Router Session 时拒绝：`Task id is already owned by another Session`（`src/dispatch.js:53`）。
- 派发前读取项目根、基础 commit、基础分支和工作区状态；除 `?? .agents/worktrees/.gitignore` 外有未提交改动就拒绝（`src/dispatch.js:82-88`）。
- `mode=merge` 还要求 `land=true` 和非空 `branches`；每项是分支名或 16 位 Task ID，最多 20 项。Task ID 会按本 Router Session 和 Project 解析成 worker 分支，目标分支必须存在且不能是 base branch（`src/validation.js:5-48`、`src/dispatch.js:13-43`）。
- 首个 Task 固定 Team 与 Project 的一对一关系；之后改配任一侧都报 `The project and team must retain their existing one-to-one assignment`（`src/task-store.js:70-75`）。
- 新 worker 受面板「设置」的并发上限约束：名额内启动，超出写为 `queued` 并按创建顺序等待；review 是 worker 的子代理，不占额外名额（`src/worker-settings.js`、`src/launch-queue.js`）。

### 已有工作

`continue_worker` 把追加要求送给已经存在且未发布的 Task。

- 调用者必须是该 Task 的 Router Session；`taskId` 必须是 16 位小写十六进制；要求 1–20,000 字符（`src/continue.js:133-139`）。
- 只有同一个 Deliverable 和目标的补充或修正才继续；不同业务目标即使看起来相关也新建 Task（`src/continue.js:118-126`）。例如再改一次提示词措辞可以继续，改变派发消息的结构是新任务。合并请求也是新任务：即使点名已有任务，也派发 `mode=merge` 的新 worker，不续派该任务。
- Worker agent 正在运行时，发送一条短的要求更新，让 Worker 判断是否属于本 Task；不属于就不执行，并在最终报告里带上未应用的 follow-up（`src/continue.js:143-159`）。
- Worker 空闲时，发送精简续派发消息：任务标识（Task ID、分支、Worktree、base）、不可变规则，以及标明为本次唯一权威指令的 Follow-up；不再整段重发原始需求。只有检测到 Worker 会话上下文被压缩（compact checkpoint）时才回放原需求。Task 处于 `awaiting-merge`、`review-required` 或 `failed` 且已有 Worktree 时，先标为 `resuming`；旧 Review 记录保留，批准是否仍有效只看 `review.head` 是否等于当前 HEAD（`src/continue.js:10-28`、`src/continue.js:35-71`、`src/continue.js:161-176`）。
- follow-up 先写入 `task.followUps` 再发送；发送失败删除该条。发送失败到已结束的 Task 时标为 `failed`；发送失败到运行中的 Task 保持 `running`（`src/continue.js:99-116`、`src/continue.js:174-189`）。
- `land=true` 只能来自用户本轮明确授权，写入 `task.land`、`task.landAuthorizedAt` 和 `task.landAuthorizedVia`；在 `continue_worker` 里它只授权推送和 PR，不授权合并；发送失败时回滚这次新增的授权（`src/continue.js:73-93`、`src/continue.js:129-189`）。
- 已发布的 Task 不继续；发布后的下一个输入是新工作。

### 不交叉

- `dispatch_worker` 不恢复已有 Task，也不给运行中的 Worker 追加要求。
- `continue_worker` 不创建 Task 或 Worktree。
- 文件重叠不是合并工作的理由；新目标有自己的 Worker、Worktree 和分支，合并路径会拒绝冲突（`src/validation.js:1-16`、`src/git-actions.js:199-208`）。

## 授权级别

| 级别 | 授予方式 | 允许什么 | 默认 |
| --- | --- | --- | --- |
| 观察 | 作为 Router Session | 读取输入，调用 `dispatch_worker`、`continue_worker` 和 `superagent_memory` 的 router 分类 | 每个输入 |
| 委派 | `dispatch_worker` 且 `mode=change`、`mode=report` 或 `mode=merge` | 创建一个 Task 和一个 Worker Session | 否；需要决定 |
| 编辑 | change 任务中调用 `create_worktree` | 在分配的 Worktree 工作；未进入前其他工具被拦 | 否；Worker 必须先进入 Worktree |
| 审查 | 提交后调用 `review_worker_commit` | 读取已提交 diff 并启动一个只读 reviewer | 否；需要干净的已提交 Worktree |
| 报告 | report 任务中调用 `report_task` | 带着结论结束 Task | 否；仅 report 任务 |
| 落地 | change/report 派发或续派发时携带 `land=true` | change worker 可推送指派分支、开 PR；只限指派分支与 reviewed HEAD | 否；未携带时不推送、不开 PR、不合并 |
| 合并 | 用户直接指示时由 router 派发 `mode=merge` 的新 worker；面板任务行的合并操作 | merge worker 先把 `mergeBranches` 合入自己的 worktree 分支并审查合并结果，再把 reviewed commit 本地合入 base branch；面板直接把 reviewed HEAD 合入所选分支，不需要 `gh` | 否；需要明确授权、审查通过的 HEAD、干净的项目 checkout 和 full access |
| 发送 PR | 用户在面板点击「提交 PR」 | 推送 reviewed HEAD 到所选 GitHub remote 并打开或复用该 HEAD 的 Pull request | 否；需要任务已结束 Worker 工作、审查通过的 HEAD、`gh` 账号、GitHub remote 和 full access |
| 删除分支 | 用户在已完成的 Task 行点击「删除分支」 | 移除已合并的 worker Worktree 并删除分支 | 否；需要明确点击和已合并的 HEAD |
| 删除任务 | 安装 owner 在面板点击「删除任务」或批量「删除所选」 | 移除所选 Task 记录和各自的 worker 会话映射，保留 worker 分支、Worktree 和记忆归档 | 否；需要明确点击，运行中或合并/发布中的 Task 除外 |
| 编辑记忆 | owner 在面板编辑、逐条删除或批量删除 | 改一条记忆记录，或删除所选的记忆记录 | 否；需要 owner 明确点击 |
| 修改设置 | owner 在面板「设置」保存 | 保存 worker 模型和并发上限，只影响之后启动的 worker | 否；需要 owner 明确点击 |
| 提取记忆 | 最终 `message_router` 报告 | 启动一次记忆对话，读取 Worker 对话并把提炼结果写回四类 | 否；仅 change worker |

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
- 只有用户要求保存或读取记忆、路由需要某条已保存事实、或用户要求加载 skill 时，Router 才调用别的工具。
- 派发参数在碰文件前完成校验：`mode` 必填，`title` 1–120 字符，`task` 1–20,000 字符，`teamId` 1–64 字符（`src/dispatch.js:46`、`src/validation.js:1-16`）。
- 合并只在用户明确授权后执行：直接指示或面板的合并操作。直接指示的合并请求默认派发 `mode=merge` 的新 worker，不续派分支所属的 Task（`cordis.patch.yml:31-32`、`src/dispatch.js:25-48`）。

## Worker 规则

- change worker 必须先调用一次 `create_worktree`；除 `create_worktree` 外，工作目录不在分配的 Worktree 时所有工具被拦（`index.js:57-66`）。
- `create_worktree` 向 worktree 服务请求名字 `sl-<team slug>-<taskId>` 的 Worktree；Team slug 是小写 Team 名，把连续非字母数字替换为 `-`，去掉首尾 `-`，截到 32 字符（`src/worktree-tool.js:39-40`）。实际分支名取服务返回值，写入 `task.worktree.branch`（`src/worktree-tool.js:42-49`）。
- 已存在 Worktree 时再次调用只重新进入，不创建第二个（`src/worktree-tool.js:27-37`）。
- Worker 的 subagent 结束时冻结，之后不能用任何工具，包括记忆和消息工具（`index.js:114-116`、`index.js:58-59`）。
- Worker 的 `bash`/`pwsh` 在工具守卫里检查落地命令：未授权时 `git push`、`gh pr create`、`gh pr merge`、`git merge` 被拒；change worker 授权后仍只允许指派分支、reviewed HEAD 和本任务记录的 PR。`git merge` 只对 `mode=merge` 的 Task 开放，且只允许把本任务的 reviewed commit 从项目 checkout 合入 base branch；merge worker 用 `merge_branch` 把目标分支合入自己的 worktree 分支，不经过 shell 合并（`index.js:70-100`、`src/landing.js:374-388`、`src/merge-tool.js:13-64`）。
- `review_worker_commit`、记忆、提取和 `message_router` 只在 Worker 活跃且位于 Worktree 时可用；`merge_branch` 只对活跃的 merge 任务开放，目标必须来自 `task.mergeBranches`；`report_task` 只对活跃的 report 任务可用（`index.js:67-100`）。
- report worker 在项目 checkout 中只能使用 `read`、`glob`、`grep`、`read_image`、`bash`、`todo_write`，并以 `report_task` 结束；其他工具被拒绝（`index.js:57-66`）。
- `report_task` 要求 HEAD 仍等于基础 commit，且 checkout 除 `?? .agents/worktrees/.gitignore` 外没有改动（`src/report-tool.js:21-31`）。
- `message_router` 的报告 1–4,000 字符；Worker 在工作结束时发一次，不发过程进度。`COMPLETED` 只用于已审查且相关检查通过的实现，需要等待的任务不能报 `COMPLETED`（`src/message-router.js:6-25`）。
- 不属于本 Task 的 follow-up 不执行，并在最终报告里说明。运行中的 Task 仍然完整时报告 `COMPLETED` 并带上未应用的 follow-up；恢复后的 Task 的 follow-up 不属于本 Task 时报告 `BLOCKED`（`src/worker-prompt.js:61-68`）。

## Review 规则

- `review_worker_commit` 要求 Task 处于 `running`、已有 Worktree、工作区干净、HEAD 不是基础 commit、基础 commit 是 HEAD 的祖先，且 base..head 有净改动（`src/review.js:71-78`）。
- Reviewer 是独立子代理，标签 `Independent code review`，工作目录为 Worktree，delivery 为 `caller`，深度 2（`src/review.js:61-76`）。
- Reviewer 收到保存的需求、follow-up 文本、base 与 head commit、Worktree 路径；**diff 不放进提示词**，Reviewer 自己读 `base..head` 和改动文件（`src/review.js:20-32`）。
- 审查针对已提交的 diff；follow-up 只作上下文；只有具体的正确性、回归或缺少测试问题才阻止通过，风格偏好不阻止（`src/review.js:24-29`）。
- Reviewer 用 `submit_review` 记录裁决：内容「通过」是通过，其他内容记为审查意见。只有已认领的 Reviewer 能调用它，且一个审查只能提交一次（`src/review.js:6-34`、`src/review.js:125-140`）。
- 工具拿到裁决后，还要确认 Reviewer 实际读过改动、Worker HEAD 没有移动，才写入 `review.head`、`review.reviewerSessionId` 和 `review.approved`（`src/review.js:109-122`）。
- 面板的 `review` 动作对 `unreviewed` 的 Task 运行同一审查，要求 Worker Session 仍活着；通过写 `awaiting-merge`，有意见写 `review-required`（`src/git-actions.js:386-407`）。
- 通过的审查属于它的 commit。同一 Project 的另一个 Task 当前 HEAD 就是该 commit 时，面板读取可以采纳这条审查（`src/git-actions.js:254-269`）。
- 审查没有通过不直接改 Task 状态；Worker 修完再提交、再次请求审查。Worker 结束时仍未通过，Task 才落到 `review-required`（`index.js:131-133`）。

### 放行命令与围栏

Reviewer 只能检查 Worktree 与 `base..head`。以下规则由 `src/helper-guard.js` 和 `src/review-scope.js` 执行。

| 项目 | 放行 | 拒绝 |
| --- | --- | --- |
| 工具 | `submit_review`、`structured_output`、`read`、`read_image`、`glob`、`grep`、`bash`、`pwsh`（`src/helper-guard.js:23`） | 其他所有工具 |
| Git 子命令 | `diff`、`show`、`log`、`status`（`src/review-scope.js:17`） | 其他子命令 |
| 版本参数 | `HEAD`、基础 commit、head commit，或至少 7 位的唯一前缀 | 其他 revision |
| `git diff` | 必须同时命名 base 与 head，例如 `git diff <base>..<head>` | 缺少任一端的 diff |
| `git log` | 必须使用 `base..head` | 缺少任一端；读 patch 时可用 `-p`、`-u`、`--patch`、`--raw`、`-U<n>` |
| `git show` | 只读 base 或 head，可带 `:<path>` | 其他 commit、其他 revision、`.git` 内路径 |
| `git status` | 只带 flag | 位置参数 |
| 只读命令 | `ls`、`cat`、`head`、`tail`、`wc`、`pwd`、`file`、`stat` | 其他命令；写、执行和网络命令 |
| 命令形态 | 一次一条普通命令，可从 Worktree 根或其子目录运行 | shell 操作符、引号、重定向、管道、后台运行 |
| 路径 | Worktree 内路径 | 绝对路径越界、`..` 越界、解析符号链接后越界、`:` 开头、`.git` 内路径 |
| workdir | 未指定，或 Worktree 内路径 | 类型不是字符串或越界 |
| 沙箱 | Shell 挂载了只读限制且当前 Session 解析为 `read-only` | 请求放宽沙箱、沙箱不能限制文件写入 |
| `sandbox_permissions` | 不传 | 任何值 |
| `run_in_background` | 不传或 `false` | `true` |

- Git flag 黑名单包括 `--all`、`--branches`、`--tags`、`--remotes`、`--glob`、`--exclude`、`--reflog`、`--walk-reflogs`、`--source`、`--decorate-refs`、`--cached`、`--staged`、`--no-index`、`--ext-diff`、`--textconv`、`--output`、`--relative`、`--src-prefix`、`--dst-prefix`、`--line-prefix`、子模块相关 flag 和短 flag `-a`（`src/review-scope.js:10-16`、`src/review-scope.js:30-34`）。
- Reader 必须实际读过改动：一次 `git diff base..head`、带 patch 的 `git log base..head`、`git show <head>`，或对改动文件的 `read`、`read_image`、`grep` 调用会留下证据（`src/review-scope.js:212-229`、`src/review.js:87-89`）。
- 没有留下证据的裁决被拒绝：`The reviewer did not inspect the committed change; read the base..head diff or a changed file before deciding`（`src/review.js:87-89`）。

## Git 操作规则

合并只在用户明确授权后执行：直接指示或面板任务行的合并操作。worker 默认不推送、不合并；只有任务记录里的 `land` 授权才允许推送、开 PR 或合并 reviewed commit。直接指示的合并请求默认派发 `mode=merge` 的新 merge worker；change worker 的 `land` 授权只覆盖推送和 PR。未授权时 Router 和 Worker 都不合并，Worker 停在审查过的 commit（`cordis.patch.yml:31-32`、`src/worker-prompt.js:62-103`、`src/landing.js:63-71`）。

### 合并与发送 PR 的共同前提

| 条件 | 说明 |
| --- | --- |
| 状态 | Task 已结束 Worker 工作（`awaiting-merge` 或 `awaiting-ci`）（`src/delivery.js:7-13`） |
| 审查 | `review.approved === true`，且 worker 分支当前 HEAD 等于 `review.head`（`src/delivery.js:7-13`） |
| 文件策略 | 动作执行时解析出的 Session 文件策略必须是 `danger-full-access`（`src/git-actions.js:106-110`） |
| 任务模式 | report 任务没有 Git 操作（`src/git-actions.js:541`） |
| Task 记录 | 面板 Git 动作端点只接受 16 位任务 ID 和 `merge`、`publish`、`review`、`delete-branch`；任务删除走 `/superagent-lite/tasks` 的 `DELETE`（`src/board.js:91-148`、`src/board.js:14-45`） |

合并与发送 PR 共用 `deliverableHead`：状态、Worktree、审查和 HEAD 按同一套判定；执行前再用 `assertStillDeliverable` 复核状态与 Review。发送 PR 只额外要求 `gh auth status --hostname github.com` 成功，且所选 remote 指向 GitHub 仓库；写权限由 push 本身验证（`src/delivery.js:7-19`、`src/git-actions.js:427-439`）。

### 本地合并

合并始终是本地合并，GitHub 项目也一样；插件不再通过 `gh pr merge` 合并 PR。

1. 由用户直接指示后 router 派发的 `mode=merge` worker、面板任务行的合并动作触发。merge worker 先用 `merge_branch` 把目标分支合入自己的 worktree 分支、审查合并结果，再按本流程合入 base branch；面板动作通过 Task 的 Router Session 解析文件策略（`src/merge-tool.js:13-64`、`src/git-actions.js:106-110`）。
2. Task 必须已结束 Worker 工作，有 worker 分支和 Worktree，`review.approved === true`，且当前 HEAD 等于 `review.head`（`src/delivery.js:7-13`）。
3. 目标分支必须是合法的本地分支名，且不能是 worker 分支本身（`src/merge.js:35-38`）。
4. 项目 checkout 必须干净（除 `?? .agents/worktrees/.gitignore` 外），并且检出一个分支（`src/git-actions.js:201-209`、`src/merge.js:46-48`）。
5. 用 `git merge-tree --write-tree refs/heads/<target> <head>` 做冲突预检；冲突时报 `Merge would conflict; the target was not changed`（`src/merge.js:49-53`）。
6. 需要时切到目标分支，确认仍在目标分支且工作区干净，用 `assertStillDeliverable` 复核状态与 Review 后把 Task 标为 `merging`；执行 `git merge --no-ff --no-edit --no-overwrite-ignore <head>`，然后标为 `merged` 并记录 `mergeTarget`（`src/merge.js:54-77`、`src/delivery.js:16-19`）。
7. 合并执行失败时标为 `delivery-blocked`；最后把 checkout 切回原来的分支，切换失败时在结果里说明（`src/merge.js:69-99`）。

同一 Project 根的合并和分支删除跨 Task 串行，共享的 checkout 不会被两个合并同时切换；merge worker 的目标分支合并发生在其自己的 worktree 内，不切换共享 checkout，最后合入 base branch 时走本项目的串行队列（`src/merge.js:14-26`、`src/merge-tool.js:13-64`）。

### 发送 PR

发送 PR 与本地合并共用同一套前置校验（`src/delivery.js:7-19`）：

- Task 已结束 Worker 工作（`awaiting-merge` 或 `awaiting-ci`）、有 worker 分支和 Worktree、`review.approved === true`、当前 HEAD 等于 `review.head`、文件策略为 full access。
- 唯一额外条件是 GitHub：`gh auth status --hostname github.com` 必须成功，所选 remote 的 fetch 与 push URL 必须指向同一 GitHub 仓库；写权限由 push 本身验证（`src/git-actions.js:427-439`）。
- 面板先读取 remote 列表，用户选择一个 GitHub remote；没登录 `gh` 时弹窗不能提交（`src/git-actions.js:244-252`、`client.js:603-618`）。
- 已有精确匹配且打开的 PR 时复用；已有精确匹配且已合并的 PR 时记为 `merged`；已关闭时拒绝（`src/git-actions.js:440-450`）。
- 准备阶段用 `assertStillDeliverable` 复核状态与 Review 后把 Task 标为 `publishing`，把 reviewed HEAD 推送到所选 remote 的 push URL 和 `refs/heads/<worker branch>`，再创建 base 为 `task.baseBranch` 的 PR（`src/git-actions.js:451-457`、`src/github.js:77-113`）。
- PR 打开后 Task 标为 `awaiting-ci`；发送命令失败时标为 `delivery-blocked`。GitHub 写入不自动重试（`src/git-actions.js:469-472`）。

必需检查和分支保护由 GitHub 执行；插件不预先查询检查状态，只同步 PR 状态并展示检查汇总（`src/git-actions.js:18-32`、`src/git-actions.js:149-199`）。

### 审查、删除分支与删除任务

- 面板的 `review` 动作对未合并、HEAD 未审查且有提交的 Task 运行一次独立审查；Worker Session 必须还活着。通过写 `awaiting-merge`，有意见写 `review-required`（`src/git-actions.js:390-412`）。
- 面板的 `delete-branch` 只用于 `merged` 的 Task。Worktree 已登记且干净时先 `git worktree remove`，再 `git branch -D`；随后记录 `branchDeletedAt` 并清空 `worktree`（`src/merge.js:104-133`）。
- 面板的「删除任务」向 `/superagent-lite/tasks` 发送 `DELETE`，只接受 owner 和 16 位任务 ID。Worker Session 还活着的运行中 Task、正在合并或发布的 Task 被拒绝；其余 Task 删除记录和 worker 会话映射，分支、Worktree 和记忆归档保留（`src/board.js:14-45`、`src/task-store.js:103-121`）。
- 读取面板时会采纳同一 Project 的另一个 Task 为同一 commit 记录的通过审查，把 reviewed HEAD 写回本 Task（`src/git-actions.js:255-299`）。

### 并发与幂等

- 面板的 merge、publish、review 和 delete-branch 按 Task ID 串行；同一 Task 的重复动作不会并行执行（`src/git-actions.js:83-92`、`src/git-actions.js:537-547`）。
- 删除 Task 与同一 Task 的状态写入在 `src/task-store.js` 中按记录串行，先读后删；第二次删除返回未找到（`src/task-store.js:103-121`）。
- 面板一次 Git 动作的 HTTP 超时为 15 分钟，请求体上限 4 KB（`src/board.js:123`、`src/board.js:142`）。

## 记忆规则

| 类别 | Router Session | Worker Session | 记忆对话 | 面板 owner | 规则 |
| --- | --- | --- | --- | --- | --- |
| `private` | 读、写 | 无访问 | 每次最多 1 条凭据引用 | 读、改、删 | 只存凭据引用名，不存密钥；极少使用，按需读取 |
| `public` | 读、写 | 读、写 | 每次最多 3 条客观结论 | 读、改、删 | 只存客观知识；不存个人信息、团队专属信息或临时任务状态 |
| `profile` | 读、写 | 只读 | 每次最多 1 条用户画像或环境事实 | 读、改、删 | 每轮注入 Router 和 Worker；保持极少量 |
| `team` | 无访问 | 读、写 | 每次最多 3 条团队事实 | 读、改、删 | 同时按 Team 和 Project 隔离；只有同 Team、同 Project 的 Worker 能读 |

- 调用者身份来自 Host Session，不来自模型参数；不允许的 Session 报 `Memory is not available to this Session`（`src/memory.js:50-52`）。
- Worker 的 `superagent_memory` 分类枚举只有 `public`、`profile`、`team`；Router 的是 `public`、`profile`、`private`（`src/memory.js:32`）。
- `profile` 和 `private` 的写操作只有 Router 能做；Worker 只能读 `profile`（`src/memory.js:55-57`）。
- `private` 记录只接受 `credentialRef`，传 `content` 会被拒绝（`src/memory.js:58`、`src/memory-store.js:39-57`）。
- `team` 调用者必须是 Worker，且同时提供 Team 和绝对 Project 根；存储分区使用两者的哈希（`src/memory-store.js:143-153`、`src/memory-store.js:247-253`）。
- 内容 1–16,000 字符；疑似密钥的字符串被拒绝；凭据引用名匹配 `[A-Za-z_][A-Za-z0-9_]{0,127}`（`src/memory-store.js:12,14,52-55`）。
- 写入前在同一分类、同一 scope 内比对已有记录。文本先做 NFKC、大小写、空白和标点规范化：规范化后完全相同直接复用原记录，不更新 `source` 和 `updatedAt`（`src/memory-store.js:64-70`、`src/memory-store.js:329-338`）。
- 只有两种非完全相同文本算同一事实：较短文本完整包含在较长文本里（增加或去掉限定语），或字符编辑相似度达到 `0.8`。判定故意不使用 token 重叠和公共前后缀相似度，避免同模板但取值不同的事实互相覆盖（`src/memory-store.js:15-20`、`src/memory-store.js:96-109`）。
- 被判定为同一事实但文本不同的记录被覆盖而不是追加：保留 `id` 和 `createdAt`，用新内容、新 `source` 和新的 `updatedAt` 重写；低于阈值且无包含关系的文本才新增记录（`src/memory-store.js:116-132`、`src/memory-store.js:329-355`）。
- `private` 的 `credentialRef` 只按引用名完全相同去重，不做模糊匹配；不同分类、不同 Team 或不同 Project 的记录永不合并。
- 匹配是词面启发式，不含语义：表述完全不同但语义相同或冲突的事实不会命中，需要显式 `update` 指定 `id` 或由面板修正；同模板但取值不同的新事实会保留为两条。
- `list` 最多返回 8 条，每条预览最多 240 字符（`src/memory.js:59-65`）。面板列出全部记录。
- `profile` 注入取最近更新的 6 条，每条截到 500 字符；写入后立即刷新，Router 插件装载时和每个 Worker 创建前也会重新读取；上下文标记为 `required`，关闭可选运行时上下文时仍然注入（`src/memory.js:10-22`、`src/memory.js:80`、`router.js:8-11`、`index.js:117`）。
- 面板不是 Session：public、profile、private 使用 Host 专用 operator 角色，team 的编辑和删除必须带记录自己的 Team 与 Project（`src/memory.js:195-232`）。
- 记忆记录是数据，不授予权限，也不覆盖代码规则（`src/memory.js:35`）。

## 记忆对话规则

- 记忆对话是独立 helper 子代理，标签 `Distill memory`，delivery 为 `caller`，深度 2；它和 Reviewer 共用 helper 守卫，运行只读（`src/memory.js:157-190`、`src/memory-extractor.js:4-13`）。
- 它自己读取 Worker 的对话记录，不接收 worker 提交的摘要：`[user]`、`[assistant]`、`[tool call]` 和 `[tool result]` 逐条组成 transcript；最终报告工具（`message_router`、`report_task`）保留工具名但省略参数，COMPLETED 摘要本身不进入 transcript；每条最多 4,000 字符，tool call 参数最多 500 字符，总长最多 60,000 字符，超长时保留首尾并标出省略（`src/memory.js:108-155`、`src/memory-extractor.js:7-9`）。
- 角色提示词返回四个数组：`private`、`public`、`profile`、`team`。每条事实最多 500 字符；一次最多 1 条 private、3 条 public、1 条 profile、3 条 team（`src/memory-extractor.js:4-45`）。
- 提示词要求只固化长期可复用的事实或结论，跳过一次性、短期或易过时的内容；没有合格事实就返回空数组，不强制每次任务都写入。每条事实写成一句短小、独立、规范化的陈述并保持稳定主语，不得用不同措辞重复同一事实；纠正旧结论时只返回纠正后的事实，写入端负责覆盖匹配记录（`src/memory-extractor.js:29-38`）。
- 输出校验失败、事实超长或数量超出上限时整次提取报错；空数组不写记录（`src/memory.js:89-106`、`src/memory.js:168-169`）。
- 触发方式只有一种：最终 `message_router` 报告送达后触发一次记忆对话；Worker 不再拥有提交 findings 的 `extract_memory` 工具（`index.js:104-113`、`src/message-router.js:22`）。
- 触发只发生在 change 任务、Worker 位于 Worktree 且未冻结时；每个 Worker Session 最多一次（`index.js:104-113`）。
- 插件负责写入：private、public、profile 使用 Host 的 `memory` 角色，team 使用 Worker 的 Team 与规范化后的 Project 根。每条记录保存触发事件的 Session ID 和序号作为 `source`；同一次提取里落到同一记录的多个事实按记录 ID 去重后再返回（`src/memory.js:177-189`、`src/memory.js:24-29`）。
- 提取失败不阻塞最终报告；只记录警告，报告照常送达（`index.js:109-111`）。
- 原始归档不是记忆分类，也没有模型工具可读；它按 Worker Session 和轮次结束序号存放（`src/memory-store.js:417-439`）。

## 版本

Task 在创建和审查时固定自己的条件：保存的需求、父 Session、Team、Project、基础 commit 和 reviewed HEAD。改提示词或规则不会重写运行中的 Task；之后的回合和新派发使用新文本（`src/dispatch.js:69-87`、`src/review.js:20-32`、`src/continue.js:136`）。

Git 动作执行时会重新检查 Task 和 checkout；HEAD 移动、分支变化、目标脏或有新提交时停止动作，不使用过期审查（`src/git-actions.js:560-579`、`src/merge.js:23-43`）。

## 不完成时

无法完成的 Task 记录 `failed`、`review-required` 或 `delivery-blocked`；面板显示对应状态，由用户决定下一步（`index.js:118-145`）。

无法继续的 Worker 报告 `BLOCKED`：具体阻塞、已经尝试的内容、需要人提供的一个决定或资源。工作未完成但可继续的报告 `INCOMPLETE` 并说明剩下什么（`src/worker-prompt.js:61-68`）。
