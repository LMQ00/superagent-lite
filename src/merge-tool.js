import { readTask } from './task-store.js'
import { runCommand } from './process.js'

const BRANCH_NAME = /^[A-Za-z0-9._/-]{1,200}$/

function mergeTargets(task) {
  return Array.isArray(task?.mergeBranches) ? task.mergeBranches : []
}

// Merging a delivered branch into the new merge worker's own worktree branch is
// ordinary work, not landing. The tool keeps that write inside the assigned
// worktree; the reviewed result reaches the base branch only through the
// worker's landing command.
export function createMergeTool(ctx, agent, taskId) {
  return {
    name: 'merge_branch',
    description: 'Merge one branch from this merge task\'s target list into the assigned worktree branch. Call it once per target after create_worktree and before review_worker_commit; resolve and commit any conflict it reports.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        branch: { type: 'string', description: 'One branch from the task\'s recorded merge targets.' },
      },
      required: ['branch'],
    },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute({ branch }, exec) {
      const task = await readTask(taskId)
      if (exec.agent !== agent || task?.status !== 'running' || task.mode !== 'merge' || !task.worktree) {
        throw new Error('No active merge worktree')
      }
      const target = typeof branch === 'string' ? branch.trim() : ''
      if (!BRANCH_NAME.test(target) || !mergeTargets(task).includes(target)) {
        throw new Error('Merge only a branch recorded in this task\'s merge targets')
      }
      const { path, branch: current } = task.worktree
      const checkedOut = await runCommand(ctx, ['symbolic-ref', '--quiet', '--short', 'HEAD'], path, exec.signal)
        .catch(() => undefined)
      if (checkedOut !== current) {
        throw new Error('Worker is no longer on its assigned worktree branch')
      }
      if (await runCommand(ctx, ['status', '--porcelain', '--untracked-files=all'], path, exec.signal)) {
        throw new Error('Commit or remove uncommitted changes before merging another branch')
      }
      if (await runCommand(ctx, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], path, exec.signal).catch(() => undefined)) {
        throw new Error('A merge is already in progress; resolve and commit it before merging another branch')
      }
      try {
        await runCommand(ctx, ['rev-parse', '--verify', `refs/heads/${target}^{commit}`], path, exec.signal)
      } catch {
        throw new Error(`The merge target branch "${target}" was not found`)
      }
      const contained = await runCommand(ctx, ['merge-base', '--is-ancestor', `refs/heads/${target}`, 'HEAD'], path, exec.signal)
        .then(() => true, () => false)
      if (contained) return `${target} is already contained in ${current}; nothing to merge.`
      try {
        await runCommand(ctx, ['-c', 'commit.gpgsign=false', 'merge', '--no-ff', '--no-edit', target], path, exec.signal)
      } catch (error) {
        const conflicts = (await runCommand(ctx, ['diff', '--name-only', '--diff-filter=U'], path, exec.signal).catch(() => ''))
          .split('\n').filter(Boolean)
        if (conflicts.length === 0) throw error
        throw new Error(`Merge conflict in ${conflicts.join(', ')}; resolve the conflicts, stage and commit them, run the tests, then continue with the remaining targets`)
      }
      const head = await runCommand(ctx, ['rev-parse', '--verify', 'HEAD^{commit}'], path, exec.signal)
      return `Merged ${target} into ${current} at ${head}.`
    },
  }
}
