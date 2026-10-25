import {
  TradingAccountDataSchema,
  PositionsDataSchema,
  OrdersDataSchema,
  OrderDataSchema,
  TradesDataSchema,
  CashFlowsDataSchema,
  SignalDataSchema,
} from '@tqx-ai/sdk'
import { setTimeout as delay } from 'node:timers/promises'
import { isPublicTradingToolErrorCode } from '../src/trading'
import { assertReadTool, readOnlyPlan, type ReadCase, type ReadTool } from './read-only-plan'

export interface ReadPermit {
  approved: true
  phase: 'B'
  subject: '740001'
  generation: string
  expiresAt: number
  maxToolObservationsPerMinute: number
}
export interface ReadObservation {
  httpStatus?: number
  challengePresent?: boolean
  result?: unknown
  rpcCode?: number
  rpcKind?: 'invalid_arguments' | 'tool_unavailable'
  transport?: {
    action: 'call' | 'cancel' | 'reconnect' | 'parallel-two'
    toolPosts: number
    peakInflight: number
    initialized: number
    closed: number
    cancelledAfterReadStarted?: boolean
    quiescent: boolean
    peers?: ReadObservation[]
  }
}
export interface ReadAudit {
  businessDigest: string
  tradingReadAttempts: number
  tradingWriteAttempts: number
  effects: number
  activeReadAttempts?: number
  lastReadId?: string | null
  integrityOk?: boolean
}
export interface ReadDriver {
  layer: 'official-mcp-sdk' | 'memory-double'
  subject: '740001'
  capabilities: ReadonlySet<string>
  fixtureValues: Readonly<Record<string, unknown>>
  supportsCase?(test: ReadCase): boolean
  record?(
    test: ReadCase,
    stage: 'before' | 'observation' | 'after' | 'semantic',
    value: unknown,
  ): Promise<void>
  setup(test: ReadCase): Promise<void>
  teardown(test: ReadCase): Promise<void>
  observe(
    tool: ReadTool,
    args: Record<string, unknown>,
    role: ReadCase['role'],
    test?: ReadCase,
  ): Promise<ReadObservation>
  audit(): Promise<ReadAudit>
  semanticChecks(
    test: ReadCase,
    privateData: unknown,
    observation?: ReadObservation,
  ): Promise<Readonly<Record<string, boolean>>>
  close(): Promise<void>
}
export interface RedactedReadResult {
  id: string
  tool: ReadTool
  outcome: 'passed' | 'failed' | 'blocked' | 'unsupported' | 'not-run'
  reason?: string
  errorMappingPassed?: boolean
  unchangedBusiness?: boolean
  tradeWriteDelta?: number
  effectDelta?: number
  semanticChecks?: Readonly<Record<string, boolean>>
  transport?: {
    action: 'call' | 'cancel' | 'reconnect' | 'parallel-two'
    toolPosts: number
    peakInflight: number
    initialized: number
    closed: number
    quiescent: boolean
    cancelledAfterReadStarted?: boolean
  }
}
const schemas = {
  getAccount: TradingAccountDataSchema,
  listPositions: PositionsDataSchema,
  listOrders: OrdersDataSchema,
  getOrder: OrderDataSchema,
  listTrades: TradesDataSchema,
  listCashFlows: CashFlowsDataSchema,
  getSignal: SignalDataSchema,
}

