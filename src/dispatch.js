import { createHash, randomUUID } from 'node:crypto'
import { createTask, readTask, linkWorkerSession, updateTask } from './task-store.js'
import { buildWorkerPrompt } from './worker-prompt.js'
import { runCommand } from './process.js'
import { validateDispatchArguments } from './validation.js'

export function createDispatchTool(ctx) {
  return {
    name: 'dispatch_worker',
    description: 'Start one isolated worker for a project task. Choose the team responsible for the project; the full execution instructions are sent only to that worker.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: 'Short task title.' },
        teamId: { type: 'string', description: 'Project team identifier; one team owns one project.' },
        task: { type: 'string', description: 'Complete task and acceptance criteria for the worker.' },
      },
      required: ['title', 'teamId', 'task'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          taskId: { type: 'string' },
          workerSessionId: { type: 'string' },
          status: { type: 'string' },
          teamId: { type: 'string' },
        },
        required: ['taskId', 'workerSessionId', 'status', 'teamId'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Worker started for ${value.teamId}; task ${value.taskId}; session ${value.workerSessionId}.`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('dispatch_worker requires an Agent session')
      const { title, teamId, task: taskText } = validateDispatchArguments(args)

      const id = createHash('sha256').update(JSON.stringify([exec.agent.id, exec.callId])).digest('hex').slice(0, 16)
      const existing = await readTask(id)
      if (existing) {
        if (existing.parentSessionId !== exec.agent.session.id) throw new Error('Task id is already owned by another Session')
        if (existing.status !== 'starting' && existing.status !== 'failed') {
          return { taskId: id, workerSessionId: existing.workerSessionId, status: existing.status, teamId: existing.teamId }
        }
        throw new Error(`Dispatch ${id} is already being established; inspect the task board before retrying`)
      }

      const cwd = ctx.workingDirectory.get(exec.agent.session)
      const projectRoot = await runCommand(ctx, ['rev-parse', '--show-toplevel'], cwd, exec.signal)
      const baseCommit = await runCommand(ctx, ['rev-parse', '--verify', 'HEAD^{commit}'], projectRoot, exec.signal)
      const baseBranch = await runCommand(ctx, ['symbolic-ref', '--quiet', '--short', 'HEAD'], projectRoot, exec.signal)
      const dirty = await runCommand(ctx, ['status', '--porcelain', '--untracked-files=all'], projectRoot, exec.signal)
      if (dirty.split('\n').some(line => line && line !== '?? .agents/worktrees/.gitignore')) throw new Error('Project checkout has uncommitted changes; commit or stash them before dispatching workers')
      const workerSessionId = randomUUID()
      const taskRecord = {
        id,
        title,
        teamId,
        task: taskText,
        parentSessionId: exec.agent.session.id,
        projectRoot,
        baseCommit,
        baseBranch,
        workerSessionId,
        status: 'starting',
        createdAt: new Date().toISOString(),
      }
      if (!await createTask(taskRecord)) throw new Error(`Task ${id} already exists`)

      try {
        await linkWorkerSession(id, workerSessionId)
        await ctx.subagents.startActivation({
          provider: 'spawn',
          parent: exec.agent,
          cwd: projectRoot,
          name: `sl-${id}`,
          childId: workerSessionId,
          label: `${teamId}: ${title}`,
          agentPreset: 'standard',
          prompt: [{ type: 'text', text: buildWorkerPrompt({ title, teamId, task: taskText, baseBranch }) }],
          signal: exec.signal,
          delivery: 'parent',
          maxDepth: ctx.subagents.resolveMaxDepth(),
        })
      } catch (error) {
        await updateTask(id, {
          status: 'failed',
          failure: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString(),
        })
        throw error
      }

      const { status } = await readTask(id)
      return { taskId: id, workerSessionId, status, teamId }
    },
  }
}
