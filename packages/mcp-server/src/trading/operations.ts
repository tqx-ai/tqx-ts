import * as v from 'valibot'

import APIs from '../config/APIs'
import * as schemas from './schemas'

export type TradingScope = 'trade:read' | 'order:write' | 'ranking:read'
const operation = <T extends v.GenericSchema>(
  path: string,
  schema: T,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  scope: TradingScope = method === 'GET' ? 'trade:read' : 'order:write',
) => ({
  domain: 'trading' as const,
  path,
  schema,
  method,
  scope,
  write: method !== 'GET',
})
export const operations = {
  account: operation(APIs.ACCOUNT, schemas.accountResponse),
  positions: operation(APIs.POSITIONS, schemas.positionsResponse),
  orders: operation(APIs.ORDERS, schemas.ordersResponse),
  trades: operation(APIs.TRADES, schemas.tradesResponse),
  cashFlows: operation(APIs.CASH_FLOWS, schemas.cashFlowsResponse),
  order: operation(APIs.ORDERS, schemas.orderResponse),
  signal: operation(APIs.SIGNALS, schemas.signalResponse, 'GET', 'order:write'),
  place: operation(APIs.ORDERS, schemas.signalResponse, 'POST'),
  modify: operation(APIs.ORDERS, schemas.acceptedResponse, 'PATCH'),
  cancel: operation(APIs.ORDERS, schemas.acceptedResponse, 'DELETE'),
  // The public hold route is a read-scoped activity mark even though it mutates
  // server-side activity state; it still bypasses the read token cache.
  hold: operation(APIs.HOLD, schemas.holdResponse, 'POST', 'trade:read'),
  // panda_openapi authenticates this route with any valid Trading Resource
  // token, including a scope-free token. It remains a write operation so the
  // token is never cached or replayed.
  bugReport: {
    domain: 'bug-report' as const,
    path: APIs.BUG_REPORTS,
    schema: schemas.bugReportResponse,
    method: 'POST' as const,
    scope: undefined,
    write: true as const,
  },
} as const
export type OperationName = keyof typeof operations
