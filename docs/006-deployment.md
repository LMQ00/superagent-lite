# 006 部署

使用这份文档安装、配置、发布、升级和排障 Superagent 轻量版 bundle。它建立在 [001 领域模型](001-domain.md) 到 [005 界面](005-panel.md) 之上。

## 运行什么

Bundle 运行在一个 DeepSeek Harness Web 进程内，增加两个预设、一个 worktree 服务、路由工具、Worker 工具、Task 存储、记忆存储和面板。它不启动独立守护进程，也不开放自己的端口（`cordis.patch.yml:1-134`、`index.js:1-26`）。

| 组件 | 作用 |
| --- | --- |
| DSH Web Host | 运行插件、Session 和面板 |
| `@lmq00/superagent-lite` bundle | 提供预设、工具、HTTP 路由、Task 存储和记忆存储 |
| 记忆 | 全局/项目记忆、全局/项目 skill（项目 skill 最多 10 个）、全局知识库，以及 change worker 的原始归档和 memory 读取的会话记录 |
| 项目 skill provider | Worker 作用域的 `superagent-memory` provider 从项目 checkout 读取 `<项目根>/.dsh/skills/<skill名>/SKILL.md`，让 Git Worktree 里或非 Git 项目目录里的 Worker 和 Reviewer 看到项目 skill description；catalog 归属判断读取这些 skill 的 `author` frontmatter |
| Worktree 服务 | 为每个 Git Task 创建并保留一个 Worktree；非 Git 项目不使用 |
| GitHub CLI `gh` | 可选；只为面板的「提交 PR」动作服务；合并是本地 Git 操作，不需要账号 |
| GitHub remote | 可选；发送 PR 需要，合并不需要 |

## 前置条件

| 要求 | 值 |
| --- | --- |
| DeepSeek Harness | `>=0.2.2-rc.1 <=0.2.3-alpha.1`，即 `package.json` 的 `engines.dsh` |
| Node.js | 24.9 或更新，跟随 DSH 引擎要求 |
| Git | 支持 `git merge-tree --write-tree HEAD HEAD` 的版本 |
| GitHub CLI | 发送 PR 需要；`gh auth status --hostname github.com` 必须成功 |
| 项目 checkout | Git 项目需已检出且有分支、工作区干净；普通目录也可作为项目根，直接执行 change/report |
| 非 Git 目录 | 不需要 `.git`、分支或提交；change/report 直接在工作区执行，审查当前文件。merge、PR 和 `land` 不可用 |

### 版本矩阵与检测

Bundle 的 `engines.dsh` 是 `>=0.2.2-rc.1 <=0.2.3-alpha.1`，Host 版本不满足时插件管理器拒绝安装或启用。DSH 用 `semver.satisfies(version, range, { includePrerelease: true })` 判断这个区间：它包含 `0.2.2-rc.1` 到 `0.2.2-rc.5` 和 `0.2.3-alpha.1`，排除 `0.2.2-alpha.3`（低于下限）、`0.2.3-alpha.2`、`0.2.3` 及更高版本。不能写成 `<0.2.3`，因为 `includePrerelease` 会把它扩大成包含 `0.2.3-alpha.2`。Host 补丁则按 `@deepseek-ai/dsh-client-ui-chat` 与 `@deepseek-ai/dsh-subagent` 的 `package.json` 版本和实际文件布局分别检测，不受 bundle 的 `engines.dsh` 限制。

> 发布核查：npm 的 `@deepseek-ai/dsh@0.2.3-alpha.1` 自身不能启动。它把 `@deepseek-ai/cordis-plugin-loader` 声明为 `~1.1.0`，但 `dsh-app-boot@0.2.3-alpha.1` 静态导入 1.1.0 不导出的 `EntryValidationError`，`dsh --version` 会直接报 `does not provide an export named 'EntryValidationError'`。这是上游发布的依赖声明问题；本仓库按 alpha.1 的实际包内容验证补丁。`0.2.3-alpha.2` 已把依赖改为 `~1.2.0-alpha.1`，但不在本任务的支持区间内；在 alpha.1 上安装本 bundle 前需要自行覆盖 loader 版本，或等上游重新发布。

