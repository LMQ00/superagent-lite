# `/merge-worker` 报 “No reviewed local commit is ready for merge” 诊断

被审对象：分支 `sl-superagent-lite-10691e5b98883bc1` 上的本文件提交（`git log` 可见）；基线为合并目标 master 的 HEAD `8d572fa360c075fed73e564b766a5248db0bdbf9`。文件按事故日期命名，长期说明以 `docs/DETAIL.md` 为准。范围：只诊断，未改代码、未执行合并。命令输入为合法 16 位任务 ID，参数本身通过校验。

行号约定：所有 `file:line` 以基线 `8d572fa` 的工作区核对为准（本诊断只改 `docs/`，不会移动代码行号）；关键判定处同时给出函数/条件名（如 `mergeCommand` 的 `status !== 'awaiting-merge'`），便于重构后定位。环境与采集时间：`gh version 2.104.0 (2026-11-12)`、`node v26.13.1`、`Linux 7.3.4`；证据采集于 2026-11-21T14:02–14:05+08:00（Asia/Shanghai）。任务 JSON 的 mtime：`7ca2bbe1` 12:44:39、`b81edda` 11:27:05、`0258beac` 12:13:06、`fe847302` 10:49:54、`0c6e6374` 12:24:20、`df729be0` 13:34:59（均 +0800）。

## 结论（先回答）

- **结构性原因：GitHub 仓库根本不走 `/merge-worker`**。`status === 'awaiting-merge'` 只在 `githubOrigin` 为 undefined 时写入（`index.js:103-107`），本仓库 origin 是 GitHub，因此该状态永不产生，`/merge-worker` 对所有 GitHub 项目整体不可用（不是本次四条的特例）。
- **直接原因**：用户四条里，两条 approved 的任务当前是 `delivery-blocked`（GitHub 投递在 checks 门禁失败：仓库完全没有 checks，无 `.github/workflows`，`gh pr checks` 无论是否加 `--required` 都 exit 1），另两条是 `review-required`（用户口径 INCOMPLETE，review 未通过/未做）。两条 approved 即便 checks 门禁修好，也只会到 `merge-queued`/`merged`，`/merge-worker` 仍不可用。
- **两条已 approved 的提交仍可合入**：Host 已推送并创建 PR（#4、#2），PR `state=OPEN`、`isDraft=false`、`mergeable=MERGEABLE`、`mergeStateStatus=CLEAN`、`baseRefName=master`、`isCrossRepository=false`，且 `headRefOid` 逐字等于 `review.head`。走 PR 合并即可，不需要 `/merge-worker`。
- **报错原因不是**状态丢失、宿主重启、插件副本加载、HEAD 前移或命令参数错误；是任务状态不满足 `awaiting-merge`（两条 `delivery-blocked`、两条 `review-required`），而命令只认 `awaiting-merge`。
- **已知缺口**：PR 合并不会回写任务状态，面板仍显示 `delivery-blocked`，`/merge-worker` 之后仍报同一句；本地 master 也仍停在 `8d572fa`，需要 `git pull`。当前代码没有 PR 状态回收入口。
- 任务目录里另有两条记录（`0c6e6374`、`df729be0`）卡在同一门禁，但不在用户给出的四条里，仅作为系统性门禁旁证。

## “reviewed local commit is ready for merge” 判定依赖什么

判定只读**磁盘任务记录** `~/.dsh/superagent-lite/tasks/<id>.json`，不依赖内存，也不按 worktree 分支登记（`src/task-store.js:34,81-101`：数据根为 `homedir()/.dsh/superagent-lite`，`readTask`/`updateTask` 每次现读现写，JSON 原子替换）。

| 字段 | 写入点 | 读取点 / 含义 |
| --- | --- | --- |
| `review = { head, reviewerSessionId, approved }` | `review_worker_commit` 工具：名称常量 `reviewToolName`（`src/review.js:5`），工具定义 `createReviewTool`（`src/review.js:19`），`execute` 在子代理返回结构化结论且 HEAD 未变时写 `src/review.js:53` | `src/merge.js:25` 要求 `review.approved === true`（与 `status`、`worktree` 三个条件合取）；`src/merge.js:36-37` 再校验 worktree HEAD 与 `review.head` 相等 |
| `status = 'awaiting-merge'` | **唯一写入点** `index.js:105`：worker 结束、review approved、HEAD 未变、且 `githubOrigin` 为 undefined | `src/merge.js:25` 的门槛；`src/merge.js:45` 合并准备期再校验一次 |
| `status = 'delivery-blocked'` | `index.js:115`（GitHub 投递抛错）、`src/merge.js:51`（本地 merge 命令失败） | 终止态；`src/continue.js:31` 不接受它 |
| `worktree = { path, branch }` | `src/worktree-tool.js`（dispatch 后创建） | `src/merge.js:25` 要求存在 |

