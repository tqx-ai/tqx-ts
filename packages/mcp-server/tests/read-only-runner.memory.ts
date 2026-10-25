import { describe, expect, it } from 'vitest'
import { PUBLIC_TRADING_TOOL_ERROR_CODES } from '../src/trading'
import { READ_TOOLS, readOnlyPlan, type ReadCase } from './read-only-plan'
import {
  classifyReadObservation,
  runReadOnly,
  type ReadDriver,
  type ReadPermit,
} from './read-only-runner'

const permit = (): ReadPermit => ({
  approved: true,
  phase: 'B',
  subject: '740001',
  generation: 'owner-20261025-7648d1b4',
  expiresAt: Date.now() + 60_000,
  maxToolObservationsPerMinute: 20,
})
const testCase: ReadCase = {
  id: 'getAccount.offline',
  tool: 'getAccount',
  args: {},
  role: 'read',
  scenario: 'normal',
  expected: 'data',
  checks: ['sdk-schema'],
  requires: [],
}
const account = {
  account_id: 'private-account-not-for-report',
  mode: 'PAPER',
  base_currency: 'HKD',
  total_assets: '9007199254740993.12345',
  cash: null,
  available_cash: null,
  frozen_cash: null,
  buying_power: null,
  market_value: null,
  unrealized_pnl: null,
  as_of: 'fixture-time',
  is_stale: true,
}
function fakeDriver(overrides: Partial<ReadDriver> = {}) {
  let reads = 0,
    closed = false
  const driver: ReadDriver = {
    layer: 'memory-double',
    subject: '740001',
    capabilities: new Set(),
    fixtureValues: {},
    setup: async () => {},
    teardown: async () => {},
    close: async () => {
      closed = true
    },
    observe: async () => {
      reads++
      return { result: { content: [{ type: 'text', text: JSON.stringify(account) }] } }
    },
    audit: async () => ({
      businessDigest: 'same-private-digest',
      tradingReadAttempts: reads,
      tradingWriteAttempts: 0,
      effects: 0,
    }),
    semanticChecks: async () => ({}),
    ...overrides,
  }
  return { driver, closed: () => closed }
}
describe('READ preparation runner boundaries, pure doubles only', () => {
  it.each(PUBLIC_TRADING_TOOL_ERROR_CODES)('recognizes production safe error %s', (error) => {
    expect(
      classifyReadObservation({
        result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ error }) }] },
      }),
    ).toEqual({ kind: 'tool_error', errorCode: error })
  })
  it('has only unique READ cases and a single real-ledger gap rather than duplicate green counts', () => {
    const plan = readOnlyPlan()
    expect(new Set(plan.map((c) => c.id)).size).toBe(plan.length)
    expect(plan.every((c) => READ_TOOLS.includes(c.tool))).toBe(true)
    expect(plan.filter((c) => c.expected === 'capability_gap')).toHaveLength(1)
  })
  it.each(['absent', 'phase-A', 'expired'] as const)(
    'rejects %s permit before opening any protocol/controller adapter',
    async (mode) => {
      let opened = false
      const candidate =
        mode === 'absent'
          ? undefined
          : ({
              ...permit(),
              ...(mode === 'phase-A' ? { phase: 'A' } : { expiresAt: 1 }),
            } as ReadPermit)
      await expect(
        runReadOnly({
          permit: candidate,
          generation: permit().generation,
          openDriver: async () => {
            opened = true
            return fakeDriver().driver
          },
        }),
      ).rejects.toThrow('fresh explicit Owner B permit')
      expect(opened).toBe(false)
    },
  )
  it('rejects a write-tool descriptor before opening an adapter, even if injected at runtime', async () => {
    let opened = false
    await expect(
      runReadOnly({
        permit: permit(),
        generation: permit().generation,
        cases: [{ ...testCase, tool: 'placeOrder' } as unknown as ReadCase],
        openDriver: async () => {
          opened = true
          return fakeDriver().driver
        },
      }),
    ).rejects.toThrow('non-READ')
    expect(opened).toBe(false)
  })
  it('classifies plain SDK not-found and validation separately from structured auth/tool errors', () => {
    const text = (value: string) => ({
      result: { isError: true, content: [{ type: 'text', text: value }] },
    })
    expect(classifyReadObservation(text('MCP error -32602: Tool getOrder not found')).kind).toBe(
      'tool_unavailable',
    )
    expect(classifyReadObservation(text('MCP error -32602: Input validation error')).kind).toBe(
      'invalid_arguments',
    )
    expect(classifyReadObservation(text('{"error":"permission_denied"}'))).toEqual({
      kind: 'tool_error',
      errorCode: 'permission_denied',
    })
    expect(classifyReadObservation(text('unrecognized private backend message')).kind).toBe(
      'unclassified',
    )
  })
  it('records unsupported ledger as a gap, never a passed ledger feature', async () => {
    const f = fakeDriver({
      observe: async () => ({
        result: {
          isError: true,
          content: [{ type: 'text', text: '{"error":"cash_flows_unsupported"}' }],
        },
      }),
    })
    const report = await runReadOnly({
      permit: permit(),
      generation: permit().generation,
      cases: [
        {
          ...testCase,
          tool: 'listCashFlows',
          expected: 'capability_gap',
          expectedCode: 'cash_flows_unsupported',
        },
      ],
      openDriver: async () => f.driver,
    })
    expect(report.results[0]?.outcome).toBe('unsupported')
    expect(report.counts.passed).toBe(0)
    expect(report.results[0]?.errorMappingPassed).toBe(true)
    expect(report.actualProtocol).toBe(false)
    expect(f.closed()).toBe(true)
  })
  it('does not accept an unsupported error mapping that leaks extra fields or content', async () => {
    const unsafe = {
      isError: true,
      content: [
        { type: 'text', text: '{"error":"cash_flows_unsupported","debug":"PRIVATE_CANARY"}' },
      ],
    }
    expect(classifyReadObservation({ result: unsafe }).kind).toBe('unclassified')
    expect(
      classifyReadObservation({
        result: {
          isError: true,
          content: [
            { type: 'text', text: '{"error":"cash_flows_unsupported"}' },
            { type: 'text', text: 'PRIVATE_CANARY' },
          ],
        },
      }).kind,
    ).toBe('unclassified')
    const report = await runReadOnly({
      permit: permit(),
      generation: permit().generation,
      cases: [
        {
          ...testCase,
          tool: 'listCashFlows',
          expected: 'capability_gap',
          expectedCode: 'cash_flows_unsupported',
        },
      ],
      openDriver: async () => fakeDriver({ observe: async () => ({ result: unsafe }) }).driver,
    })
    expect(report.results).toMatchObject([
      { outcome: 'failed', reason: 'unexpected-protocol-result' },
    ])
    expect(report.counts.unsupported).toBe(0)
    expect(JSON.stringify(report)).not.toContain('PRIVATE_CANARY')
  })
  it('never copies raw account values, IDs or audit digests into the report', async () => {
    const f = fakeDriver()
    const report = await runReadOnly({
      permit: permit(),
      generation: permit().generation,
      cases: [testCase],
      openDriver: async () => f.driver,
    })
    expect(report.results[0]?.outcome).toBe('passed')
    expect(JSON.stringify(report)).not.toMatch(
      /private-account|9007199254740993|same-private-digest/,
    )
    expect(f.closed()).toBe(true)
  })
  it('stops immediately after any trade-write/effect or business digest mutation', async () => {
    let snapshots = 0,
      observed = 0
    const f = fakeDriver({
      audit: async () =>
        ++snapshots === 1
          ? {
              businessDigest: 'before',
              tradingReadAttempts: 0,
              tradingWriteAttempts: 0,
              effects: 0,
            }
          : {
              businessDigest: 'after',
              tradingReadAttempts: 1,
              tradingWriteAttempts: 1,
              effects: 1,
            },
      observe: async () => {
        observed++
        return { result: { content: [{ type: 'text', text: JSON.stringify(account) }] } }
      },
    })
    const report = await runReadOnly({
      permit: permit(),
      generation: permit().generation,
      cases: [testCase, { ...testCase, id: 'getAccount.must-not-run' }],
      openDriver: async () => f.driver,
    })
    expect(report.results.map((r) => r.outcome)).toEqual(['failed', 'not-run'])
    expect(observed).toBe(1)
  })
})
