import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const distributions = ['skills/tqx-data', 'plugins/agent-plugin/skills/tqx-data']

describe('Local data Skill helper', () => {
  it.each(distributions)('runs credential and environment tests for %s', (directory) => {
    const result = execFileSync(
      'python3',
      [resolve(root, directory, 'tests/test_tqx_data_auth.py')],
      { encoding: 'utf8', timeout: 15_000, stdio: 'pipe' },
    )
    expect(result).not.toContain('secret')
  })

  it('keeps the portable helper behavior identical across distributions', () => {
    const helpers = distributions.map((directory) =>
      readFileSync(resolve(root, directory, 'scripts/tqx_data_auth.py')),
    )
    expect(helpers[0]).toEqual(helpers[1])
  })
})