| 组件 | 支持版本 | 检测方式 |
| --- | --- | --- |
| Bundle | `>=0.2.2-rc.1 <=0.2.3-alpha.1` | `dsh --version`；`package.json` 的 `engines.dsh` |
| 客户端任务卡补丁 | npm `0.2.2-rc.2` / `0.2.2-rc.3` / `0.2.2-rc.4` / `0.2.2-rc.5` / `0.2.3-alpha.1`（源码 + bundle，共用一个 target）、`0.2.2-rc.1`（仅 bundle）、DSH-go 的 `0.2.2-rc.1` Host | `node scripts/dsh-client-ui-chat-agent-message-card.mjs --check` 输出匹配的版本、布局和待改文件；版本或片段不匹配时退出码 1 且不写入 |
| 子代理 promptSource 补丁 | `0.2.2-rc.2` / `0.2.2-rc.3` / `0.2.2-rc.4` / `0.2.2-rc.5`（源码 + bundle）、`0.2.2-rc.1`（仅 bundle，单独的 diff）、`0.2.3-alpha.1` 不需要补丁 | 插件启动时在进程内按已安装 `dsh-subagent` 的版本读取源码和 bundle，先逐条比对目标片段再一次性写入；片段缺失、命中多次或文件读不到时报告 `failed` 且不改任何文件。手工核对仍可运行 `patch -p1 --dry-run -d "$DSUBAGENT" < scripts/dsh-subagent-0.2.2-prompt-source.patch`（rc.1 用 `scripts/dsh-subagent-0.2.2-rc.1-prompt-source.patch`）；rc.2 到 rc.5 补丁后 `src/manager.ts` 与 `lib/types/manager.js` 各有一处 `spec.promptSource ?? { kind: 'user' }`，rc.1 的 `lib/index.js` 与 `lib/types/manager.js` 有一处 `request.promptSource ?? { kind: 'user' }`；`0.2.3-alpha.1` 的 `src/manager.ts` 已用 `createAgentMessage` 记录初始任务，插件只读检测并报告 `native` |

面板路由按 Host 的认证契约分流：`0.2.2-rc.1` 到 `0.2.2-rc.5` 的 `connection` 暴露 `requestRejection`，`admit` 在内部完成认证，插件用这个函数判断并走不需要 `connection.authentication` 的注册路径；`0.2.3-alpha.1` 移除了 `requestRejection`，`admit` 从调用方 fiber 读取 `connection.authentication`，所以五个面板路由只在注入了该服务的上下文注册（`index.js:81-89`）。两条路径都在隔离目录安装各版本真实 npm Host 启动验证：`GET /superagent-lite/tasks`、`/branches`、`/memory`、`/worker-settings` 和带 `taskId` 的 `/git` 全部返回 `200` 和 JSON，不能用单元测试模拟替代。对任意已安装版本还可以用 `DSH_INSTALL_DIR=<dsh 包目录> node --test test/host-connection.test.js` 核对它只暴露一种认证契约。

按实际内容归并：`0.2.2-rc.2` 到 `0.2.2-rc.5` 的 `@deepseek-ai/dsh-client-ui-chat` 除 `package.json` 外逐字节相同，因此共用同一个 source-and-bundle 目标；`0.2.3-alpha.1` 的 Chat 包有变化，但被补丁修改的两个源码文件和所有 bundle 片段与 rc.2–rc.5 相同，所以也归入该目标。`0.2.2-rc.1` 的 Chat 包没有 `src/`，单独走 bundle-only 目标。子代理包 `0.2.2-rc.2` 到 `0.2.2-rc.5` 除 `package.json` 外相同，共用一个源码 + bundle 补丁；`0.2.2-rc.1` 没有 `src/` 且初始请求嵌套在 `request` 下，使用单独的 bundle-only 补丁和 `src/subagent-start.js` 的 rc.1 请求形状；`0.2.3-alpha.1` 原生记录 agent 消息。区间内 `dsh-base` 的 `cordis.patch.yml` 差异只在账号、web provider、agent-team 等基础行，未触及本 bundle 挂载的 `worktrees` 服务或补丁目标，因此不调整本仓库的 `cordis.patch.yml`。

`npm install -g @deepseek-ai/dsh` 会整包替换 `dsh-subagent` 和 `dsh-client-ui-chat`，上表中的补丁随之丢失。Bundle 启动时由 `src/host-patch.js` 从运行入口解析已安装的 `@deepseek-ai/dsh`，对区间内的 npm Host 自动执行同样的检测和应用：客户端补丁仍调用自带的版本检查脚本，子代理 `promptSource` 补丁改为进程内片段比对和写入，Windows 也不需要 `patch.exe`。应用后写入 Host 日志 `superagent-lite host patch: applied ...; restart DSH to load it`。`0.2.2` Host 的 subagent 补丁要下次启动才生效，客户端补丁也要重启后才加载，所以看到该日志后再重启一次 DSH，卡片才会恢复；`0.2.3-alpha.1` 只需补客户端卡片补丁，子代理初始任务已由 Host 原生记录。只有 npm 安装会走这条自动补丁路径，也才会出现这条日志：桌面版和只读安装无法写入，插件改为在「项目任务」面板显示只读提示，见下文「桌面版与只读布局」。DSH-go 的 rootfs 保持只读，不自动修补，仍按上面两个 Host 补丁文档手动运行。

Bundle 自带 worktree 服务，不要与另一个挂载 worktree 服务的 bundle 同时启用。

## 安装

仓库没有运行时依赖，不需要 `npm install`。

```bash
git clone https://github.com/LMQ00/superagent-lite.git
cd superagent-lite
npm test
git merge-tree --write-tree HEAD HEAD >/dev/null && echo "merge-tree ok"
```

