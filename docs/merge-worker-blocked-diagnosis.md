# `/merge-worker` 报 “No reviewed local commit is ready for merge” 诊断

基线：`8d572fa360c075fed73e564b766a5248db0bdbf9`（master）。范围：只诊断，未改代码、未执行合并。命令输入为 16 位任务 ID（`7ca2bbe11a9d6cec` 等），参数校验本身通过。

## 结论（先回答）

- **不能通过 `/merge-worker` 合并**：该命令只接受 `status === 'awaiting-merge'` 的任务；本项目有 GitHub origin，任务收尾走 PR 发布路径，状态停在 `delivery-blocked`，因此四条都过不了 `src/merge.js:25`。
- **但用户问的两条已 approved 的提交仍可合入**：它们已由 Host 推送并创建 PR（#4、#2，均 `OPEN` / `MERGEABLE` / `CLEAN`，headRefOid 精确等于 `review.head`），最短路径是合并 PR，而不是 `/merge-worker`。
- **另有两条（`0258beac`、`fe847302`）本身 review 未通过**（`approved=false` / 没有 review 记录），落在 `review-required`，“暂可预期不合”成立。
- 报错原因**不是**状态丢失、宿主重启、插件副本加载、HEAD 前移或命令参数错误；是 GitHub 投递在 CI 门禁处失败，任务被写成 `delivery-blocked`。
- 任务目录里还有两条记录（`0c6e6374`、`df729be0`）同样卡在同一门禁，但不在用户给出的四条里，仅作为“系统性门禁”旁证列出。

## “reviewed local commit is ready for merge” 判定依赖什么

判定只读**磁盘任务记录** `~/.dsh/superagent-lite/tasks/<id>.json`，不依赖内存，也不按 worktree 分支登记（`src/task-store.js:34,81-101` 以 `homedir()/.dsh/superagent-lite` 为数据根，原子写 JSON）。

| 字段 | 写入点 | 读取点 / 含义 |
| --- | --- | --- |
| `review = { head, reviewerSessionId, approved }` | `src/review.js:53`（review 子代理返回结构化结论且 HEAD 未变时） | `src/merge.js:25` 只要求 `review.approved`；`src/merge.js:36-37` 再校验 worktree HEAD 与 `review.head` 相等 |
| `status = 'awaiting-merge'` | **唯一写入点** `index.js:105`：worker 结束、review approved、HEAD 未变、且 `githubOrigin` 为 undefined | `src/merge.js:25` 的门槛；`src/merge.js:45` 合并准备期再校验一次 |
| `status = 'delivery-blocked'` | `index.js:115`（GitHub 投递抛错）、`src/merge.js:51`（本地 merge 命令失败） | 终止态；`src/continue.js:31` 不接受它 |
| `worktree = { path, branch }` | `src/worktree-tool.js` / dispatch 时创建 | `src/merge.js:25` 要求存在 |

全仓检索 `awaiting-merge` 的结果：写入仅 `index.js:105`（另 `test/host.test.js:113` 为测试手工写入）；`src/merge.js:25,45`、`src/continue.js:31` 只读。因此**在当前代码路径下**，有 GitHub origin 的项目不会产生 `awaiting-merge`，只会依次经过 `publishing` → `awaiting-ci` → `delivery-blocked`（或成功时的 `merge-queued`/`merged`）。

## 现场证据

### 用户四条任务的原始字段

```
{"id":"7ca2bbe11a9d6cec","status":"delivery-blocked","review":{"head":"aaad3e0ae56d41920bc933fb995b3b6d96195a38","approved":true},"stopReason":"completed","failure":"gh pr exited with status 1","prUrl":"…/pull/4","worktree":{"branch":"sl-superagent-lite-7ca2bbe11a9d6cec"}}
{"id":"b81eddab113e99cb","status":"delivery-blocked","review":{"head":"9ccc191d2f24f3ecea0139d096dc5657f939d425","approved":true},"stopReason":"completed","failure":"gh pr exited with status 1","prUrl":"…/pull/2","worktree":{"branch":"sl-superagent-lite-b81eddab113e99cb"}}
{"id":"0258beac07ecaa15","status":"review-required","review":{"head":"71c9fc4e14aa0b3ef7b85584b2cfb419926c0ff3","approved":false},"stopReason":"completed","failure":null,"prUrl":null}
{"id":"fe8473029c270882","status":"review-required","review":null,"stopReason":"completed","failure":null,"prUrl":null}
```

### 旁证：另两条同因记录（不在用户四条内）

