# 005 界面

在 DeepSeek Harness Web 的侧栏打开「项目任务」，可以监督 Router、Worker 和分支，也可以查看、编辑记忆。任务列表在前，Git 交付在中，记忆在最下。它建立在 [001 领域模型](001-domain.md) 到 [004 配置与提示词](004-config-prompts.md) 之上。

## 三个问题

打开面板依次回答三个问题：

1. 现在有哪些 Task，各属于哪一个状态？
2. 哪个 Task 正在等人操作，卡在哪里？
3. 哪条 worker 分支可以合并或发送 PR，哪些记忆记录可以查看、编辑或删除？

## 状态筛选项

任务列表是唯一的状态分类来源。顶部有 6 个筛选项：全部，以及 5 个互斥分类；这 6 项就是面板的六类状态视图（`client.js:253`、`client.js:803-812`）。

| 筛选项 | 包含状态 | 说明 |
| --- | --- | --- |
| 全部 | 所有 Task | 只显示 scope 筛选后的总数 |
| 失败 | `failed`、`merge-conflict`、`delivery-blocked`、`interrupted`、`cancelled` | 当前代码写入 `failed`、`delivery-blocked`；其余是面板已识别的文案（`client.js:255`） |
| 进行中 | `starting`、`running`、`resuming`、`merging`、`publishing`、`awaiting-ci`、`merge-queued`，以及未归入其他分类的状态 | 默认落点（`client.js:249`、`client.js:267-273`） |
| 已合并 | `merged` | 本地或 GitHub 合并完成 |
| 待审查 | `review-required`、`awaiting-merge`、`ready`、`completed` | report 任务的 `completed` 归入「仅回答」（`client.js:256`） |
| 仅回答 | `mode=report` 且 `completed` | 只报告任务已经交付结论 |

分类顺序固定为失败、进行中、已合并、待审查、仅回答；没有任务的分类不显示标题（`client.js:253`、`client.js:822-827`）。每一行仍显示 [003 生命周期](003-lifecycle.md) 里的具体阶段，例如「等待合并」或「等待 CI」。

Git 交付没有第二套状态系统：没有打开/已合并/已关闭页签，没有状态计数，也没有搜索。分支行跟随任务列表的状态、团队、项目筛选（`client.js:614`、`client.js:828-837`）。

## 区块

面板没有页签，区块按以下顺序出现。

| 区块 | 显示什么 |
| --- | --- |
| 头部 | 标题、状态归属说明、刷新按钮 |
| 筛选 | 6 个状态筛选及计数；团队和项目下拉框缩小同一批任务 |
| 任务分组 | 每个非空分类一个标题和计数，下面是该分类的 Task 行 |
| Git 交付 | 每个带 `git.branch` 的 Task 一行；展开后显示仓库、审查、未合并事实、评论、检查、提交、改动文件和合并/发送按钮及原因 |
| 记忆 | 四类用量和调用方式、当前 profile 注入计数、分类筛选、搜索框、记录行及编辑/删除 |
| 提示 | 加载失败、打开会话失败、Git 动作错误或完成、记忆加载或编辑错误 |

加载中、空列表和筛选无结果各有独立文字。刷新按钮中止进行中的加载、清空旧错误并重新加载（`client.js:348-446`）。面板不会自动刷新（`client.js:791-875`）。

## 单条记录怎么读

### Task 行

| 部分 | 行为 |
| --- | --- |
| 阶段 | [003 生命周期](003-lifecycle.md) 的具体阶段，带状态点或 spinner；`未确认` 表示记录仍在进行中但 Worker Session 已不在（`client.js:521-527`） |
| 标题 | 标题；没有标题时显示 Task ID |
| 团队与项目 | `teamId` 和项目根 |
| 更新时间 | 存储的 `updatedAt`，缺失时用 `createdAt`，按本地时间显示 |
| ID | 16 位 Task ID |
| Router 会话 | 按 Session ID 打开 Router Session |
| Worker 会话 | 用父、子 Session ID 打开 Worker Session（`client.js:618-635`） |
| Pull request | 在新标签打开；只渲染 `https://github.com/<owner>/<repo>/pull/<number>` 形式的链接（`client.js:281-290`） |

