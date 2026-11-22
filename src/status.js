// The panel status answers what a person can do with a Task. It is derived from
// the stored Task plus the Git and Review facts, never written back as a stored
// lifecycle status: "unmerged" and "unreviewed" are display states, while
// `awaiting-merge` and `review-required` remain the recorded lifecycle values.

export const PANEL_STATUSES = ['unmerged', 'running', 'unreviewed', 'completed', 'failed', 'answer']

const RUNNING = new Set(['starting', 'running', 'resuming', 'publishing', 'merging'])
const STOPPED = new Set(['cancelled', 'interrupted', 'merge-conflict'])
const FAILED = new Set(['failed', 'delivery-blocked', 'merge-conflict', 'interrupted', 'cancelled'])

export function panelStatus(task, facts = {}) {
  const status = task?.status
  if (typeof status !== 'string') return 'failed'
  if (task.mode === 'report') {
    if (status === 'completed') return 'answer'
    if (FAILED.has(status)) return 'failed'
    return 'running'
  }
  if (RUNNING.has(status)) return 'running'
  if (status === 'merged') return 'completed'
  if (STOPPED.has(status)) return 'failed'
  if (facts.merged === true) return 'completed'
  if (facts.closed === true) return 'failed'
  if (facts.reviewed === true) return 'unmerged'
  // A completed worker turn that committed nothing has no Review to wait for;
  // legacy records used to sit in review-required forever.
  if (facts.hasCommits === false && task.stopReason === 'completed') return 'completed'
  if (facts.hasCommits === true) return 'unreviewed'
  if (FAILED.has(status)) return 'failed'
  if (status === 'completed') return 'completed'
  if (status === 'awaiting-ci' || status === 'awaiting-merge' || status === 'merge-queued' || status === 'ready') return 'unmerged'
  if (status === 'review-required') return 'unreviewed'
  return 'running'
}

export function reviewKey(projectRoot, head) {
  return `${projectRoot}\0${head}`
}

export function reviewIndex(records) {
  const index = new Map()
  for (const record of records ?? []) {
    const review = record?.review
    if (review?.approved === true && typeof review.head === 'string' && typeof record.projectRoot === 'string') {
      index.set(reviewKey(record.projectRoot, review.head), review)
    }
  }
  return index
}
