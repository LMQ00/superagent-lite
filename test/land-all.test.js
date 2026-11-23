import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/land-all.sh', import.meta.url))

function git(repo, ...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'land-all-test-'))
  const repo = path.join(root, 'repo')
  const tasks = path.join(root, 'tasks')
  fs.mkdirSync(repo)
  fs.mkdirSync(tasks)
  git(repo, 'init', '-q', '-b', 'master')
  git(repo, 'config', 'user.name', 'land-all test')
  git(repo, 'config', 'user.email', 'land-all@example.test')
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'land-all-fixture',
    private: true,
    scripts: { test: 'node -e "process.exit(0)"' },
  }, null, 2))
  fs.writeFileSync(path.join(repo, 'notes.txt'), 'one\nshared\nthree\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'base')
  return { root, repo, tasks }
}

function installScript(repo) {
  fs.mkdirSync(path.join(repo, 'scripts'))
  const target = path.join(repo, 'scripts', 'land-all.sh')
  fs.copyFileSync(SCRIPT, target)
  fs.chmodSync(target, 0o755)
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'script')
  return target
}

function branch(repo, id, changes) {
  git(repo, 'checkout', '-q', '-b', `sl-superagent-lite-${id}`, 'master')
  for (const [file, content] of Object.entries(changes)) {
    fs.writeFileSync(path.join(repo, file), content)
  }
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', id)
  const head = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'checkout', '-q', 'master')
  return head
}

function task(tasks, id, head) {
  fs.writeFileSync(path.join(tasks, `${id}.json`), JSON.stringify({
    id,
    title: id,
    status: 'awaiting-merge',
    review: { approved: true, head },
  }))
}

function run(repo, tasks) {
  return spawnSync('bash', [path.join(repo, 'scripts', 'land-all.sh')], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, LAND_ALL_TASKS_DIR: tasks },
  })
}

function withFixture(fn) {
  const ctx = fixture()
  try {
    fn(ctx)
  } finally {
    fs.rmSync(ctx.root, { recursive: true, force: true })
  }
}

test('land-all keeps both sides when both branches only add lines', () => {
  withFixture(({ repo, tasks }) => {
    installScript(repo)
    task(tasks, 'addaaa', branch(repo, 'addaaa', { 'notes.txt': 'one\nshared\nA\nthree\n' }))
    task(tasks, 'addbbb', branch(repo, 'addbbb', { 'notes.txt': 'one\nshared\nB\nthree\n' }))

    const result = run(repo, tasks)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(fs.readFileSync(path.join(repo, 'notes.txt'), 'utf8'), 'one\nshared\nA\nB\nthree\n')
    assert.equal(git(repo, 'rev-list', '--count', '--merges', 'HEAD'), '2')
  })
})

test('land-all stops on same-line edits under the default merge style', () => {
  withFixture(({ repo, tasks }) => {
    installScript(repo)
    task(tasks, 'modaaa', branch(repo, 'modaaa', { 'notes.txt': 'one\nours\nthree\n' }))
    task(tasks, 'modbbb', branch(repo, 'modbbb', { 'notes.txt': 'one\ntheirs\nthree\n' }))

    const result = run(repo, tasks)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /无法安全自动解决/)
    assert.match(fs.readFileSync(path.join(repo, 'notes.txt'), 'utf8'), /^<<<<<<< /m)
    assert.match(git(repo, 'status', '--porcelain'), /^UU notes\.txt$/m)
    assert.doesNotMatch(git(repo, 'log', '--format=%s', '-3'), /modbbb/)
  })
})

test('land-all stops on add/add conflicts instead of concatenating files', () => {
  withFixture(({ repo, tasks }) => {
    installScript(repo)
    task(tasks, 'fileaaa', branch(repo, 'fileaaa', { 'new.txt': 'A\n' }))
    task(tasks, 'filebbb', branch(repo, 'filebbb', { 'new.txt': 'B\n' }))

    const result = run(repo, tasks)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /双方各自新增同一路径/)
    assert.doesNotMatch(fs.readFileSync(path.join(repo, 'new.txt'), 'utf8'), /^A\nB\n$/)
    assert.match(git(repo, 'status', '--porcelain'), /^AA new\.txt$/m)
  })
})