```
{"id":"0c6e6374369b8933","status":"delivery-blocked","review":{"head":"14a59798979ab694939eee9f7af5fbdb47237330","approved":true},"failure":"gh pr exited with status 1","prUrl":"…/pull/3"}
{"id":"df729be001a6c1a5","status":"delivery-blocked","review":{"head":"d9539f40023ed2038da1a462377fd48235941251","approved":true},"failure":"gh pr exited with status 1","prUrl":"…/pull/5"}
```

### Git 证据（reviewed commit 未失效、无 HEAD 前移、worktree 干净）

| 任务 | worktree HEAD | review.head | 相等 | dirty 行数 | 对应 PR | PR headRefOid |
| --- | --- | --- | --- | --- | --- | --- |
| `7ca2bbe11a9d6cec` | `aaad3e0…` | `aaad3e0…` | 是 | 0 | #4 | `aaad3e0…` |
| `b81eddab113e99cb` | `9ccc191…` | `9ccc191…` | 是 | 0 | #2 | `9ccc191…` |
| `0c6e6374369b8933` | `14a5979…` | `14a5979…` | 是 | 0 | #3 | `14a5979…` |
| `df729be001a6c1a5` | `d9539f4…` | `d9539f4…` | 是 | 0 | #5 | `d9539f4…` |

（`…` 为上一列完整 SHA 的缩写；四组均为同一字符串逐字相等。）

其他：远端分支已推送（`git ls-remote --heads origin 'sl-superagent-lite-*'` 返回同样的四个 head）；`git merge-tree --write-tree master <head>` 四个分支均 exit 0；master 当前 `8d572fa`，无 `MERGE_HEAD`，工作区干净。

### GitHub 证据（PR 已建成，失败点在 required checks）

```
gh pr view 4 … -> OPEN, MERGEABLE, CLEAN, headRefOid=aaad3e0…
gh pr view 2 … -> OPEN, MERGEABLE, CLEAN, headRefOid=9ccc191…
gh pr checks 4 --repo … --required --json bucket -> "no checks reported on the 'sl-superagent-lite-7ca2bbe11a9d6cec' branch", exit 1
gh pr checks 2 … --required --json bucket        -> "no checks reported on the '…b81eddab113e99cb' branch", exit 1
gh pr checks 4 … --required --watch              -> 同上，立即 exit 1（无 checks 可等）
gh api repos/LMQ00/superagent-lite/branches/master/protection -> 404 Branch not protected
gh api repos/LMQ00/superagent-lite/rulesets -> []
无 .github/workflows
```

## 失败链路

1. `githubOrigin()` 命中 `origin=https://github.com/LMQ00/superagent-lite.git`（`src/github.js:9-20`），`index.js:103-107` 的本地合并分支被跳过。
2. `index.js:112` 写 `publishing`，调用 `deliverGithub`（`src/github.js:22`）。
3. 推送分支、`gh pr create` 成功（PR #4/#2 等已存在），`src/github.js:35` 写 `awaiting-ci` + `prUrl`。
4. `src/github.js:40` 执行 `gh pr checks … --required --watch`；仓库没有 required checks，`gh` 以 exit 1 返回。
5. `src/process.js:14` 把任何 `gh pr …` 失败统一包成 `gh pr exited with status 1`（只保留 `args[0]`）。
6. `index.js:114-116` 捕获后写 `status='delivery-blocked'`、`failure='gh pr exited with status 1'`，`prUrl` 保留。
7. 用户执行 `/merge-worker`：`src/merge.js:25` 看到 `status !== 'awaiting-merge'`，抛 `No reviewed local commit is ready for merge`。

## 逐项排除故障假设

| 假设 | 结论 | 证据 |
| --- | --- | --- |
| 宿主重启/重载导致状态丢失 | 排除 | 状态在磁盘；router Session 目录 `~/.dsh/sessions/--home-LMQ-work-superagent-lite--/session-990801bc-…` 的 `session.lock` 自 10:54 存在、事件文件 13:41 仍在追加，与任务 `parentSessionId` 一致；且 `src/merge.js:16` 的归属校验已通过（否则报的是另一句）。 |
| review 登记路径与插件实例不一致 | 排除 | 只有单一数据根 `~/.dsh/superagent-lite`（`src/task-store.js:34`）；记录中 `review`/`worktree` 齐全。 |
| review 后 HEAD 前移 | 排除 | 四条记录的 worktree HEAD 与 `review.head` 逐字相等（见上表）；若前移，`index.js:99-101` 会写 `review-required`，不会出现 `delivery-blocked`。 |
| 插件从已安装副本加载、状态写到别处 | 排除 | `~/.dsh/profiles/web/package.json` 用 `link:/home/LMQ/work/superagent-lite/`，`node_modules/@local/superagent-lite` 是指向该目录的符号链接；数据根由 `homedir()` 决定，与插件副本位置无关。 |
| 命令参数不对 | 排除 | ID 为合法 16 位十六进制，`src/merge.js:14` 通过，且后续归属/文件策略校验通过。 |
| 任务不是 `awaiting-merge`（真实原因） | 成立 | 四条记录中两条为 `delivery-blocked`，两条为 `review-required`；`delivery-blocked` 由 GitHub 投递在无 required checks 的仓库上失败产生。 |

