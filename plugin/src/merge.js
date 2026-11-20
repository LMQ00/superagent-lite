import { readTask, updateTask } from './task-store.js'
import { runCommand } from './process.js'
import { githubOrigin } from './github.js'
import { worktreeHead } from './review.js'

export function mergeCommand(ctx) {
  const byRepository = new Map()
  return {
    name: 'merge-worker',
    description: 'Authorize merging a reviewed local worker commit into its original branch',
    input: { hint: '<task ID>' },
    async handler({ agent, rawInput, signal }) {
      const id = rawInput.trim()
      if (!/^[a-f0-9]{16}$/.test(id)) return { kind: 'error', text: 'Usage: /merge-worker <task ID>' }
      const task = await readTask(id)
      if (!task || task.parentSessionId !== agent.id) return { kind: 'error', text: 'This task does not belong to the current router Session.' }
      if (ctx.sandboxPolicy.resolve({ session: agent.session }).mode !== 'danger-full-access') {
        return { kind: 'error', text: 'Local merge is unavailable under this Session file policy.' }
      }
      const root = task.projectRoot
      const previous = byRepository.get(root) ?? Promise.resolve()
      const operation = previous.catch(() => {}).then(async () => {
        const current = await readTask(id)
        if (current.status === 'merged') return { kind: 'success', text: `${id} is already merged.` }
        if (current.status !== 'awaiting-merge' || !current.review?.approved || !current.worktree) throw new Error('No reviewed local commit is ready for merge')
        const git = args => runCommand(ctx, args, root, signal)
        if (await githubOrigin(ctx, root, signal)) throw new Error('GitHub projects must merge through a pull request')
        if (await git(['rev-parse', '--show-toplevel']) !== root || await git(['symbolic-ref', '--quiet', 'HEAD']) !== `refs/heads/${current.baseBranch}`) {
          throw new Error('The target checkout no longer has its original branch checked out')
        }
        if (await git(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']).then(() => true, error => { if (error.exitCode === 1) return false; throw error })) {
          throw new Error('The target already has an in-progress merge')
        }
        const dirty = await git(['status', '--porcelain', '--untracked-files=all'])
        if (dirty.split('\n').some(line => line && line !== '?? .agents/worktrees/.gitignore')) throw new Error('The target checkout has uncommitted changes')
        const head = await worktreeHead(ctx, current, signal)
        if (head !== current.review.head) throw new Error('The worker branch no longer matches its reviewed commit')
        try {
          await git(['merge-tree', '--write-tree', 'HEAD', head])
        } catch (error) {
          if (error.exitCode === 1 && !signal.aborted) throw new Error('Merge would conflict; the target was not changed')
          throw error
        }
        await updateTask(id, latest => {
          if (latest.status !== 'awaiting-merge' || latest.review?.head !== head) throw new Error('The task changed during merge preparation')
          return { status: 'merging' }
        })
        try {
          await git(['-c', 'commit.gpgsign=false', 'merge', '--no-ff', '--no-edit', '--no-overwrite-ignore', head])
        } catch (error) {
          await updateTask(id, { status: 'delivery-blocked' })
          throw new Error(`Merge did not report success; inspect the target before retrying: ${error.message}`)
        }
        await updateTask(id, { status: 'merged' })
        return { kind: 'success', text: `Merged ${id} into ${current.baseBranch}.` }
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
