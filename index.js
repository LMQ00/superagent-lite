import { taskForSession, updateTask } from './src/task-store.js'
import { createWorktreeTool } from './src/worktree-tool.js'
import { createBoardHandler } from './src/board.js'
import { createReviewTool, worktreeHead } from './src/review.js'
import { deliverGithub, githubOrigin } from './src/github.js'
import { archiveWorkerTurn, createMemoryTool, createExtractTool, refreshProfile, registerProfileContext } from './src/memory.js'

export const inject = ['subagents', 'tools', 'worktrees', 'subprocess', 'agents', 'sandboxPolicy', 'workingDirectory', 'systemPrompt']

export async function apply(ctx) {
  await refreshProfile().catch(error => ctx.logger.warn(`superagent-lite profile: ${error.message}`))
  ctx.inject(['webServer', 'connection'], web => {
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/superagent-lite/tasks',
      handler: createBoardHandler(web.connection, ctx.agents),
    }))
  })
  const workers = new Map()
  const jobs = new Set()
  const track = job => {
    const tracked = job.catch(error => { ctx.logger.warn(String(error)) })
    jobs.add(tracked)
    void tracked.finally(() => jobs.delete(tracked))
  }
  const lifetime = new AbortController()

  ctx.on('agent/created', async ({ agent }) => {
    if (agent.session.header.origin !== 'subagent') return
    const task = await taskForSession(undefined, agent.id)
    if (!task || task.parentSessionId !== agent.session.header.parentSession) return
    const active = ['starting', 'resuming', 'running'].includes(task.status)
    if (task.status === 'starting' || task.status === 'resuming') await updateTask(task.id, { status: 'running' })
    const state = { frozen: !active, path: task.worktree?.path }
    const guard = agent.ctx.tools.guard(({ name }) => {
      if (state.frozen) return 'This worker is frozen.'
      if (state.path !== ctx.workingDirectory.get(agent.session) && name !== 'create_worktree') return 'Create the assigned project worktree before using any other tool.'
    })
    const checkout = agent.ctx.tools.register(createWorktreeTool(ctx, agent, task.id, path => { state.path = path }), {
      when: () => !state.frozen,
    })
    const review = agent.ctx.tools.register(createReviewTool(ctx, agent, task.id), {
      when: () => !state.frozen && state.path === ctx.workingDirectory.get(agent.session),
    })
    const caller = { role: 'worker', teamId: task.teamId, projectRoot: task.projectRoot }
    const canUseMemory = candidate => candidate === agent && !state.frozen && state.path === ctx.workingDirectory.get(agent.session)
    const memory = agent.ctx.tools.register(createMemoryTool(caller, canUseMemory), { when: ({ agent: candidate }) => canUseMemory(candidate) })
    const extract = agent.ctx.tools.register(createExtractTool(ctx, agent, caller, canUseMemory), { when: ({ agent: candidate }) => canUseMemory(candidate) })
    const profile = !state.frozen ? registerProfileContext(agent.ctx) : undefined
    const reviewPrompt = agent.ctx.systemPrompt.context({
      name: 'superagent-lite-review',
      order: 171,
      text: () => 'Commit every change, then call review_worker_commit. Fix all reported issues and repeat until it approves. Never push or merge; delivery happens outside your Session.',
    })
    workers.set(agent.id, { state, session: agent.session, dispose: () => { reviewPrompt(); profile?.(); extract(); memory(); review(); checkout(); guard() } })
  })

  ctx.on('agent/disposed', ({ agent }) => {
    workers.get(agent.id)?.dispose()
    workers.delete(agent.id)
  })

  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end' && !lifetime.signal.aborted && workers.get(session.id)?.session === session) {
      track(archiveWorkerTurn(session, event))
    }
  })

  ctx.on('subagent/end', (info) => {
    const worker = workers.get(info.id)
    if (worker) worker.state.frozen = true
    if (lifetime.signal.aborted) return
    track((async () => {
      const task = await taskForSession(undefined, info.id)
      if (!task || task.parentSessionId !== info.parentSessionId || task.status !== 'running') return
      const publish = changes => updateTask(task.id, changes)
      const stopped = { stopReason: info.stopReason, finishedAt: new Date().toISOString() }
      if (info.stopReason !== 'completed' || !task.worktree) {
        await publish({ ...stopped, status: 'failed' })
        return
      }
      if (task.review?.approved !== true) {
        await publish({ ...stopped, status: 'review-required' })
        return
      }
      const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(15 * 60_000)])
      try {
        if (await worktreeHead(ctx, task, signal) !== task.review.head) {
          await publish({ ...stopped, status: 'review-required' })
          return
        }
        const origin = await githubOrigin(ctx, task.projectRoot, signal)
        if (!origin) {
          await publish({ ...stopped, status: 'awaiting-merge' })
          return
        }
        const parent = ctx.agents.get(task.parentSessionId)
        if (!parent || ctx.sandboxPolicy.resolve({ session: parent.session }).mode !== 'danger-full-access') {
          throw new Error('GitHub publication is unavailable under the router Session file policy')
        }
        await publish({ ...stopped, status: 'publishing' })
        await deliverGithub(ctx, task, origin, signal, publish)
      } catch (error) {
        await publish({ ...stopped, status: 'delivery-blocked', failure: error.message })
      }
    })())
  })

  ctx.effect(() => async () => {
    lifetime.abort()
    for (const worker of workers.values()) worker.dispose()
    workers.clear()
    await Promise.allSettled(jobs)
  }, 'superagent-lite: worker lifecycle and delivery')
}
