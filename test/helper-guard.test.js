import assert from 'node:assert/strict'
import test from 'node:test'
import { claimHelper, clearHelperExpectation, expectHelper, registerReadOnlyGuard } from '../src/helper-guard.js'

test('only an expected child is claimed as a helper', () => {
  assert.equal(claimHelper('parent'), false)
  expectHelper('parent')
  assert.equal(claimHelper('parent'), true)
  assert.equal(claimHelper('parent'), false)
})

test('nested expectations survive one claim and clear together', () => {
  expectHelper('parent')
  expectHelper('parent')
  assert.equal(claimHelper('parent'), true)
  assert.equal(claimHelper('parent'), true)
  assert.equal(claimHelper('parent'), false)
  expectHelper('parent')
  clearHelperExpectation('parent')
  assert.equal(claimHelper('parent'), false)
})

test('the helper guard permits only the structured result tool', () => {
  const denials = []
  registerReadOnlyGuard({ ctx: { tools: { guard(check) {
    denials.push(check({ name: 'write' }))
    denials.push(check({ name: 'bash' }))
    denials.push(check({ name: 'structured_output' }))
  } } } })
  assert.match(denials[0], /read-only helper/)
  assert.match(denials[1], /read-only helper/)
  assert.equal(denials[2], undefined)
})
