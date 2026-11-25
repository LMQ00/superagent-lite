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
const RUNNING = new Set(['queued', 'starting', 'running', 'resuming', 'publishing', 'merging'])

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
        // --log appends the merged branch's one-line commit descriptions to the
        // merge commit, so the base branch history keeps the functional commits
        // and their messages instead of only a bare merge line.
        const mergeArgs = [
          '-c', 'commit.gpgsign=false', 'merge', '--no-ff', '--log', '--no-overwrite-ignore',
          '-m', `Merge branch '${branch}'`,
        ]
        if (typeof task.title === 'string' && task.title.trim()) mergeArgs.push('-m', task.title.trim())
        mergeArgs.push(head)
        await git(mergeArgs)
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

export function parseWorktrees(output) {
  return output.split('\n\n').map(block => {
    const lines = block.split('\n')
    const path = lines.find(line => line.startsWith('worktree '))?.slice('worktree '.length)
    const ref = lines.find(line => line.startsWith('branch '))?.slice('branch '.length)
    return path ? { path, branch: ref?.replace(/^refs\/heads\//, '') } : undefined
  }).filter(Boolean)
}

// Delete the worker branch and its clean Worktree. The branch may be merged or
// unmerged; a running Task, an uncommitted Worktree, a Worktree left behind by
// removal, and a branch checked out by another Worktree are refused.
export async function deleteWorkerBranch(ctx, task, signal, update = updateTask) {
  if (RUNNING.has(task.status)) throw new Error('The task is still running; stop its worker before deleting the branch')
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
      const listed = parseWorktrees(await git(['worktree', 'list', '--porcelain']))
      const own = typeof path === 'string' && path ? listed.find(entry => entry.path === path) : undefined
      if (own && own.branch !== branch) {
        throw new Error(`The worktree at ${path} is not on the worker branch ${branch}; remove it before deleting the branch`)
      }
      const elsewhere = listed.find(entry => entry.branch === branch && entry.path !== path)
      if (elsewhere) {
        throw new Error(`The worker branch is still checked out in the worktree at ${elsewhere.path}; remove it before deleting the branch`)
      }
      if (own) {
        const dirty = await runCommand(ctx, ['status', '--porcelain', '--untracked-files=all'], own.path, signal)
          .catch(() => '')
        if (dirty.split('\n').some(dirtyTargetLine)) {
          throw new Error('The worker worktree has uncommitted changes; commit or remove them before deleting the branch')
        }
        await git(['worktree', 'remove', own.path]).catch(error => {
          throw new Error(`Could not remove the worker worktree at ${own.path}: ${error.message}`)
        })
        const remaining = parseWorktrees(await git(['worktree', 'list', '--porcelain']))
        if (remaining.some(entry => entry.path === own.path)) {
          throw new Error(`The worker worktree at ${own.path} still exists; remove it before deleting the branch`)
        }
        const holder = remaining.find(entry => entry.branch === branch)
        if (holder) {
          throw new Error(`The worker branch is still checked out in the worktree at ${holder.path}; remove it before deleting the branch`)
        }
      }
      await git(['branch', '-D', branch]).catch(error => {
        throw new Error(`Could not delete the worker branch ${branch}: ${error.message}`)
      })
    }
    await update(task.id, { worktree: undefined, branchDeletedAt: new Date().toISOString() })
    return { branch, deleted: exists }
  })
}

// The branch/worktree tab deletes the two plugin-created objects separately:
// removing a worktree keeps its branch, and deleting the branch only happens
// after no worktree (including the project checkout) still holds it.
export async function removeWorkerWorktree(ctx, { projectRoot, branch, path, task }, signal) {
  if (RUNNING.has(task?.status)) throw new Error('The task is still running; stop its worker before deleting the worktree')
  return serializeByRoot(projectRoot, async () => {
    const git = args => runCommand(ctx, args, projectRoot, signal)
    const listed = parseWorktrees(await git(['worktree', 'list', '--porcelain']))
    const own = listed.find(entry => entry.path === path)
    if (!own) throw new Error(`The worktree at ${path} no longer exists`)
    if (own.branch !== branch) throw new Error(`The worktree at ${path} is not on the worker branch ${branch}`)
    const dirty = await runCommand(ctx, ['status', '--porcelain', '--untracked-files=all'], own.path, signal)
      .catch(() => '')
    if (dirty.split('\n').some(dirtyTargetLine)) {
      throw new Error('The worker worktree has uncommitted changes; commit or remove them before deleting the worktree')
    }
    await git(['worktree', 'remove', own.path]).catch(error => {
      throw new Error(`Could not remove the worker worktree at ${own.path}: ${error.message}`)
    })
    const remaining = parseWorktrees(await git(['worktree', 'list', '--porcelain']))
    if (remaining.some(entry => entry.path === own.path)) {
      throw new Error(`The worker worktree at ${own.path} still exists; remove it manually`)
    }
    return { branch, path: own.path, deleted: true }
  })
}

export async function deleteWorkerBranchOnly(ctx, { projectRoot, branch, task }, signal, update = updateTask) {
  if (RUNNING.has(task?.status)) throw new Error('The task is still running; stop its worker before deleting the branch')
  return serializeByRoot(projectRoot, async () => {
    const git = args => runCommand(ctx, args, projectRoot, signal)
    const exists = await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`]).then(() => true, () => false)
    if (!exists) return { branch, deleted: false }
    const listed = parseWorktrees(await git(['worktree', 'list', '--porcelain']))
    const holder = listed.find(entry => entry.branch === branch)
    if (holder) {
      throw new Error(`The worker branch is still checked out in the worktree at ${holder.path}; delete that worktree first`)
    }
    await git(['branch', '-D', branch]).catch(error => {
      throw new Error(`Could not delete the worker branch ${branch}: ${error.message}`)
    })
    if (task) await update(task.id, { worktree: undefined, branchDeletedAt: new Date().toISOString() })
    return { branch, deleted: true }
  })
}
