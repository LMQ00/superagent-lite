import assert from 'node:assert/strict'
import test from 'node:test'
import { createReviewScope } from '../src/review-scope.js'

const worktree = '/repo/worktree'
const base = 'a'.repeat(40)
const head = 'b'.repeat(40)

function scope(changedFiles = ['changed.js']) {
  return createReviewScope({ worktree, baseCommit: base, headCommit: head, changedFiles })
}

test('only git commands that change branches or history are refused', () => {
  const reviewScope = scope()
  for (const command of [
    `git diff ${base}..${head}`,
    `git diff --stat ${base} ${head}`,
    `git show ${head}`,
    `git log --all --oneline`,
    'git status --porcelain',
    'git blame changed.js',
    'git grep value',
    'cat /etc/hosts',
    'grep "git commit" changed.js',
    'npm test',
    'node scripts/check.js | tee report.txt',
    'find . -name "*.js"',
    `sh -c 'git diff ${base}..${head}'`,
  ]) {
    assert.equal(reviewScope.checkCommand(command), undefined, command)
  }
})

test('git commands that move branches or history are refused', () => {
  const reviewScope = scope()
  for (const command of [
    'git commit -m x',
    'git commit --amend',
    'git init',
    'git merge feature',
    'git rebase main',
    `git -C ${worktree} commit -m x`,
    'git -c user.name=dsh commit -m x',
    'git --no-pager commit -m x',
    'git --git-dir=.git commit -m x',
    '/usr/bin/git commit -m x',
    'cd repo && git merge feature',
    'git status; git commit -m x',
    'git diff HEAD | git commit -m x',
    `sh -c 'git commit -m x'`,
    'bash -lc "git rebase main"',
    'pwsh -Command "git commit -m x"',
    'env GIT_AUTHOR_NAME=dsh git commit -m x',
    'sudo git commit -m x',
    'xargs git commit -m x',
    'find . -name "*.js" -exec git commit -m x ;',
    'timeout 10 git commit -m x',
    'eval "git commit -m x"',
    'echo $(git commit -m x)',
    'echo `git commit -m x`',
    'bash -c "echo $(git commit -m x)"',
    'git checkout main',
    'git switch -c branch',
    'git reset --hard HEAD~1',
    'git branch -D branch',
    'git tag release',
    'git stash',
    'git push origin main',
    'git fetch origin',
    'git pull origin main',
    'git cherry-pick abc123',
    'git revert abc123',
    'git am patch.diff',
    'git update-ref refs/heads/x HEAD',
    'git symbolic-ref HEAD refs/heads/x',
    'git worktree add ../x',
    'git filter-branch --all',
    'git replace abc123 def456',
  ]) {
    assert.match(reviewScope.checkCommand(command), /may not create or change git branches/, command)
  }
})

test('only a diff or changed-file read counts as evidence', () => {
  const diffScope = scope()
  assert.equal(diffScope.hasEvidence(), false)
  diffScope.record('bash', { command: `git diff ${base}..${head}` })
  assert.equal(diffScope.hasEvidence(), true)

  const twoRevisionScope = scope()
  twoRevisionScope.record('bash', { command: `git diff ${base} ${head}` })
  assert.equal(twoRevisionScope.hasEvidence(), true)

  const fileScope = scope()
  fileScope.record('read', { file_path: 'README.md' })
  assert.equal(fileScope.hasEvidence(), false)
  fileScope.record('read', { file_path: 'changed.js' })
  assert.equal(fileScope.hasEvidence(), true)

  const weakScope = scope()
  weakScope.record('bash', { command: `git show ${base}` })
  weakScope.record('bash', { command: `git log --oneline ${base}..${head}` })
  weakScope.record('bash', { command: 'git status --porcelain' })
  assert.equal(weakScope.hasEvidence(), false)
  weakScope.record('bash', { command: `git show ${head}:changed.js` })
  assert.equal(weakScope.hasEvidence(), true)

  const logScope = scope()
  logScope.record('bash', { command: `git log --oneline ${base}..${head}` })
  assert.equal(logScope.hasEvidence(), false)
  logScope.record('bash', { command: `git log -p ${base}..${head}` })
  assert.equal(logScope.hasEvidence(), true)

  const shellScope = scope()
  shellScope.record('bash', { command: `sh -c 'git diff ${base}..${head}'` })
  assert.equal(shellScope.hasEvidence(), true)

  const substitutionScope = scope()
  substitutionScope.record('bash', { command: `echo $(git diff ${base}..${head})` })
  assert.equal(substitutionScope.hasEvidence(), true)

  const tripleDotScope = scope()
  tripleDotScope.record('bash', { command: `git diff ${base}...${head}` })
  assert.equal(tripleDotScope.hasEvidence(), true)

  const grepScope = scope()
  grepScope.record('grep', { path: 'changed.js' })
  assert.equal(grepScope.hasEvidence(), true)
})

test('a workspace review counts reading any project file and blocks git init', () => {
  const workspace = createReviewScope({ worktree, workspace: true })
  assert.equal(workspace.checkCommand('git diff HEAD'), undefined)
  assert.match(workspace.checkCommand('git init'), /may not create or change git branches/)
  assert.equal(workspace.hasEvidence(), false)
  workspace.record('read', { file_path: 'notes.txt' })
  assert.equal(workspace.hasEvidence(), true)

  const outside = createReviewScope({ worktree, workspace: true })
  outside.record('read', { file_path: '/elsewhere/notes.txt' })
  assert.equal(outside.hasEvidence(), false)
  outside.record('grep', { path: '/elsewhere' })
  assert.equal(outside.hasEvidence(), false)
})
