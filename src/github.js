import { runCommand, runProcess } from './process.js'

export function githubRepository(url) {
  const match = /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url)
  if (!match || match[2] === '.' || match[2] === '..') return undefined
  return `${match[1]}/${match[2]}`
}

export async function githubOrigin(ctx, cwd, signal) {
  const listing = await runCommand(ctx, ['remote', '-v'], cwd, signal)
  const urls = listing.split('\n').filter(Boolean).map(line => line.match(/^\S+\s+(\S+)\s+\((?:fetch|push)\)$/)?.[1])
  if (urls.some(url => !url)) throw new Error('Could not identify the project remotes')
  if (!urls.some(url => githubRepository(url) || /(?:^|[/@:])github\.com[:/]/i.test(url))) return undefined
  if (!listing.split('\n').some(line => /^origin\s/.test(line))) throw new Error('Configure the GitHub repository as origin before automated delivery')
  const fetchUrl = await runCommand(ctx, ['remote', 'get-url', 'origin'], cwd, signal)
  const pushUrl = await runCommand(ctx, ['remote', 'get-url', '--push', '--all', 'origin'], cwd, signal)
  const repo = githubRepository(fetchUrl)
  if (!repo || repo !== githubRepository(pushUrl)) throw new Error('Origin is not a single matching GitHub fetch/push repository')
  return { repo, pushUrl }
}

export async function deliverGithub(ctx, task, origin, signal, publish) {
  const { path, branch } = task.worktree
  const { head } = task.review
  const gh = (args) => runProcess(ctx, 'gh', args, path, signal)
  const repo = ['--repo', `github.com/${origin.repo}`]
  await gh(['auth', 'status', '--hostname', 'github.com'])
  await runCommand(ctx, ['push', '--recurse-submodules=no', '--', origin.pushUrl, `${head}:refs/heads/${branch}`], path, signal)
  const created = await gh(['pr', 'create', ...repo, '--head', branch, '--base', task.baseBranch, '--title', task.title, '--body', `Reviewed worker commit: ${head}\n\nSuperagent lite task: ${task.id}`])
  const prUrl = created.split(/\r?\n/).at(-1)
  if (!prUrl?.startsWith(`https://github.com/${origin.repo}/pull/`) || !/^\d+$/.test(prUrl.slice(prUrl.lastIndexOf('/') + 1))) {
    throw new Error('GitHub did not return a recognized pull request URL')
  }
  const number = prUrl.slice(prUrl.lastIndexOf('/') + 1)
  await publish({ status: 'awaiting-ci', prUrl })
  const view = async () => JSON.parse(await gh(['pr', 'view', number, ...repo, '--json', 'headRefOid,headRefName,baseRefName,isCrossRepository,state']))
  const exact = pr => pr.headRefOid === head && pr.headRefName === branch && pr.baseRefName === task.baseBranch && pr.isCrossRepository === false
  const initial = await view()
  if (!exact(initial) || initial.state !== 'OPEN') throw new Error('Pull request does not match the reviewed branch and target')
  await gh(['pr', 'checks', number, ...repo, '--required', '--watch'])
  const checks = JSON.parse(await gh(['pr', 'checks', number, ...repo, '--required', '--json', 'bucket']))
  if (!Array.isArray(checks) || checks.length === 0 || checks.some(check => check.bucket !== 'pass')) {
    throw new Error('All required CI checks must pass; empty, skipped or failing checks do not qualify')
  }
  const current = await view()
  if (!exact(current) || current.state !== 'OPEN') throw new Error('Pull request changed while waiting for CI')
  await gh(['pr', 'merge', number, ...repo, '--auto', '--squash', '--match-head-commit', head])
  const final = await view()
  if (!exact(final)) throw new Error('GitHub returned a changed pull request after merge request')
  await publish({ status: final.state === 'MERGED' ? 'merged' : 'merge-queued' })
}
