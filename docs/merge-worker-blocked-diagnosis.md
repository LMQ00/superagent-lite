# `/merge-worker` 报 “No reviewed local commit is ready for merge” 诊断

基线：`8d572fa360c075fed73e564b766a5248db0bdbf9`（master）。本文件只记录诊断结论与证据，未改代码、未执行合并。

## 结论

**不能合**。`/merge-worker` 报错是判定逻辑按设计工作，不是状态丢失、宿主重启、插件副本或 HEAD 前移。

- 判定只读磁盘任务记录：`~/.dsh/superagent-lite/tasks/<id>.json` 的 `status`、`review`、`worktree` 三个字段；不依赖内存，也不按 worktree 分支登记（`src/merge.js:25`，`src/task-store.js:34,81-101`）。
- `status === 'awaiting-merge'` 只在“无 GitHub origin 的本地仓库”收尾时写入（`index.js:103-106`）。本项目 origin 是 `https://github.com/LMQ00/superagent-lite.git`，`githubOrigin()` 命中后走 PR 路径，`awaiting-merge` 永远不会出现。
- 两个已 approved 的任务实际状态是 `delivery-blocked`：PR 已创建并推送成功，但 `deliverGithub` 在 CI 门禁处失败——仓库没有配置任何 required checks，`gh pr checks --required` 以 exit 1（`no checks reported`）退出，被统一包成 `gh pr exited with status 1` 写入 `failure`（`src/github.js:40-44`，`index.js:114-116`）。
- 即使把状态改成 `awaiting-merge`，`src/merge.js:27` 仍会因 GitHub origin 拒绝本地合并，提示 `GitHub projects must merge through a pull request`。所以 `/merge-worker` 对本项目不可用是设计使然。

## 判定链（代码位置）

1. 命令入口：`src/merge.js:14` 校验 16 位 task ID（用户输入 `7ca2bbe11a9d6cec` 合法，参数没问题）。
2. `src/merge.js:16` 校验 `task.parentSessionId === agent.id`。用户的报错是后续第 25 行的文案，说明这一步已通过——即当前 router Session 就是任务记录的 `session-990801bc-19f1-4e4a-b4c9-d8d6eb35a3c7`，归属没错。
3. `src/merge.js:17-19` 校验文件策略 `danger-full-access`。
4. **关键**：`src/merge.js:25` 要求 `status === 'awaiting-merge' && review.approved && worktree` 三者同时成立，否则统一抛 `No reviewed local commit is ready for merge`（三个条件共用一条错误文案）。
5. `review.approved` 的写入时机：`src/review.js:53`，review 通过后写 `{ head, reviewerSessionId, approved }`。
6. `status === 'awaiting-merge'` 的写入时机：`index.js:98-106`，worker 结束且 review 通过、HEAD 仍等于 `review.head`、**且 `githubOrigin` 为 undefined** 时。
7. 有 GitHub origin 时改走 `index.js:108-116`：先 `publishing`，再 `deliverGithub`（`src/github.js:22-51`），失败写 `delivery-blocked`。
8. `src/continue.js:31` 只允许从 `awaiting-merge`、`review-required`、`failed` 恢复；`delivery-blocked` 不在其中，**没有续跑/重试入口**。

## 现场证据

任务记录（与用户报告一致）：

| 任务 | status | review.head | 失败信息 | PR |
| --- | --- | --- | --- | --- |
| `7ca2bbe11a9d6cec` | `delivery-blocked` | `aaad3e0ae56d41920bc933fb995b3b6d96195a38`（approved） | `gh pr exited with status 1` | #4 OPEN |
| `b81eddab113e99cb` | `delivery-blocked` | `9ccc191d2f24f3ecea0139d096dc5657f939d425`（approved） | `gh pr exited with status 1` | #2 OPEN |
| `0c6e6374369b8933` | `delivery-blocked` | `14a5979…`（approved） | `gh pr exited with status 1` | #3 OPEN |
| `df729be001a6c1a5` | `delivery-blocked` | `d9539f4…`（approved） | `gh pr exited with status 1` | #5 OPEN |
| `0258beac07ecaa15` | `review-required` | `71c9fc4…`（approved=false） | — | 无 |
| `fe8473029c270882` | `review-required` | 无 review | 无 | 无 |

注意：用户认为“两条 INCOMPLETE”，实际磁盘记录里另外两条 approved 的任务也是 `delivery-blocked`，三条同因（`0c6e6374`、`7ca2bbe1`、`b81edda`、`df729be0` 共四条全部卡在同一门禁）。

Git 侧（review 结果未失效）：

```
worktree HEAD        aaad3e0… / 9ccc191…   == review.head        # HEAD 未前移
worktree status      （空）                 # 干净，未被新提交/未提交改动破坏
git ls-remote origin sl-superagent-lite-*   # 两个 head 都已推到远端
git merge-tree --write-tree master <head>   # 四个分支均 exit 0（无冲突）
master HEAD 8d572fa，无 MERGE_HEAD，工作区干净
```

GitHub 侧（证明 PR 已建成、失败点在 CI 门禁）：

