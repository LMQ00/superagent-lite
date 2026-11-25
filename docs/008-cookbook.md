# 008 手册

这份手册给 Worker 增加一个只读工具 `read_task`，让 Worker 能确认自己 Task 的标题、Team、Project、基础分支和状态。它用到 [001 领域模型](001-domain.md) 的 Task 与 Worker Session，[002 规则与权限](002-rules.md) 的工具准入，[003 生命周期](003-lifecycle.md) 的 Worker 阶段，以及 [007 架构](007-architecture.md) 的 Host 入口、工具注册和依赖规则。

## 映射

| 概念 | 这里对应什么 |
| --- | --- |
| Task | 工具只读当前 Task 记录，不写状态 |
| Worker Session | 工具在 `index.js` 为该 Task 注册，并用闭包里的 `agent` 校验调用者 |
| Worktree | 可用性沿用 `activeWorker`：Worker 必须先进入 Worktree，且未冻结 |
| Review / Reviewer | Reviewer 继承 Worker 工具集，但 helper 守卫只放行审查白名单；`read_task` 不在白名单内 |
| Panel | 不新增端点，面板不感知这个工具 |
| 工具命名 | `read_task`，小写下划线，与现有工具命名一致 |

## 1. 写工具工厂

写到 `src/read-task.js`。工厂接收 Worker agent、Task ID 和可替换的读取函数；默认读取 `taskForSession`。

```js
import { taskForSession } from './task-store.js'

export function createReadTaskTool(agent, taskId, read = taskForSession) {
  return {
    name: 'read_task',
    description: 'Read the Task assigned to this worker: title, team, project, base branch and status.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          teamId: { type: 'string' },
          projectRoot: { type: 'string' },
          baseBranch: { type: 'string' },
          status: { type: 'string' },
        },
        required: ['id', 'title', 'teamId', 'projectRoot', 'baseBranch', 'status'],
      },
      render: (_args, value) => [{ type: 'text', text: `${value.id}: ${value.status}` }],
    },
    async execute(_args, exec) {
      if (exec.agent !== agent) throw new Error('This tool belongs to another worker')
      const task = await read(taskId, agent.id)
      if (!task || task.status !== 'running') throw new Error('This worker has no running task')
      return {
        id: task.id,
        title: task.title,
        teamId: task.teamId,
        projectRoot: task.projectRoot,
        baseBranch: task.baseBranch,
        status: task.status,
      }
    },
  }
}
```

- **身份从闭包来。** `agent` 和 `taskId` 在注册时绑定，不从模型参数读取；`exec.agent !== agent` 拒绝其他 Session。
- **状态门槛与现有工具一致。** 只允许 `running`，与 `create_worktree`、`review_worker_commit` 的 Task 状态检查一致（`src/worktree-tool.js:25-26`、`src/review.js:44-45`）。
- **输出只含公开字段。** 不返回需求全文、Review findings 或失败原因；Task 记录里这些字段不进入返回值。
- **不写记录。** 工具只调用 `taskForSession` 读取，不调用 `updateTask`。

## 2. 在 Worker Session 上注册

改 `index.js`。文件顶部加入 import：

```js
import { createReadTaskTool } from './src/read-task.js'
```

在 `activeWorker` 定义之后、消息工具注册之前加入：

```js
const readTask = agent.ctx.tools.register(createReadTaskTool(agent, task.id), {
  when: ({ agent: candidate }) => activeWorker(candidate),
})
```

把 `readTask` 加进 `workers.set` 的 dispose 列表，与现有工具一起释放（`index.js:211-214`）。

- **`when` 用 `activeWorker`。** 它要求调用者就是该 Worker、未冻结、工作目录在 Worktree（`index.js:184`）。因此工具在 `create_worktree` 前不可用，冻结后也不可用。
- **注册位置在 `agent/created` 内。** 该回调已经完成 Task 归属核对；不要把工具注册到 `router.js`。
- **不要另建全局工具。** 工具只能看到闭包绑定的那个 Task，避免 `read_task` 变成跨 Task 读取入口。

## 3. 注册与构建入口

| 事项 | 做法 |
| --- | --- |
| 源码位置 | `src/read-task.js`，`package.json` 的 `files` 已包含整个 `src` |
| 导出 | 不需要新增 `package.json` export；这是 bundle 内部模块 |
| 捆绑配置 | `cordis.patch.yml` 不改；没有新的工具行或预设 |
| 重启 | 重载 bundle 或重启 DSH Web；运行中的 Worker 不会自动获得新工具 |
| Reviewer | 不改 helper 白名单；Reviewer 仍只能用 `structured_output`、`read`、`read_image`、`glob`、`grep`、`bash`、`pwsh`（`src/helper-guard.js:23`） |

## 4. 测试

写到 `test/read-task.test.js`。

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReadTaskTool } from '../src/read-task.js'

const agent = { id: 'worker-1' }
const task = {
  id: 'a'.repeat(16), title: 'Change', teamId: 'core',
  projectRoot: '/repo', baseBranch: 'main', status: 'running',
  task: 'requirements', review: { findings: 'internal' },
}

test('returns only public task fields to its own running worker', async () => {
  const tool = createReadTaskTool(agent, task.id, async () => task)
  const value = await tool.execute({}, { agent })
  assert.deepEqual(value, {
    id: task.id, title: 'Change', teamId: 'core',
    projectRoot: '/repo', baseBranch: 'main', status: 'running',
  })
})

test('refuses another agent, a settled task and a missing task', async () => {
  const tool = createReadTaskTool(agent, task.id, async () => task)
  await assert.rejects(tool.execute({}, { agent: { id: 'other' } }), /another worker/)

  const settled = createReadTaskTool(agent, task.id, async () => ({ ...task, status: 'awaiting-merge' }))
  await assert.rejects(settled.execute({}, { agent }), /no running task/)

  const missing = createReadTaskTool(agent, task.id, async () => undefined)
  await assert.rejects(missing.execute({}, { agent }), /no running task/)
})
```

至少覆盖以下几条：

1. 自己的、状态为 `running` 的 Task 返回公开字段。
2. 其他 agent 被拒绝。
3. 非 `running` 的 Task 被拒绝。
4. Task 不存在时被拒绝。
5. 返回值不含需求全文和 Review 内容。

运行单文件测试：

```bash
node --test test/read-task.test.js
```

看到 `pass 2`、`fail 0` 后，再运行完整测试：

```bash
npm test
```

完整测试以 `fail 0` 结束才算接通。

## 5. 检查清单

1. `src/read-task.js` 只读 Task，不写记录。
2. `index.js` 在 `agent/created` 内注册，`when` 使用 `activeWorker`。
3. `readTask` 已加入 dispose 列表。
4. 没有新增包导出、bundle 配置或 helper 白名单。
5. 测试覆盖身份、状态、缺失 Task 和字段范围。
6. 重载 bundle 后，在 change 任务的 Worktree 内调用 `read_task`，返回当前 Task 的公开字段。