export function classifyReadObservation(observation: ReadObservation): {
  kind:
    | 'data'
    | 'invalid_arguments'
    | 'tool_unavailable'
    | 'tool_error'
    | 'http_401'
    | 'http_403'
    | 'unclassified'
  data?: unknown
  errorCode?: string
} {
  if (observation.httpStatus === 401) return { kind: 'http_401' }
  if (observation.httpStatus === 403) return { kind: 'http_403' }
  if (observation.rpcCode === -32602 && observation.rpcKind) return { kind: observation.rpcKind }
  const result = observation.result
  if (
    !result ||
    typeof result !== 'object' ||
    !('content' in result) ||
    !Array.isArray(result.content)
  )
    return { kind: 'unclassified' }
  const texts = result.content.filter(
    (item): item is { type: 'text'; text: string } =>
      !!item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string',
  )
  if (result.content.length !== 1 || texts.length !== 1 || texts[0]!.text.length > 1_048_576)
    return { kind: 'unclassified' }
  const text = texts[0]!.text
  const isError = 'isError' in result && result.isError === true
  if (isError && /Tool .*not found/i.test(text)) return { kind: 'tool_unavailable' }
  if (isError && /(?:-32602|Input validation error|Invalid arguments)/i.test(text))
    return { kind: 'invalid_arguments' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { kind: 'unclassified' }
  }
  if (!isError) return { kind: 'data', data }
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Object.keys(data).length === 1 &&
    'error' in data &&
    typeof data.error === 'string' &&
    isPublicTradingToolErrorCode(data.error)
  )
    return { kind: 'tool_error', errorCode: data.error }
  return { kind: 'unclassified' }
}

export function checkReadPermit(permit: ReadPermit | undefined, generation: string) {
  if (
    !permit?.approved ||
    permit.phase !== 'B' ||
    permit.subject !== '740001' ||
    permit.generation !== generation ||
    !/^owner-\d{8}-[a-f0-9]{8}$/.test(generation) ||
    !Number.isFinite(permit.expiresAt) ||
    permit.expiresAt <= Date.now() ||
    permit.expiresAt > Date.now() + 7_200_000 ||
    !Number.isInteger(permit.maxToolObservationsPerMinute) ||
    permit.maxToolObservationsPerMinute < 1 ||
    permit.maxToolObservationsPerMinute > 20
  )
    throw new Error('READ execution requires a fresh explicit Owner B permit for isolated primary')
}
function resolveArgs(value: unknown, fixtures: Readonly<Record<string, unknown>>): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveArgs(item, fixtures))
  if (!value || typeof value !== 'object') return value
  const input = value as Record<string, unknown>
  if (typeof input.$readFixture === 'string') {
    if (!Object.hasOwn(fixtures, input.$readFixture))
      throw new Error('Missing private read fixture')
    return fixtures[input.$readFixture]
  }
  return Object.fromEntries(
    Object.entries(input).map(([key, child]) => [key, resolveArgs(child, fixtures)]),
  )
}
function validAudit(audit: ReadAudit): boolean {
  return (
    typeof audit.businessDigest === 'string' &&
    audit.businessDigest.length > 0 &&
    audit.integrityOk !== false &&
    (audit.activeReadAttempts === undefined || audit.activeReadAttempts === 0) &&
    [audit.tradingReadAttempts, audit.tradingWriteAttempts, audit.effects].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  )
}
export const builtInReadChecks = new Set([
  'sdk-schema',
  'zero-trade-writes',
  'zero-trading-dispatch',
  'no-trading-dispatch',
  'tool-not-found-not-validation',
  'normal-HTTP-challenge',
])

