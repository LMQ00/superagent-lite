# 009 一键落地

本页记录 2026-11-23 对 `superagent-lite` 待落地 worker 分支的只读清点，以及 `scripts/land-all.sh` 的合并计划。脚本只做本地 `git merge --no-ff` 和 `npm test`，不推送；任务状态仍由 Git 面板收尾。

## 清点

基准：`master` = `81fafb1`。审查以 `~/.dsh/superagent-lite/tasks/*.json` 中 `review.approved === true` 且 `review.head` 等于分支 tip 为准；差异取 `git diff --shortstat master...<branch>`。

| 分支 | tip | 审查 | 相对 master 差异 | 与 master 的冲突 |
| --- | --- | --- | --- | --- |
| `sl-superagent-lite-29dba2f52e41a385` | `45a83b8` | 通过，head 一致 | 4 文件，+181/−106 | 无 |
| `sl-superagent-lite-2bda3c5136a71f55` | `20dc289` | 通过，head 一致 | 13 文件，+312/−50 | 无 |
| `sl-superagent-lite-516e3115f332d9a0` | `0f75a85` | 通过，head 一致 | 7 文件，+175/−58 | 无 |
| `sl-superagent-lite-669e70474a677c9d` | `a879a16` | 通过，head 一致 | 15 文件，+142/−86 | 无 |
| `sl-superagent-lite-9c2ee9c780815a4b` | `e74f9b3` | 通过，head 一致 | 17 文件，+211/−139 | 无 |
| `sl-superagent-lite-b8414db2a34e4430` | `ef79e9b` | 通过，head 一致 | 12 文件，+276/−68 | `docs/002-rules.md`、`docs/005-panel.md` |
| `sl-superagent-lite-f270c878c58d623f` | `54d3c91` | 通过，head 一致 | 27 文件，+1046/−45 | 无 |
| `sl-superagent-lite-ccbae7a6e4948549` | `abead8b` | 通过，已合入 | 无 | 已在 master |

清点时没有“已审但 head 已前移”或“审查记录缺失”的分支。`b8414db` 的 base 是 `46729f2`，master 已包含 `abead8b` 对同一批 docs 的改动，所以它是唯一与 master 直接冲突的分支。`800bfdc7` 是交付本脚本的分支，清点时 tip 与 master 相同；提交后按常规流程审查、合入，脚本会把它当作未列入顺序的附加分支处理。

## 彼此冲突

- 代码/测试冲突：`516` ↔ `f270`（`src/continue.js`、`test/continue.test.js`）；`669` ↔ `f270`（`src/dispatch.js`、`src/validation.js`、`cordis.patch.yml`、`test/host.test.js`、`test/report-only.test.js`）；`b841` ↔ `f270`（`src/continue.js`、`src/git-actions.js`）；`9c` ↔ `f270`（`index.js`）。`2b` ↔ `9c` 的 `test/memory-extractor.test.js` 是双方各自新增测试，脚本可自动保留。
- 文档冲突：`b841` 与 master、`29`、`2b`、`9c`（`docs/002`、`005`），与 `669`（`002`、`005`、`007`），与 `516`（`002`、`003`、`005`、`007`）；`516` 与 `669`（`docs/001`、`002`、`004`）、与 `f270`（`002`、`004`）；`9c` 与 `29`（`005`）、`2b`（README、`docs/001`、`002`、`003`、`004`、`007`）、`669`（`001`）；`f270` 与 `2b`、`9c`（`007`）。
- 两两无冲突：`29`–`2b`、`29`–`516`、`29`–`669`、`29`–`f270`、`2b`–`516`、`2b`–`669`、`516`–`9c`。

这些文档冲突大多是并行分支改写同一段说明，不是“双方纯新增”，无法在不丢语义的前提下自动合并。所以不存在一条零人工、全自动的顺序；脚本的目标是先把能干净合入的合掉，在第一个需要人工判断的冲突处停下。

## 合并顺序

| 顺序 | 分支 | 内容 | 预期 |
| --- | --- | --- | --- |
| 1 | `29dba2f` | 项目任务/记忆标签页与滚动 | 与 master、`2b`、`516` 无冲突 |
| 2 | `2bda3c5` | memory 写入去重与纠错 | 与 `29` 无冲突 |
| 3 | `516e311` | 续派发精简简报 | 与 `29`、`2b` 无冲突 |
| 4 | `669e704` | router answer 模式 | 与 `516` 在 `docs/001`、`002`、`004` 冲突；预计第一次停下 |
| 5 | `9c2ee9c` | memory 读取 worker 对话、删除按钮 | 与 `29`、`2b`、`669` 的 docs 冲突；`2b` 的测试新增可自动解 |
| 6 | `b8414db` | publish/merge 共用前置校验 | 与 master 及 `516`、`669` 的 docs 冲突 |
| 7 | `f270c87` | push/merge 的显式 land 授权 | 与 `516`、`669`、`b841` 有代码冲突，与 `2b`、`9c` 有 docs 冲突；放最后，避免阻断前三条无冲突合并 |

第 4 条停下是预期行为。手工解决后重跑脚本，已合入的分支会跳过，从下一条继续；后续 `9c`、`b841`、`f270` 仍可能各停一次。

## 用法

```bash
# 任意检出都可只读预览
scripts/land-all.sh --dry-run

# 在 master 检出、工作区干净时执行
scripts/land-all.sh
```

- 脚本只合入 `review.approved === true` 且 `review.head` 等于当前 tip 的分支；审查缺失或 head 前移的分支跳过并列在末尾，提示先重审。
- 每条分支用 `git merge --no-ff`（`merge.conflictStyle=diff3`）。文本冲突只有在 base 段为空、双方都是新增时，才把双方内容都保留；双方各自新增同一路径（add/add）及其它冲突立即停下并保留 merge 现场，打印冲突文件和建议。
- 每次合并（包括自动解冲突后）运行 `npm test`，失败即停并打印失败用例。
- 冲突停下后：手工编辑冲突文件 → `git add <文件>` → `git commit --no-edit` → `npm test` → 重跑脚本。脚本是幂等的，已合入分支自动跳过。
- 实际执行前，本脚本所在分支必须先按常规流程合入 master（或在 master 检出中放一份脚本）；否则 master 上还没有这个命令。

## 完成后

脚本打印新的 master HEAD 和本次合入的任务。任务记录不会自动改成 `merged`：刷新 Git 面板，面板按“worker HEAD 是否已进入 master”推导状态，应显示“已完成”；若仍显示“未合并”，用面板的合并动作补齐记录，再删除 worker 分支。脚本不推送；需要远端时再按正常发布流程处理。

## 风险

- 自动解冲突只覆盖“双方纯新增”；它保留的是文本，不保证文档语义连贯，合并后仍需人工审查。
- `npm test` 通过只说明现有测试不回归，不能证明审查时的意图没有在并发合并中丢失。
- 顺序基于清点时的分支和冲突；若分支 tip 或审查记录变化，脚本会按新事实跳过或停下，不会硬合旧审查。
- 本地合并会直接改写 master。建议先 `--dry-run`，并确认 master 工作区干净。