## 用户下一步（最短路径）

1. **直接合并已审核的 PR**（推荐，已验证 head 一致）：
   `gh pr merge 4 --repo LMQ00/superagent-lite --squash`、
   `gh pr merge 2 --repo LMQ00/superagent-lite --squash`。
   仓库无分支保护、无 required checks，不需要 `--admin`；PR head 与 `review.head` 相等，合并的就是 reviewed commit。
2. **不要重新 `review_worker_commit`**：review 结论仍有效且 HEAD 未变；worker 已结束被冻结，review 工具要求 `task.status === 'running'`（`src/review.js:30`），当前也调不动。即便能调，重新 review 只会再次走同一条 GitHub 投递路径，在同一个 required-checks 门禁再次失败。
3. **不要重启宿主**：状态在磁盘，重启不会把 `delivery-blocked` 变回 `awaiting-merge`，也不会自动重试投递。
4. **不要改命令写法**：参数无误，问题不在命令。
5. 若坚持要“本地 `/merge-worker` 合并”语义（不推荐，绕过状态机）：需要在同一任务上同时满足 (a) 去掉 GitHub origin（否则 `src/merge.js:27` 拒绝）、(b) 把任务 JSON 的 `status` 手工改为 `awaiting-merge`。`src/continue.js:31` 不接受 `delivery-blocked`，所以没有产品内的正规路径；手工改会导致面板状态与真实交付记录不一致。

## 判定逻辑缺陷与修法建议（本轮不改代码）

1. **`src/merge.js:25` 三种原因共用一句错误文案**（状态不对 / review 未通过 / 无 worktree），用户无法分辨。建议按条件分别报错，并附 `status`、`review.approved`、`failure`、`prUrl`；GitHub 项目直接提示“已投递为 PR #n，请走 PR 合并”。建议测试：分别构造三种不满足条件的任务，断言错误文案区分。
2. **origin 检查与状态检查的顺序**：`src/merge.js:27` 的“GitHub 项目走 PR”目前排在状态校验之后，正常路径下先被第 25 行拦掉，提示具有误导性。建议先探测 origin 再判状态；至少让 `delivery-blocked` 的错误文案带上 `prUrl` 与 `failure`。建议测试：GitHub origin + `delivery-blocked` 任务，断言提示指向 PR。
3. **`src/github.js:40-44` 把“required checks 非空且全绿”作为硬门禁**，而仓库没有 required checks 时 `gh pr checks --required` 本身 exit 1，导致“分支已推、PR 已建”之后必然 `delivery-blocked`，且只留 `gh pr exited with status 1`。建议：投递前探测 required checks，为空时给出明确错误或在显式配置下放行；`gh` 失败时保留子命令与 stderr 片段。建议测试：空 required checks、失败 checks 两个用例。
4. **`delivery-blocked` 是死状态**：`src/continue.js:31` 不接受它，也没有重试投递命令，一次 `gh` 失败会把已 approved 的提交永久搁置。建议增加受控重试入口（如 `/publish-worker <id>` 或允许 `continue_worker` 从 `delivery-blocked` 恢复并复用已有 PR），并记录失败步骤。建议测试：投递失败后重试成功、复用同一 PR。
5. **approved 后 HEAD 前移的状态处置**：合并前 `src/merge.js:36-37` 会重新校验 worktree HEAD 与 `review.head` 相等，GitHub 路径也在 `src/github.js:28` 推送 reviewed head、`src/github.js:47` 用 `--match-head-commit` 钉住，因此不会把未审核提交合入；但缺少“已 approved 且已投递、HEAD 又变化”时的显式降级/复审路径，只能等人发现。建议测试：approved 后新增提交，断言本地合并拒绝、PR 路径不误合。