`npm test` 以 `fail 0` 结束；`merge-tree ok` 确认 Git 能力。然后安装 bundle：

1. 打开 DSH Web 的插件管理器。
2. 点「添加插件」。
3. 输入本仓库的绝对路径并安装。
4. 在插件管理器里启用这个 bundle。
5. 新建 Session，在预设里选择「Superagent 轻量版」或「Superagent 轻量版 worker」。

安装成功的判据：预设列表出现两个预设，侧栏出现「项目任务」。Bundle 会插入自己的 worktree 服务，目录 `.agents/worktrees`，`retainOnArchive: true`；新任务的 Worktree 和分支名由 `sl-<worktreeName>-<Task ID 前 12 位>` 组成（`cordis.patch.yml:1-7`、`src/worktree-tool.js:42-46`）。

## 发布

发布由 `.github/workflows/publish.yml` 执行。入口是 GitHub Actions 的 **Publish npm** → **Run workflow**，分支选 `master`，输入带 `v` 的 semver 版本号（如 `v1.0.1`）；不带 `v` 也接受，工作流统一规范化。tag 和发布提交固定用 `v` 前缀，`package.json` 的 `version` 去掉 `v`。其他分支会被第一步拒绝（`.github/workflows/publish.yml:50-56`、`.github/workflows/publish.yml:69-74`）。

| 阶段 | 行为 |
| --- | --- |
| 校验版本 | 去掉输入里的 `v` 后执行 `npm version <版本> --no-git-tag-version --allow-same-version` 写入 `package.json`（`.github/workflows/publish.yml:87-105`） |
| 测试 | `node --test test/*.test.js`。不要裸跑 `npm test` 或 `node --test`：它们会扫描 `tmp/` 下的遗留测试并失败（`.github/workflows/publish.yml:107-108`） |
| 提交与 tag | 用 `GITHUB_TOKEN` 提交 `chore(release): v<版本>`，打 annotated tag `v<版本>`；tag 已存在时停止（`.github/workflows/publish.yml:110-127`） |
| 发布 | `npm publish --access public --tag <latest 或 next>`；稳定版用 `latest`，预发布版本用 `next`。`NODE_AUTH_TOKEN` 来自仓库 Secret `NPM_TOKEN`（`.github/workflows/publish.yml:129-133`） |
| 回写 | `git push --atomic origin HEAD:master refs/tags/v<版本>`（`.github/workflows/publish.yml:135-138`） |

### 版本号

- 输入带 `v` 的 semver，例如 `v1.0.1`、`v1.1.0-rc.1`；不带 `v` 也接受。
- 常规递增：修复 `v1.0.0`→`v1.0.1`，功能 `v1.1.0`，破坏性 `v2.0.0`，预发布 `v1.1.0-rc.1`。
- 稳定版发布到 npm 的 `latest` dist-tag；预发布版本（带 `-rc.1` 等后缀）发布到 `next`。
- 不能输入 npm 上已经存在的版本；已发布过的版本不能重复发布（`.github/workflows/publish.yml:7-15`）。
- `package.json` 的 `version` 不能带 `v`；工作流写入前会剥掉，tag 和提交文案保留 `v`。
- 输入与 `package.json` 当前版本相同时，工作流跳过空提交、只打 tag；这只适合该版本还没发布成功的情况（`.github/workflows/publish.yml:121-127`）。

### GitHub 配置

| 项 | 要求 |
| --- | --- |
| Secret 名称 | `NPM_TOKEN`。位置：仓库 Settings → Secrets and variables → Actions → New repository secret（`.github/workflows/publish.yml:18-19`） |
| token 类型 | npm granular access token，scope 选 `@lmq00`，权限 `Read and write packages`，勾选 `Bypass two-factor authentication` |
| 2FA | npm 账号开启 2FA；CI 不能输入 OTP，没有 bypass 的 token 会在 publish 时因 401/2FA 失败（`.github/workflows/publish.yml:20-21`） |
| 工作流权限 | `permissions: contents: write`（`.github/workflows/publish.yml:58-59`）；Settings → Actions → General 的 Workflow permissions 允许读写 |
| 分支保护 | `master` 需允许 GitHub Actions 推送提交和 tag；否则 publish 成功后回写失败（`.github/workflows/publish.yml:22-24`） |
| 其他 Secret | 不需要；提交和 tag 用自动的 `GITHUB_TOKEN`（`.github/workflows/publish.yml:22`），不要把 token 写进仓库或提交 `.npmrc`（`.github/workflows/publish.yml:46-47`） |

### 失败语义

1. 测试失败时工作流停止，不提交、不发布。
2. publish 失败时提交和 tag 只留在 runner，不回写远端。
3. publish 成功但最后的推送被分支保护拒绝时，npm 上已有该版本；需要手动补提交/tag，或换新版本号重跑。

### 本地手动发布