全仓检索 `awaiting-merge`：写入仅 `index.js:105`（`test/host.test.js:113` 为测试手工写入）；`src/merge.js:25,45`、`src/continue.js:31` 只读。**在当前代码路径下**，有 GitHub origin 的项目收尾只会依次经过 `publishing` → `awaiting-ci` → `delivery-blocked`（或成功时的 `merge-queued`/`merged`），不会产生 `awaiting-merge`。

## 现场证据

### 用户四条任务（原始字段）

| 任务 | 用户口径 | status | review.approved | review.head | failure | prUrl |
| --- | --- | --- | --- | --- | --- | --- |
| `7ca2bbe11a9d6cec` | approved | `delivery-blocked` | true | `aaad3e0ae56d41920bc933fb995b3b6d96195a38` | `gh pr exited with status 1` | `https://github.com/LMQ00/superagent-lite/pull/4` |
| `b81eddab113e99cb` | approved | `delivery-blocked` | true | `9ccc191d2f24f3ecea0139d096dc5657f939d425` | `gh pr exited with status 1` | `https://github.com/LMQ00/superagent-lite/pull/2` |
| `0258beac07ecaa15` | INCOMPLETE | `review-required` | false | `71c9fc4e14aa0b3ef7b85584b2cfb419926c0ff3` | — | 无 |
| `fe8473029c270882` | INCOMPLETE | `review-required` | 无 review（`null`） | 无 | — | 无 |

四条均有 `worktree` 与 `stopReason: "completed"`。注意 `stopReason: completed` 只表示 worker 这一轮正常结束，不代表 review 通过；INCOMPLETE 的依据是 `review.approved=false`（`0258beac`）或没有 `review` 记录（`fe847302`），与用户“另两条 INCOMPLETE（review 未通过）”的口径一致。

### 旁证：另两条同因记录（不在用户四条内）

| 任务 | status | review.approved | review.head | failure | prUrl |
| --- | --- | --- | --- | --- | --- |
| `0c6e6374369b8933` | `delivery-blocked` | true | `14a59798979ab694939eee9f7af5fbdb47237330` | `gh pr exited with status 1` | `https://github.com/LMQ00/superagent-lite/pull/3` |
| `df729be001a6c1a5` | `delivery-blocked` | true | `d9539f40023ed2038da1a462377fd48235941251` | `gh pr exited with status 1` | `https://github.com/LMQ00/superagent-lite/pull/5` |

### Git 证据

下表为 4 条 approved 记录。`0258beac` 也有 `review.head`（`71c9fc4e14aa0b3ef7b85584b2cfb419926c0ff3`）且 worktree HEAD 与之相等，但 `approved=false`，不参与合并判定；`fe847302` 无 `review.head`，同样不参与。五条有 `review.head` 的记录均无 HEAD 前移。

| 任务 | worktree HEAD | review.head | 相等 | dirty 行数 | 远端分支 head |
| --- | --- | --- | --- | --- | --- |
| `7ca2bbe11a9d6cec` | `aaad3e0ae56d41920bc933fb995b3b6d96195a38` | 同左 | 是 | 0 | 同左 |
| `b81eddab113e99cb` | `9ccc191d2f24f3ecea0139d096dc5657f939d425` | 同左 | 是 | 0 | 同左 |
| `0c6e6374369b8933` | `14a59798979ab694939eee9f7af5fbdb47237330` | 同左 | 是 | 0 | 同左 |
| `df729be001a6c1a5` | `d9539f40023ed2038da1a462377fd48235941251` | 同左 | 是 | 0 | 同左 |

其他：`git merge-tree --write-tree master <head>` 四个分支均 exit 0；master 当前 `8d572fa360c075fed73e564b766a5248db0bdbf9`，无 `MERGE_HEAD`，工作区干净（0 行）。组合预检也用 `merge-tree` 链式做过：#4 得到 tree `35b5e27…`，再以 `8d572fa` 为 merge-base 合 #2 得到 tree `5244ac2…`（exit 0）；反向（先 #2 后 #4）同样 exit 0。该链式命令在 git 2.56.1 上直接接受 tree OID 作为一侧输入（`git cat-file -t $T1` 返回 `tree`，命令实测 exit 0），复现命令见文末。所以按顺序合 #4、#2 不会冲突，但合并后仍应按下一步复核下一个 PR 的 `mergeable`。

