import * as v from 'valibot'

const text = v.pipe(v.string(), v.maxLength(2048))
const nullable = v.nullable(text)
const optionalNullable = v.optional(nullable)
export const marketSchema = v.picklist(['HK', 'US'])
const side = v.picklist(['BUY', 'SELL'])
const validity = v.optional(v.literal('DAY'))
const id = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^(?!\.{1,2}$)[\s\S]+$/, 'Invalid identifier'),
)
const signalId = v.pipe(v.string(), v.minLength(8), v.maxLength(128))
const price = v.pipe(
  v.string(),
  v.maxLength(128),
  v.regex(/^\d+(?:\.\d+)?$/),
  v.check((x) => /[1-9]/.test(x), 'Price must be positive'),
)
const pagination = {
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 20),
  cursor: v.optional(v.pipe(v.string(), v.maxLength(512))),
}
const date = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/),
  v.check((x) => {
    const parsed = new Date(`${x}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === x
  }, 'Expected a valid YYYY-MM-DD date'),
)

export const snapshotSchema = v.pipe(
  v.strictObject({
    sections: v.optional(
      v.pipe(v.array(v.picklist(['account', 'positions'])), v.minLength(1), v.maxLength(2)),
      ['account', 'positions'],
    ),
    currency: v.optional(v.picklist(['HKD', 'USD'])),
    symbol: v.optional(v.pipe(v.string(), v.minLength(3), v.maxLength(32))),
    market: v.optional(marketSchema),
    ...pagination,
  }),
  v.check(
    (x) =>
      (x.currency === undefined || x.sections.includes('account')) &&
      ([x.symbol, x.market, x.cursor].every((value) => value === undefined) ||
        x.sections.includes('positions')),
    'Filters require their matching section',
  ),
)

export const activitySchema = v.variant('type', [
  v.strictObject({ type: v.literal('orders'), ...pagination }),
  v.strictObject({
    type: v.literal('trades'),
    market: v.optional(marketSchema),
    orderId: v.optional(id),
    ...pagination,
  }),
  v.pipe(
    v.strictObject({
      type: v.literal('cash_flows'),
      startDate: v.optional(date),
      endDate: v.optional(date),
      currency: v.optional(v.pipe(v.string(), v.regex(/^[A-Z]{3}$/))),
      ...pagination,
    }),
    v.check(
      (x) => !x.startDate || !x.endDate || x.startDate <= x.endDate,
      'startDate must not exceed endDate',
    ),
  ),
])
export const lookupSchema = v.variant('type', [
  v.strictObject({ type: v.literal('order'), id }),
  v.strictObject({ type: v.literal('signal'), id: signalId }),
])
const placeFields = {
  action: v.literal('place'),
  symbol: v.pipe(
    v.string(),
    v.regex(
      /^\s*[^\s.]{1,29}\.(?:[Hh][Kk]|[Uu][Ss])\s*$/,
      'Symbol must use <code>.HK or <code>.US',
    ),
    v.trim(),
    v.toUpperCase(),
    v.check((symbol) => symbol.length <= 32, 'Symbol must not exceed 32 characters'),
  ),
  side,
  quantity: v.pipe(
    v.string(),
    v.maxLength(128),
    v.regex(/^[1-9]\d*$/, 'Quantity must be a positive integer string'),
  ),
  reason: v.optional(v.pipe(v.string(), v.maxLength(512))),
  timeInForce: validity,
  idempotencyKey: v.pipe(
    v.string(),
    v.minLength(8),
    v.maxLength(128),
    v.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/),
  ),
}
export const orderSchema = v.variant('action', [
  v.variant('orderType', [
    v.strictObject({ ...placeFields, orderType: v.literal('LIMIT'), price }),
    v.strictObject({ ...placeFields, orderType: v.literal('MARKET') }),
  ]),
  v.strictObject({ action: v.literal('modify'), orderId: id, price }),
  v.strictObject({ action: v.literal('cancel'), orderId: id }),
])
export const controlSchema = v.strictObject({ action: v.literal('hold') })

// These schemas are local MCP contracts. Unknown upstream fields are stripped.
export const accountResponse = v.object({
  account_id: v.union([text, v.number()]),
  mode: v.picklist(['LIVE', 'PAPER']),
  base_currency: text,
  total_assets: text,
  cash: nullable,
  available_cash: nullable,
  frozen_cash: nullable,
  buying_power: nullable,
  market_value: nullable,
  unrealized_pnl: nullable,
  as_of: text,
  is_stale: v.boolean(),
  cash_balances: v.optional(
    v.nullable(
      v.array(
        v.object({
          currency: text,
          available_cash: nullable,
          frozen_cash: nullable,
          settling_cash: nullable,
          withdrawable_cash: nullable,
        }),
      ),
    ),
  ),
})
const positionResponse = v.object({
  symbol: text,
  symbol_name: text,
  market: marketSchema,
  currency: text,
  side: text,
  quantity: text,
  available_quantity: text,
  average_cost: nullable,
  last_price: nullable,
  market_value: nullable,
  unrealized_pnl: nullable,
  unrealized_pnl_ratio: nullable,
  as_of: text,
  price_currency: optionalNullable,
})
export const orderResponse = v.object({
  order_id: text,
  client_order_id: nullable,
  symbol: text,
  symbol_name: text,
  market: marketSchema,
  currency: text,
  side,
  order_type: v.picklist(['MARKET', 'LIMIT']),
  status: v.picklist([
    'PENDING',
    'SUBMITTED',
    'PARTIAL_FILLED',
    'MODIFYING',
    'CANCELLING',
    'FILLED',
    'CANCELLED',
    'REJECTED',
    'TIMEOUT',
    'FAILED',
  ]),
  quantity: text,
  price: nullable,
  filled_quantity: text,
  remaining_quantity: text,
  average_fill_price: nullable,
  submitted_at: nullable,
  updated_at: nullable,
  time_in_force: validity,
  market_session: optionalNullable,
  effective_trade_date: optionalNullable,
  expire_at: optionalNullable,
  cancel_request_id: optionalNullable,
  modify_request_id: optionalNullable,
  cancel_action_status: optionalNullable,
  modify_action_status: optionalNullable,
  price_currency: optionalNullable,
})
const tradeResponse = v.object({
  trade_id: text,
  order_id: text,
  symbol: text,
  symbol_name: text,
  market: marketSchema,
  currency: text,
  side,
  quantity: text,
  price: text,
  amount: text,
  commission: nullable,
  executed_at: text,
  client_order_id: optionalNullable,
  realized_pnl: optionalNullable,
  order_type: v.optional(v.nullable(v.picklist(['MARKET', 'LIMIT']))),
  total_fees: optionalNullable,
  fees: v.optional(v.nullable(v.record(text, text))),
  price_currency: optionalNullable,
})
const cashFlowResponse = v.object({
  flow_id: text,
  currency: text,
  amount: text,
  direction: v.picklist(['IN', 'OUT']),
  category: v.nullable(
    v.picklist(['TRADE', 'FEE', 'TRANSFER', 'FX', 'CORPORATE_ACTION', 'AWARD', 'OTHER']),
  ),
  symbol: nullable,
  occurred_at: nullable,
  business_date: nullable,
  settle_date: nullable,
  settlement_status: v.nullable(v.picklist(['SETTLED', 'SETTLING'])),
  reference_id: nullable,
  order_id: nullable,
  broker_type: nullable,
  business_name: nullable,
  description: nullable,
})
const page = <T extends v.GenericSchema>(schema: T) =>
  v.object({
    items: v.pipe(v.array(schema), v.maxLength(100)),
    next_cursor: v.optional(nullable, null),
  })
export const positionsResponse = page(positionResponse)
export const ordersResponse = page(orderResponse)
export const tradesResponse = page(tradeResponse)
export const cashFlowsResponse = page(cashFlowResponse)
export const signalResponse = v.object({
  signal_id: text,
  state: v.picklist(['PENDING', 'ACCEPTED', 'UNKNOWN', 'REJECTED']),
  order_id: nullable,
  order_status: nullable,
  message: nullable,
  created_at: text,
  updated_at: text,
  error_code: optionalNullable,
  broker_error_id: v.optional(v.nullable(v.number())),
  rejection_reason: optionalNullable,
  parent_request_id: optionalNullable,
  symbol: optionalNullable,
  requested_price: optionalNullable,
  total_quantity: optionalNullable,
  requested_quantity: optionalNullable,
  available_quantity: optionalNullable,
  excess_quantity: optionalNullable,
  short_selling_allowed: v.optional(v.nullable(v.boolean())),
  requested_value: optionalNullable,
  available_cash: optionalNullable,
  available_buying_power: optionalNullable,
  cash_max_quantity: optionalNullable,
  margin_max_quantity: optionalNullable,
  shortfall: optionalNullable,
  currency: optionalNullable,
  time_in_force: v.optional(v.nullable(v.literal('DAY'))),
  market_session: optionalNullable,
  effective_trade_date: optionalNullable,
  expire_at: optionalNullable,
})
export const acceptedResponse = v.object({
  order_id: text,
  new_order_id: optionalNullable,
  accepted: v.boolean(),
  action_id: text,
  request_id: optionalNullable,
  status: text,
  order_status: optionalNullable,
  error_code: optionalNullable,
})
export const holdResponse = v.object({
  agent_id: text,
  activity_date: text,
  is_active: v.boolean(),
  first_active_at: text,
  newly_marked: v.boolean(),
})
export const bugReportResponse = v.object({
  bug_id: text,
  created_at: text,
})

export type SnapshotInput = v.InferOutput<typeof snapshotSchema>
export type ActivityInput = v.InferOutput<typeof activitySchema>
export type LookupInput = v.InferOutput<typeof lookupSchema>
export type OrderInput = v.InferOutput<typeof orderSchema>
export type ControlInput = v.InferOutput<typeof controlSchema>
export type SignalData = v.InferOutput<typeof signalResponse>
