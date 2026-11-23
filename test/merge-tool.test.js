import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const tmp = fileURLToPath(new URL('../tmp/', import.meta.url))
await mkdir(tmp, { recursive: true })
const home = await mkdtemp(join(tmp, 'merge-tool-'))
process.env.HOME = home
after(() => rm(home, { recursive: true, force: true }))

const { createMergeTool } = await import('../src/merge-tool.js')
const { createTask, updateTask, linkWorkerSession } = await import('../src/task-store.js')

function git(cwd, args, allowFailure = false) {
  const result = spawnSync('git', ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, encoding: 'utf8' })
  if (!allowFailure) assert.equal(result.status, 0, result.stderr)
  return result
}

const ctx = {
  subprocess: {
    async resolveExecutable(name) { return name },
    spawn({ argv: [command, ...args], cwd, env }) {
      const result = spawnSync(command, ['-c', 'user.name=dsh', '-c', 'user.email=dsh@local', ...args], { cwd, env, encoding: 'utf8' })
      return {
        done: Promise.resolve({ exitCode: result.status }),
        collected: {
          stdout: { readFrom: () => ({ text: result.stdout, lossy: false }) },
          stderr: { readFrom: () => ({ text: result.stderr, lossy: false }) },
        },
      }
    },
  },
}

async function fixture(name) {
  const repo = join(home, name)
  await mkdir(repo)
  git(repo, ['init', '-b', 'main'])
  await writeFile(join(repo, 'notes.txt'), 'original\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-m', 'initial'])
  const worktree = join(home, `${name}-worktree`)
  const branch = `sl-${name}-merge`
  git(repo, ['worktree', 'add', '-b', branch, worktree])
  return { repo, worktree, branch }
}

async function taskFor(id, facts, branches) {
  await createTask({
    id,
    title: 'Merge delivered branches',
    teamId: `team-${id}`,
    task: `Merge ${branches.join(', ')}`,
    mode: 'merge',
    land: true,
    parentSessionId: 'router',
    projectRoot: facts.repo,
    baseCommit: git(facts.repo, ['rev-parse', 'HEAD']).stdout.trim(),
    baseBranch: 'main',
    workerSessionId: `worker-${id}`,
    mergeBranches: branches,
    worktree: { path: facts.worktree, branch: facts.branch, repositoryRoot: facts.repo, sourceBranch: 'main' },
    status: 'running',
    createdAt: new Date().toISOString(),
  })
  await linkWorkerSession(id, `worker-${id}`)
  return { id, agent: { id: `worker-${id}` }, exec: { agent: { id: `worker-${id}` }, signal: new AbortController().signal } }
}

test('a merge worker merges only a recorded target into its assigned worktree branch', async () => {
  const facts = await fixture('plain')
  const target = 'sl-target-plain'
  git(facts.repo, ['switch', '-q', '-c', target])
  await writeFile(join(facts.repo, 'target.txt'), 'target\n')
  git(facts.repo, ['add', '.'])
  git(facts.repo, ['commit', '-m', 'target work'])
  git(facts.repo, ['switch', '-q', 'main'])
  const { id, agent } = await taskFor('1000000000000001', facts, [target])
  const tool = createMergeTool(ctx, agent, id)
  const result = await tool.execute({ branch: target }, { agent, signal: new AbortController().signal })
  assert.match(result, new RegExp(`Merged ${target}`))
  assert.equal(git(facts.worktree, ['show', 'HEAD:target.txt']).stdout, 'target\n')
  await assert.rejects(
    tool.execute({ branch: 'main' }, { agent, signal: new AbortController().signal }),
    /recorded in this task/,
  )
})

test('a merge conflict is left in the worktree for the worker to resolve and commit', async () => {
  const facts = await fixture('conflict')
  const branch = 'sl-conflict-target'
  git(facts.repo, ['switch', '-q', '-c', branch])
  await writeFile(join(facts.repo, 'notes.txt'), 'target value\n')
  git(facts.repo, ['commit', '-am', 'target edit'])
  git(facts.repo, ['switch', '-q', 'main'])
  const { id, agent } = await taskFor('1000000000000002', facts, [branch])
  await writeFile(join(facts.worktree, 'notes.txt'), 'worker value\n')
  git(facts.worktree, ['commit', '-am', 'worker edit'])
  const tool = createMergeTool(ctx, agent, id)
  await assert.rejects(
    tool.execute({ branch }, { agent, signal: new AbortController().signal }),
    /Merge conflict in notes\.txt/,
  )
  assert.equal(git(facts.worktree, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], true).status, 0)
  await writeFile(join(facts.worktree, 'notes.txt'), 'resolved value\n')
  git(facts.worktree, ['add', 'notes.txt'])
  git(facts.worktree, ['commit', '-m', 'resolve conflict'])
  assert.match(await tool.execute({ branch }, { agent, signal: new AbortController().signal }), /already contained/)
})

test('the merge tool requires the assigned worktree and a clean tree', async () => {
  const facts = await fixture('state')
  const target = 'sl-target-state'
  git(facts.repo, ['branch', target])
  const { id, agent } = await taskFor('1000000000000003', facts, [target])
  const tool = createMergeTool(ctx, agent, id)
  await writeFile(join(facts.worktree, 'scratch.txt'), 'scratch\n')
  await assert.rejects(
    tool.execute({ branch: target }, { agent, signal: new AbortController().signal }),
    /uncommitted changes/,
  )
  await rm(join(facts.worktree, 'scratch.txt'))
  git(facts.worktree, ['checkout', '--detach', '-q'])
  await assert.rejects(
    tool.execute({ branch: target }, { agent, signal: new AbortController().signal }),
    /assigned worktree branch/,
  )
  await updateTask(id, { status: 'awaiting-merge' })
  await assert.rejects(
    tool.execute({ branch: target }, { agent, signal: new AbortController().signal }),
    /No active merge worktree/,
  )
})