会话按钮打不开时显示打开失败提示。没有 Worker Session 的 Task 不显示 Worker 按钮；面板没有会话打开能力时，标签显示为文本。

### Git 交付行

只有带 `git.branch` 的 Task 出现在 Git 交付区。没有 PR 的 Task 也有分支行。

| 部分 | 行为 |
| --- | --- |
| 标题与编号 | Task 标题；URL 可解析时显示 `#<n>`，否则显示 Task ID |
| 摘要 | 作者、更新时间、`分支 → 基础分支` |
| 详情 | 展开时通过 `GET /superagent-lite/git?taskId=` 读取 `base..head` 的提交和改动文件，并显示分支、基础分支、仓库、审查状态、未合并事实、评论、检查和 PR 链接（`client.js:575-613`、`client.js:649-719`） |
| 审查状态 | `审查已通过`、`审查未通过`，或 `审查记录已过期`（HEAD 在审查后移动） |
| 合并按钮 | `合并到 <基础分支>`；不可用时在 `title` 和行内提示里给出原因 |
| 发送 PR 按钮 | `发送 PR`；不可用时同样给出原因 |

已合并的分支行保留详情，但不显示操作按钮。动作执行期间显示 `处理中…`，两个按钮都禁用。动作成功后重新加载列表并显示后端完成消息；失败时显示后端错误文本，没有消息时显示 `Git 操作失败。`（`client.js:550-574`、`client.js:704-719`）。

### 合并与 PR 行为

| 条件 | 面板表现 |
| --- | --- |
| 已合并 | 两个按钮都不可用；原因 `This branch is already merged` |
| 精确 PR 已关闭 | 两个按钮都不可用；原因 `The pull request was closed; reopen it or dispatch a new task` |
| PR 冲突 | 合并不可用；原因 `The pull request has merge conflicts; resolve them before merging` |
| 同一分支已有打开的精确 PR | 发送 PR 不可用；原因 `A pull request already exists for this branch` |
| 审查未通过或 reviewed HEAD 已移动 | 合并和发送都不可用；服务端分别返回 `The review has not approved this branch` 或 `The worker branch no longer matches its reviewed commit` |
| 文件策略不是 full access | 合并和发送都不可用；返回 `Git delivery is unavailable under the current Session file policy` |
| 本地合并目标不满足 | 合并不可用；原因来自 `src/git-actions.js:181-228` 和 `src/merge.js:28-43` 的预检，例如目标分支未检出、工作区脏、已有进行中的 merge 或冲突 |

- 点击「合并到 <基础分支>」后，GitHub 项目会复用或打开该 reviewed HEAD 的 PR，再通过 `gh pr merge --merge --match-head-commit` 合并；没有 GitHub `origin` 的项目走 `/merge-worker` 的本地 `git merge --no-ff` 路径（`src/git-actions.js:464-525`、`src/github.js:115-137`）。
- 点击「发送 PR」只适用于 GitHub 项目：推送 reviewed HEAD 到 worker 分支并创建或复用 PR；PR 打开后 Task 进入 `awaiting-ci`（`src/github.js:77-113`）。
- 合并和发送都要求审查通过的 HEAD 未移动、Task 不是 report 模式、动作执行时 Session 解析为 `danger-full-access`（`src/git-actions.js:168-237`、`src/git-actions.js:566`）。
- 合并 GitHub PR 后，插件用 `git pull --ff-only origin <基础分支>` 快进项目 checkout；快进失败时动作报错，PR 已经合并的事实保留（`src/git-actions.js:504-509`）。
- 必需检查和分支保护在 GitHub 合并 PR 时执行；插件只在面板展示检查汇总，不预检检查状态（`src/git-actions.js:18-31`）。