### GitHub 证据（PR 已建成，失败点在 required checks）

```
# gh pr view <n> --repo github.com/LMQ00/superagent-lite --json number,state,baseRefName,headRefName,headRefOid,isDraft,isCrossRepository,mergeable,mergeStateStatus
#4 base=master head=sl-superagent-lite-7ca2bbe11a9d6cec headRefOid=aaad3e0ae56d41920bc933fb995b3b6d96195a38 state=OPEN isDraft=false MERGEABLE CLEAN cross=false
#2 base=master head=sl-superagent-lite-b81eddab113e99cb headRefOid=9ccc191d2f24f3ecea0139d096dc5657f939d425 state=OPEN isDraft=false MERGEABLE CLEAN cross=false
#3 base=master headRefOid=14a59798979ab694939eee9f7af5fbdb47237330 state=OPEN isDraft=false MERGEABLE CLEAN cross=false
#5 base=master headRefOid=d9539f40023ed2038da1a462377fd48235941251 state=OPEN isDraft=false MERGEABLE CLEAN cross=false

$ gh pr checks 4 --repo github.com/LMQ00/superagent-lite --required
[stderr] no checks reported on the 'sl-superagent-lite-7ca2bbe11a9d6cec' branch
exit=1
$ gh pr checks 4 --repo github.com/LMQ00/superagent-lite
[stderr] 同上
exit=1
$ gh pr checks 2 --repo github.com/LMQ00/superagent-lite --required
[stderr] no checks reported on the 'sl-superagent-lite-b81eddab113e99cb' branch
exit=1
$ gh pr checks 4 --repo github.com/LMQ00/superagent-lite --required --watch
[stderr] 同上，立即 exit=1（无 checks 可等；gh 2.104.0）
$ gh pr view 4 --repo github.com/LMQ00/superagent-lite --json baseRefName,headRefOid,state
成功，输出与上表一致

gh api repos/LMQ00/superagent-lite/branches/master/protection -> 404 Branch not protected
gh api repos/LMQ00/superagent-lite/rulesets -> []
无 .github/workflows
gh api repos/LMQ00/superagent-lite -> default_branch=master, allow_merge_commit=true, allow_squash_merge=true
```

关于“失败点就是 checks”的推断边界：任务里只留了 `gh pr exited with status 1`；`src/process.js:14` 的失败消息只含命令与第一个参数，失败时 stdout 不进入错误文本，stderr 由 spawn 收集但未拼入。但在 `awaiting-ci` 写入之后，`deliverGithub` 只再调用三类 `gh pr`：`pr view`（现测成功）、`pr checks`（可复现 exit 1）、`pr merge`（未执行）。因此可复现的失败点只能是 `pr checks`；无法从记录中排除当时存在瞬时失败，但当前 `gh auth status --hostname github.com` 正常、`gh` 版本支持 `--required`（2.104.0），且 `pr checks` 的失败是确定性的。

## 失败链路

1. `githubOrigin()` 命中 `origin=https://github.com/LMQ00/superagent-lite.git`（`src/github.js:9-20`），`index.js:103-107` 的本地合并分支被跳过。
2. `index.js:112` 写 `publishing`，调用 `deliverGithub`（`src/github.js:22`）。
3. 推送分支、`gh pr create` 成功（PR #4/#2 等已存在），`src/github.js:35` 写 `awaiting-ci` + `prUrl`。
4. `src/github.js:40` 执行 `gh pr checks … --required --watch`；仓库没有 required checks，`gh` 以 exit 1 返回。
5. `src/process.js:14` 把任何 `gh pr …` 失败统一包成 `gh pr exited with status 1`：错误消息只拼命令与第一个参数，失败时 stdout 不进入错误文本，stderr 虽由 spawn 收集但未拼入。
6. `index.js:114-116` 捕获后写 `status='delivery-blocked'`、同名 `failure`，`prUrl` 保留。
7. 用户执行 `/merge-worker`：`src/merge.js:25` 看到 `status !== 'awaiting-merge'`，抛 `No reviewed local commit is ready for merge`。
8. 另外两条 `review-required` 在 `index.js:93-95` 就被写成 `review-required`，根本没进入投递；它们的报错也是同一句，但原因不同。

