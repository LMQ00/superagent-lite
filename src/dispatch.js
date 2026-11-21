import { createHash, randomUUID } from 'node:crypto'
import { createTask, readTask, linkWorkerSession, updateTask } from './task-store.js'
import { buildWorkerPrompt } from './worker-prompt.js'
import { runCommand } from './process.js'
import { validateDispatchArguments } from './validation.js'

export function createDispatchTool(ctx) {
  return {
    name: 'dispatch_worker',
    description: 'Record this input\'s routing decision before answering; earlier turns never count. Set delegate=true to start one isolated worker when the request needs files changed, commands run, a repository inspected, or code delivered. Set mode=report when the input only asks for a diagnosis, analysis, lookup, or read-only inspection and must not change code; omit mode for work that changes project files. Use delegate=false with a reason when no project work is needed. Decide from the input alone; do not inspect the repository. Pass the request and stated acceptance criteria; never add a plan or requirements. Use continue_worker only when an unpublished task already owns the same deliverable and goal and this input just adds to or corrects it. A different business goal needs its own worker even if it looks related, and even if it touches files a running worker is changing; worktrees keep the edits separate and merge refuses conflicts. Execution instructions reach only the worker.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        delegate: { type: 'boolean', description: 'true starts a worker; false answers this turn without one.' },
        reason: { type: 'string', description: 'Required when delegate is false: why no worker is needed.' },
        title: { type: 'string', description: 'For delegate true: short task title.' },
        teamId: { type: 'string', description: 'For delegate true: the team that owns the project; one team owns one project.' },
        task: { type: 'string', description: 'For delegate true: the user\'s request and any acceptance criteria they stated; do not add a plan or requirements.' },
        mode: { type: 'string', enum: ['change', 'report'], description: 'For delegate true: report when the input asks only for a diagnosis, analysis, lookup, or read-only inspection and must not change code; omit for a change task.' },
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
      const { title, teamId, task: taskText, mode } = decision

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
        mode,
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
          prompt: [{ type: 'text', text: buildWorkerPrompt({ title, teamId, task: taskText, baseBranch, mode }) }],
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