```bash
git checkout master
git pull --ff-only
TAG=v1.0.1
VERSION="${TAG#v}"
npm version "$VERSION" --no-git-tag-version --allow-same-version
node --test test/*.test.js
npm login   # 浏览器或 OTP 完成 2FA
DIST_TAG=latest
[[ "$VERSION" == *-* ]] && DIST_TAG=next
npm publish --access public --tag "$DIST_TAG"
git add package.json
git commit -m "chore(release): $TAG"   # package.json 没变时跳过
git tag -a "$TAG" -m "$TAG"
git push origin master --follow-tags
```

`npm login` 用浏览器或 OTP 完成 2FA。也可用带 bypass-2FA 的 granular token：`npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"`，再执行上面的 `npm publish --access public --tag "$DIST_TAG"`；token 写在用户级 `~/.npmrc`，不要提交。npm 不直接读取 `NODE_AUTH_TOKEN`，CI 里是 setup-node 生成的 `.npmrc` 引用它。发布后核对 `npm view @lmq00/superagent-lite version dist-tags`。

## 配置

Bundle 的组成和提示词配置是 `cordis.patch.yml` 和源文件；面板「设置」保存 worker 模型和并发上限。

| 键 | 必填 | 含义 |
| --- | --- | --- |
| `worktree.directory` | 是，默认 `.agents/worktrees` | Worktree 在项目内的创建目录 |
| `worktree.namePrefix` | 是，默认 `sl-` | worktree 服务自动生成名字时的前缀；本插件为 Task 显式指定名字 |
| `worktree.retainOnArchive` | 是，默认 `true` | Session 归档后保留 worker 分支和检出 |
| Router `preset.id` | 是，`superagent-lite` | Router 预设 ID |
| Worker `preset.id` | 是，`superagent-lite-worker` | Worker 预设 ID |
| `engines.dsh` | 是，`>=0.2.2-rc.1 <=0.2.3-alpha.1` | Bundle 面向的 Host 版本区间 |
| 面板「设置」 | 否 | worker 模型（留空跟随 DSH 默认模型）与并发 worker 上限（1–16，默认 3），保存在 `~/.dsh/superagent-lite/worker-settings.json`；DSH Host 的 `maxActiveSubagents`（默认 8）是另一层共享上限，插件不改写，Host 报限额时任务保持排队 |
| Router skill 根 | 是 | Router 预设只扫描全局 skill 根（`~/.dsh/skills` 与 `~/.agents/skills`），不扫描项目 skill；Worker 预设保留项目 + 全局 skill 根（`cordis.patch.yml`） |

外部设置单独完成：

| 设置 | 用于 | 做法 |
| --- | --- | --- |
| Session 文件策略 | 合并、发送 PR、审查、删除分支 | 把 Router Session 设为 full access；动作检查 `danger-full-access` |
| GitHub remote | 发送 PR | `git remote -v` 显示一个 remote，fetch 与 push URL 指向同一个 GitHub 仓库；面板列出 remote 供选择 |
| `gh` 登录 | 发送 PR | `gh auth status --hostname github.com` |
| GitHub 分支保护与必需检查 | 在 GitHub 上合并 PR | 在 GitHub 仓库设置；插件不预检检查状态 |
| Host 补丁 | 角色消息、子代理状态通知和系统提醒的任务卡片 | npm Host 由插件启动时自动检测并补打；客户端补丁调用版本检查脚本，子代理补丁在进程内做片段替换，不需要外部 `patch` 命令。也可按 [HOST-PATCH](HOST-PATCH.md) 和 [HOST-PATCH-AGENT-MESSAGE](HOST-PATCH-AGENT-MESSAGE.md) 手动应用。客户端卡片补丁覆盖 `0.2.2-rc.2` 到 `0.2.2-rc.5` 及 `0.2.3-alpha.1`（源码 + bundle）和 `0.2.2-rc.1`（仅 bundle）与 DSH-go 的 `0.2.2-rc.1` Host；子代理 promptSource 补丁覆盖 `0.2.2-rc.1` 到 `0.2.2-rc.5`，`0.2.3-alpha.1` 由 Host 原生记录初始任务；DSH-go 不自动补；不打补丁也能运行 |

## 启停与状态

插件没有独立进程和 CLI，因此没有进程退出码。启停随 bundle 和 DSH Web 进程。

