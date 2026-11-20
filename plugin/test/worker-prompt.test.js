import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkerPrompt } from '../src/worker-prompt.js'

test('worker prompt is detailed only at dispatch and requires independent review', () => {
  const prompt = buildWorkerPrompt({
    title: 'Add project panel',
    teamId: 'project-alpha',
    baseBranch: 'main',
    task: 'Implement the task panel and its tests.',
  })

  assert.match(prompt, /Project team: project-alpha/)
  assert.match(prompt, /Base branch: main/)
  assert.match(prompt, /call create_worktree once/)
  assert.match(prompt, /separate read-only subagent/)
  assert.match(prompt, /Do not push or merge/)
})