```
gh pr view 4 …  -> OPEN, MERGEABLE, CLEAN, headRefOid=aaad3e0…
gh pr view 2 …  -> OPEN, MERGEABLE, CLEAN, headRefOid=9ccc191…
gh pr checks 4 --required --json bucket  -> "no checks reported on the … branch", exit 1
gh pr checks 2 --required --json bucket  -> "no checks reported on the … branch", exit 1
gh api repos/LMQ00/superagent-lite/branches/master/protection -> 404 Branch not protected
gh api repos/LMQ00/superagent-lite/rulesets -> []
无 .github/workflows 目录
```

即仓库没有 required checks：`gh pr checks 4 --required --watch` 立即以 exit 1 结束（无 checks 可等），`src/github.js:42` 的 `checks.length === 0` 分支从未执行；异常被 `src/process.js:14` 包成 `gh pr exited with status 1`，用户只看到这一句。

## 逐项排除故障假设

| 假设 | 结论 | 证据 |
| --- | --- | --- |
| 宿主重启/重载导致状态丢失 | 排除 | 任务状态在磁盘 `~/.dsh/superagent-lite/tasks/*.json`；重启不会清空。router Session 目录 `session-990801bc-…` 的锁与事件文件仍在追加（`session.lock` 创建于 10:54，`session.v4.jsonl.zstd` 13:41 仍在写），归属校验也通过了。 |
| review 登记路径与当前插件实例不一致 | 排除 | 只有一个数据根 `~/.dsh/superagent-lite`（`src/task-store.js:34`，`homedir()` 推导）；记录中 `review` 与 `worktree` 齐全。 |
| review 通过后 HEAD 前移 | 排除 | 两个 worktree 的 HEAD 精确等于 `review.head`，且工作区干净；若前移，`index.js:99-101` 会写回 `review-required` 而不是 `delivery-blocked`。 |
| 插件从已安装副本加载、状态写到别处 | 排除 | `~/.dsh/profiles/web/package.json` 用 `link:/home/LMQ/work/superagent-lite/` 引入，`node_modules/@local/superagent-lite` 是指向该目录的符号链接；且数据根由 homedir 决定，与插件副本位置无关。 |
| 命令参数不对 | 排除 | `7ca2bbe11a9d6cec` 是合法 16 位 ID，且后续归属、策略校验均通过；错误发生在状态判定。 |
| 任务状态不是 `awaiting-merge`（真实原因） | 成立 | 记录为 `delivery-blocked`，因 `gh pr checks --required` 在无 required checks 的仓库上失败。 |

## 用户下一步（最短路径）

1. **走已开好的 PR**（最短，不改任何状态）：PR #4、#2 已是 `MERGEABLE/CLEAN`，直接
   `gh pr merge 4 --repo LMQ00/superagent-lite --squash`、`gh pr merge 2 --repo LMQ00/superagent-lite --squash`
   （#3、#5 同理）。仓库无分支保护、无 required checks，不需要 `--admin`。
2. **不要重新 `review_worker_commit`**：review 结果仍有效（approved 且 HEAD 未变）；worker 结束已被冻结，review 工具要求 `task.status === 'running'`（`src/review.js:30`），现在也调不动。重新 review 只会再次进入同一条 GitHub 投递路径，在同一个门禁再失败一次。
3. **不要重启宿主**：状态在磁盘，重启不改变 `delivery-blocked`，且不会自动重试投递。
4. 若坚持要“本地合并”语义（不推荐）：当前代码没有支持路径。需要同时（a）去掉 GitHub origin，（b）手工把任务 JSON 的 `status` 改为 `awaiting-merge`（`/merge-worker` 只认这个状态，且 `src/merge.js:27` 会拒绝仍带 GitHub origin 的项目），之后 `/merge-worker` 才能通过 `merge-tree` 预检并合并。这是绕过产品状态机的 hack，会让面板状态与真实历史不一致。

## 判定逻辑缺陷与修法建议（本轮不改代码）

1. **错误文案把三种原因合并成一句**：`src/merge.js:25` 把“状态不对 / review 未通过 / 无 worktree”压成 `No reviewed local commit is ready for merge`，用户无法判断是没 review 还是已投递失败。建议按条件分别报错，并附上 `status`、`review.approved`、`failure`、`prUrl`；对 GitHub 项目直接提示“已投递为 PR #n，请走 PR 合并”。
2. **`src/merge.js:27` 的 GitHub 拒绝分支实际不可达**：`awaiting-merge` 只在 `!githubOrigin` 时写入，所以该分支平时永远走不到；把 origin 检查前移到状态检查之前，才能给出正确指引。
3. **CI 门禁与仓库配置不匹配**：`src/github.js:40-44` 要求 required checks 非空且全部 pass，但仓库没有 CI 配置时 `gh pr checks --required` 本身就 exit 1，导致“PR 建好、分支推好”之后必然 `delivery-blocked`，且错误只剩 `gh pr exited with status 1`。建议：投递前先探测 required checks，为空时给出明确错误（或在显式配置下允许空 checks 通过）；`gh` 失败时保留子命令与 stderr 片段，而不是只留 `args[0]`。
4. **`delivery-blocked` 是死状态**：`src/continue.js:31` 不接受它，也没有“重试投递”命令；一次瞬时的 `gh` 失败会把已 approved 的提交永久搁置。建议增加受控重试入口（例如 `/publish-worker <id>` 或允许 `continue_worker` 从 `delivery-blocked` 恢复并复用已有 PR），并记录失败步骤。
