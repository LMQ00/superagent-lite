import { readTask, updateTask } from './task-store.js'
import { runCommand } from './process.js'
import { worktreeHead } from './review.js'

function dirtyTargetLine(line) {
  return line && line !== '?? .agents/worktrees/.gitignore'
}

function cleanMergeError(error) {
  if (error?.exitCode === 1) return 'Merge would conflict; the target was not changed'
  return error
}

// Merge the reviewed worker head into a local branch. No GitHub account, push
// or Pull request is involved: this is a plain local merge into a chosen branch.
export async function mergeWorkerBranch(ctx, task, target, signal, update = updateTask) {
  if (task.status === 'merged') {
    return { head: task.review?.head, target, baseHead: undefined, alreadyMerged: true }
  }
  if (!task.worktree?.branch || !task.worktree.path) throw new Error('This task has no worker branch')
  if (task.review?.approved !== true) throw new Error('No reviewed local commit is ready for merge')
  if (typeof target !== 'string' || !/^[A-Za-z0-9._\/-]{1,200}$/.test(target)) throw new Error('A merge target branch is required')
  const branch = task.worktree.branch
  if (target === branch) throw new Error('The merge target cannot be the worker branch')
  const root = task.projectRoot
  const head = await worktreeHead(ctx, task, signal)
  if (head !== task.review.head) throw new Error('The worker branch no longer matches its reviewed commit')
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
  try {
    await update(task.id, latest => {
      if (latest.status === 'merged') throw new Error('This branch is already merged')
      if (latest.review?.approved !== true || latest.review?.head !== head) throw new Error('The review changed during merge')
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
    return { head, target, baseHead, alreadyMerged: false }
  } finally {
    if (previous !== target) await git(['switch', '--quiet', previous]).catch(() => {})
  }
}

// Delete the worker branch only after its reviewed commit is in a local branch.
// The Worktree is removed first because Git refuses to delete a checked-out branch.
export async function deleteWorkerBranch(ctx, task, signal, update = updateTask) {
  if (task.status !== 'merged') throw new Error('Delete the worker branch only after the task is merged')
  const { path, branch } = task.worktree ?? {}
  if (typeof branch !== 'string' || !branch) {
    if (task.worktree === undefined && task.branchDeletedAt) return { branch: undefined, deleted: false }
    throw new Error('This task has no worker branch')
  }
  const root = task.projectRoot
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
}

export function mergeCommand(ctx) {
  const byRepository = new Map()
  return {
    name: 'merge-worker',
    description: 'Merge a reviewed local worker commit into its original branch after the user\'s explicit authorization',
    input: { hint: '<task ID>' },
    async handler({ agent, rawInput, signal }) {
      const id = rawInput.trim()
      if (!/^[a-f0-9]{16}$/.test(id)) return { kind: 'error', text: 'Usage: /merge-worker <task ID>' }
      const task = await readTask(id)
      if (!task || task.parentSessionId !== agent.id) return { kind: 'error', text: 'This task does not belong to the current router Session.' }
      if (ctx.sandboxPolicy.resolve({ session: agent.session }).mode !== 'danger-full-access') {
        return { kind: 'error', text: 'Local merge is unavailable under the current Session file policy.' }
      }
      const root = task.projectRoot
      const previous = byRepository.get(root) ?? Promise.resolve()
      const operation = previous.catch(() => {}).then(async () => {
        const current = await readTask(id)
        if (current.status === 'merged') return { kind: 'success', text: `${id} is already merged.` }
        if (current.status !== 'awaiting-merge' || !current.review?.approved || !current.worktree) {
          throw new Error('No reviewed local commit is ready for merge')
        }
        const merged = await mergeWorkerBranch(ctx, current, current.baseBranch, signal)
        return { kind: 'success', text: `Merged ${id} into ${merged.target}.` }
      })
      byRepository.set(root, operation)
      try {
        return await operation
      } catch (error) {
        return { kind: 'error', text: error.message }
      } finally {
        if (byRepository.get(root) === operation) byRepository.delete(root)
      }
    },
  }
}
