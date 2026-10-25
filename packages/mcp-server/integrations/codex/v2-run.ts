import assert from 'node:assert/strict'
import { clientTarget } from './target'
import { v2Matrix } from './v2-matrix'
import { runMemorySuite } from './v2-memory'
import { authorizeLiveIntegration, assertLiveIntegrationAllowed } from './local-policy'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileFixtureAdapter } from './v2-control'
import { connectV2 } from './v2-session'
import { executeV2Suite, type V2Fixtures } from './v2-suite'

const args = process.argv.slice(2)
assert(
  args.every((arg) => ['--plan', '--run', '--memory', '--allow-synthetic-writes'].includes(arg)),
  'Unknown option; service secrets are not accepted',
)
assert(
  [args.includes('--plan'), args.includes('--run'), args.includes('--memory')].filter(Boolean)
    .length <= 1,
)
if (args.includes('--run')) {
  let authorized: Awaited<ReturnType<typeof authorizeLiveIntegration>> | undefined
  try {
    const target = clientTarget()
    authorized = await authorizeLiveIntegration(target)
    const { ready, fixtureData, controlDir, permit } = authorized
    const driver = process.env.TQX_CODEX_DRIVER ?? 'app-server'
    assert(driver === 'app-server' || driver === 'cli', 'Unknown actual-client login driver')
    const fixtures = JSON.parse(await readFile(fixtureData, 'utf8')) as V2Fixtures
    assert.equal(fixtures.generation, ready.generation)
    assert.equal(fixtures.fixtureNamespace, ready.fixtureNamespace)
    const evidence = await executeV2Suite({
      target,
      fixtures,
      runs: permit.runs,
      adapter: fileFixtureAdapter(controlDir, ready, `v2-${Date.now()}`, permit),
      allowSyntheticWrites: args.includes('--allow-synthetic-writes'),
      stillReady: () => assertLiveIntegrationAllowed(permit),
      sessionFactory: (caseTarget, user, runs) => connectV2(caseTarget, user, runs, permit, driver),
      recordReceipt: async (caseId, receipts) => {
        assertLiveIntegrationAllowed(permit)
        assert(/^[A-Za-z0-9_-]+$/.test(caseId))
        const name = `${caseId}.private.json`
        await writeFile(resolve(permit.runs, name), JSON.stringify({ caseId, receipts }), {
          flag: 'wx',
          mode: 0o600,
        })
        return name
      },
    })
    const report = {
      status:
        evidence.length === v2Matrix().length && evidence.every((test) => test.status === 'passed')
          ? 'passed'
          : 'incomplete',
      actualCodex: true,
      clientKind:
        driver === 'cli' ? 'installed-cli-login-and-app-server-tools' : 'installed-app-server',
      persistence: true,
      synthetic: true,
      mode: 'PAPER',
      broker: 'fake',
      generation: ready.generation,
      fixtureNamespace: ready.fixtureNamespace,
      cases: evidence,
    }
    const reportPath = resolve(permit.runs, 'report.private.json')
    await writeFile(reportPath, JSON.stringify(report), { flag: 'wx', mode: 0o600 })
    console.log(
      JSON.stringify({
        status: report.status,
        actualCodex: true,
        clientKind: report.clientKind,
        caseCount: evidence.length,
        passed: evidence.filter((test) => test.status === 'passed').length,
        incomplete: evidence.filter((test) => test.status !== 'passed'),
        reportPath,
      }),
    )
    if (evidence.length !== v2Matrix().length || evidence.some((test) => test.status !== 'passed'))
      process.exitCode = 1
  } catch {
    console.log(
      JSON.stringify({
        status: authorized ? 'failed' : 'policy-blocked',
        actualCodex: false,
        reason: authorized
          ? 'Fixture preflight failed; inspect private configuration without exposing credentials'
          : 'Requires explicit isolated-test opt-in, matching generation/namespace and fresh schema-v2 Owner READY',
      }),
    )
    process.exitCode = 2
  }
} else if (args.includes('--memory')) {
  const report = await runMemorySuite()
  console.log(
    JSON.stringify({
      actualCodex: report.actualCodex,
      clientKind: report.clientKind,
      persistence: report.persistence,
      externalNetwork: report.externalNetwork,
      authentication: report.authentication,
      caseCount: report.cases.length,
      passed: report.cases.filter((test) => test.status === 'passed').length,
      receiptCountInMemory: report.receiptCountInMemory,
    }),
  )
  if (report.cases.some((test) => test.status !== 'passed')) process.exitCode = 1
} else {
  console.log(
    JSON.stringify(
      {
        status: 'not-run',
        reason: 'plan only; no endpoint contacted',
        actualCodex: false,
        persistence: false,
        target: clientTarget(),
        matrix: v2Matrix(),
      },
      null,
      2,
    ),
  )
}
