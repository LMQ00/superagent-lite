import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('bundled router prompt keeps replies concrete, single, and merge-gated', async () => {
  const config = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

  assert.match(config, /Started: <concrete change>/)
  assert.match(config, /surface one outcome, once/)
  assert.match(config, /Never repeat an unchanged result/)
  assert.match(config, /only the user's `\/merge-worker` command authorizes it/)
})