读取面板会回写 Task 记录：`GET /superagent-lite/tasks` 会在同步 PR 或识别合并时更新 `merged`、`awaiting-ci`、`delivery-blocked` 或 `awaiting-merge`，但不修改项目文件、不推送、不合并（`src/git-actions.js:239-327`、`src/board.js:16-26`）。记忆的 GET 不写任何记录。

### 记忆行

记忆区在 Git 交付之后，从 `GET /superagent-lite/memory` 独立加载，不受任务团队/项目筛选影响（`client.js:374-396`）。

| 部分 | 行为 |
| --- | --- |
| 用量行 | **私有**：按需调用，保持极少；**公共**：按需调用，只记结论；**用户画像与环境**：每轮注入 Router 和 Worker；**团队**：仅同团队 Worker 可读。每类显示记录数（`client.js:843-846`） |
| profile 注入 | 接口返回当前注入的记录 ID、上限 6 和每条 500 字符；面板显示 `每轮注入 N/6 条最新记录，每条最多 500 字符`（`client.js:847-848`） |
| 分类筛选 | 全部加私有、公共、用户画像与环境、团队，各带计数 |
| 搜索 | 按内容、凭据引用、ID、Team、Project 或分类标签过滤（`client.js:423-429`） |
| 注入标记 | 当前在注入集合里的 profile 记录显示 `当前注入` |
| 内容 | 保存的事实；private 显示 `凭据引用: <name>` 而不是内容 |
| 团队与项目 | 只在 team 记录上显示；编辑和删除请求也带这对值 |
| ID 与时间 | 记录 UUID 和 `updatedAt` |
| 编辑 | 行内换成 textarea 和保存/取消；public、profile、team 改内容，private 改凭据引用名；team 请求带 Team 与 Project（`client.js:452-520`） |
| 删除 | 第一次点击显示「确认删除」和「取消」；确认后 POST `delete`。失败时保留行并显示后端错误 |
| 限制 | 内容 1–16,000 字符；private 凭据引用 1–128 字符并符合引用名格式（`client.js:741-745`、`src/memory-store.js:12-13`） |

记忆区有自己的加载、空列表和无匹配文字。成功的编辑或删除显示短提示并更新当前行，不重新加载任务列表。面板只在 owner 点击编辑或删除时写记忆（`client.js:463-520`）。

## 设置分组

面板没有设置分组。bundle 组成和提示词文字在 `cordis.patch.yml` 与 [004 配置与提示词](004-config-prompts.md) 列出的源文件里。

## 设计原则

1. **一套状态。** Task 分类拥有状态；Git 交付只负责分支、提交和动作，不派生也不显示第二套状态（`client.js:266`）。
2. **只回答三个问题。** 每个区块对应一个问题；不改变决定的数量或行去掉。
3. **用户动作用 GET 读取，写操作要 owner 点击。** 面板读取任务和记忆使用 GET；合并、发送 PR、编辑记忆和删除记忆都由 owner 明确点击触发。服务端在同步 PR 或识别合并时会回写 Task 记录，但不修改项目文件（`src/board.js:12-15`、`src/memory-panel.js:48-62`、`src/git-actions.js:239-327`）。
4. **一行一个动作并给出原因。** 按钮禁用时说明缺什么，用户不必翻文档才知道为什么。
5. **诚实状态。** Worker Session 不在时显示「未确认」；分类与具体阶段一致；不显示存储状态不支持的进度。
6. **链接而不复制。** 会话在对应 Session 里，审查在 GitHub 上，面板只给链接。
7. **安全目标。** 只跟随同源面板请求和 GitHub PR URL，其他协议不渲染（`client.js:281-290`、`client.js:531-549`）。
8. **显式刷新。** 面板在打开和点击刷新时加载，不轮询、不后台拉取（`client.js:348-400`）。
9. **仅 owner。** 不是安装 owner 的请求拿不到任务数据（`src/board.js:7-11`、`src/memory-panel.js:43-46`）。
