# `/merge-worker` 报 “No reviewed local commit is ready for merge” 诊断

基线：`8d572fa360c075fed73e564b766a5248db0bdbf9`（master）。范围：只诊断，未改代码、未执行合并。命令输入为合法 16 位任务 ID，参数本身通过校验。证据采集时间：2026-11-21T14:02:08+08:00（Asia/Shanghai）。

## 结论（先回答）

- **不能通过 `/merge-worker` 合并**：命令只接受 `status === 'awaiting-merge'` 的任务（`src/merge.js:25`）。用户四条里，两条 approved 的任务是 `delivery-blocked`（GitHub 投递在 required-checks 门禁失败：仓库没有 required checks，`gh pr checks --required` 因此 exit 1），两条是 `review-required`（review 未通过/未做）。两类都到不了 `awaiting-merge`，但原因不同。
- **两条已 approved 的提交仍可合入**：Host 已推送并创建 PR（#4、#2），PR `state=OPEN`、`mergeable=MERGEABLE`、`mergeStateStatus=CLEAN`、`baseRefName=master`、`isCrossRepository=false`，且 `headRefOid` 逐字等于 `review.head`。走 PR 合并即可，不需要 `/merge-worker`。
- **报错原因不是**状态丢失、宿主重启、插件副本加载、HEAD 前移或命令参数错误；是任务状态不满足 `awaiting-merge`（两条 `delivery-blocked`、两条 `review-required`），而命令只认 `awaiting-merge`。
- **已知缺口**：PR 合并不会回写任务状态，面板仍显示 `delivery-blocked`，`/merge-worker` 之后仍报同一句；本地 master 也仍停在 `8d572fa`，需要 `git pull`。当前代码没有 PR 状态回收入口。
- 任务目录里另有两条记录（`0c6e6374`、`df729be0`）卡在同一门禁，但不在用户给出的四条里，仅作为系统性门禁旁证。

## “reviewed local commit is ready for merge” 判定依赖什么

判定只读**磁盘任务记录** `~/.dsh/superagent-lite/tasks/<id>.json`，不依赖内存，也不按 worktree 分支登记（`src/task-store.js:34,81-101`：数据根为 `homedir()/.dsh/superagent-lite`，JSON 原子写、读时现取）。

| 字段 | 写入点 | 读取点 / 含义 |
| --- | --- | --- |
| `review = { head, reviewerSessionId, approved }` | `src/review.js:53`（review 子代理返回结构化结论且 HEAD 未变时） | `src/merge.js:25` 只要求 `review.approved` 为真；`src/merge.js:36-37` 再校验 worktree HEAD 与 `review.head` 相等 |
| `status = 'awaiting-merge'` | **唯一写入点** `index.js:105`：worker 结束、review approved、HEAD 未变、且 `githubOrigin` 为 undefined | `src/merge.js:25` 的门槛；`src/merge.js:45` 合并准备期再校验一次 |
| `status = 'delivery-blocked'` | `index.js:115`（GitHub 投递抛错）、`src/merge.js:51`（本地 merge 命令失败） | 终止态；`src/continue.js:31` 不接受它 |
| `worktree = { path, branch }` | `src/worktree-tool.js`（dispatch 后创建） | `src/merge.js:25` 要求存在 |

全仓检索 `awaiting-merge`：写入仅 `index.js:105`（`test/host.test.js:113` 为测试手工写入）；`src/merge.js:25,45`、`src/continue.js:31` 只读。**在当前代码路径下**，有 GitHub origin 的项目收尾只会依次经过 `publishing` → `awaiting-ci` → `delivery-blocked`（或成功时的 `merge-queued`/`merged`），不会产生 `awaiting-merge`。

## 现场证据

### 用户四条任务（原始字段）

| 任务 | status | review.approved | review.head | failure | prUrl |
| --- | --- | --- | --- | --- | --- |
| `7ca2bbe11a9d6cec` | `delivery-blocked` | true | `aaad3e0ae56d41920bc933fb995b3b6d96195a38` | `gh pr exited with status 1` | `https://github.com/LMQ00/superagent-lite/pull/4` |
| `b81eddab113e99cb` | `delivery-blocked` | true | `9ccc191d2f24f3ecea0139d096dc5657f939d425` | `gh pr exited with status 1` | `https://github.com/LMQ00/superagent-lite/pull/2` |
| `0258beac07ecaa15` | `review-required` | false | `71c9fc4e14aa0b3ef7b85584b2cfb419926c0ff3` | — | 无 |
| `fe8473029c270882` | `review-required` | 无 review（`null`） | 无 | — | 无 |

