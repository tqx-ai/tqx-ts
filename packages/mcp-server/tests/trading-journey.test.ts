import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { syntheticOrder, syntheticSignal, v2Fixture } from './v2-fixture'

// Owned loopback AS/Trading fixtures, not a real model, broker, or consent journey.
const active: { close(): Promise<void> }[] = []
afterEach(async () => {
  for (const resource of active.splice(0).toReversed()) await resource.close()
})
const setup = async (options: Parameters<typeof v2Fixture>[0] = {}) => {
  const f = await v2Fixture(options)
  active.push(f)
  const client = new Client({ name: 'synthetic-journey-client', version: '1.0.0' })
  active.push(client)
  const token = await f.sign({ scope: 'trade:read order:write' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(f.config.resource), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  )
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult
    const content = result.content[0]
    if (content?.type !== 'text') throw new Error('Expected a synthetic JSON tool result')
    return { isError: result.isError, data: JSON.parse(content.text) }
  }
  const idle = async () => {
    await vi.waitFor(() => {
      expect(f.service.application.activeRequestCount).toBe(0)
      expect(f.state.activeTrading).toBe(0)
      expect(f.state.activeExchange).toBe(0)
    })
  }
  return { ...f, client, call, idle }
}
const intent = {
  symbol: 'SYNTHETIC.US',
  side: 'BUY',
  orderType: 'LIMIT',
  quantity: '10',
  price: '100',
  idempotencyKey: 'synthetic-journey-intent',
}
const snapshot = (status: string, filled: string, remaining: string, extra = {}) => ({
  ...syntheticOrder,
  quantity: '10',
  price: '100',
  status,
  filled_quantity: filled,
  remaining_quantity: remaining,
  updated_at: '2026-10-26T01:00:00Z',
  ...extra,
})
const trade = (id: string, quantity: string, price: string, amount: string) => ({
  trade_id: id,
  order_id: syntheticOrder.order_id,
  symbol: 'SYNTHETIC.US',
  symbol_name: 'fixture',
  market: 'US',
  currency: 'USD',
  side: 'BUY',
  quantity,
  price,
  amount,
  commission: null,
  executed_at: '2026-10-26T01:00:00Z',
})
const writeCount = (f: Awaited<ReturnType<typeof setup>>) =>
  f.v2.requests.filter((request) => request.method !== 'GET').length

