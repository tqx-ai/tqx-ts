import assert from 'node:assert/strict'
import { generateKeyPair, jwtVerify, SignJWT } from 'jose'
import type { RecordValue } from './client'
import { clientTarget, expectedTools, READ_TOOLS } from './target'
import type { FixtureAdapter } from './v2-control'
import type { FixtureAudit } from './v2-evidence'
import { v2Matrix, type V2Case } from './v2-matrix'
import { executeV2Suite, type V2Fixtures } from './v2-suite'
import type { connectV2, FixturePrincipal } from './v2-session'

// This is a runner model, not a replacement for AS/MCP/Trading implementations.
// All auth/operations/audit state and signed fixture tokens live in this process.
function makeInputs(): V2Fixtures['inputs'] {
  const inputs: V2Fixtures['inputs'] = {}
  const order = (key: string) => ({
    symbol: 'SYNTHETIC.US',
    side: 'BUY',
    orderType: 'LIMIT',
    quantity: '1',
    price: '10.00',
    idempotencyKey: key,
  })
  for (const test of v2Matrix()) {
    if (inputs[test.input]) continue
    let value: RecordValue = {}
    if (test.tool === 'getOrder') value = { orderId: 'memory-order' }
    if (test.tool === 'getSignal') value = { signalId: 'memory-signal' }
    if (test.tool === 'placeOrder') value = order(`memory-${test.input}`)
    if (test.tool === 'modifyOrder')
      value = { orderId: 'memory-order', price: '10.00', idempotencyKey: `memory-${test.input}` }
    if (test.tool === 'cancelOrder')
      value = { orderId: 'memory-order', idempotencyKey: `memory-${test.input}` }
    if (test.tool === 'placeOrders') {
      const count =
        test.id === 'batch-empty'
          ? 0
          : test.id === 'batch-over20'
            ? 21
            : test.id === 'batch-20'
              ? 20
              : 3
      const orders: RecordValue[] = Array.from({ length: count }, (_, index) =>
        order(`memory-${test.input}-${index}`),
      )
      if (test.id === 'batch-duplicateKey') orders[1]!.idempotencyKey = orders[0]!.idempotencyKey
      if (test.id === 'batch-invalidLater') orders[1]!.quantity = '0'
      value = { orders }
    }
    if (test.expectation === 'invalid' && test.id.startsWith('missing-key-')) {
      if (test.tool === 'placeOrders') delete (value.orders as RecordValue[])[1]!.idempotencyKey
      else delete value.idempotencyKey
    }
    inputs[test.input] =
      test.expectation === 'conflict'
        ? [
            value,
            {
              ...value,
              ...(test.tool === 'cancelOrder'
                ? { orderId: 'different-memory-order' }
                : test.tool === 'modifyOrder'
                  ? { price: '11.00' }
                  : { quantity: '2' }),
            },
          ]
        : ['replay', 'unknownReplay'].includes(test.expectation)
          ? [value, structuredClone(value)]
          : [value]
  }
  return inputs
}
function result(payload: RecordValue, isError = false): RecordValue {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError }
}
export async function runMemorySuite() {
  const target = clientTarget({
    TQX_CODEX_PROFILE: 'v2',
    TQX_CODEX_SCOPES: 'trade:read order:write',
  })
  const fixtures: V2Fixtures = {
    synthetic: true,
    mode: 'PAPER',
    broker: 'fake',
    generation: 'pure-memory',
    users: [
      { uid: '9007199254740993', agentId: 'memory-agent', webAccessToken: 'unused-memory-only' },
    ],
    inputs: makeInputs(),
  }
  const keys = await generateKeyPair('RS256')
  const grants = new Map<string, { active: boolean; sessionActive: boolean }>()
  const receipts = new Map<string, RecordValue[]>()
  const operations = new Map<string, { fingerprint: string; payload: RecordValue }>()
  let sequence = 0
  let activeTest: V2Case | undefined
  let audit: FixtureAudit | undefined
  let principal: FixturePrincipal | undefined
  const adapter: FixtureAdapter = {
    async arm(test, identity) {
      activeTest = test
      principal = identity
      operations.clear()
      audit = {
        synthetic: true,
        mode: 'PAPER',
        broker: 'fake',
        generation: fixtures.generation,
        caseId: test.id,
        settled: true,
        attempts: [],
        effects: [],
        maxConcurrent: 0,
      }
    },
    async snapshot(test, identity) {
      assert.equal(test.id, activeTest?.id)
      assert.deepEqual(identity, principal)
      assert(audit)
      return structuredClone(audit)
    },
  }
  const sessionFactory: typeof connectV2 = async (scoped, user) => {
    const id = `memory-${++sequence}`
    const identity: FixturePrincipal = {
      uid: user.uid,
      agentId: user.agentId,
      grantId: id,
      sessionId: id,
      sourceJti: id,
      clientId: id,
    }
    grants.set(id, { active: true, sessionActive: true })
    const token = await new SignJWT({
      scope: scoped.scopes.join(' '),
      agent_id: user.agentId,
      grant_id: id,
      sid: id,
      jti: id,
      client_id: id,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(scoped.issuer)
      .setAudience(scoped.resource)
      .setSubject(user.uid)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(keys.privateKey)
    async function authorize(authoritative = true) {
      const { payload } = await jwtVerify(token, keys.publicKey, {
        issuer: scoped.issuer,
        audience: scoped.resource,
        algorithms: ['RS256'],
      })
      assert.equal(payload.sub, user.uid)
      assert.equal(payload.agent_id, user.agentId)
      assert.deepEqual(String(payload.scope).split(' '), scoped.scopes)
      if (authoritative)
        assert(
          grants.get(id)?.active && grants.get(id)?.sessionActive,
          'Memory grant/session is inactive',
        )
    }
    const tools = Object.fromEntries(
      expectedTools(scoped).map((tool) => [
        tool,
        { annotations: { readOnlyHint: READ_TOOLS.includes(tool as (typeof READ_TOOLS)[number]) } },
      ]),
    )
    function submit(tool: string, args: RecordValue, index: number): RecordValue {
      assert(audit && activeTest)
      const key = String(args.idempotencyKey)
      const state = grants.get(id)
      const fingerprint = JSON.stringify(args)
      const previous = operations.get(key)
      let payload: RecordValue
      if (!state?.active || !state.sessionActive)
        payload = { status: 'failed', idempotencyKey: key, error: 'authorization_required' }
      else if (previous && previous.fingerprint !== fingerprint)
        payload = { status: 'failed', idempotencyKey: key, error: 'idempotency_conflict' }
      else if (previous) payload = previous.payload
      else if (index === 1 && ['fail_at_2', 'quota_at_2'].includes(activeTest.scenario))
        payload = {
          status: 'failed',
          idempotencyKey: key,
          error:
            activeTest.scenario === 'quota_at_2'
              ? 'rate_limit_exceeded'
              : 'trading_request_rejected',
        }
      else {
        const unknown =
          activeTest.scenario === 'unknown_first' ||
          (activeTest.scenario === 'uncertain_at_2' && index === 1)
        payload = {
          status: unknown ? 'unknown' : 'accepted',
          idempotencyKey: key,
          request_id: `memory-request-${sequence}-${index}`,
          data: {
            signal_id: `memory-signal-${sequence}-${index}`,
            state: unknown ? 'UNKNOWN' : 'ACCEPTED',
            operation: tool,
          },
          ...(unknown ? { error: 'trading_outcome_unknown' } : {}),
        }
        operations.set(key, { fingerprint, payload })
        audit.effects.push({ id: `memory-effect-${sequence}-${index}`, index, idempotencyKey: key })
      }
      const attempts = payload.status === 'unknown' ? 3 : 1
      for (let attempt = 0; attempt < attempts; attempt++)
        audit.attempts.push({
          index,
          idempotencyKey: key,
          outcome: payload.status as 'accepted' | 'failed' | 'unknown',
        })
      audit.maxConcurrent = 1
      if (index === 0 && activeTest.scenario === 'revoke_before_2') {
        state!.active = false
        audit.grantRevoked = true
      }
      if (index === 0 && activeTest.scenario === 'expire_before_2') {
        state!.sessionActive = false
        audit.sessionExpired = true
      }
      return payload
    }
    function valid(args: RecordValue, place: boolean) {
      return (
        typeof args.idempotencyKey === 'string' &&
        args.idempotencyKey.length >= 8 &&
        (!place || (typeof args.quantity === 'string' && /^[1-9]\d*$/.test(args.quantity)))
      )
    }
    return {
      home: 'memory-only-no-directory',
      tools,
      async principal() {
        await authorize()
        return identity
      },
      async protectedProbe(tool) {
        await authorize(false)
        const granted = grants.get(id)
        if (!granted?.active || !granted.sessionActive)
          return { status: 401, body: { error: 'invalid_token' } }
        return {
          status: Object.hasOwn(tools, tool) ? 200 : 403,
          body: { error: 'insufficient_scope' },
        }
      },
      async call(tool, args) {
        await authorize()
        if (!Object.hasOwn(tools, tool)) return result({ error: 'permission_denied' }, true)
        if (READ_TOOLS.includes(tool as (typeof READ_TOOLS)[number])) {
          if (tool === 'getAccount')
            return result({
              mode: 'PAPER',
              as_of: 'memory-clock',
              is_stale: true,
              total_assets: '9007199254740993.123456',
              cash: null,
            })
          if (tool === 'getSignal') return result({ state: 'UNKNOWN' })
          if (tool === 'getOrder')
            return result({ status: 'SUBMITTED', quantity: '1', price: null })
          return result({ items: [], next_cursor: null })
        }
        if (tool !== 'placeOrders') {
          if (!valid(args, tool === 'placeOrder'))
            return result({ error: 'invalid_arguments' }, true)
          const payload = submit(tool, args, 0)
          return result(payload, payload.status !== 'accepted')
        }
        const orders = args.orders as RecordValue[]
        if (
          !Array.isArray(orders) ||
          orders.length < 1 ||
          orders.length > 20 ||
          !orders.every((order) => valid(order, true)) ||
          new Set(orders.map((order) => order.idempotencyKey)).size !== orders.length
        )
          return result({ error: 'invalid_arguments' }, true)
        const results: RecordValue[] = []
        let stopped = false
        for (let index = 0; index < orders.length; index++) {
          const payload = stopped
            ? { status: 'not_submitted', idempotencyKey: orders[index]!.idempotencyKey }
            : submit(tool, orders[index]!, index)
          results.push({ index, ...payload })
          if (payload.status === 'failed' || payload.status === 'unknown') stopped = true
        }
        return result({ results, stopped }, stopped)
      },
      async close() {},
    }
  }
  const results = await executeV2Suite({
    target,
    fixtures,
    runs: 'unused-memory-only',
    adapter,
    allowSyntheticWrites: true,
    stillReady() {},
    sessionFactory,
    async recordReceipt(caseId, values) {
      receipts.set(caseId, values)
      return undefined
    },
  })
  return {
    actualCodex: false,
    clientKind: 'in-process-protocol' as const,
    persistence: false,
    externalNetwork: false,
    authentication: 'in-process signed fixture token and Map grant/scope checks; not OAuth consent',
    cases: results.map(({ wireAttempts, privateReceipt: _receipt, ...test }) =>
      Object.assign(test, { simulatedTransportAttempts: wireAttempts }),
    ),
    receiptCountInMemory: receipts.size,
  }
}