四条均有 `worktree` 与 `stopReason: "completed"`。

### 旁证：另两条同因记录（不在用户四条内）

| 任务 | status | review.approved | review.head | failure | prUrl |
| --- | --- | --- | --- | --- | --- |
| `0c6e6374369b8933` | `delivery-blocked` | true | `14a59798979ab694939eee9f7af5fbdb47237330` | `gh pr exited with status 1` | `https://github.com/LMQ00/superagent-lite/pull/3` |
| `df729be001a6c1a5` | `delivery-blocked` | true | `d9539f40023ed2038da1a462377fd48235941251` | `gh pr exited with status 1` | `https://github.com/LMQ00/superagent-lite/pull/5` |

### Git 证据

对“有 review.head 的四条 approved 记录”逐条比对（`0258beac`/`fe847302` 不参与，前者 review 未通过、后者无 review）：

| 任务 | worktree HEAD | review.head | 相等 | dirty 行数 | 远端分支 head |
| --- | --- | --- | --- | --- | --- |
| `7ca2bbe11a9d6cec` | `aaad3e0ae56d41920bc933fb995b3b6d96195a38` | 同左 | 是 | 0 | 同左 |
| `b81eddab113e99cb` | `9ccc191d2f24f3ecea0139d096dc5657f939d425` | 同左 | 是 | 0 | 同左 |
| `0c6e6374369b8933` | `14a59798979ab694939eee9f7af5fbdb47237330` | 同左 | 是 | 0 | 同左 |
| `df729be001a6c1a5` | `d9539f40023ed2038da1a462377fd48235941251` | 同左 | 是 | 0 | 同左 |

其他：`git merge-tree --write-tree master <head>` 四个分支均 exit 0；master 当前 `8d572fa360c075fed73e564b766a5248db0bdbf9`，无 `MERGE_HEAD`，工作区干净（0 行）。

### GitHub 证据（PR 已建成，失败点在 required checks）

```
#4 base=master head=sl-superagent-lite-7ca2bbe11a9d6cec headRefOid=aaad3e0ae56d41920bc933fb995b3b6d96195a38 state=OPEN isDraft=false MERGEABLE CLEAN cross=false
#2 base=master head=sl-superagent-lite-b81eddab113e99cb headRefOid=9ccc191d2f24f3ecea0139d096dc5657f939d425 state=OPEN isDraft=false MERGEABLE CLEAN cross=false
#3 base=master headRefOid=14a59798979ab694939eee9f7af5fbdb47237330 state=OPEN isDraft=false MERGEABLE CLEAN cross=false
#5 base=master headRefOid=d9539f40023ed2038da1a462377fd48235941251 state=OPEN isDraft=false MERGEABLE CLEAN cross=false

gh pr checks 4 --repo … --required --json bucket -> "no checks reported on the 'sl-superagent-lite-7ca2bbe11a9d6cec' branch", exit 1
gh pr checks 2 … --required --json bucket        -> "no checks reported on the '…b81eddab113e99cb' branch", exit 1
gh pr checks 4 … --required --watch              -> 同上，立即 exit 1（无 checks 可等）
gh api repos/LMQ00/superagent-lite/branches/master/protection -> 404 Branch not protected
gh api repos/LMQ00/superagent-lite/rulesets -> []
无 .github/workflows
gh api repos/LMQ00/superagent-lite -> default_branch=master, allow_merge_commit=true, allow_squash_merge=true
```

## 失败链路

1. `githubOrigin()` 命中 `origin=https://github.com/LMQ00/superagent-lite.git`（`src/github.js:9-20`），`index.js:103-107` 的本地合并分支被跳过。
2. `index.js:112` 写 `publishing`，调用 `deliverGithub`（`src/github.js:22`）。
3. 推送分支、`gh pr create` 成功（PR #4/#2 等已存在），`src/github.js:35` 写 `awaiting-ci` + `prUrl`。
4. `src/github.js:40` 执行 `gh pr checks … --required --watch`；仓库没有 required checks，`gh` 以 exit 1 返回。
5. `src/process.js:14` 把任何 `gh pr …` 失败统一包成 `gh pr exited with status 1`（只保留命令与第一个参数，具体子命令与 stderr 被丢弃）。
6. `index.js:114-116` 捕获后写 `status='delivery-blocked'`、同名 `failure`，`prUrl` 保留。
7. 用户执行 `/merge-worker`：`src/merge.js:25` 看到 `status !== 'awaiting-merge'`，抛 `No reviewed local commit is ready for merge`。
8. 另外两条 `review-required` 在 `index.js:93-95` 就被写成 `review-required`，根本没进入投递；它们的报错也是同一句，但原因不同。

