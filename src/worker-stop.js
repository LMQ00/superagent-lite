import { stopTask } from './task-store.js'
import { pumpWorkers } from './launch-queue.js'
import { notifyWorkerStatus } from './worker-status.js'
import { interruptWorker, waitForWorkerStop } from './worker-control.js'

export async function stopWorker(ctx, taskId, { waitForStop = false, notify = true, timeoutMs } = {}) {
  const result = await stopTask(taskId)
  if (!result) return undefined
  const { task, stopped } = result
  let interruptError
  try {
    interruptWorker(ctx, task.workerSessionId)
  } catch (error) {
    interruptError = error
  }
  if (stopped) {
    // The cancelled record no longer occupies a slot. Pump now so a queued task
    // can start without waiting for the interrupted worker to settle.
    try {
      await pumpWorkers(ctx)
    } catch (error) {
      ctx.logger?.warn(`superagent-lite worker queue: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const ready = waitForStop ? await waitForWorkerStop(ctx.agents, task.workerSessionId, timeoutMs) : true
  if (stopped && notify) notifyWorkerStatus(ctx, task, 'cancelled')
  if (interruptError) throw interruptError
  return { ...result, ready }
}