describe('bounded protocol observations using owned synthetic services', () => {
  it('FILL-04/READ-03/08: one submission, cumulative 0/10 -> 4/6 -> 4/6 -> 10/0', async () => {
    const f = await setup()
    const submitted = await f.call('placeOrder', intent)
    expect(submitted.data).toMatchObject({
      status: 'accepted',
      data: { state: 'ACCEPTED', order_id: null, order_status: null },
    })
    const observations = [
      snapshot('SUBMITTED', '0', '10'),
      snapshot('PARTIAL_FILLED', '4', '6', { average_fill_price: '100' }),
      snapshot('PARTIAL_FILLED', '4', '6', { average_fill_price: '100' }),
      snapshot('FILLED', '10', '0', { average_fill_price: '99.88' }),
    ]
    f.v2.readData.push(...observations)
    for (const expected of observations) {
      const result = await f.call('getOrder', { orderId: syntheticOrder.order_id })
      expect(result.isError).not.toBe(true)
      expect(result.data).toEqual(expected)
      await f.idle()
    }
    const trades = {
      items: [trade('fill-1', '4', '100', '400'), trade('fill-2', '6', '99.8', '598.8')],
      next_cursor: null,
    }
    f.v2.readData.push(trades)
    expect((await f.call('listTrades', { orderId: syntheticOrder.order_id })).data).toEqual(trades)
    expect(writeCount(f)).toBe(1)
    expect(f.v2.effects).toBe(1)
    expect(submitted.data.status).toBe('accepted')
    await f.idle()
  })

  it('ACT-06: cancellation acceptance and in-flight fills retain action references', async () => {
    const f = await setup()
    await f.call('placeOrder', intent)
    f.v2.actionData = {
      order_id: syntheticOrder.order_id,
      accepted: true,
      status: 'SUBMITTED',
      action_id: 'cancel-action',
      request_id: 'cancel-request',
    }
    const cancellation = await f.call('cancelOrder', {
      orderId: syntheticOrder.order_id,
      idempotencyKey: 'synthetic-cancel',
    })
    expect(cancellation.data).toMatchObject({ status: 'accepted', data: f.v2.actionData })
    const observations = [
      snapshot('CANCELLING', '4', '6', {
        cancel_action_status: 'SUBMITTED',
        cancel_request_id: 'cancel-request',
      }),
      snapshot('CANCELLING', '6', '4', {
        average_fill_price: '100',
        cancel_action_status: 'SUBMITTED',
        cancel_request_id: 'cancel-request',
      }),
      // Remaining quantity is supplied by the provider, never reconstructed by MCP.
      snapshot('CANCELLED', '6', '4', {
        average_fill_price: '100',
        cancel_action_status: 'ACCEPTED',
        cancel_request_id: 'cancel-request',
      }),
    ]
    f.v2.readData.push(...observations)
    for (const expected of observations)
      expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(
        expected,
      )
    expect(writeCount(f)).toBe(2)
    expect(f.v2.effects).toBe(2)
    await f.idle()
  })

  it('FILL-08: cancelling the remaining six preserves the four already filled', async () => {
    const f = await setup()
    await f.call('placeOrder', intent)
    f.v2.readData.push(snapshot('PARTIAL_FILLED', '4', '6', { average_fill_price: '100' }))
    expect(
      (await f.call('getOrder', { orderId: syntheticOrder.order_id })).data.filled_quantity,
    ).toBe('4')
    expect(
      (
        await f.call('cancelOrder', {
          orderId: syntheticOrder.order_id,
          idempotencyKey: 'synthetic-partial-cancel',
        })
      ).data.status,
    ).toBe('accepted')
    const cancelled = snapshot('CANCELLED', '4', '6', {
      average_fill_price: '100',
      status_source: 'CHANNEL',
    })
    f.v2.readData.push(cancelled)
    expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(cancelled)
    expect(writeCount(f)).toBe(2)
    expect(f.v2.effects).toBe(2)
    await f.idle()
  })

  it('ACT: modification acceptance does not replace a MODIFYING snapshot with success', async () => {
    const f = await setup()
    f.v2.actionData = {
      order_id: syntheticOrder.order_id,
      accepted: true,
      status: 'SUBMITTED',
      action_id: 'modify-action',
    }
    expect(
      (
        await f.call('modifyOrder', {
          orderId: syntheticOrder.order_id,
          price: '99.8',
          idempotencyKey: 'synthetic-modify',
        })
      ).data,
    ).toMatchObject({ status: 'accepted', data: f.v2.actionData })
    const modifying = snapshot('MODIFYING', '4', '6', {
      modify_request_id: 'modify-action',
      modify_action_status: 'SUBMITTED',
    })
    f.v2.readData.push(modifying)
    expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(modifying)
    expect(writeCount(f)).toBe(1)
    await f.idle()
  })

  it('MON-14/15: monitor exhaustion stays independent of order state and later fills', async () => {
    const f = await setup()
    const exhausted = {
      ...syntheticSignal(),
      order_id: syntheticOrder.order_id,
      order_status: 'PARTIAL_FILLED',
      monitor_status: 'BUDGET_EXHAUSTED',
      monitor_stop_reason: 'monitor_budget',
      order_status_source: 'CHANNEL',
    }
    const partial = snapshot('PARTIAL_FILLED', '4', '6', {
      status_source: 'CHANNEL',
      status_reason: null,
      is_stale: false,
    })
    const filled = snapshot('FILLED', '10', '0', {
      status_source: 'CHANNEL',
      status_reason: null,
      is_stale: false,
      average_fill_price: '99.88',
    })
    f.v2.readData.push(exhausted, partial, filled)
    expect((await f.call('getSignal', { signalId: exhausted.signal_id })).data).toEqual(exhausted)
    expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(partial)
    expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(filled)
    expect(writeCount(f)).toBe(0)
    // Fixture supplies authoritative late detail. Real backend reconciliation is a separate check.
    await f.idle()
  })

  it.each([
    {},
    { status_source: null, status_reason: null, is_stale: null },
    { status_source: 'CHANNEL', status_reason: 'DAY_EXPIRED', is_stale: false },
  ])(
    'MON: preserves missing/nullable provenance and channel TIMEOUT unchanged: %j',
    async (fields) => {
      const f = await setup()
      const order = snapshot('TIMEOUT', '4', '6', fields)
      f.v2.readData.push(order, { items: [order], next_cursor: null })
      expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(order)
      expect((await f.call('listOrders')).data).toEqual({ items: [order], next_cursor: null })
      const signal = {
        ...syntheticSignal(),
        monitor_status: null,
        monitor_stop_reason: null,
        order_status_source: null,
      }
      f.v2.readData.push(signal, syntheticSignal())
      expect((await f.call('getSignal', { signalId: signal.signal_id })).data).toEqual(signal)
      expect((await f.call('getSignal', { signalId: signal.signal_id })).data).toEqual(
        syntheticSignal(),
      )
      await f.idle()
    },
  )

  it('MON: preserves explicitly stale and older snapshots without inventing fills', async () => {
    const f = await setup()
    const current = snapshot('PARTIAL_FILLED', '4', '6', {
      average_fill_price: '100',
      status_source: 'CHANNEL',
      is_stale: false,
    })
    const stale = snapshot('SUBMITTED', '0', '10', {
      updated_at: '2026-10-25T01:00:00Z',
      status_source: null,
      is_stale: true,
    })
    f.v2.readData.push(current, stale)
    expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(current)
    expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(stale)
    expect(writeCount(f)).toBe(0)
    await f.idle()
  })

  it.each(['rate-limit', 'network', 'timeout', 'missing'] as const)(
    'MON-07/IDEM-10: a later GET %s cannot erase an ambiguous submission',
    async (fault) => {
      const f = await setup({ tradingTimeoutMs: 500 })
      f.v2.plans.push({ invalidJson: true })
      const submitted = await f.call('placeOrder', intent)
      expect(submitted.data).toMatchObject({
        status: 'unknown',
        idempotencyKey: intent.idempotencyKey,
      })
      const original = JSON.stringify(submitted)
      if (fault === 'rate-limit') f.v2.readPlans.push({ status: 429, code: 'rate_limit_exceeded' })
      if (fault === 'missing') f.v2.readPlans.push({ status: 404, code: 'order_not_found' })
      if (fault === 'network')
        f.v2.readPlans.push(...Array.from({ length: 3 }, () => ({ disconnect: true })))
      if (fault === 'timeout') f.v2.readPlans.push({ hold: true })
      const result = await f.call('getOrder', { orderId: syntheticOrder.order_id })
      expect(result.isError).toBe(true)
      expect(result.data).toEqual({
        error:
          fault === 'rate-limit'
            ? 'rate_limit_exceeded'
            : fault === 'missing'
              ? 'order_not_found'
              : 'dependency_unavailable',
      })
      // A read error carries no invented order/signal/submission status.
      expect(JSON.stringify(submitted)).toBe(original)
      const recovered = snapshot('PARTIAL_FILLED', '4', '6')
      f.v2.readData.push(recovered)
      expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(
        recovered,
      )
      expect(writeCount(f)).toBe(1)
      expect(f.v2.effects).toBe(1)
      await f.idle()
    },
  )

  it('IDEM-10: UNKNOWN -> PENDING -> ACCEPTED -> linked FILLED uses only explicit GETs', async () => {
    const f = await setup()
    f.v2.plans.push({ invalidJson: true })
    const original = await f.call('placeOrder', intent)
    const signals = [
      syntheticSignal('UNKNOWN'),
      syntheticSignal('PENDING'),
      { ...syntheticSignal(), order_id: syntheticOrder.order_id, order_status: 'FILLED' },
    ]
    f.v2.readData.push(...signals)
    for (const expected of signals)
      expect((await f.call('getSignal', { signalId: expected.signal_id })).data).toEqual(expected)
    expect(original.data.status).toBe('unknown')
    expect(writeCount(f)).toBe(1)
    expect(f.v2.effects).toBe(1)
    await f.idle()
  })

  it('AUTH-04: a revoked session/grant/source is checked by a new online exchange, with no cached fallback', async () => {
    const f = await setup()
    const lastKnown = snapshot('PARTIAL_FILLED', '4', '6')
    f.v2.readData.push(lastKnown)
    expect((await f.call('getOrder', { orderId: syntheticOrder.order_id })).data).toEqual(lastKnown)
    const before = f.state.exchange.length
    const dispatched = f.v2.requests.length
    // AS stands in for authoritative session/grant/source-jti revocation, not MCP introspection.
    f.state.error = { status: 401, code: 'invalid_grant' }
    await expect(f.call('getOrder', { orderId: syntheticOrder.order_id })).rejects.toThrow()
    expect(f.state.exchange.length).toBe(before + 1)
    expect(f.v2.requests).toHaveLength(dispatched)
    expect(writeCount(f)).toBe(0)
    await f.idle()
  })

  it('AUTH-04: a fresh derived token cannot bypass Trading revocation', async () => {
    const f = await setup()
    await f.call('getOrder', { orderId: syntheticOrder.order_id })
    const before = f.state.exchange.length
    f.v2.revoked = true
    expect(await f.call('getOrder', { orderId: syntheticOrder.order_id })).toEqual({
      isError: true,
      data: { error: 'authorization_required' },
    })
    expect(f.state.exchange.length).toBe(before + 1)
    expect(writeCount(f)).toBe(0)
    await f.idle()
  })
})