## 逐项排除故障假设

| 假设 | 结论 | 证据 |
| --- | --- | --- |
| 宿主重启/重载导致状态丢失 | 排除 | 状态由代码写入磁盘 JSON（`src/task-store.js:34,91-101`）。任务记录仍在，`.agents/worktrees` 与远端分支仍在。是否发生过重启无法从现有证据确认，但不影响结论：状态不是内存态，重启不会改变 `delivery-blocked`；`index.js` 的 `apply` 中也没有启动恢复/重试逻辑（只有 `subagent/end` 触发的投递，`index.js:80`），`docs/DETAIL.md` 亦写明中断的投递不自动重试。 |
| review 登记路径与插件实例不一致 | 排除 | 只有单一数据根 `~/.dsh/superagent-lite`（`src/task-store.js:34`）；四条记录里 approved 的两条 `review`/`worktree` 齐全且与 Git 状态一致。 |
| review 后 HEAD 前移 | 排除 | 四条有 `review.head` 的记录，worktree HEAD 与 `review.head` 逐字相等（见上表）；若在 worker 收尾前前移，`index.js:99-101` 会把状态降为 `review-required` 而不是 `delivery-blocked`。 |
| 插件从已安装副本加载、状态写到别处 | 排除 | `~/.dsh/profiles/web/package.json` 用 `link:/home/LMQ/work/superagent-lite/`，`node_modules/@local/superagent-lite` 是指向该目录的符号链接；数据根由 `homedir()` 决定，与插件副本位置无关。 |
| 命令参数不对 | 排除 | ID 为合法 16 位十六进制，`src/merge.js:14` 通过；归属与文件策略校验也通过（否则报的是另外两句）。 |
| 任务不是 `awaiting-merge`（真实原因） | 成立 | 两条 approved 为 `delivery-blocked`（GitHub 投递在 required-checks 门禁失败：仓库无 required checks，`gh pr checks --required` exit 1），两条为 `review-required`（review 未通过/未做）。 |

## 用户下一步（最短路径）

1. **合并已审核的 PR**（推荐；只用 reviewed head 对应的 PR）：
   - `gh pr merge 4 --repo LMQ00/superagent-lite --merge`
   - `gh pr merge 2 --repo LMQ00/superagent-lite --merge`
   - 用 `--merge` 会保留 reviewed commit 本身进入 master 历史；若改用 `--squash`，master 上只会得到一个新的 squash 提交（内容等价、SHA 不同），reviewed SHA 不会出现在历史里。仓库无分支保护、无 required checks，不需要 `--admin`。
   - 合并前可复核 `gh pr view 4 --json baseRefName,headRefOid,state,isDraft` 仍为 `master` / `aaad3e0ae56d41920bc933fb995b3b6d96195a38` / `OPEN` / `false`（四条 PR 均已核实 `isDraft=false`，draft PR 无法直接 `gh pr merge`）。
   - 合并后本地要 `git pull` 才会看到 master 前进（当前仍是 `8d572fa`）。
2. **PR 合并不会更新任务状态**（已知缺口）：任务 JSON 仍是 `delivery-blocked`，面板不会自动变成 `merged`，再执行 `/merge-worker` 仍报同一句。当前代码没有 PR 状态回收/重试入口（`src/continue.js:31` 也不接受 `delivery-blocked`）；不要把面板状态当成合并结果。
3. **不要重新 `review_worker_commit`**：review 结论仍有效且已钉住 head；worker 已结束被冻结，review 工具要求 `task.status === 'running'`（`src/review.js:30`），当前也调不动。即便能调，也会再次走同一条 GitHub 投递路径，在同一个 required-checks 门禁再次失败。
4. **不要重启宿主**：状态在磁盘，重启不会把 `delivery-blocked` 变回 `awaiting-merge`，也没有启动重试。
5. **不要改命令写法**：参数无误。
6. 手工改状态 + 删 origin 的本地合并 workaround 见文末附录（**强烈不推荐**，仅留作理解状态机的参考）。

## 判定逻辑缺陷与修法建议（本轮不改代码）

