import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { TqxClient, TqxProtocolError, type OrderData, type SignalData } from '../src/index'

const order = {
  order_id: 'observation-order',
  client_order_id: 'original-intent',
  symbol: 'AAPL.US',
  symbol_name: 'Synthetic observation fixture',
  market: 'US',
  currency: 'USD',
  side: 'BUY',
  order_type: 'LIMIT',
  status: 'PARTIAL_FILLED',
  quantity: '10',
  price: '100',
  filled_quantity: '4',
  remaining_quantity: '6',
  average_fill_price: '100',
  submitted_at: '2026-10-26T02:00:00Z',
  updated_at: '2026-10-26T02:01:00Z',
}
const signal = {
  signal_id: 'original-intent',
  state: 'ACCEPTED',
  order_id: order.order_id,
  order_status: 'SUBMITTED',
  message: null,
  created_at: order.submitted_at,
  updated_at: order.updated_at,
}

function clientFor(data: unknown) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () =>
      Response.json({ code: '0', message: 'ok', data, request_id: 'observation', timestamp: 1 }),
    )
  return {
    client: new TqxClient({
      baseUrl: 'https://api.example.test',
      tradingBaseUrl: 'https://trading.example.test',
      bearerToken: 'synthetic-observation-token',
      runtimeEnvironment: {},
      fetch,
    }),
    fetch,
  }
}

describe('order and signal observation provenance', () => {
  it('keeps legacy responses valid without inventing provenance', async () => {
    const a = clientFor(order)
    const b = clientFor(signal)
    await expect(a.client.trading.getOrder(order.order_id)).resolves.toEqual(order)
    await expect(b.client.trading.getSignal(signal.signal_id)).resolves.toEqual(signal)
  })

  it('preserves a stale partial snapshot without treating it as a fresh fill', async () => {
    const data = { ...order, status_source: null, status_reason: null, is_stale: true }
    const { client, fetch } = clientFor(data)
    await expect(client.trading.getOrder(order.order_id)).resolves.toEqual(data)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('keeps confirmed channel expiry separate from observation budget exhaustion', async () => {
    const data = {
      ...order,
      status: 'TIMEOUT',
      status_source: 'CHANNEL',
      status_reason: 'DAY_EXPIRED',
      is_stale: false,
    }
    const { client } = clientFor(data)
    await expect(client.trading.getOrder(order.order_id)).resolves.toEqual(data)
  })

  it('preserves acceptance and linked order status after monitoring stops', async () => {
    const data = {
      ...signal,
      monitor_status: 'BUDGET_EXHAUSTED',
      monitor_stop_reason: 'monitor_budget',
      order_status_source: null,
    }
    const { client } = clientFor(data)
    await expect(client.trading.getSignal(signal.signal_id)).resolves.toEqual(data)
  })

  it('accepts explicit null for unavailable provenance', async () => {
    const data = {
      ...signal,
      monitor_status: null,
      monitor_stop_reason: null,
      order_status_source: null,
    }
    await expect(clientFor(data).client.trading.getSignal(signal.signal_id)).resolves.toEqual(data)
    await expect(
      clientFor({
        ...order,
        status_source: null,
        status_reason: null,
        is_stale: null,
      }).client.trading.getOrder(order.order_id),
    ).resolves.toMatchObject({ is_stale: null })
  })

  it.each([{ is_stale: 'false' }, { status_source: 1 }, { status_reason: { expired: true } }])(
    'rejects malformed order provenance: %j',
    async (invalid) => {
      await expect(
        clientFor({ ...order, ...invalid }).client.trading.getOrder(order.order_id),
      ).rejects.toBeInstanceOf(TqxProtocolError)
    },
  )

  it.each([{ monitor_status: false }, { monitor_stop_reason: [] }, { order_status_source: 1 }])(
    'rejects malformed signal observation metadata: %j',
    async (invalid) => {
      await expect(
        clientFor({ ...signal, ...invalid }).client.trading.getSignal(signal.signal_id),
      ).rejects.toBeInstanceOf(TqxProtocolError)
    },
  )

  it('exposes optional typed provenance to SDK callers', () => {
    expectTypeOf<OrderData['status_source']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<OrderData['status_reason']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<OrderData['is_stale']>().toEqualTypeOf<boolean | null | undefined>()
    expectTypeOf<SignalData['monitor_status']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<SignalData['monitor_stop_reason']>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<SignalData['order_status_source']>().toEqualTypeOf<string | null | undefined>()
  })
})
