import { resolve } from 'node:path'
import { readTask, taskForSession, updateTask } from './src/task-store.js'
import { stopWorker } from './src/worker-stop.js'
import { interruptWorker } from './src/worker-control.js'
import { checkLandingCommand, forgetLanding, initLanding, landingState } from './src/landing.js'
import { createWorktreeTool } from './src/worktree-tool.js'
import { createBoardHandler, createGitActionHandler } from './src/board.js'
import { createReviewTool, createReviewResultTool, worktreeHead } from './src/review.js'
import { createMergeTool } from './src/merge-tool.js'
import { createGitManager } from './src/git-actions.js'
import { createDispatchGuard } from './src/turn-guard.js'
import { createMessageRouterTool } from './src/message-router.js'
import { createReportTool } from './src/report-tool.js'
import { createSettingsPanelHandler } from './src/settings-panel.js'
import { createMemoryPanelHandler } from './src/memory-panel.js'
import { createBranchesPanelHandler } from './src/branches-panel.js'
import { createWorkerSkillCatalogGuard } from './src/skill-catalog.js'
import { pumpWorkers, reclaimStaleTasks } from './src/launch-queue.js'
import { claimHelper, forgetHelper, registerReadOnlyGuard, registerReviewGuard } from './src/helper-guard.js'
import { reconcileHostPatches } from './src/host-patch.js'
import {
  archiveWorkerTurn, createKnowledgeGetTool, createKnowledgeQueryTool, createKnowledgeWriteTool,
  memoryAuthoredSkillNames, registerMemoryContext, registerProjectSkillProvider, runMemoryExtraction,
} from './src/memory.js'

export const inject = ['subagents', 'tools', 'worktrees', 'subprocess', 'agents', 'agentPresets', 'sandboxPolicy', 'workingDirectory', 'systemPrompt']

// Cordis reuses one context when it reloads a fiber (a config update), so a
// context counts as applied only until the previous instance tears down.
// Re-applying a still-active context must not install a second copy.
const applied = new WeakSet()