| 操作 | 做法 |
| --- | --- |
| 启动 | 启用 bundle，启动 DSH Web |
| 重载 | 禁用再启用 bundle，或重启 DSH Web |
| 停止 | 禁用 bundle，或停止 DSH Web |
| 任务状态 | 打开「项目任务」；6 个状态分组见 [005 界面](005-panel.md)，顺序由 [003 生命周期](003-lifecycle.md) 定义。也可以直接问 Router，它用 `worker_status` 查询本会话的排队、运行、已交付、已取消和失败任务 |
| 行内动作 | 未合并提供合并和提交 PR；未审查提供审查；有 worker 分支的行提供删除分支（运行中禁用）；运行中或排队中提供停止；每行提供删除任务（运行中或排队中会先停止再删除，合并或发布中禁用）。任务行可勾选后批量删除。「分支 / worktree」标签页只列本插件创建的 Worktree 和 `sl-*` 分支，分别提供删除 Worktree 与删除分支（运行中禁用）；删除成功后就地更新该标签页。失败动作显示后端错误，Task 保留已存储的生命周期状态 |
| 停止变化 | 任务被停止时，插件向 Router 注入后台 `worker-status` 通知；通知不打开新回合、不算新用户输入。停止把 Task 写成 `cancelled` 终态并保留记录，面板显示「已取消」标签；worker 被中断，并发名额立即释放，排队任务可以启动 |
| 记录位置 | `~/.dsh/superagent-lite/tasks/` 保存 Task 记录；旧版本 `tasks/cancelled/` 的排队取消墓碑仍可被 `worker_status` 查询；worker 设置在 `~/.dsh/superagent-lite/worker-settings.json`；记忆在 `~/.dsh/superagent-lite/memory/`；原始归档和 memory 读取的会话记录在 `~/.dsh/superagent-lite/task/archive/`；全局 skill 在 `~/.agents/skills/<skill名>/`；项目 skill 在 `<项目根>/.dsh/skills/<skill名>/`；Worktree 在 `<项目根>/.agents/worktrees/`，由面板「分支 / worktree」标签页单独管理 |
| 记忆 | Worker 和 Reviewer 自动注入项目 + 全局记忆；Router 只注入全局记忆；Worker、Reviewer 和 memory 角色用 `knowledge_query`（中英文分词，多词按命中关键词数排序）/ `knowledge_get` 查询全局知识；只有 memory 角色能写知识；skill 只放固定流程，知识、事实、经验、结论写知识库，项目 skill 同时最多 10 个，达到上限后 memory 拒绝新建并整次不写字段和 skill；skill 正文不注入，memory 角色通过会话里的 catalog 按名调用 `skill` 工具读取，提示词给项目 skill 已用数量与 10 个上限，并逐条列出 skill 名称和作者（`author: memory` 或 `none`），不写路径、description 或根目录；面板的「记忆系统」标签页显示记忆、全局/项目 skill 和全局知识库，并允许安装 owner 逐条删除记忆字段、memory 管理的 skill 或知识条目。项目 skill 目录会加入 `.git/info/exclude`，不弄脏项目 checkout |
| 日志 | 不写独立日志文件；插件警告进 DSH Host 日志，Task 错误还写入 `failure` 字段。桌面版和只读布局不保证落盘日志，Host 补丁的只读状态改由项目任务面板显示 |

面板 HTTP 端点的状态码：

| 码 | 含义 |
| --- | --- |
| `200` | 列表、记忆读取或删除、分支 / Worktree 读取或删除、Git 动作、任务停止/删除成功 |
| `400` | 任务 ID、JSON 请求体、项目根或分支删除目标（kind/projectRoot/branch/path）、记忆删除目标（kind/scope/field/name/id）不对 |
| `403` | 请求者不是安装 owner；其他准入拒绝使用 Host 返回的拒绝码 |
| `404` | Git 详情、任务停止/删除找不到 Task |
| `405` | 方法不被该端点接受 |
| `409` | Git 动作被拒绝或失败、分支 / Worktree 删除被拒绝、任务停止/删除被拒绝，或记忆读取/删除失败 |
| `413` | Git 动作请求体超过 4 KB |
| `415` | 动作请求体不是 `application/json` |

## 设置

1. 确认 `node --version` 满足 DSH 引擎要求，且 `git merge-tree --write-tree HEAD HEAD` 成功。
2. 安装并启用 bundle，新建「Superagent 轻量版」Session。
3. 打开目标仓库为工作目录，确认已检出分支且 `git status` 干净。
4. 需要发送 PR 时，配置一个 GitHub remote，运行 `gh auth status --hostname github.com`，并至少配置一个必需检查。
5. 需要合并或发送 PR 时，把 Router Session 设为 full access。
6. 先问一个只读问题：Router 应直接回答，不启动 Worker。
7. 再要求一个小的文件改动：面板应把审查通过的 Task 显示为「未合并」，并出现「合并」和「提交 PR」；如果审查未通过，先显示「未审查」。
8. 完成一个 change 任务：memory 角色会更新全局/项目记忆和 skill，并可能写入全局知识库；下一个 Worker 和 Reviewer 的提示词自动带上这些内容，Worker 和 Reviewer 可以用 `knowledge_query` / `knowledge_get` 读取全局知识。

## 升级

1. 备份 `~/.dsh/superagent-lite/`。
2. 等运行中的 Worker 结束。
3. 在仓库执行 `git pull --ff-only`。
4. 运行 `npm test`，确认 `fail 0`。
5. 重载或重启 DSH Web；如果升级同时重装了 DSH，启动日志出现 `superagent-lite host patch: applied ...; restart DSH to load it` 时再重启一次，让 Host 导入补好的 subagent bundle。这条日志只属于 npm 安装；桌面版和只读安装不会写补丁，而是在「项目任务」面板显示只读提示。
6. 打开「项目任务」，确认已有 Task 和分支仍在列表里。

