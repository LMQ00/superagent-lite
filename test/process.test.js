import assert from 'node:assert/strict'
import test from 'node:test'
import { runCommand, runProcess } from '../src/process.js'

function harness({ text = '', lossy = false } = {}) {
  const spawns = []
  const ctx = { subprocess: {
    async resolveExecutable(name) { return name },
    spawn(spec) {
      spawns.push(spec)
      return { done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { readFrom: () => ({ text, lossy }) } } }
    },
  } }
  return { ctx, spawns }
}

test('git and gh calls keep the default 65536 byte limit', async () => {
  const { ctx, spawns } = harness({ text: 'sha\n' })
  assert.equal(await runCommand(ctx, ['rev-parse', 'HEAD'], '/fixture'), 'sha')
  assert.equal(spawns[0].stdio.stdout.maxBytes, 65536)
  assert.equal(spawns[0].stdio.stderr.maxBytes, 65536)

  await runProcess(ctx, 'gh', ['pr', 'view'], '/fixture')
  assert.equal(spawns[1].stdio.stdout.maxBytes, 65536)
  assert.equal(spawns[1].stdio.stderr.maxBytes, 65536)
})

test('runCommand passes a custom maxBytes through to the spawn spec', async () => {
  const { ctx, spawns } = harness()
  await runCommand(ctx, ['diff', 'base', 'head', '--'], '/fixture', undefined, 262144)
  assert.equal(spawns[0].stdio.stdout.maxBytes, 262144)
  assert.equal(spawns[0].stdio.stderr.maxBytes, 262144)
})

test('a lossy result reports the command and the limit that was exceeded', async () => {
  const { ctx } = harness({ lossy: true })
  await assert.rejects(
    runCommand(ctx, ['diff', 'base', 'head', '--'], '/fixture', undefined, 262144),
    { message: 'git diff output exceeded 262144 bytes' },
  )
  await assert.rejects(
    runCommand(ctx, ['status', '--porcelain'], '/fixture'),
    { message: 'git status output exceeded 65536 bytes' },
  )
  await assert.rejects(
    runProcess(ctx, 'gh', ['pr', 'view'], '/fixture'),
    { message: 'gh pr output exceeded 65536 bytes' },
  )
})
