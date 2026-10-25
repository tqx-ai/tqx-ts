import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type { RecordValue } from './client'
import { ROLE_SCOPES, v2Matrix, type V2Case } from './v2-matrix'
import { validateAudit, validateBatch, type BatchItem } from './v2-evidence'
import type { FixtureAdapter } from './v2-control'
import { connectV2, type FixtureUser } from './v2-session'
import { assertLiveIntegrationAllowed } from './local-policy'
import { WRITE_TOOLS, type ClientTarget } from './target'

export interface V2Fixtures {
  synthetic: true
  mode: 'PAPER'
  broker: 'fake'
  generation: string
  fixtureNamespace?: string
  users: FixtureUser[]
  inputs: Record<string, RecordValue[]>
  expectedErrors?: Record<string, 'cash_flows_unsupported'>
}
export interface CaseEvidence {
  caseId: string
  status: 'passed' | 'blocked' | 'failed'
  reason?: string
  wireAttempts?: number
  effects?: number
  outcomes?: string[]
  submission?: 'observed' | 'unknown' | 'not_submitted'
  observation?: RecordValue
  privateReceipt?: string
}
export function failureStatus(phase: 'oauth' | 'arm' | 'case'): 'failed' | 'blocked' {
  return phase === 'arm' ? 'blocked' : 'failed'
}
export function observation(tool: string, payload: RecordValue): RecordValue {
  const summary: RecordValue = {}
  for (const key of ['mode', 'as_of', 'is_stale', 'state', 'status'])
    if (Object.hasOwn(payload, key)) summary[key] = payload[key]
  if (tool === 'getAccount')
    assert.equal(payload.mode, 'PAPER', 'Actual account disagrees with the synthetic PAPER fixture')
  if (tool === 'getSignal') summary.signalIsNotFinalOrderStatus = true
  if (payload.data && typeof payload.data === 'object') {
    const data = payload.data as RecordValue
    if (typeof data.state === 'string') summary.signalState = data.state
    if (typeof data.status === 'string') summary.returnedStatus = data.status
  }
  const item = Array.isArray(payload.items)
    ? (payload.items[0] as RecordValue | undefined)
    : payload
  if (Array.isArray(payload.items)) summary.itemCount = payload.items.length
  const decimalFields: RecordValue = {}
  for (const key of [
    'total_assets',
    'cash',
    'available_cash',
    'frozen_cash',
    'buying_power',
    'market_value',
    'unrealized_pnl',
    'quantity',
    'available_quantity',
    'price',
    'average_cost',
    'last_price',
    'filled_quantity',
    'remaining_quantity',
    'average_fill_price',
    'amount',
  ]) {
    if (item && Object.hasOwn(item, key)) {
      assert(
        item[key] === null || typeof item[key] === 'string',
        'Decimal value lost its string/null representation',
      )
      decimalFields[key] = item[key]
    }
  }
  if (Object.keys(decimalFields).length) summary.decimals = decimalFields
  return summary
}
function privateReceipt(payload: RecordValue): RecordValue {
  const result: RecordValue = {}
  for (const key of ['index', 'idempotencyKey', 'status', 'request_id', 'stopped'])
    if (Object.hasOwn(payload, key)) result[key] = payload[key]
  const data = payload.data as RecordValue | undefined
  if (data && typeof data === 'object') {
    const picked: RecordValue = {}
    for (const key of [
      'signal_id',
      'order_id',
      'action_id',
      'request_id',
      'parent_request_id',
      'state',
      'status',
      'operation',
    ])
      if (Object.hasOwn(data, key)) picked[key] = data[key]
    result.data = picked
  }
  if (payload.error !== undefined) result.error = errorCode(payload)
  if (Array.isArray(payload.results))
    result.results = payload.results.map((item) => privateReceipt(item as RecordValue))
  return result
}
export function scopeDenied(probe: { status: number; body: RecordValue }, tool: string) {
  if (probe.status === 403)
    return probe.body.error === 'insufficient_scope' || probe.body.error === 'permission_denied'
  if (probe.status !== 200) return false
  const missing = (text: unknown) =>
    text === `Tool ${tool} not found` || text === `MCP error -32602: Tool ${tool} not found`
  const error = probe.body.error as RecordValue | undefined
  if (error) return error.code === -32602 && missing(error.message)
  const result = probe.body.result as RecordValue | undefined
  if (result?.isError !== true) return false
  const content = result.content as { type?: string; text?: string }[] | undefined
  if (Array.isArray(content) && content.some((item) => item.type === 'text' && missing(item.text)))
    return true
  try {
    return ['permission_denied', 'insufficient_scope'].includes(
      String(errorCode(toolPayload(result))),
    )
  } catch {
    return false
  }
}
export function toolPayload(result: RecordValue): RecordValue {
  if (result.structuredContent && typeof result.structuredContent === 'object')
    return result.structuredContent as RecordValue
  const content = result.content as { type?: string; text?: string }[] | undefined
  const text = content?.find((item) => item.type === 'text')?.text
  assert(text, 'Expected an MCP JSON tool result')
  const parsed = JSON.parse(text) as RecordValue
  assert(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
  return parsed
}
export function errorCode(value: RecordValue): unknown {
  if (typeof value.error === 'string') return value.error
  return value.error && typeof value.error === 'object'
    ? (value.error as RecordValue).code
    : undefined
}
function argumentsFor(fixtures: V2Fixtures, test: V2Case) {
  const calls = fixtures.inputs[test.input]
  assert(Array.isArray(calls) && calls.length > 0, 'Fixture inputs are not prepared for this case')
  for (const call of calls) assert(call && typeof call === 'object' && !Array.isArray(call))
  if (['replay', 'unknownReplay', 'conflict'].includes(test.expectation)) {
    assert.equal(calls.length, 2)
    assert.equal(typeof calls[0]?.idempotencyKey, 'string')
    assert.equal(
      calls[0]?.idempotencyKey,
      calls[1]?.idempotencyKey,
      'Replay/conflict must reuse the original stable key',
    )
    if (test.expectation === 'replay' || test.expectation === 'unknownReplay')
      assert.deepEqual(calls[0], calls[1])
    else assert.notDeepEqual(calls[0], calls[1])
  } else assert.equal(calls.length, 1)
  return calls
}
export async function executeV2Suite(options: {
  target: ClientTarget
  fixtures: V2Fixtures
  runs: string
  adapter: FixtureAdapter
  allowSyntheticWrites: boolean
  stillReady: () => void
  sessionFactory?: typeof connectV2
  recordReceipt?: (caseId: string, receipts: RecordValue[]) => Promise<string | undefined>
}): Promise<CaseEvidence[]> {
  const { target, fixtures, adapter } = options
  assert.equal(target.profile, 'v2')
  assert.equal(fixtures.synthetic, true)
  assert.equal(fixtures.mode, 'PAPER')
  assert.equal(fixtures.broker, 'fake')
  const user = fixtures.users[0]
  assert(
    user &&
      typeof user.uid === 'string' &&
      typeof user.agentId === 'string' &&
      typeof user.webAccessToken === 'string',
  )
  const matrix = v2Matrix().filter((test) =>
    ROLE_SCOPES[test.role].every((scope) => target.scopes.includes(scope)),
  )
  const report: CaseEvidence[] = []
  // Preflight every selected fixture input before any session or write is started.
  const prepared = new Map(matrix.map((test) => [test.id, argumentsFor(fixtures, test)]))
  for (const test of matrix) {
    if (
      WRITE_TOOLS.includes(test.tool as (typeof WRITE_TOOLS)[number]) &&
      !options.allowSyntheticWrites
    ) {
      report.push({
        caseId: test.id,
        status: 'blocked',
        reason: 'synthetic write flag not selected',
      })
      continue
    }
    options.stillReady()
    let session: Awaited<ReturnType<typeof connectV2>> | undefined
    let armed = false
    let phase: 'oauth' | 'arm' | 'case' = 'oauth'
    let submitted = false
    try {
      session = await (options.sessionFactory ?? connectV2)(
        { ...target, scopes: ROLE_SCOPES[test.role] },
        user,
        options.runs,
      )
      const principal = await session.principal()
      phase = 'arm'
      await adapter.arm(test, principal)
      armed = true
      phase = 'case'
      const calls = prepared.get(test.id)!
      const responses: RecordValue[] = []
      for (const args of calls) {
        options.stillReady()
        submitted = true
        try {
          responses.push(await session.call(test.tool, args))
        } catch {
          assert.equal(
            test.expectation,
            'denied',
            'Opaque client failure is not a valid tool outcome',
          )
          responses.push({ isError: true })
        }
      }
      if (test.expectation === 'denied') {
        assert(responses.every((response) => response.isError === true))
        const direct = await session.protectedProbe(test.tool, calls[0]!)
        assert(
          scopeDenied(direct, test.tool),
          'Direct MCP probe did not establish a scope/tool-visibility denial',
        )
      }
      const audit = await adapter.snapshot(test, principal)
      validateAudit(audit, test, fixtures.generation)
      if (test.writes && test.tool !== 'placeOrders' && test.expectation !== 'invalid') {
        for (const attempt of audit.attempts) {
          assert.equal(attempt.index, 0)
          assert.equal(attempt.idempotencyKey, calls[0]!.idempotencyKey)
        }
        for (const effect of audit.effects)
          assert.equal(effect.idempotencyKey, calls[0]!.idempotencyKey)
      }
      const outcomes: string[] = []
      let observed: RecordValue | undefined
      let receiptFile: string | undefined
      if (test.expectation === 'invalid')
        assert(responses.every((response) => response.isError === true))
      else if (test.expectation !== 'denied') {
        const payloads = responses.map(toolPayload)
        observed = observation(test.tool, payloads[0]!)
        const receipts = payloads.map(privateReceipt)
        if (options.recordReceipt) receiptFile = await options.recordReceipt(test.id, receipts)
        else {
          assertLiveIntegrationAllowed()
          const path = resolve(session.home, 'case.private.json')
          await writeFile(path, JSON.stringify({ caseId: test.id, receipts }))
          receiptFile = `${basename(session.home)}/case.private.json`
        }
        if (test.expectation === 'batch') {
          const payload = payloads[0]!
          assert(Array.isArray(payload.results))
          const items = payload.results as BatchItem[]
          const orders = calls[0]!.orders as { idempotencyKey: string }[]
          assert(Array.isArray(orders) && orders.length >= 1 && orders.length <= 20)
          validateBatch(
            items,
            orders.map((order) => order.idempotencyKey),
            audit,
            test,
          )
          const stopped = items.some(
            (item) => item.status === 'failed' || item.status === 'unknown',
          )
          assert.equal(payload.stopped, stopped)
          assert.equal(responses[0]!.isError === true, stopped)
          outcomes.push(...items.map((item) => item.status))
        } else if (test.expectation === 'conflict') {
          assert.equal(payloads[0]?.status, 'accepted')
          assert.equal(payloads[1]?.status, 'failed')
          assert.equal(errorCode(payloads[1]!), 'idempotency_conflict')
          assert.equal(responses[1]?.isError, true)
          assert.equal(audit.effects.length, 1, 'Conflicting replay produced an extra effect')
          outcomes.push('accepted', 'failed')
        } else if (test.expectation === 'unknownReplay') {
          assert(payloads.every((payload) => payload.status === 'unknown'))
          assert(responses.every((response) => response.isError === true))
          assert(
            ['trading_operation_pending', 'trading_outcome_unknown'].includes(
              String(errorCode(payloads[1]!)),
            ),
          )
          assert(audit.effects.length <= 1, 'Unknown replay produced duplicate effects')
          outcomes.push('unknown', 'unknown')
        } else if (test.expectation === 'replay') {
          assert(payloads.every((payload) => payload.status === 'accepted'))
          assert.deepEqual(
            payloads[0]?.data,
            payloads[1]?.data,
            'Replay did not retain its original response',
          )
          assert.equal(audit.effects.length, 1, 'Identical replay produced an extra effect')
          assert(responses.every((response) => response.isError !== true))
          outcomes.push('accepted', 'accepted')
        } else {
          const expectedError = fixtures.expectedErrors?.[test.id]
          if (expectedError) {
            assert.equal(test.tool, 'listCashFlows')
            assert.equal(responses[0]?.isError, true)
            assert.equal(errorCode(payloads[0]!), expectedError)
            outcomes.push('cash_flows_unsupported')
          } else {
            assert(responses.every((response) => response.isError !== true))
            if (test.writes) {
              assert.equal(payloads[0]?.status, 'accepted')
              assert.equal(payloads[0]?.idempotencyKey, calls[0]?.idempotencyKey)
              assert(payloads[0]?.data)
              assert.equal(audit.effects.length, 1)
              outcomes.push('accepted')
            }
          }
        }
      }
      report.push({
        caseId: test.id,
        status: 'passed',
        wireAttempts: audit.attempts.length,
        effects: audit.effects.length,
        outcomes,
        submission: 'observed',
        observation: observed,
        privateReceipt: receiptFile,
      })
    } catch {
      report.push({
        caseId: test.id,
        status: failureStatus(phase),
        submission: submitted ? 'unknown' : 'not_submitted',
        reason: armed
          ? 'client/result/audit assertion failed; submission may be uncertain; inspect original stable keys and private evidence'
          : phase === 'oauth'
            ? 'Actual client OAuth/discovery failed after valid Owner READY; no case writes submitted'
            : 'Fixture arm unavailable; no case writes submitted',
      })
      // Stop immediately after a failure or an unavailable fixture, never continue writes.
      break
    } finally {
      await session?.close()
    }
  }
  return report
}