// No transport/token/file/controller is opened at import or until the B gate accepts.
// The Owner's adapter must use an actual official MCP Client and precheck private token subject
// before connect. A memory double is always labeled separately and is never live evidence.
export async function runReadOnly(options: {
  permit?: ReadPermit
  generation: string
  openDriver: (permit: ReadPermit) => Promise<ReadDriver>
  cases?: readonly ReadCase[]
}) {
  checkReadPermit(options.permit, options.generation)
  const permit = options.permit!
  const cases = options.cases ?? readOnlyPlan()
  for (const test of cases) {
    assertReadTool(test.tool)
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(test.id)) throw new Error('Invalid public read case ID')
  }
  const driver = await options.openDriver(permit)
  const results: RedactedReadResult[] = []
  const calls: number[] = []
  let stopped = false
  try {
    if (driver.subject !== '740001')
      throw new Error('READ driver identity is outside isolated primary')
    for (const test of cases) {
      if (stopped) {
        results.push({
          id: test.id,
          tool: test.tool,
          outcome: 'not-run',
          reason: 'stopped-after-safety-failure',
        })
        continue
      }
      checkReadPermit(permit, options.generation)
      if (
        (driver.supportsCase && !driver.supportsCase(test)) ||
        test.requires.some((capability) => !driver.capabilities.has(capability))
      ) {
        results.push({
          id: test.id,
          tool: test.tool,
          outcome: 'blocked',
          reason: 'missing-fixture-capability',
        })
        continue
      }
      let args: Record<string, unknown>
      try {
        args = resolveArgs(test.args, driver.fixtureValues) as Record<string, unknown>
      } catch {
        results.push({
          id: test.id,
          tool: test.tool,
          outcome: 'blocked',
          reason: 'missing-private-fixture',
        })
        continue
      }
      let setupStarted = false
      try {
        setupStarted = true
        await driver.setup(test)
        const before = await driver.audit()
        await driver.record?.(test, 'before', before)
        if (!validAudit(before)) throw new Error('Invalid audit')
        while (calls.length && calls[0]! <= Date.now() - 60_000) calls.shift()
        const cost = test.action === 'parallel-two' ? 2 : 1
        if (cost > permit.maxToolObservationsPerMinute)
          throw new Error('Permit rate below case cost')
        while (calls.length + cost > permit.maxToolObservationsPerMinute) {
          await delay(Math.max(1, calls[0]! + 60_000 - Date.now()))
          while (calls.length && calls[0]! <= Date.now() - 60_000) calls.shift()
        }
        checkReadPermit(permit, options.generation)
        for (let index = 0; index < cost; index++) calls.push(Date.now())
        const observation = await driver.observe(test.tool, args, test.role, test)
        await driver.record?.(test, 'observation', observation)
        const classified = classifyReadObservation(observation)
        const after = await driver.audit()
        await driver.record?.(test, 'after', after)
        if (
          !validAudit(after) ||
          after.tradingReadAttempts < before.tradingReadAttempts ||
          after.tradingWriteAttempts < before.tradingWriteAttempts ||
          after.effects < before.effects
        )
          throw new Error('Audit was reset or invalid')
        const writeDelta = after.tradingWriteAttempts - before.tradingWriteAttempts
        const effectDelta = after.effects - before.effects
        const unchangedBusiness = before.businessDigest === after.businessDigest
        if (writeDelta || effectDelta || !unchangedBusiness) {
          results.push({
            id: test.id,
            tool: test.tool,
            outcome: 'failed',
            reason: 'read-business-or-write-boundary-violated',
            tradeWriteDelta: writeDelta,
            effectDelta,
            unchangedBusiness,
          })
          stopped = true
          continue
        }
        const mustNotDispatch = [
          'invalid_arguments',
          'tool_unavailable',
          'http_401',
          'http_403',
        ].includes(test.expected)
        if (mustNotDispatch && after.tradingReadAttempts !== before.tradingReadAttempts) {
          results.push({
            id: test.id,
            tool: test.tool,
            outcome: 'failed',
            reason: 'rejected-call-reached-Trading',
          })
          continue
        }
        const gap = test.expected === 'capability_gap'
        const cancelled =
          test.action === 'cancel' && observation.transport?.cancelledAfterReadStarted === true
        const matched =
          (cancelled || classified.kind === (gap ? 'tool_error' : test.expected)) &&
          (!test.expectedCode || classified.errorCode === test.expectedCode) &&
          (!['http_401', 'http_403'].includes(test.expected) ||
            observation.challengePresent === true)
        if (!matched) {
          results.push({
            id: test.id,
            tool: test.tool,
            outcome: 'failed',
            reason: 'unexpected-protocol-result',
          })
          continue
        }
        if (gap) {
          results.push({
            id: test.id,
            tool: test.tool,
            outcome: 'unsupported',
            errorMappingPassed: true,
            unchangedBusiness,
            tradeWriteDelta: 0,
            effectDelta: 0,
          })
          continue
        }
        if (classified.kind === 'data') {
          const parsed = await schemas[test.tool]['~standard'].validate(classified.data)
          if (parsed.issues) {
            results.push({
              id: test.id,
              tool: test.tool,
              outcome: 'failed',
              reason: 'SDK-data-schema-mismatch',
            })
            continue
          }
        }
        const checks = test.checks.filter((check) => !builtInReadChecks.has(check))
        const checked = await driver.semanticChecks(test, classified.data, observation)
        await driver.record?.(test, 'semantic', checked)
        if (test.action && test.action !== 'call') {
          const transport = observation.transport
          const proven =
            transport?.action === test.action &&
            transport.quiescent &&
            (test.action === 'cancel'
              ? transport.cancelledAfterReadStarted === true && transport.toolPosts === 1
              : test.action === 'reconnect'
                ? transport.initialized >= 2 && transport.closed >= 2 && transport.toolPosts === 1
                : transport.toolPosts === 2 &&
                  transport.peakInflight === 2 &&
                  transport.peers?.length === 1)
          if (!proven) throw new Error('Transport action was not observed')
          for (const peer of transport?.peers ?? []) {
            const payload = classifyReadObservation(peer)
            if (
              payload.kind !== 'data' ||
              (await schemas[test.tool]['~standard'].validate(payload.data)).issues
            )
              throw new Error('Parallel peer failed')
            const peerChecks = await driver.semanticChecks(test, payload.data, peer)
            if (checks.some((check) => peerChecks[check] !== true))
              throw new Error('Parallel peer semantics failed')
          }
        }
        if (checks.some((check) => typeof checked[check] !== 'boolean')) {
          results.push({
            id: test.id,
            tool: test.tool,
            outcome: 'blocked',
            reason: 'private-semantic-oracle-missing',
          })
          continue
        }
        results.push({
          id: test.id,
          tool: test.tool,
          outcome: checks.every((check) => checked[check]) ? 'passed' : 'failed',
          semanticChecks: Object.fromEntries(
            checks.map((check) => [check, checked[check] === true]),
          ),
          ...(observation.transport
            ? {
                transport: {
                  action: observation.transport.action,
                  toolPosts: observation.transport.toolPosts,
                  peakInflight: observation.transport.peakInflight,
                  initialized: observation.transport.initialized,
                  closed: observation.transport.closed,
                  quiescent: observation.transport.quiescent,
                  ...(test.action === 'cancel'
                    ? {
                        cancelledAfterReadStarted:
                          observation.transport.cancelledAfterReadStarted === true,
                      }
                    : {}),
                },
              }
            : {}),
          unchangedBusiness,
          tradeWriteDelta: 0,
          effectDelta: 0,
        })
      } catch {
        results.push({
          id: test.id,
          tool: test.tool,
          outcome: 'failed',
          reason: 'driver-or-audit-failed',
        })
        stopped = true
      } finally {
        if (setupStarted) {
          try {
            await driver.teardown(test)
          } catch {
            results.push({
              id: test.id,
              tool: test.tool,
              outcome: 'failed',
              reason: 'fixture-teardown-failed',
            })
            stopped = true
          }
        }
      }
    }
    return {
      layer: driver.layer,
      actualDesktop: false,
      actualProtocol: driver.layer === 'official-mcp-sdk',
      generation: options.generation,
      results,
      counts: Object.fromEntries(
        ['passed', 'failed', 'blocked', 'unsupported', 'not-run'].map((outcome) => [
          outcome,
          results.filter((result) => result.outcome === outcome).length,
        ]),
      ),
    }
  } finally {
    await driver.close()
  }
}
