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
    if (url.origin === 'https://github.com' && !url.username && !url.password && !url.search && !url.hash &&
        /^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/pull\/\d+\/?$/.test(url.pathname)) return url.href.replace(/\/$/, '')
  } catch {
    return undefined
  }
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

function belongsToRepository(url, repository) {
  return typeof url === 'string' && url.startsWith(`https://github.com/${repository}/pull/`)
}

async function findPullRequest(gh, repo, task, repository) {
  if (task.prUrl) {
    const url = pullRequestUrl(task.prUrl)
    if (!url) throw new Error('The stored pull request URL is not a GitHub pull request')
    if (!belongsToRepository(url, repository)) throw new Error('The stored pull request URL does not belong to this project repository')
    return { url, view: await viewPullRequest(gh, repo, url) }
  }
  try {
    const view = await viewPullRequest(gh, repo, task.worktree.branch)
    const url = pullRequestUrl(view.url)
    if (!belongsToRepository(url, repository)) throw new Error('The pull request does not belong to this project repository')
    return { url, view }
  } catch (error) {
    if (error.message === 'The pull request does not belong to this project repository') throw error
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
  const existing = await findPullRequest(gh, repo, task, origin.repo)
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