1. **`src/merge.js:25` 三种原因共用一句错误文案**（状态不对 / review 未通过 / 无 worktree）。建议按条件分别报错并附 `status`、`review.approved`、`failure`、`prUrl`：`delivery-blocked && prUrl` 提示“已投递为 PR #n，请走 PR 合并”；`review-required` 提示“提交尚未通过 review”；无 `worktree` 单独报。测试：分别构造三种任务，断言错误文案互不相同且包含各自字段。
2. **GitHub origin 检查与状态分类的顺序**：不要做“origin 优先”一刀切，否则 `0258beac`（`review-required`、无 PR）会被误导去合 PR。建议先按状态分类，只对 `delivery-blocked && prUrl` 给出 PR 指引，其余仍报真实原因（这也解决缺陷 1 的文案问题）。测试：GitHub origin + `delivery-blocked`+`prUrl` 断言指向 PR；GitHub origin + `review-required` 且 `prUrl=null` 断言提示 review。
3. **`src/github.js:40-44` 把“required checks 非空且全绿”作为硬门禁**，而仓库没配 required checks 时 `gh pr checks --required` 本身 exit 1，导致“分支已推、PR 已建”之后必然 `delivery-blocked`，且错误只剩 `gh pr exited with status 1`。建议：投递前探测 required checks，为空时给出明确错误或在显式配置下放行；`gh` 失败时保留子命令与 stderr 片段。测试：空 required checks、失败 checks 两个用例，断言错误信息包含子命令与 stderr。
4. **`delivery-blocked` 是死状态**：`src/continue.js:31` 不接受它，也没有重试投递命令，一次 `gh` 失败会把已 approved 的提交永久搁置。建议增加受控重试入口（如 `/publish-worker <id>` 或允许 `continue_worker` 从 `delivery-blocked` 恢复并复用已有 PR），并记录失败步骤；另建议在面板/命令中按 PR 实际状态回收 `merged`。测试：投递失败后重试成功并复用同一 PR；PR 已合并时任务状态被回收为 `merged`。
5. **approved 后的 HEAD 变化缺少复审入口**：worker 结束前 HEAD 变化会被降级为 `review-required`（`index.js:99-101`），合并前 `src/merge.js:36-37` 也会拒绝 HEAD 不匹配，GitHub 路径用 `src/github.js:28` 的 reviewed head 推送和 `src/github.js:47` 的 `--match-head-commit` 钉住，因此不会误合未审核提交；但任务一旦进入 `delivery-blocked`，HEAD 再变化既不会自动复审也没有入口，只能等人发现。建议为该状态提供重新 review 的路径。测试：approved 后新增提交，断言本地合并拒绝且 PR 路径不会合入新提交。
6. **有 GitHub origin 时 `awaiting-merge` 永不写入，`/merge-worker` 对该类仓库整体不可用**：`index.js:103-106` 的本地分支以 `!githubOrigin` 为前提，因此 GitHub 项目的 approved 任务只会走 PR 路径；但 `src/merge.js:27` 的“GitHub 项目走 PR”提示排在状态校验之后，用户永远先看到 `No reviewed local commit is ready for merge`，而不是“该仓库走 PR”。`docs/DETAIL.md` 只写了 Local-only 与 GitHub 两种仓库，命令层没有对应提示。建议：`merge-worker` 在任何状态判定前先探测 origin，对 GitHub 项目统一回“本地合并不可用，请走 PR #n / gh pr merge”，并把这条写进 `docs/DETAIL.md` 与 router 提示词。测试：GitHub origin + approved 任务执行 `/merge-worker`，断言提示指向 PR 而非 “No reviewed local commit”。

## 附录：手工改状态的本地合并 workaround（强烈不推荐）

目的仅是说明状态机，不建议执行：需要在同一任务上同时满足 (a) 去掉 GitHub origin（否则 `src/merge.js:27` 拒绝本地合并），(b) 手工把任务 JSON 的 `status` 改为 `awaiting-merge`。风险：

- `git remote remove origin` 不可逆地改动仓库远端配置；
- 宿主随时可能用 `updateTask` 的读改写覆盖手工修改，改前必须备份任务 JSON；
- `src/merge.js:36-37` 会再次校验 worktree HEAD == `review.head` 且工作区干净，`src/merge.js:45` 会再次校验状态与 head；
- 成功后任务记录与真实交付来源（PR #n）仍不一致，面板会误导。
