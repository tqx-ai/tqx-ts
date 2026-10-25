import type { IncomingMessage, ServerResponse } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { decodeJwt } from 'jose'
import { tradingFixture } from './trading-fixture'

export const syntheticSignal = (state = 'ACCEPTED') => ({
  signal_id: 'synthetic-signal-0001',
  state,
  order_id: null,
  order_status: null,
  message: null,
  created_at: 'synthetic-time',
  updated_at: 'synthetic-time',
  parent_request_id: 'synthetic-parent-not-http-id',
})
const order = {
  order_id: 'synthetic-order',
  client_order_id: null,
  symbol: 'SYNTHETIC.US',
  symbol_name: 'fixture',
  market: 'US',
  currency: 'USD',
  side: 'BUY',
  order_type: 'LIMIT',
  status: 'PENDING',
  quantity: '9007199254740993',
  price: '10.1234',
  filled_quantity: '0',
  remaining_quantity: '9007199254740993',
  average_fill_price: null,
  submitted_at: null,
  updated_at: null,
  price_currency: null,
}
export interface Plan {
  status?: number
  code?: string
  data?: unknown
  disconnect?: boolean
  revokeAfter?: boolean
  hold?: boolean
  invalidJson?: boolean
  waitMs?: number
  requestId?: string
}
export async function v2Fixture(
  options: { writesEnabled?: boolean; tradingTimeoutMs?: number } = {},
) {
  const f = await tradingFixture({ writesEnabled: true, ...options })
  const state = {
    requests: [] as {
      method: string
      path: string
      body: unknown
      key?: string
      scope: string
      agent: string
    }[],
    plans: [] as Plan[],
    readData: [] as unknown[],
    effects: 0,
    revoked: false,
    unsupportedCashFlows: false,
    actionData: { order_id: 'synthetic-order', accepted: true } as Record<string, unknown>,
    replay: new Map<string, { fingerprint: string; data: unknown }>(),
    events: [] as string[],
  }
  const send = (
    res: ServerResponse,
    status: number,
    code: string,
    data: unknown,
    id: number | string,
  ) => {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        code,
        message: 'synthetic private upstream detail',
        data,
        request_id: typeof id === 'string' ? id : `synthetic-http-${id}`,
        timestamp: 1,
      }),
    )
  }
  f.state.handleTrading = (req: IncomingMessage, res: ServerResponse) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString()
    })
    req.on('end', () => {
      void (async () => {
        const claims = decodeJwt(req.headers.authorization?.slice(7) ?? '')
        const method = req.method ?? 'GET'
        const path = req.url ?? ''
        const key = req.headers['idempotency-key'] as string | undefined
        const body: unknown = raw ? JSON.parse(raw) : null
        state.requests.push({
          method,
          path,
          key,
          body,
          scope: String(claims.scope),
          agent: String(claims.agent_id),
        })
        const id = state.requests.length
        if (state.revoked) {
          send(res, 401, 'invalid_token', null, id)
          return
        }
        if (method === 'GET') {
          const url = new URL(path, f.tradingBase)
          if (url.pathname.endsWith('/cash-flows') && state.unsupportedCashFlows) {
            send(res, 501, 'cash_flows_unsupported', null, id)
            return
          }
          const data = state.readData.length
            ? state.readData.shift()
            : url.pathname.includes('/signals/')
              ? syntheticSignal('PENDING')
              : url.pathname.includes('/orders/')
                ? order
                : url.pathname.endsWith('/orders')
                  ? { items: [order], next_cursor: null }
                  : url.pathname.endsWith('/account')
                    ? {
                        account_id: 'fixture-account',
                        mode: 'PAPER',
                        base_currency: 'USD',
                        total_assets: '9007199254740993.12',
                        cash: null,
                        available_cash: null,
                        frozen_cash: null,
                        buying_power: null,
                        market_value: null,
                        unrealized_pnl: null,
                        as_of: 'synthetic-time',
                        is_stale: true,
                      }
                    : { items: [], next_cursor: null }
          send(res, 200, '0', data, id)
          return
        }
        const plan = state.plans.shift() ?? {}
        state.events.push(`start:${key}`)
        if (plan.hold) return
        if (plan.waitMs) await delay(plan.waitMs)
        if (plan.status) {
          send(res, plan.status, plan.code ?? 'synthetic_failure', plan.data ?? null, id)
          return
        }
        const fingerprint = JSON.stringify({ method, path, body })
        const prior = state.replay.get(key ?? '')
        if (prior && prior.fingerprint !== fingerprint) {
          send(res, 409, 'idempotency_conflict', null, id)
          return
        }
        const data =
          plan.data ?? prior?.data ?? (method === 'POST' ? syntheticSignal() : state.actionData)
        if (!prior) {
          state.effects++
          state.replay.set(key ?? '', { fingerprint, data })
        }
        if (plan.revokeAfter) state.revoked = true
        if (plan.disconnect) {
          req.socket.destroy()
          return
        }
        state.events.push(`end:${key}`)
        if (plan.invalidJson) {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end('{')
          return
        }
        send(res, 200, '0', data, plan.requestId ?? id)
      })().catch(() => {
        if (!res.destroyed) res.writeHead(500).end()
      })
    })
  }
  return { ...f, v2: state }
}