升级不改写 Task 或记忆文件，它们留在 `~/.dsh/superagent-lite/`；全局和项目 skill 也保留在各自的 skill 目录，旧的固定名字在下次 memory 写入时补上 `author: memory`。重启时仍在运行的 Worker 可能显示「未确认」；Worker Session 可用时可以用 `continue_worker` 继续，否则需要重新派发。失联的 `starting`、`running` 或 `resuming` 超过 2 分钟没有活着的 Worker Session 时，插件启动时扫描一次，之后派发、Worker 结束、停止任务或保存设置触发的启动队列也会扫描：读 Review 记录、worker 分支和 Worktree HEAD，Review 通过且 HEAD 与 `review.head` 一致时落为 `awaiting-merge`，否则落为 `failed`，回收在 Task 锁内复核，不碰真正在跑的会话（`src/board.js:129-146`、`src/launch-queue.js:54-120`、`src/launch-queue.js:206-228`、`index.js:391-395`）。

回滚：停用 bundle，检出上一个 commit，必要时恢复备份，再重载 DSH Web。

## 桌面版与只读布局

桌面版 DSH 把 dsh 运行时和内置 npm 包放进只读的 `resources\app.asar`。插件启动时仍能解析到 `@deepseek-ai/dsh` 和 `dsh-client-ui-chat`，`--check` 也可能报告补丁可用，但写文件会被 `EACCES` 拒绝；子代理补丁以前还依赖外部 `patch`，Windows 默认没有 `patch.exe`，即使有也无法对 asar 内的文件 `chdir`。这些失败不会阻断桌面版启动，也不保证写进用户能看到的日志，所以插件现在把只读布局当作已知状态处理：

- 启动检测到解析出的 dsh 目录含 `.asar` 路径段时，不再尝试任何补丁。`/superagent-lite/tasks` 的响应带 `host: { readonly: true, dshDir }`，项目任务面板在任务列表上方显示「桌面版内置运行时只读，任务卡补丁不可用」、说明和「诊断：运行时目录 ...」。其他面板行为不变。
- 客户端任务卡补丁和子代理 `promptSource` 补丁都不会写入；派发、审查、报告和状态消息退回普通文本。任务执行、审查、合并和 PR 交付不依赖补丁，仍然可用。
- 子代理 `promptSource` 补丁在 npm 安装上已改为进程内片段替换，不再需要 `patch` 或 `patch.exe`；这一改动修好 Windows npm 安装的同类失效，但不改变桌面版 asar 只读的限制。
- 桌面版不会因为补丁失败产生可依赖的日志，因此不要按「看到日志再重启」排查；面板的只读提示和运行时目录就是诊断入口。也可以直接查看桌面版安装目录下是否存在 `resources\app.asar`，或看面板提示的路径是否包含 `app.asar`。
- 不要解包或重打 `app.asar`，也不要把改过的 Chat 包塞进 desktop profile。要让桌面版显示任务卡，需要由桌面版发行方在打包前把补丁打进内置运行时；日常使用可以改用 npm 安装的 DSH CLI/Web Host，它会走上面的自动补丁路径。

## 排障

