import { taskForSession, updateTask } from './src/task-store.js'
import { createWorktreeTool } from './src/worktree-tool.js'
import { createBoardHandler, createGitActionHandler } from './src/board.js'
import { createReviewTool, createReviewResultTool, worktreeHead } from './src/review.js'
import { createGitManager } from './src/git-actions.js'
import { archiveWorkerTurn, createMemoryTool, createExtractTool, originFor, refreshProfile, registerProfileContext, runMemoryExtraction } from './src/memory.js'
import { createMemoryPanelHandler } from './src/memory-panel.js'
import { createDispatchGuard } from './src/turn-guard.js'
import { createMessageRouterTool } from './src/message-router.js'
import { createReportTool } from './src/report-tool.js'
import { claimHelper, registerReadOnlyGuard } from './src/helper-guard.js'

export const inject = ['subagents', 'tools', 'worktrees', 'subprocess', 'agents', 'agentPresets', 'sandboxPolicy', 'workingDirectory', 'systemPrompt']

export async function apply(ctx) {
  await refreshProfile().catch(error => ctx.logger.warn(`superagent-lite profile: ${error.message}`))
  const gitManager = createGitManager(ctx)
  ctx.inject(['webServer', 'connection'], web => {
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/superagent-lite/tasks',
      handler: createBoardHandler(web.connection, ctx.agents, undefined, gitManager),
    }))
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/superagent-lite/git',
      handler: createGitActionHandler(web.connection, gitManager),
    }))
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/superagent-lite/memory',
      handler: createMemoryPanelHandler(web.connection),
    }))
  })
  const dispatchGuard = createDispatchGuard(ctx)
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
    const helper = claimHelper(agent.session.header.parentSession)
    if (helper) {
      registerReadOnlyGuard(agent, helper.scope)
      if (helper.scope) agent.ctx.tools.register(createReviewResultTool(agent), { when: () => true })
      return
    }
    const task = await taskForSession(undefined, agent.id)
    if (!task || task.parentSessionId !== agent.session.header.parentSession) return
    const active = ['starting', 'resuming', 'running'].includes(task.status)
    if (task.status === 'starting' || task.status === 'resuming') await updateTask(task.id, { status: 'running' })
    const state = { frozen: !active, path: task.worktree?.path }
    const reportOnly = task.mode === 'report'
    const inCheckout = () => state.path === ctx.workingDirectory.get(agent.session)
    const inspectingProject = () => state.path === undefined && ctx.workingDirectory.get(agent.session) === task.projectRoot
    const inspectionTools = new Set(['read', 'glob', 'grep', 'read_image', 'bash', 'todo_write'])
    const guard = agent.ctx.tools.guard(({ name }) => {
      if (state.frozen) return 'This worker is frozen.'
      if (reportOnly) {
        if (name === 'report_task' || (inspectingProject() && inspectionTools.has(name))) return
        return 'Report-only tasks inspect the project checkout read-only and end with report_task.'
      }
      if (name === 'create_worktree' || inCheckout()) return
      return 'Create the assigned project worktree before using any other tool.'
    })
    const checkout = agent.ctx.tools.register(createWorktreeTool(ctx, agent, task.id, path => { state.path = path }), {
      when: () => !state.frozen && !reportOnly,
    })
    const review = agent.ctx.tools.register(createReviewTool(ctx, agent, task.id), {
      when: () => !state.frozen && !reportOnly && inCheckout(),
    })
    const caller = { role: 'worker', teamId: task.teamId, projectRoot: task.projectRoot }
    const canUseMemory = candidate => candidate === agent && !state.frozen && inCheckout()
    let memoryAttempted = false
    const memory = agent.ctx.tools.register(createMemoryTool(caller, canUseMemory), { when: ({ agent: candidate }) => canUseMemory(candidate) })
    const extract = agent.ctx.tools.register(createExtractTool(ctx, agent, caller, canUseMemory, () => { memoryAttempted = true }), { when: ({ agent: candidate }) => canUseMemory(candidate) })
    const message = agent.ctx.tools.register(createMessageRouterTool(ctx, agent, task.id, async (text, exec) => {
      if (memoryAttempted || task.mode !== 'change' || !inCheckout()) return undefined
      memoryAttempted = true
      try {
        return await runMemoryExtraction(ctx, agent, caller, text, originFor(exec), exec.signal)
      } catch (error) {
        ctx.logger.warn(`superagent-lite memory extraction: ${error instanceof Error ? error.message : String(error)}`)
        return undefined
      }
    }), { when: ({ agent: candidate }) => canUseMemory(candidate) })
    const report = agent.ctx.tools.register(createReportTool(ctx, agent, task.id, () => !state.frozen, () => { state.frozen = true }), {
      when: () => reportOnly && !state.frozen,
    })
    const profile = !state.frozen ? registerProfileContext(agent.ctx) : undefined
    workers.set(agent.id, { state, session: agent.session, dispose: () => { profile?.(); report(); message(); extract(); memory(); review(); checkout(); guard() } })
  })

  ctx.on('agent/disposed', ({ agent }) => {
    workers.get(agent.id)?.dispose()
    workers.delete(agent.id)
    dispatchGuard.dispose(agent.session.id)
  })

  // DSH dispatches agent/status as a scoped event with a single { agent, status }
  // payload, and the loop announces idle only after the turn/end append returns.
  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'idle' && !lifetime.signal.aborted) dispatchGuard.onIdle(agent.session.id)
  })

  ctx.on('session/event', (session, event) => {
    dispatchGuard.onEvent(session, event)
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
      if (task.mode === 'report') {
        await publish({ ...stopped, status: 'failed', failure: 'Report-only task ended without report_task' })
        return
      }
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
        await publish({ ...stopped, status: 'awaiting-merge' })
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
