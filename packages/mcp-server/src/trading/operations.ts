import * as v from 'valibot'

import * as schemas from './schemas'

// All backend paths belong to this module; no CLI/SDK imports.
const root = '/openapi/v1/trading'
const paths = {
  account: `${root}/account`,
  positions: `${root}/positions`,
  orders: `${root}/orders`,
  trades: `${root}/trades`,
  cashFlows: `${root}/cash-flows`,
  signals: `${root}/signals`,
  hold: `${root}/hold`,
}
const operation = <T extends v.GenericSchema>(
  path: string,
  schema: T,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  scope: 'trade:read' | 'order:write' = method === 'GET' ? 'trade:read' : 'order:write',
) => ({
  domain: 'trading' as const,
  path,
  schema,
  method,
  scope,
  write: method !== 'GET',
})
export const operations = {
  account: operation(paths.account, schemas.accountResponse),
  positions: operation(paths.positions, schemas.positionsResponse),
  orders: operation(paths.orders, schemas.ordersResponse),
  trades: operation(paths.trades, schemas.tradesResponse),
  cashFlows: operation(paths.cashFlows, schemas.cashFlowsResponse),
  order: operation(paths.orders, schemas.orderResponse),
  signal: operation(paths.signals, schemas.signalResponse, 'GET', 'order:write'),
  place: operation(paths.orders, schemas.signalResponse, 'POST'),
  modify: operation(paths.orders, schemas.acceptedResponse, 'PATCH'),
  cancel: operation(paths.orders, schemas.acceptedResponse, 'DELETE'),
  // The public hold route is a read-scoped activity mark even though it mutates
  // server-side activity state; it still bypasses the read token cache.
  hold: operation(paths.hold, schemas.holdResponse, 'POST', 'trade:read'),
} as const
export type OperationName = keyof typeof operations