export async function apply(ctx) {
  if (applied.has(ctx)) return
  applied.add(ctx)
  const hostPatch = await reconcileHostPatches(ctx)
  const catalogGuard = createWorkerSkillCatalogGuard(ctx, {
    authoredSkills: async agent => {
      const parent = agent.session?.header?.parentSession
      const task = await taskForSession(undefined, agent.id)
        ?? (parent === undefined ? undefined : await taskForSession(undefined, parent))
      return memoryAuthoredSkillNames(task?.projectRoot)
    },
  })
  ctx.on('agent/pre-step', catalogGuard.preStep, { prepend: true })
  const gitManager = createGitManager(ctx)
  const registerPanels = web => {
    const connection = web.connection
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/superagent-lite/tasks',
      handler: createBoardHandler(connection, ctx.agents, undefined, gitManager, undefined,
        (taskId, options) => stopWorker(ctx, taskId, options), hostPatch),
    }))
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/superagent-lite/git',
      handler: createGitActionHandler(connection, gitManager),
    }))
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/superagent-lite/worker-settings',
      handler: createSettingsPanelHandler(connection, {
        catalog: async () => (ctx.get?.('sessionController') ?? ctx.sessionController)?.modelCatalog?.(),
        onChange: () => pumpWorkers(ctx).catch(error => {
          ctx.logger.warn(`superagent-lite worker queue: ${error instanceof Error ? error.message : String(error)}`)
        }),
      }),
    }))
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/superagent-lite/memory',
      handler: createMemoryPanelHandler(connection),
    }))
    web.effect(() => web.webServer.register({
      kind: 'exact', path: '/superagent-lite/branches',
      handler: createBranchesPanelHandler(connection, {
        list: signal => gitManager.branches(signal),
        removeWorktree: (target, signal) => gitManager.removeWorktree(target, signal),
        removeBranch: (target, signal) => gitManager.removeBranch(target, signal),
      }),
    }))
  }
  // Older Hosts authenticate inside `connection.admit` itself; newer Hosts read
  // `connection.authentication` from the calling fiber, so their route handlers
  // must be registered from a context that injected that service too.
  ctx.inject(['webServer', 'connection'], web => {
    if (typeof web.connection.requestRejection === 'function') registerPanels(web)
  })
  ctx.inject(['webServer', 'connection', 'connection.authentication'], web => {
    if (typeof web.connection.requestRejection !== 'function') registerPanels(web)
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

  // A plugin reload disposes the previous instance's registrations but leaves
  // its agents alive, so activation must be replayable: `apply` activates every
  // live agent, a session event recovers one it missed, and an agent whose
  // marker tool is still installed is not registered twice.
  const activating = new Map()
  const markers = new Map()
  const skipped = new Set()
  const visible = (agent, name) => typeof agent.ctx?.tools?.get === 'function' &&
    agent.ctx.tools.get(name, agent) !== undefined
  const registered = agent => {
    if (skipped.has(agent.id)) return true
    const marker = markers.get(agent.id)
    if (marker === undefined) return false
    // A registration can disappear without this instance seeing agent/disposed,
    // so confirm the marker tool is still installed.
    return typeof agent.ctx?.tools?.get !== 'function' || visible(agent, marker)
  }

  const activateAgent = async agent => {
    const parentSession = agent.session.header.parentSession
    // A worker has a Task linked to its Session; a helper does not, and its
    // one-shot expectation was claimed at creation, so the descriptor cached
    // by claimHelper keeps it recognized after a reload.
    const task = await taskForSession(undefined, agent.id)
    if (!task || task.parentSessionId !== parentSession) {
      const helper = claimHelper(parentSession, agent.id)
      if (!helper) {
        skipped.add(agent.id)
        return
      }
      const marker = helper.kind === 'memory' ? 'knowledge_write' : 'submit_review'
      // A live helper from the previous plugin instance keeps its tools.
      if (visible(agent, marker)) {
        markers.set(agent.id, marker)
        return
      }
      if (helper.scope) {
        registerReviewGuard(agent, helper.scope)
        agent.ctx.tools.register(createReviewResultTool(agent), { when: () => true })
      } else {
        registerReadOnlyGuard(agent)
      }
      if (agent.ctx.tools.register) {
        const projectRoot = helper.projectRoot
          ?? (await taskForSession(undefined, parentSession))?.projectRoot
        agent.ctx.tools.register(createKnowledgeQueryTool(), { when: () => true })
        agent.ctx.tools.register(createKnowledgeGetTool(), { when: () => true })
        if (helper.kind === 'memory') {
          agent.ctx.tools.register(createKnowledgeWriteTool(), { when: () => true })
        }
        if (projectRoot) {
          try {
            registerProjectSkillProvider(agent.ctx, projectRoot)
          } catch (error) {
            ctx.logger.warn(`superagent-lite project skill: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
      markers.set(agent.id, marker)
      return
    }
    // Re-registering a worker whose tools were dropped starts from a clean
    // slate instead of leaving stale disposers in the tracked entry.
    workers.get(agent.id)?.dispose()
    workers.delete(agent.id)
    let current = task
    if (task.status === 'starting' || task.status === 'resuming') {
      // A stop can win the race against this event; never resurrect it to running.
      try {
        current = await updateTask(task.id, latest =>
          latest.status === 'starting' || latest.status === 'resuming' ? { status: 'running' } : {})
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        skipped.add(agent.id)
        interruptWorker(ctx, agent.id)
        return
      }
    }
    if (current.status === 'cancelled') {
      skipped.add(agent.id)
      interruptWorker(ctx, agent.id)
      return
    }
    if (!landingState(task.id)) initLanding(task)
    const active = ['starting', 'resuming', 'running'].includes(current.status)
    const reportOnly = task.mode === 'report'
    const mergeMode = task.mode === 'merge'
    const state = { frozen: !active, path: task.git === false && !reportOnly ? task.projectRoot : task.worktree?.path }
    const projectSkill = (() => {
      try {
        return registerProjectSkillProvider(agent.ctx, task.projectRoot)
      } catch (error) {
        ctx.logger.warn(`superagent-lite project skill: ${error instanceof Error ? error.message : String(error)}`)
        return undefined
      }
    })()
    const memory = !state.frozen
      ? await registerMemoryContext(agent.ctx, task.projectRoot).catch(error => {
        ctx.logger.warn(`superagent-lite memory context: ${error instanceof Error ? error.message : String(error)}`)
        return undefined
      })
      : undefined
    const inCheckout = () => state.path === ctx.workingDirectory.get(agent.session)
    const inspectingProject = () => state.path === undefined && ctx.workingDirectory.get(agent.session) === task.projectRoot
    const inspectionTools = new Set(['read', 'glob', 'grep', 'read_image', 'bash', 'pwsh', 'todo_write', 'skill'])
    // Knowledge reads touch nothing in the checkout, so a worker may query them
    // before create_worktree; knowledge_write stays behind the normal boundary.
    // message_router is also allowed there so a worker can report BLOCKED when
    // creating its worktree fails.
    const knowledgeReadTools = new Set(['knowledge_query', 'knowledge_get'])
    const preWorktreeTools = new Set([...knowledgeReadTools, 'message_router'])
    // External lookup reads nothing in the checkout, so a report-only task may
    // use it from anywhere while the project writes stay refused.
    const externalReadTools = new Set([
      'read_page', 'web_fetch', 'web_search', 'x_search',
      'job_output', 'job_list', 'knowledge_query', 'knowledge_get',
    ])
    const landingDenial = input => {
      if (typeof input?.command !== 'string') return undefined
      const sessionCwd = ctx.workingDirectory.get(agent.session)
      const workdir = typeof input.workdir === 'string' && typeof sessionCwd === 'string'
        ? resolve(sessionCwd, input.workdir)
        : sessionCwd
      return checkLandingCommand(input.command, landingState(task.id), workdir)
    }
    const guard = agent.ctx.tools.guard(({ name, arguments: input }) => {
      if (state.frozen) return 'This worker is frozen.'
      if (reportOnly) {
        if (name === 'bash' || name === 'pwsh') {
          const denial = landingDenial(input)
          if (denial) return denial
        }
        if (name === 'report_task' || externalReadTools.has(name) ||
            (inspectingProject() && inspectionTools.has(name))) return
        return 'Report-only tasks inspect the checkout and external sources read-only and end with report_task.'
      }
      if (name !== 'create_worktree' && !preWorktreeTools.has(name) && !inCheckout()) {
        return 'Create the assigned project worktree before using any other tool.'
      }
      if (name === 'bash' || name === 'pwsh') {
        const denial = landingDenial(input)
        if (denial) return denial
      }
      return
    })
    const checkout = agent.ctx.tools.register(createWorktreeTool(ctx, agent, task.id, path => { state.path = path }), {
      when: () => !state.frozen && !reportOnly && task.git !== false,
    })
    const merge = agent.ctx.tools.register(createMergeTool(ctx, agent, task.id), {
      when: ({ agent: candidate }) => candidate === agent && !state.frozen && mergeMode,
    })
    const review = agent.ctx.tools.register(createReviewTool(ctx, agent, task.id), {
      when: () => !state.frozen && !reportOnly,
    })
    const activeWorker = candidate => candidate === agent && !state.frozen
    const knowledge = agent.ctx.tools.register(createKnowledgeQueryTool(), {
      when: ({ agent: candidate }) => candidate === agent,
    })
    const knowledgeGet = agent.ctx.tools.register(createKnowledgeGetTool(), {
      when: ({ agent: candidate }) => candidate === agent,
    })
    let memoryAttempted = false
    const message = agent.ctx.tools.register(createMessageRouterTool(ctx, agent, task.id, async (_text, exec) => {
      if (memoryAttempted || task.mode !== 'change' || !inCheckout()) return undefined
      memoryAttempted = true
      try {
        // create_worktree writes the Worker branch into the Task after this
        // agent was created, so the memory request reads the current record
        // instead of the snapshot captured in agent/created.
        const current = await readTask(task.id) ?? task
        return await runMemoryExtraction(ctx, agent, {
          projectRoot: current.projectRoot, task: current,
        }, exec.signal)
      } catch (error) {
        ctx.logger.warn(`superagent-lite memory extraction: ${error instanceof Error ? error.message : String(error)}`)
        return undefined
      }
    }), { when: ({ agent: candidate }) => activeWorker(candidate) })
    const report = agent.ctx.tools.register(createReportTool(ctx, agent, task.id, () => !state.frozen, () => { state.frozen = true }), {
      when: () => reportOnly && !state.frozen,
    })
    workers.set(agent.id, {
      taskId: task.id, state, session: agent.session,
      dispose: () => { memory?.(); projectSkill?.(); knowledge(); knowledgeGet(); report(); message(); review(); merge(); checkout(); guard() },
    })
    markers.set(agent.id, 'message_router')
  }

  const activate = agent => {
    if (agent.session.header.origin !== 'subagent' || registered(agent)) return
    const running = activating.get(agent.id)
    if (running) return running
    const pending = activateAgent(agent).finally(() => activating.delete(agent.id))
    activating.set(agent.id, pending)
    return pending
  }

  ctx.on('agent/created', ({ agent }) => activate(agent))

  ctx.on('agent/disposed', ({ agent }) => {
    const worker = workers.get(agent.id)
    worker?.dispose()
    workers.delete(agent.id)
    markers.delete(agent.id)
    skipped.delete(agent.id)
    forgetHelper(agent.id)
    catalogGuard.forget(agent.id)
    if (worker) forgetLanding(worker.taskId)
    dispatchGuard.dispose(agent.session.id)
    if (!lifetime.signal.aborted) track(pumpWorkers(ctx))
  })

  // DSH dispatches agent/status as a scoped event with a single { agent, status }
  // payload, and the loop announces idle only after the turn/end append returns.
  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'idle' && !lifetime.signal.aborted) dispatchGuard.onIdle(agent.session.id)
  })

  ctx.on('session/event', (session, event) => {
    dispatchGuard.onEvent(session, event)
    // An agent created before this plugin instance attached its listener never
    // receives agent/created here; recover it on its next event.
    const agent = ctx.agents.get?.(session.id)
    if (!lifetime.signal.aborted && agent?.session?.header?.origin === 'subagent' && !registered(agent)) {
      track(activate(agent))
    }
    if (event.type === 'turn/end' && !lifetime.signal.aborted && workers.get(session.id)?.session === session) {
      track(archiveWorkerTurn(session, event))
    }
  })

  ctx.on('subagent/end', (info) => {
    const worker = workers.get(info.id)
    if (worker) worker.state.frozen = true
    if (lifetime.signal.aborted) return
    track((async () => {
      try {
        const task = await taskForSession(undefined, info.id)
        if (!task || task.parentSessionId !== info.parentSessionId || task.status !== 'running') return
        const publish = changes => updateTask(task.id, changes)
        const stopped = { stopReason: info.stopReason, finishedAt: new Date().toISOString() }
        if (task.mode === 'report') {
          await publish({ ...stopped, status: 'failed', failure: 'Report-only task ended without report_task' })
          return
        }
        if (task.git === false) {
          if (info.stopReason !== 'completed') {
            await publish({ ...stopped, status: 'failed' })
            return
          }
          await publish(task.review?.approved === true
            ? { ...stopped, status: 'completed' }
            : { ...stopped, status: 'review-required' })
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
      } finally {
        await pumpWorkers(ctx)
      }
    })())
  })

  ctx.effect(() => async () => {
    applied.delete(ctx)
    lifetime.abort()
    for (const worker of workers.values()) worker.dispose()
    workers.clear()
    await Promise.allSettled(jobs)
  }, 'superagent-lite: worker lifecycle and delivery')

  // A reload keeps the agents alive but builds a fresh instance with no
  // per-agent state, so reattach them instead of waiting for another creation
  // event.
  for (const agent of ctx.agents.list()) await activate(agent)

  // A Host restart or a plugin reload can dispose worker Sessions without a
  // `subagent/end`, so scan the persisted records once instead of leaving them
  // unconfirmed until the next pump.
  if (!lifetime.signal.aborted) track(reclaimStaleTasks(ctx))
}
