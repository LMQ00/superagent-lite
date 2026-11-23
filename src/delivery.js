import { worktreeHead } from './review.js'

// Merge and publish share these preconditions. Publishing alone additionally
// needs an authenticated GitHub account and a remote that names a GitHub repo.
const DELIVERABLE_STATUSES = ['awaiting-merge', 'awaiting-ci']

export async function deliverableHead(ctx, task, signal, headOf) {
  if (!DELIVERABLE_STATUSES.includes(task.status)) throw new Error('Only a task that finished its worker turn can be delivered')
  if (!task.worktree?.branch || !task.worktree.path) throw new Error('This task has no worker branch')
  if (task.review?.approved !== true) throw new Error('No reviewed local commit is ready for delivery')
  const head = headOf ? await headOf(task, signal) : await worktreeHead(ctx, task, signal)
  if (head !== task.review.head) throw new Error('The worker branch no longer matches its reviewed commit')
  return head
}

export function assertStillDeliverable(task, head) {
  if (!DELIVERABLE_STATUSES.includes(task.status)) throw new Error('The task left its deliverable state during preparation')
  if (task.review?.approved !== true || task.review.head !== head) throw new Error('The review changed during delivery')
}