## 逐项排除故障假设

| 假设 | 结论 | 证据 |
| --- | --- | --- |
| 宿主重启/重载导致状态丢失 | 不成立（状态不在内存） | 状态由代码写入磁盘 JSON（`src/task-store.js:34,81-101`）。任务记录、worktree、远端分支都在，`review` 与 Git 状态一致。是否发生过重启无需确认：重启不会改变已写的 `delivery-blocked`；`index.js` 的 `apply` 也没有启动恢复/重试逻辑（投递只由 `index.js:80` 的 `subagent/end` 触发），`docs/DETAIL.md` 亦写明中断的投递不自动重试。 |
| review 登记路径与插件实例不一致 | 排除 | 只有单一数据根 `~/.dsh/superagent-lite`（`src/task-store.js:34`）；两条 approved 记录的 `review`/`worktree` 齐全且与 Git 状态一致。 |
| review 后 HEAD 前移 | 排除 | 五条有 `review.head` 的记录（4 条 approved + `0258beac`），worktree HEAD 与 `review.head` 逐字相等（见上表）；`fe847302` 无 `review.head`。若在 worker 收尾前前移，`index.js:99-101` 会把状态降为 `review-required` 而不是 `delivery-blocked`。 |
| 插件从已安装副本加载、状态写到别处 | 排除 | `~/.dsh/profiles/web/package.json` 用 `link:/home/LMQ/work/superagent-lite/`，`node_modules/@local/superagent-lite` 是指向该目录的符号链接；数据根由 `homedir()` 决定，与插件副本位置无关。 |
| 命令参数不对 | 排除 | ID 为合法 16 位十六进制，`src/merge.js:14` 通过；归属与文件策略校验也通过（否则报的是另外两句）。 |
| 任务不是 `awaiting-merge`（真实原因） | 成立 | 两条 approved 为 `delivery-blocked`（GitHub 投递在 required-checks 门禁失败：仓库无 required checks，`gh pr checks --required` exit 1），两条为 `review-required`（review 未通过/未做）。 |

## 用户下一步（最短路径）

**先明确：本仓库不能用 `/merge-worker`，验收看 `gh pr view <n> --json state`，不要反复试该命令。**

1. **合并已审核的 PR**（推荐；只用 reviewed head 对应的 PR）：
   - `gh pr merge 4 --repo LMQ00/superagent-lite --merge --match-head-commit aaad3e0ae56d41920bc933fb995b3b6d96195a38`
   - `gh pr merge 2 --repo LMQ00/superagent-lite --merge --match-head-commit 9ccc191d2f24f3ecea0139d096dc5657f939d425`（放在 #4 合并、`git pull` 之后执行）
   - `--match-head-commit` 与 Host 的 `src/github.js:47` 做法一致：即使校验后分支前移，GH 也会拒绝合并，不会合入未审核提交。合并前仍可复核：`gh pr view 4 --repo LMQ00/superagent-lite --json baseRefName,headRefOid,state,isDraft` 应为 `master` / `aaad3e0ae56d41920bc933fb995b3b6d96195a38` / `OPEN` / `false`。
   - 用 `--merge` 会保留 reviewed commit 本身进入 master 历史；若改用 `--squash`，master 上只会得到一个新的 squash 提交（内容等价、SHA 不同），reviewed SHA 不会出现在历史里。仓库无分支保护、无 required checks，不需要 `--admin`。
   - **串行合并**：先合 #4，然后在主工作区执行 `git -C /home/LMQ/work/superagent-lite pull --ff-only`（主工作区当前在 `master` 且干净），再按上面的命令合 #2；每次合并后重新检查下一个 PR 的 `mergeable,mergeStateStatus,headRefOid`。组合预检已通过，但仍可能因后续新提交变化。
   - 合并后主工作区要 `git -C /home/LMQ/work/superagent-lite pull --ff-only` 才会看到 master 前进（当前仍是 `8d572fa`）。
