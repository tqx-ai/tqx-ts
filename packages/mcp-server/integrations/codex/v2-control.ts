import assert from 'node:assert/strict'
import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { V2Ready } from './v2-ready'
import type { V2Case } from './v2-matrix'
import type { FixturePrincipal } from './v2-session'
import { validateLiveAuditProvenance, type FixtureAudit } from './v2-evidence'
import { assertLiveIntegrationAllowed, type LivePermit } from './local-policy'

export interface FixtureAdapter {
  arm(test: V2Case, principal: FixturePrincipal): Promise<void>
  snapshot(test: V2Case, principal: FixturePrincipal): Promise<FixtureAudit>
}
export function fileFixtureAdapter(
  directory: string,
  ready: V2Ready,
  runId: string,
  permit?: LivePermit,
): FixtureAdapter {
  assert(/^[A-Za-z0-9._-]+$/.test(runId))
  let sequence = 0
  async function request(
    action: 'arm' | 'snapshot',
    test: V2Case,
    principal: FixturePrincipal,
  ): Promise<Record<string, unknown>> {
    assertLiveIntegrationAllowed(permit)
    assert.equal(permit.ready.generation, ready.generation)
    assert(
      Date.parse(ready.expiresAt) > Date.now(),
      'Owner READY expired; no new case is permitted',
    )
    await access(directory) // The fixture owner creates its control directory only when READY.
    const id = `${runId}.${++sequence}`
    const file = resolve(directory, `${id}.request.json`)
    const temporary = `${file}.tmp`
    await writeFile(
      temporary,
      JSON.stringify({
        schemaVersion: 1,
        id,
        generation: ready.generation,
        action,
        caseId: test.id,
        tool: test.tool,
        inputKey: test.input,
        scenario: test.scenario,
        principal,
      }),
      { flag: 'wx' },
    )
    await rename(temporary, file)
    const reply = resolve(directory, `${id}.response.json`)
    for (let attempt = 0; attempt < 150; attempt++) {
      let text: string
      try {
        text = await readFile(reply, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }
      assert(text.length <= 1_048_576, 'Fixture reply is too large')
      const result = JSON.parse(text) as Record<string, unknown>
      assert.equal(result.schemaVersion, 1)
      assert.equal(result.id, id)
      assert.equal(result.generation, ready.generation)
      assert.equal(result.caseId, test.id)
      assert.deepEqual(result.principal, principal)
      assert.equal(result.synthetic, true)
      assert.equal(result.mode, 'PAPER')
      assert.equal(result.broker, 'fake')
      assert.equal(result.ok, true, 'Fixture rejected the requested test case')
      return result
    }
    throw new Error('Fixture control unavailable; case is blocked, not passed')
  }
  return {
    async arm(test, principal) {
      await request('arm', test, principal)
    },
    async snapshot(test, principal) {
      const audit = (await request('snapshot', test, principal)).audit as FixtureAudit
      validateLiveAuditProvenance(audit)
      return audit
    },
  }
}
