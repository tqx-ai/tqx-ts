import type { AuthInfo } from '@modelcontextprotocol/server'

import type { TradingConfig } from '../../src/trading/config'

export const tradingConfig: TradingConfig = {
  baseUrl: 'https://trade.example.test',
  resource: 'https://trade.example.test/openapi',
  tokenEndpoint: 'https://auth.example.test/oauth/token',
  clientId: 'tqx_mcp_server',
  clientSecret: 'test-client-secret',
}
export const time = '2026-11-06T00:00:00Z'
export const account = {
  account_id: 'account-1',
  mode: 'PAPER',
  base_currency: 'USD',
  total_assets: '1000.00',
  cash: '900',
  available_cash: '900',
  frozen_cash: null,
  buying_power: '900',
  market_value: '100',
  unrealized_pnl: null,
  as_of: time,
  is_stale: false,
}
export const order = {
  order_id: 'order-1',
  client_order_id: null,
  symbol: 'AAPL.US',
  symbol_name: 'Apple',
  market: 'US',
  currency: 'USD',
  side: 'BUY',
  order_type: 'LIMIT',
  status: 'SUBMITTED',
  quantity: '1',
  price: '100.00',
  filled_quantity: '0',
  remaining_quantity: '1',
  average_fill_price: null,
  submitted_at: time,
  updated_at: time,
}
export const signal = {
  signal_id: 'signal-123',
  state: 'ACCEPTED',
  order_id: 'order-1',
  order_status: null,
  message: null,
  created_at: time,
  updated_at: time,
  time_in_force: null,
  available_cash: '900',
  cash_max_quantity: '9',
  margin_max_quantity: '18',
}
export const hold = {
  agent_id: 'agent-1',
  activity_date: '2026-11-06',
  is_active: true,
  first_active_at: time,
  newly_marked: true,
}
export const bugReport = {
  bug_id: 'BR-20261106-ABC123',
  created_at: time,
}
export function auth(now = Date.now()): AuthInfo {
  return {
    token: 'incoming-mcp-token',
    clientId: 'external-client',
    scopes: ['trade:read', 'order:write'],
    expiresAt: Math.floor(now / 1000) + 3600,
    extra: { sub: 'user-1', agent_id: 'agent-1' },
  }
}
export function envelope(data: unknown, status = 200, code = '0') {
  return Response.json(
    { code, message: 'upstream-message', data, request_id: 'request-1' },
    { status },
  )
}