2. **PR 合并不会更新任务状态**（已知缺口）：任务 JSON 仍是 `delivery-blocked`，面板不会自动变成 `merged`，再执行 `/merge-worker` 仍报同一句。验收口径以 `gh pr view <n> --json state` 的 `MERGED` 为准，不要看面板。证据：全仓检索 `deliverGithub` 只有 `index.js:113` 一个调用点（`subagent/end` 收尾流程）；`src/github.js:36` 的 `gh pr view` 与 `publish({ status: 'awaiting-ci' })`、GitHub 路径的 `merged`/`merge-queued` 写入都只在该函数内部（本地路径的 `merged` 写于 `src/merge.js:54`）；`src/continue.js:31` 不接受 `delivery-blocked`。因此 `delivery-blocked` 之后没有再次读取 PR 状态并回写任务的入口，不要手工伪造 `merged`（原因见附录）。
3. **不要重新 `review_worker_commit`**：review 结论仍有效且已钉住 head；worker 已结束被冻结，review 工具要求 `task.status === 'running'`（`src/review.js:30`），当前也调不动。即便能调，也会再次走同一条 GitHub 投递路径，在同一个 required-checks 门禁再次失败。
4. **不要重启宿主**：状态在磁盘，重启不会把 `delivery-blocked` 变回 `awaiting-merge`，也没有启动重试。
5. **不要改命令写法**：参数无误。
6. 不要用“删 origin + 手工改任务状态”绕过判定链；附录只解释为什么不要这样做，不提供步骤。

## 判定逻辑缺陷与修法建议（本轮不改代码）

1. **`src/merge.js:25` 三种原因共用一句错误文案**（状态不对 / review 未通过 / 无 worktree）。建议按条件分别报错并附 `status`、`review.approved`、`failure`、`prUrl`：`delivery-blocked && prUrl` 提示“已投递为 PR #n，请走 PR 合并”；`review-required` 提示“提交尚未通过 review”；无 `worktree` 单独报。测试：新增 `test/merge.test.js`（或扩展 `test/host.test.js`），分别构造三种任务，断言错误文案互不相同且包含各自字段。
2. **状态分类优先，不要 origin 优先**：若先探测 GitHub origin 就统一指 PR，会把 `0258beac`（`review-required`、无 PR）误导去合 PR。建议只在 `delivery-blocked && prUrl` 时给 PR 指引，其余仍报真实原因（与缺陷 1 合并实现）。测试：GitHub origin + `delivery-blocked`+`prUrl` 断言指向 PR；GitHub origin + `review-required` 且 `prUrl=null` 断言提示 review。
3. **`src/github.js:40-44` 把“required checks 非空且全绿”作为硬门禁**，而本仓库**完全没有 checks**（无 `.github/workflows`，`gh pr checks` 加不加 `--required` 都是 `no checks reported` + exit 1），导致“分支已推、PR 已建”之后必然 `delivery-blocked`，且错误只剩 `gh pr exited with status 1`。此外还有时序问题：即使仓库有 CI，`gh pr create` 之后立刻查询时 check run 往往尚未注册，同样会得到 `no checks reported`。三种情况要区分：(a) 仓库没有 CI/没有任何 checks；(b) 有 checks 但没有 required checks；(c) 有 required checks 但尚未注册/尚未完成。建议：对 (a) 要求先配置 CI 或在显式配置下跳过该门禁，对 (b) 提供显式配置（把 required checks 视为可选，或明确要求仓库配置 required checks），对 (c) 给宽限/重试，并在错误里区分三者；`gh` 失败时保留子命令与 stderr 片段。测试：扩展 `test/github.test.js`，覆盖“完全无 checks”“无 required checks”“`pr create` 后首次查询为空而重试后出现检查”“检查失败”四个用例，断言错误信息包含子命令与 stderr。
4. **`delivery-blocked` 是死状态**：`src/continue.js:31` 不接受它，也没有重试投递命令，一次 `gh` 失败会把已 approved 的提交永久搁置。建议增加受控重试入口（如 `/publish-worker <id>` 或允许 `continue_worker` 从 `delivery-blocked` 恢复并复用已有 PR），并记录失败步骤；另建议在面板/命令中按 PR 实际状态回收 `merged`。测试：`test/continue.test.js` 断言 `delivery-blocked` 可重试；`test/github.test.js` 断言投递失败后重试复用同一 PR；PR 已合并时任务状态回收为 `merged`。
5. **approved 后的 HEAD 变化缺少复审入口**：worker 结束前 HEAD 变化会被降级为 `review-required`（`index.js:99-101`），合并前 `src/merge.js:36-37` 也会拒绝 HEAD 不匹配，GitHub 路径用 `src/github.js:28` 的 reviewed head 推送和 `src/github.js:47` 的 `--match-head-commit` 钉住，因此不会误合未审核提交；但任务一旦进入 `delivery-blocked`，HEAD 再变化既不会自动复审也没有入口，只能等人发现。建议为该状态提供重新 review 的路径。测试：扩展 `test/host.test.js`，approved 后新增提交，断言本地合并拒绝且 PR 路径不会合入新提交。
6. **有 GitHub origin 时 `awaiting-merge` 永不写入，`/merge-worker` 对该类仓库整体不可用**：`index.js:103-107` 的本地分支以 `!githubOrigin` 为前提，因此 GitHub 项目的 approved 任务只会走 PR 路径；但 `src/merge.js:27` 的“GitHub 项目走 PR”提示排在状态校验之后，用户永远先看到 `No reviewed local commit is ready for merge`，而不是“该仓库走 PR”。`docs/DETAIL.md` 只写了 Local-only 与 GitHub 两种仓库，命令层没有对应提示。建议：在缺陷 1/2 的“状态优先分类”里补一条 GitHub 项目专用的拒绝文案（只对 `delivery-blocked && prUrl` 指向 PR，其余报真实原因），并把“GitHub 仓库不走 `/merge-worker`”写进 `docs/DETAIL.md` 与 router 提示词；不要改成 origin 优先。测试：`test/merge.test.js` 断言 GitHub origin + approved 任务得到指向 PR 的提示，GitHub origin + `review-required` 仍报 review 原因。

