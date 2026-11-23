import { updateTask } from './task-store.js'
import { runCommand } from './process.js'
import { assertStillDeliverable, deliverableHead } from './delivery.js'

function dirtyTargetLine(line) {
  return line && line !== '?? .agents/worktrees/.gitignore'
}

function cleanMergeError(error) {
  if (error?.exitCode === 1) return new Error('Merge would conflict; the target was not changed')
  return error
}

// A merge switches the shared project checkout, so merges and branch deletions
// for one Project root run one at a time. Both the panel's merge and
// delete-branch actions go through this queue.
const queues = new Map()

function serializeByRoot(root, operation) {
  const previous = queues.get(root) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(operation)
  queues.set(root, current)
  return current.finally(() => {
    if (queues.get(root) === current) queues.delete(root)
  })
}

// Merge the reviewed worker head into a local branch. No GitHub account, push
// or Pull request is involved: this is a plain local merge into a chosen branch.
export async function mergeWorkerBranch(ctx, task, target, signal, update = updateTask) {
  if (task.status === 'merged') {
    return { head: task.review?.head, target, baseHead: undefined, alreadyMerged: true }
  }
  const head = await deliverableHead(ctx, task, signal)
  if (typeof target !== 'string' || !/^[A-Za-z0-9._\/-]{1,200}$/.test(target)) throw new Error('A merge target branch is required')
  const branch = task.worktree.branch
  if (target === branch) throw new Error('The merge target cannot be the worker branch')
  const root = task.projectRoot
  return serializeByRoot(root, async () => {
    const git = args => runCommand(ctx, args, root, signal)
    try {
      await git(['rev-parse', '--verify', `refs/heads/${target}^{commit}`])
    } catch {
      throw new Error(`The merge target branch "${target}" was not found`)
    }
    const previous = await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])
    const dirty = await git(['status', '--porcelain', '--untracked-files=all'])
    if (dirty.split('\n').some(dirtyTargetLine)) throw new Error('The project checkout has uncommitted changes')
    try {
      await git(['merge-tree', '--write-tree', `refs/heads/${target}`, head])
    } catch (error) {
      throw cleanMergeError(error)
    }
    if (previous !== target) await git(['switch', '--quiet', target])
    let failure
    let result
    let restoreProblem
    try {
      if (await git(['symbolic-ref', '--quiet', '--short', 'HEAD']) !== target) {
        throw new Error('The project checkout moved to another branch during merge preparation')
      }
      const dirtyNow = await git(['status', '--porcelain', '--untracked-files=all'])
      if (dirtyNow.split('\n').some(dirtyTargetLine)) throw new Error('The project checkout has uncommitted changes')
      await update(task.id, latest => {
        if (latest.status === 'merged') throw new Error('This branch is already merged')
        assertStillDeliverable(latest, head)
        return { status: 'merging' }
      })
      try {
        await git(['-c', 'commit.gpgsign=false', 'merge', '--no-ff', '--no-edit', '--no-overwrite-ignore', head])
      } catch (error) {
        await update(task.id, { status: 'delivery-blocked', failure: `Merge did not report success: ${error.message}` })
        throw new Error(`Merge did not report success; inspect the target before retrying: ${error.message}`)
      }
      const baseHead = await git(['rev-parse', '--verify', 'HEAD^{commit}'])
      await update(task.id, { status: 'merged', mergeTarget: target, failure: undefined })
      result = { head, target, baseHead, alreadyMerged: false }
    } catch (error) {
      failure = error
    } finally {
      if (previous !== target) {
        try {
          await git(['switch', '--quiet', previous])
        } catch (error) {
          restoreProblem = error
        }
      }
    }
    if (failure) {
      const suffix = restoreProblem
        ? ` The project checkout is still on ${target}; restore ${previous} manually: ${restoreProblem.message}`
        : ''
      failure.message = `${failure.message}${suffix}`
      throw failure
    }
    return restoreProblem
      ? { ...result, checkoutRestored: false, restoreError: restoreProblem.message }
      : result
  })
}

// Delete the worker branch only after its merged commit is recorded on the Task.
// The Worktree is removed first because Git refuses to delete a checked-out branch.
export async function deleteWorkerBranch(ctx, task, signal, update = updateTask) {
  if (task.status !== 'merged') throw new Error('Delete the worker branch only after the task is merged')
  const { path, branch } = task.worktree ?? {}
  if (typeof branch !== 'string' || !branch) {
    if (task.worktree === undefined && task.branchDeletedAt) return { branch: undefined, deleted: false }
    throw new Error('This task has no worker branch')
  }
  const root = task.projectRoot
  return serializeByRoot(root, async () => {
    const git = args => runCommand(ctx, args, root, signal)
    const exists = await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`]).then(() => true, () => false)
    if (exists) {
      if (typeof path === 'string' && path) {
        const listed = (await git(['worktree', 'list', '--porcelain']).catch(() => '')).split('\n\n')
          .some(block => block.split('\n').includes(`worktree ${path}`))
        if (listed) {
          const dirty = await runCommand(ctx, ['status', '--porcelain', '--untracked-files=all'], path, signal)
            .catch(() => '')
          if (dirty.split('\n').some(dirtyTargetLine)) {
            throw new Error('The worker worktree has uncommitted changes; commit or remove them before deleting the branch')
          }
          await git(['worktree', 'remove', path])
        }
      }
      await git(['branch', '-D', branch])
    }
    await update(task.id, { worktree: undefined, branchDeletedAt: new Date().toISOString() })
    return { branch, deleted: exists }
  })
}
