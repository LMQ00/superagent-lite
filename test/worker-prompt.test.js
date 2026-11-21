import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkerPrompt } from '../src/worker-prompt.js'

test('change tasks are told to work in a worktree, commit and request independent review', () => {
  const prompt = buildWorkerPrompt({
    title: 'Add project panel',
    teamId: 'project-alpha',
    baseBranch: 'main',
    task: 'Implement the task panel and its tests.',
  })

  assert.match(prompt, /Project team: project-alpha/)
  assert.match(prompt, /Base branch: main/)
  assert.match(prompt, /Mode: change/)
  assert.match(prompt, /call create_worktree once/)
  assert.match(prompt, /Commit on the assigned branch, then call review_worker_commit/)
  assert.match(prompt, /separate read-only subagent/)
  assert.match(prompt, /Do not push or merge/)
  assert.match(prompt, /call message_router with the final conclusion/)
})

test('report-only tasks are told to inspect in place and end with report_task', () => {
  const prompt = buildWorkerPrompt({
    title: 'Diagnose the merge worker',
    teamId: 'project-alpha',
    baseBranch: 'main',
    task: '只做诊断，本轮不改代码。给出结论与证据。',
    mode: 'report',
  })

  assert.match(prompt, /Mode: report-only/)
  assert.match(prompt, /Do not create a worktree, edit files, commit, or request review/)
  assert.match(prompt, /Do not call create_worktree/)
  assert.match(prompt, /do not call review_worker_commit/)
  assert.match(prompt, /Call report_task once with the conclusion and evidence/)
  assert.doesNotMatch(prompt, /Commit on the assigned branch/)
  assert.doesNotMatch(prompt, /call message_router with the final conclusion/)
})