## 附录：为什么不要手工改状态或删 origin（反例说明）

本节只说明反例，不提供可执行步骤。**不要通过删除 origin、手工改写任务状态来绕过判定链。** 这类做法会让仓库远端配置与面板状态偏离真实交付，且宿主随时可能用 `updateTask` 的读改写覆盖手工修改；即使强行合并成功，任务记录与真实交付来源（PR #n）也不一致。如果只是想让面板与 PR 一致，那是已知缺口（见“用户下一步”第 2 条），应等后续版本提供状态回收，不要手工伪造 `merged`。

若确实需要本地合并语义，正确做法是修改代码/流程（例如新增区分 GitHub 与本地仓库的显式开关），而不是改运行时数据。

## 后续落地清单（本次未执行）

- [ ] `src/merge.js`：按 status/review/worktree 分别报错；`delivery-blocked && prUrl` 指向 PR，GitHub 项目给出专用提示（缺陷 1/2/6）。
- [ ] `src/github.js`：区分“无 checks / 无 required checks / checks 未注册 / checks 失败”，补宽限或显式跳过，错误保留子命令与 stderr（缺陷 3）。
- [ ] `src/continue.js`：允许从 `delivery-blocked` 受控重试投递并复用已有 PR（缺陷 4）。
- [ ] 状态回收：按 PR 实际状态把任务回写为 `merged`/`merge-queued`（缺陷 4）。
- [ ] `docs/DETAIL.md`：写明 `/merge-worker` 只适用于本地仓库，GitHub 仓库走 PR（缺陷 6）。
- [ ] 测试：`test/merge.test.js`（错误文案分类、GitHub 项目提示）、`test/github.test.js`（四类 checks 场景）、`test/continue.test.js`（`delivery-blocked` 重试）、`test/host.test.js`（approved 后 HEAD 变化、GitHub 端到端）。

## 复现命令（基线 `8d572fa`，2026-11-21）

```bash
# 任务状态
node -e 'const t=require(process.env.HOME+"/.dsh/superagent-lite/tasks/7ca2bbe11a9d6cec.json");console.log(t.status,t.review,t.failure,t.prUrl)'
# HEAD 与 reviewed commit
git -C /home/LMQ/work/superagent-lite/.agents/worktrees/sl-superagent-lite-7ca2bbe11a9d6cec rev-parse HEAD
# PR 状态与 base
gh pr view 4 --repo github.com/LMQ00/superagent-lite --json state,baseRefName,headRefOid,isDraft,mergeable,mergeStateStatus
# checks（有/无 --required 都 exit 1）
gh pr checks 4 --repo github.com/LMQ00/superagent-lite --required; echo $?
# 组合预检
T1=$(git -C /home/LMQ/work/superagent-lite merge-tree --write-tree master aaad3e0ae56d41920bc933fb995b3b6d96195a38)  # tree OID，git 2.56.1 可直接作为 merge-tree 输入
git -C /home/LMQ/work/superagent-lite cat-file -t "$T1"   # 输出 tree
git -C /home/LMQ/work/superagent-lite merge-tree --write-tree --merge-base 8d572fa360c075fed73e564b766a5248db0bdbf9 "$T1" 9ccc191d2f24f3ecea0139d096dc5657f939d425; echo $?
```
