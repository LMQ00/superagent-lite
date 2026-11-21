import { runCommand, runProcess } from './process.js'

export function githubRepository(url) {
  const match = /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url)
  if (!match || match[2] === '.' || match[2] === '..') return undefined
  return `${match[1]}/${match[2]}`
}

export function pullRequestUrl(value) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (url.origin === 'https://github.com' && !url.username && !url.password &&
        /^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/pull\/\d+\/?$/.test(url.pathname)) return url.href
  } catch {
    return undefined
  }
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

const PR_FIELDS = 'url,state,headRefOid,headRefName,baseRefName,isCrossRepository,mergeable'

function pullRequestInPlace(ctx, cwd, signal) {
  return args => runProcess(ctx, 'gh', args, cwd, signal)
}

function exactPullRequest(view, task) {
  return view.headRefOid === task.review?.head &&
    view.headRefName === task.worktree?.branch &&
    view.baseRefName === task.baseBranch &&
    view.isCrossRepository === false
}

async function viewPullRequest(gh, repo, reference) {
  const raw = await gh(['pr', 'view', reference, ...repo, '--json', PR_FIELDS])
  return JSON.parse(raw)
}

async function findPullRequest(gh, repo, task) {
  if (task.prUrl) {
    const url = pullRequestUrl(task.prUrl)
    if (!url) throw new Error('The stored pull request URL is not a GitHub pull request')
    return { url, view: await viewPullRequest(gh, repo, url) }
  }
  try {
    const view = await viewPullRequest(gh, repo, task.worktree.branch)
    return { url: pullRequestUrl(view.url), view }
  } catch {
    return undefined
  }
}

function pullRequestNumber(url) {
  return url.slice(url.lastIndexOf('/') + 1)
}

export async function publishGithub(ctx, task, origin, signal, record = async () => {}) {
  const { path, branch } = task.worktree
  const { head } = task.review
  const gh = pullRequestInPlace(ctx, path, signal)
  const repo = ['--repo', `github.com/${origin.repo}`]
  await gh(['auth', 'status', '--hostname', 'github.com'])
  const existing = await findPullRequest(gh, repo, task)
  if (existing) {
    if (!pullRequestUrl(existing.url)) throw new Error('The existing pull request URL is not a GitHub pull request')
    if (existing.view.state === 'MERGED') {
      if (!exactPullRequest(existing.view, task)) throw new Error('The pull request does not match the reviewed branch and target')
      await record({ status: 'merged', prUrl: existing.url, prState: 'MERGED' })
      return { url: existing.url, state: 'MERGED', number: pullRequestNumber(existing.url), adopted: true }
    }
    if (existing.view.state === 'CLOSED') throw new Error('The pull request was closed; reopen it or dispatch a new task')
    if (exactPullRequest(existing.view, task) && existing.view.state === 'OPEN') {
      await record({ status: 'awaiting-ci', prUrl: existing.url, prState: 'OPEN' })
      return { url: existing.url, state: 'OPEN', number: pullRequestNumber(existing.url), adopted: true }
    }
  }
  await runCommand(ctx, ['push', '--recurse-submodules=no', '--', origin.pushUrl, `${head}:refs/heads/${branch}`], path, signal)
  if (existing) {
    const view = await viewPullRequest(gh, repo, existing.url)
    if (!exactPullRequest(view, task) || view.state !== 'OPEN') throw new Error('The pull request does not match the reviewed branch and target')
    await record({ status: 'awaiting-ci', prUrl: existing.url, prState: 'OPEN' })
    return { url: existing.url, state: 'OPEN', number: pullRequestNumber(existing.url), adopted: true }
  }
  const created = await gh(['pr', 'create', ...repo, '--head', branch, '--base', task.baseBranch, '--title', task.title || task.id, '--body', `Reviewed worker commit: ${head}\n\nSuperagent lite task: ${task.id}`])
  const url = pullRequestUrl(created.split(/\r?\n/).at(-1))
  if (!url || !url.startsWith(`https://github.com/${origin.repo}/pull/`)) {
    throw new Error('GitHub did not return a recognized pull request URL')
  }
  await record({ status: 'awaiting-ci', prUrl: url, prState: 'OPEN' })
  const view = await viewPullRequest(gh, repo, url)
  if (!exactPullRequest(view, task) || view.state !== 'OPEN') throw new Error('Pull request does not match the reviewed branch and target')
  return { url, state: 'OPEN', number: pullRequestNumber(url), adopted: false }
}

export async function mergeGithub(ctx, task, origin, signal, record = async () => {}) {
  const { path } = task.worktree
  const gh = pullRequestInPlace(ctx, path, signal)
  const repo = ['--repo', `github.com/${origin.repo}`]
  await gh(['auth', 'status', '--hostname', 'github.com'])
  const found = await findPullRequest(gh, repo, task)
  if (!found) throw new Error('The branch has no pull request; send the pull request first')
  const { url, view } = found
  if (!pullRequestUrl(url)) throw new Error('The existing pull request URL is not a GitHub pull request')
  if (!exactPullRequest(view, task)) throw new Error('The pull request does not match the reviewed branch and target')
  if (view.state === 'MERGED') {
    await record({ status: 'merged', prUrl: url, prState: 'MERGED' })
    return { url, state: 'MERGED', number: pullRequestNumber(url), adopted: true }
  }
  if (view.state !== 'OPEN') throw new Error('The pull request is not open')
  if (view.mergeable === 'CONFLICTING') throw new Error('The pull request has merge conflicts; the base branch was not changed')
  const number = pullRequestNumber(url)
  await gh(['pr', 'merge', number, ...repo, '--merge', '--match-head-commit', task.review.head])
  const final = await viewPullRequest(gh, repo, url)
  if (!exactPullRequest(final, task) || final.state !== 'MERGED') throw new Error('GitHub did not report the pull request as merged')
  await record({ status: 'merged', prUrl: url, prState: 'MERGED' })
  return { url, state: 'MERGED', number, adopted: false }
}