| 现象 | 原因与修法 |
| --- | --- |
| 「项目任务」标签页只显示「无法加载任务，请重试。」，`/superagent-lite/tasks` 返回 `400` 空响应 | 正在运行的 DSH 进程仍加载修复前的插件代码：`0.2.3-alpha.1` 的 `connection.admit` 在未注入 `connection.authentication` 的请求 fiber 上抛出 `cannot get property "connection.authentication" without inject`，Host 兜底返回空 body。重启 DSH Web，让面板路由从注入了该服务的上下文注册。`0.2.2-rc.1` 到 `0.2.2-rc.5` 的 `admit` 自带认证，不需要这个服务，修复前后都应正常；这些旧版本仍报 400 时先检查插件是否升级到当前修复版本，再重启 DSH Web |
| 派发消息显示为普通对话，不是「收到任务消息」卡片 | 先看「项目任务」面板顶部是否显示「桌面版内置运行时只读」。有该提示时，DSH 从只读的 `app.asar` 运行，插件无法写入客户端任务卡补丁或子代理 `promptSource` 补丁，消息会一直是普通文本；这是桌面版的已知限制，不必反复重启，也无法通过 `patch.exe` 或手工改文件解决。没有该提示时，npm 安装通常是 DSH 升级覆盖了补丁：插件启动时会自动补打并在日志提示重启；看到提示后再重启一次 DSH。`0.2.3-alpha.1` 的子代理初始任务由 Host 原生记录，不需要该补丁。DSH-go 按 [HOST-PATCH](HOST-PATCH.md) 和 [HOST-PATCH-AGENT-MESSAGE](HOST-PATCH-AGENT-MESSAGE.md) 手动应用 |
| `Project checkout has uncommitted changes; commit or stash them before dispatching workers` | 提交或 stash Git 项目的 checkout；唯一允许的脏行是 `?? .agents/worktrees/.gitignore`。非 Git 目录不会报这条 |
| `Merge tasks require a git repository` | 当前目录不属于任何 Git 仓库；merge 只能对 Git 项目派发 |
| `Landing requires a git repository; this project is not under git` | 非 Git 项目不能推送、开 PR 或合并；去掉 `land` 后按 change 流程交付 |
| `This project is not a git repository; work directly in the project folder` | 非 Git 任务调用了 `create_worktree`；直接在工作区修改并调用 `review_worker_commit` |
| `Create the assigned project worktree before using any other tool.` | Git 项目的 Worker 在 `create_worktree` 前用了别的工具；只读的 `knowledge_query` / `knowledge_get` 除外，让它先创建或进入 Worktree |
| `This worker is frozen.` | Worker 的 subagent 已结束；用 `continue_worker` 恢复 Task，或重新派发 |
| `This worker has no matching project task` | 当前 Session 不是该 Task 的 Worker；重新派发，不要复用 Session |
| `Dispatch <id> is already being established; inspect the task board before retrying` | 同一派发对应的 Task 处于 `starting` 或 `failed`；查看「项目任务」后用新输入派发；`queued` 的同名 Task 会直接返回 |
| `The router Session is not running` | 本地合并需要 Router Session 保持运行 |
| `Git delivery is unavailable under the current Session file policy` | 把 Router Session 设为 full access |
| `This project is not a git repository; there is no branch to review, merge, publish, or delete` | 非 Git Task 没有 Git 动作；用 worker 的审查工具重新审查工作区 |
| `The merge target branch "<name>" was not found` | 在合并弹窗里选择一个存在的本地分支 |
| `The selected remote is not a single GitHub fetch/push repository` | 选择一个 fetch 和 push URL 指向同一 GitHub 仓库的 remote |
| `The worker Session is not running; open its conversation to review the commit there` | 审查动作需要活着的 Worker Session；恢复或重新派发该 Task |
| `The task is still running; stop its worker before deleting the branch` | 等 Task 结束工作、分支不再被运行中的 Worker 占用后再删除分支 |
| `The task is still running; stop its worker before deleting the worktree and branch` | 等 Task 结束工作后再从「分支 / worktree」标签页一步删除 Worktree 和分支 |
| `The worktree at <path> was removed, but the worker branch <branch> could not be deleted and still exists: ...` | 一步删除中 Worktree 已移除但分支删除失败；按错误信息处理分支占用或权限问题，再从该页「删除分支」重试 |
| `The worktree at <path> was removed, but the worker branch <branch> is still checked out in the worktree at <holder>; remove it before deleting the branch` | 一步删除中分支仍被另一个 Worktree 检出；先移除那个 Worktree 再从该页「删除分支」重试 |
| `No reviewed local commit is ready for delivery` | 先调用 `review_worker_commit` 并修完问题；合并与发送 PR 共用这条前置校验 |
| `The worker branch no longer matches its reviewed commit` | 审查后又有提交；重新审查新 HEAD |
| `The reviewer did not inspect the committed change; read the base..head diff or a changed file before deciding` | Reviewer 没有读改动；重新运行审查，让它读 `base..head` 或改动文件 |
| `The reviewer did not inspect the project files; read a file in the project folder before deciding` | 非 Git Reviewer 没有读项目文件；重新运行审查，让它先读工作区文件 |
| `Merge would conflict; the target was not changed` | 把基础分支合并进 worker 分支并重新审查；插件没有改目标 |
| `The project checkout has uncommitted changes` | 合并前提交或 stash 项目 checkout 的改动 |
| `The worker worktree has uncommitted changes; commit or remove them before deleting the branch` | 删除分支前清理 worker Worktree |
| `The worktree at <path> is not on the worker branch <branch>; remove it before deleting the branch` | 登记的工作树已切到别的分支；先移除该工作树再删除分支 |
| `The worker branch is still checked out in the worktree at <path>; remove it before deleting the branch` | 分支被其他工作树检出；先移除那个工作树再删除分支 |
| `The worker worktree at <path> still exists; remove it before deleting the branch` | `git worktree remove` 后工作树仍在；手动清理后再重试 |
| `Could not remove the worker worktree at <path>: ...` | 工作树移除失败；按错误信息处理占用或权限问题后重试 |
| `The worker is still running` | 删除时停止后 Worker 仍在运行；稍后重试停止或删除，或打开 Worker 会话检查 |
| `A merge or publication is in progress` | 等合并或发送 PR 结束后再删除任务 |
| `The task has already finished` | 停止或删除一个已经进入完成/失败等终态的 Task；刷新面板后不再显示停止按钮 |
| `The worker did not stop in time; stop the task again before deleting it` | 删除前等待 worker 离开运行态超过 10 秒；记录保留，可重试停止或删除 |
| `Task <id> is still queued; its worker has not started, so the follow-up was not delivered. Retry continue_worker after it starts.` | Task 还在排队或启动中，没有 Worker 回合可唤醒；这次 follow-up 未记录也未投递，Worker 启动后再追加 |
| `Task <id> is already merged; dispatch new work instead of resuming it` | Task 已合并或已完成；已发布的工作不再续派，新需求重新派发 |
| `The worker branch for task <id> was deleted; dispatch new work instead of resuming it` | worker 分支已被删除；重新派发任务，让新 worker 建自己的分支 |
| `The worktree recorded for task <id> is gone; dispatch new work instead of resuming it` | Task 记录的 Worktree 目录已不存在；重新派发，不要再恢复旧路径 |
| `Task <id> is <status> and can no longer be resumed; dispatch new work instead` | Task 处于 `awaiting-ci`、`publishing`、`merging`、`delivery-blocked` 等已进入交付或交付失败的状态，不再是可续派的未发布工作；等它结束或重新派发 |
| `Merging is performed by a newly dispatched merge worker; this task may only push or open a pull request.` | change worker 的 `land` 只授权推送/PR；合并请求要由 router 派发 `mode=merge` 的 merge worker |
| `merge tasks require land=true` | `mode=merge` 必须携带用户本轮对合并的明确授权；不能用缺省 `land` 启动 merge worker |
| `The base branch cannot be a merge target` | `branches` 里包含 base branch；改成待合并的 worker 分支或任务 ID |
| `Merge only a branch recorded in this task's merge targets` | merge worker 只能合并任务记录里的目标；重新派发时把目标写进 `branches` |
| `Only a task that finished its worker turn can be delivered` | Task 处于 `resuming`、`running`、`publishing`、`merging`、`failed`、`delivery-blocked` 等非交付状态；等 Worker 回合结束或刷新面板后重试 |
| `The task left its deliverable state during preparation` | 交付准备期间 Task 被续派发或状态变化；重新确认后重试，本次没有执行写操作 |
| `The review changed during delivery` | 准备期间 Review 被替换或 HEAD 移动；重新审查当前 HEAD |
| `GitHub authentication is required to publish: ...` | 运行 `gh auth login` 后重试；本地合并不需要 `gh` |
| `Report-only tasks inspect the checkout and external sources read-only and end with report_task.` | report 任务调用了写文件、提交或创建 Worktree 等工具；只用只读检查、联网检索、知识库和只读命令，并以 `report_task` 结束 |
| `Report-only tasks must leave the project checkout unchanged` | 还原 checkout 改动后再调用 `report_task` |
| `Report-only task ended without report_task` | 回合结束前必须调用 `report_task`；重新派发报告任务 |
| `Only the active worker for this task can message its router` | `message_router` 是 Worker 工具，Router 不能调用 |
| `Image "<path>" was not found` / `Image "<path>" could not be read: ...` | `images` 里的路径按当前会话目录解析；修正路径，或改用绝对路径 |
| `Image "<path>" is not a PNG, JPEG, WebP, or GIF file` | 只接受这四种格式；转换后再附带 |
| `Image messages need the Host attachment store, which is not mounted` | 当前 Host 没有挂载附件服务；恢复 `dsh-attachment-local` 后重启 |
| `Image "<path>" could not be attached: ...` | 附件解码、尺寸或写入失败；按错误信息压缩图片或检查 `~/.dsh/attachments/` 的权限 |
| `Model "<model>" does not support image input.` | 接收方模型没有声明 image 输入；换用图片模型，或不发图片 |
| `This Host accepts at most N images in one message` / `The attached images exceed this Host's N-byte message limit` | 附件服务的单条消息限制更小；减少图片或压缩后再发 |
| `The reviewer did not submit a usable verdict` | 重新运行审查；Reviewer 必须调用 `submit_review` 写「通过」或具体意见 |
| `The pull request was closed; reopen it or dispatch a new task` | 在 GitHub 重新打开 PR，或派发新任务 |
| `This branch is already merged` | 分支已合并；不需要再执行合并或发送 |
| `Pull request <number> merged, but the project checkout could not be fast-forwarded: ...` | PR 已合并但 checkout 快进失败；在项目 checkout 手动 `git pull --ff-only` |
| `The pull request could not be opened for the reviewed commit` | 检查 `gh` 登录、分支权限和 PR 状态后重试 |
| `GitHub did not report the pull request as merged` | 在 GitHub 确认 PR 状态和 `gh` 权限 |
| `Worktree created at ..., but task metadata could not be saved` | 检查 `~/.dsh/superagent-lite/tasks/` 的写入权限和磁盘空间 |
| `... output exceeded N bytes` | `git` 或 `gh` 输出超过插件上限；缩小命令范围或输出 |
