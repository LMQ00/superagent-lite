import assert from 'node:assert/strict'
import test from 'node:test'
import { PANEL_STATUSES, panelStatus, reviewIndex } from '../src/status.js'

const task = overrides => ({ mode: 'change', status: 'awaiting-merge', ...overrides })

test('the panel exposes exactly the six ordered statuses', () => {
  assert.deepEqual(PANEL_STATUSES, ['unmerged', 'running', 'unreviewed', 'completed', 'failed', 'answer'])
})

test('a reviewed unmerged head is unmerged, even when the stored record says failed or blocked', () => {
  for (const status of ['awaiting-merge', 'review-required', 'failed', 'delivery-blocked', 'awaiting-ci']) {
    assert.equal(panelStatus(task({ status }), { reviewed: true, merged: false, hasCommits: true }), 'unmerged', status)
  }
})

test('a merged or pushed head is completed and a closed pull request is failed', () => {
  assert.equal(panelStatus(task({ status: 'awaiting-ci' }), { reviewed: true, merged: true, hasCommits: true }), 'completed')
  assert.equal(panelStatus(task({ status: 'merged' }), {}), 'completed')
  assert.equal(panelStatus(task({ status: 'cancelled' }), { merged: true, hasCommits: true }), 'completed')
  assert.equal(panelStatus(task({ status: 'delivery-blocked' }), { reviewed: true, closed: true, hasCommits: true }), 'failed')
})

test('only a committed head without an approved review is unreviewed', () => {
  assert.equal(panelStatus(task({ status: 'review-required' }), { reviewed: false, merged: false, hasCommits: true }), 'unreviewed')
  assert.equal(panelStatus(task({ status: 'running' }), { reviewed: false, hasCommits: true }), 'running')
})

test('a completed turn that committed nothing is completed instead of unreviewed', () => {
  assert.equal(panelStatus(task({ status: 'review-required', stopReason: 'completed' }), { reviewed: false, merged: false, hasCommits: false }), 'completed')
  assert.equal(panelStatus(task({ status: 'failed', stopReason: 'error' }), { reviewed: false, hasCommits: false }), 'failed')
  assert.equal(panelStatus(task({ status: 'review-required', stopReason: 'completed' }), { reviewed: false, hasCommits: undefined }), 'unreviewed')
})

test('report-only tasks are answer, running or failed', () => {
  assert.equal(panelStatus(task({ mode: 'report', status: 'completed' }), {}), 'answer')
  assert.equal(panelStatus(task({ mode: 'report', status: 'running' }), {}), 'running')
  assert.equal(panelStatus(task({ mode: 'report', status: 'failed' }), {}), 'failed')
})

test('a non-git task is completed by its workspace review instead of waiting for a merge', () => {
  const workspace = { mode: 'change', git: false }
  assert.equal(panelStatus({ ...workspace, status: 'running' }, {}), 'running')
  assert.equal(panelStatus({ ...workspace, status: 'review-required' }, {}), 'unreviewed')
  assert.equal(panelStatus({ ...workspace, status: 'review-required', review: { head: 'workspace', approved: true } }, {}), 'completed')
  assert.equal(panelStatus({ ...workspace, status: 'completed' }, {}), 'completed')
  assert.equal(panelStatus({ ...workspace, status: 'failed' }, {}), 'failed')
  assert.equal(panelStatus({ ...workspace, status: 'failed', review: { head: 'workspace', approved: true } }, {}), 'failed')
})

test('an unavailable Git view falls back to the recorded lifecycle status', () => {
  assert.equal(panelStatus(task({ status: 'awaiting-merge' }), {}), 'unmerged')
  assert.equal(panelStatus(task({ status: 'review-required' }), {}), 'unreviewed')
  assert.equal(panelStatus(task({ status: 'failed' }), {}), 'failed')
  assert.equal(panelStatus(task({ status: 'completed' }), {}), 'completed')
  assert.equal(panelStatus(task({ status: 'starting' }), {}), 'running')
  assert.equal(panelStatus(task({ status: 'queued' }), {}), 'running')
})

test('the review index links approved commits to their project only', () => {
  const index = reviewIndex([
    { projectRoot: '/a', review: { head: 'h1', approved: true, reviewerSessionId: 'r' } },
    { projectRoot: '/a', review: { head: 'h2', approved: false } },
    { projectRoot: '/b', review: { head: 'h1', approved: true } },
  ])
  assert.equal(index.get('/a\0h1').reviewerSessionId, 'r')
  assert.equal(index.has('/a\0h2'), false)
  assert.equal(index.get('/b\0h1').head, 'h1')
})
