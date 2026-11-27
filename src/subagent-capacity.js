// The Host counts every live child of one Router Session against a single
// `maxActiveSubagents` pool, published with a default of 8. The panel's
// `maxWorkers` is a separate worker limit, so the Host ceiling stays in force:
// the launch queue reports a shortfall for diagnostics and queues work instead
// of treating a Host rejection as a task failure.
const HELPER_CHILDREN_PER_WORKER = 1

function activeChildCapacity(ctx) {
  const ref = ctx?.subagents?.config?.maxActiveSubagents
  return typeof ref?.get === 'function' ? ref.get() : undefined
}

// Report a Host ceiling that would queue tasks below the configured worker
// limit, so the caller can warn instead of silently truncating the setting.
export function activeChildCapacityShortfall(ctx, maxWorkers) {
  const current = activeChildCapacity(ctx)
  const required = maxWorkers * (1 + HELPER_CHILDREN_PER_WORKER)
  return current !== undefined && current < required ? { current, required } : undefined
}

export function isActiveChildLimit(error) {
  return error?.code === 'ACTIVATION_LIMIT_REACHED'
}