describe('submission root-cause regressions over owned loopback HTTP', () => {
  it('does not classify an HTTP-200 service outage after commit as a definite rejection', async () => {
    const f = await setup()
    f.v2.plans.push({
      afterCommitError: {
        status: 200,
        code: 'trading_service_unavailable',
        data: {
          state: 'UNKNOWN',
          signal_id: 'synthetic-committed-signal',
          debug: 'private-fixture-detail',
        },
      },
      requestId: 'synthetic-outage',
    })
    const result = await f.call('placeOrder', intent)
    expect(result.data).toEqual({
      idempotencyKey: intent.idempotencyKey,
      status: 'unknown',
      error: 'trading_service_unavailable',
      request_id: 'synthetic-outage',
      data: { state: 'UNKNOWN', signal_id: 'synthetic-committed-signal' },
    })
    expect(f.v2.effects).toBe(1)
    expect(writeCount(f)).toBe(1)
    await f.idle()
  })

  it.each(['cancelOrder', 'modifyOrder'] as const)(
    '%s classifies the invoked action response, not loose signal-shaped metadata',
    async (name) => {
      const f = await setup()
      f.v2.actionData = {
        order_id: syntheticOrder.order_id,
        accepted: false,
        status: 'REJECTED',
        state: 'PENDING',
      }
      const result = await f.call(name, {
        orderId: syntheticOrder.order_id,
        idempotencyKey: 'synthetic-action',
        ...(name === 'modifyOrder' ? { price: '99.8' } : {}),
      })
      expect(result.isError).toBe(true)
      expect(result.data).toMatchObject({ status: 'failed', data: f.v2.actionData })
      await f.idle()
    },
  )

  it('retains a safe final-response header correlation ID on malformed JSON', async () => {
    const f = await setup()
    f.v2.plans.push({ invalidJson: true, headerRequestId: 'synthetic-final-protocol-id' })
    expect((await f.call('placeOrder', intent)).data).toMatchObject({
      status: 'unknown',
      error: 'upstream_protocol_error',
      request_id: 'synthetic-final-protocol-id',
    })
    expect(f.v2.effects).toBe(1)
    await f.idle()
  })

  it.each(['cancelOrder', 'modifyOrder'] as const)(
    '%s cannot turn accepted=false into success through an extra signal state',
    async (name) => {
      const f = await setup()
      f.v2.actionData = { order_id: syntheticOrder.order_id, accepted: false, state: 'ACCEPTED' }
      expect(
        (
          await f.call(name, {
            orderId: syntheticOrder.order_id,
            idempotencyKey: 'synthetic-not-accepted',
            ...(name === 'modifyOrder' ? { price: '99.8' } : {}),
          })
        ).data.status,
      ).toBe('unknown')
      await f.idle()
    },
  )

  it('signal acceptance is not overridden by loose action-shaped metadata', async () => {
    const f = await setup()
    f.v2.plans.push({ data: { ...syntheticSignal(), status: 'RESERVED', accepted: false } })
    expect((await f.call('placeOrder', intent)).data.status).toBe('accepted')
    await f.idle()
  })

  it('drops an unsafe final protocol correlation ID', async () => {
    const f = await setup()
    f.v2.plans.push({ invalidJson: true, headerRequestId: 'x'.repeat(257) })
    expect((await f.call('placeOrder', intent)).data).toMatchObject({
      status: 'unknown',
      error: 'upstream_protocol_error',
      request_id: null,
    })
    await f.idle()
  })

  it('does not reuse a previous retryable response ID after final network failures', async () => {
    const f = await setup()
    f.v2.plans.push(
      { status: 503, code: 'trading_service_unavailable' },
      { disconnect: true },
      { disconnect: true },
    )
    const result = await f.call('placeOrder', intent)
    expect(result.data.status).toBe('unknown')
    expect(result.data.request_id).toBeUndefined()
    expect(f.v2.effects).toBe(1)
    await f.idle()
  })
})
