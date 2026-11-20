import { createHash, randomUUID } from 'node:crypto'
import { createTask, readTask, linkWorkerSession, updateTask } from './task-store.js'
import { buildWorkerPrompt } from './worker-prompt.js'
import { runCommand } from './process.js'
import { validateDispatchArguments } from './validation.js'

export function createDispatchTool(ctx) {
  return {
    name: 'dispatch_worker',
    description: 'Record the routing decision required for every user input before answering. Set delegate to true and start one isolated worker when the request needs files changed, commands run, a repository inspected, or code delivered; otherwise set delegate to false and give the reason. A follow-up on an existing unpublished task uses continue_worker instead. An earlier turn\'s decision never covers a new input. The full execution instructions reach only the worker.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        delegate: { type: 'boolean', description: 'true starts a worker for executable project work; false handles this turn without one.' },
        reason: { type: 'string', description: 'Required when delegate is false: why no worker is needed.' },
        title: { type: 'string', description: 'For delegate true: short task title.' },
        teamId: { type: 'string', description: 'For delegate true: project team identifier; one team owns one project.' },
        task: { type: 'string', description: 'For delegate true: complete task and acceptance criteria for the worker.' },
      },
      required: ['delegate'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          delegated: { type: 'boolean' },
          reason: { type: 'string' },
          taskId: { type: 'string' },
          workerSessionId: { type: 'string' },
          status: { type: 'string' },
          teamId: { type: 'string' },
        },
        required: ['delegated'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.delegated
          ? `Worker started for ${value.teamId}; task ${value.taskId}; session ${value.workerSessionId}.`
          : `No worker started: ${value.reason}`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('dispatch_worker requires an Agent session')
      const decision = validateDispatchArguments(args)
      if (!decision.delegate) return { delegated: false, reason: decision.reason }
      const { title, teamId, task: taskText } = decision

      const id = createHash('sha256').update(JSON.stringify([exec.agent.id, exec.callId])).digest('hex').slice(0, 16)
      const existing = await readTask(id)
      if (existing) {
        if (existing.parentSessionId !== exec.agent.session.id) throw new Error('Task id is already owned by another Session')
        if (existing.status !== 'starting' && existing.status !== 'failed') {
          return { delegated: true, taskId: id, workerSessionId: existing.workerSessionId, status: existing.status, teamId: existing.teamId }
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
          agentPreset: 'superagent-lite-worker',
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
      return { delegated: true, taskId: id, workerSessionId, status, teamId }
    },
  }
}
