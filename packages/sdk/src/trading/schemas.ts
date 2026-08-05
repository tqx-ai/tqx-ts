import * as v from 'valibot'

import { nullableString, optionalNullableString } from '../utils/schema-utils'

export const TradingModeSchema = v.picklist(['LIVE', 'PAPER'])
export const MarketSchema = v.picklist(['HK', 'US'])
export const OrderSideSchema = v.picklist(['BUY', 'SELL'])
export const OrderTypeSchema = v.picklist(['MARKET', 'LIMIT'])

/** Final and in-flight lifecycle states of an order. */
export const OrderStatusSchema = v.picklist([
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
])

/** Lifecycle states of a trading signal, independent from the order lifecycle. */
export const SignalStateSchema = v.picklist(['PENDING', 'ACCEPTED', 'UNKNOWN', 'REJECTED'])

const positiveDecimalString = v.pipe(
  v.string(),
  v.regex(/^\d+(?:\.\d+)?$/, 'Expected a positive decimal string'),
  v.check((value) => /[1-9]/.test(value), 'Expected a value greater than zero'),
)
const positiveIntegerString = v.pipe(
  v.string(),
  v.regex(/^[1-9]\d*$/, 'Expected a positive integer string'),
)

export const TradingAccountDataSchema = v.looseObject({
  account_id: v.union([v.string(), v.number()]),
  mode: TradingModeSchema,
  base_currency: v.string(),
  total_assets: v.string(),
  cash: nullableString,
  available_cash: nullableString,
  frozen_cash: nullableString,
  buying_power: nullableString,
  market_value: nullableString,
  unrealized_pnl: nullableString,
  as_of: v.string(),
  is_stale: v.boolean(),
})

export const PositionDataSchema = v.looseObject({
  symbol: v.string(),
  symbol_name: v.string(),
  market: MarketSchema,
  currency: v.string(),
  side: v.string(),
  quantity: v.string(),
  available_quantity: v.string(),
  average_cost: nullableString,
  last_price: nullableString,
  market_value: nullableString,
  unrealized_pnl: nullableString,
  unrealized_pnl_ratio: nullableString,
  as_of: v.string(),
})

export const OrderDataSchema = v.looseObject({
  order_id: v.string(),
  client_order_id: nullableString,
  symbol: v.string(),
  symbol_name: v.string(),
  market: MarketSchema,
  currency: v.string(),
  side: OrderSideSchema,
  order_type: OrderTypeSchema,
  status: OrderStatusSchema,
  quantity: v.string(),
  price: nullableString,
  filled_quantity: v.string(),
  remaining_quantity: v.string(),
  average_fill_price: nullableString,
  submitted_at: nullableString,
  updated_at: nullableString,
})

export const TradeDataSchema = v.looseObject({
  trade_id: v.string(),
  order_id: v.string(),
  symbol: v.string(),
  symbol_name: v.string(),
  market: MarketSchema,
  currency: v.string(),
  side: OrderSideSchema,
  quantity: v.string(),
  price: v.string(),
  amount: v.string(),
  commission: nullableString,
  executed_at: v.string(),
})

/**
 * Signal response returned by order submission and signal queries.
 * `state` describes the signal request. `order_status` is a separate,
 * optional snapshot of the linked order and may be null while processing.
 */
export const SignalDataSchema = v.looseObject({
  signal_id: v.string(),
  state: SignalStateSchema,
  order_id: nullableString,
  order_status: nullableString,
  message: nullableString,
  created_at: v.string(),
  updated_at: v.string(),
  error_code: optionalNullableString,
  broker_error_id: v.optional(v.nullable(v.number())),
})

/** `accepted` acknowledges the operation request, not the order's final state. */
export const CancelOrderDataSchema = v.looseObject({
  order_id: v.string(),
  accepted: v.boolean(),
})

export const ModifyOrderDataSchema = CancelOrderDataSchema

export const PositionsDataSchema = v.looseObject({
  items: v.array(PositionDataSchema),
  next_cursor: optionalNullableString,
})

export const OrdersDataSchema = v.looseObject({
  items: v.array(OrderDataSchema),
  next_cursor: optionalNullableString,
})

export const TradesDataSchema = v.looseObject({
  items: v.array(TradeDataSchema),
  next_cursor: optionalNullableString,
})

export const PaginationOptionsSchema = v.strictObject({
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
  cursor: v.optional(v.pipe(v.string(), v.maxLength(512))),
})

export const AccountOptionsSchema = v.strictObject({
  currency: v.optional(v.picklist(['HKD', 'USD'])),
})

export const PositionsOptionsSchema = v.strictObject({
  symbol: v.optional(v.pipe(v.string(), v.minLength(3), v.maxLength(32))),
  market: v.optional(MarketSchema),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
  cursor: v.optional(v.pipe(v.string(), v.maxLength(512))),
})

export const TradesOptionsSchema = v.strictObject({
  market: v.optional(MarketSchema),
  orderId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(128))),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
  cursor: v.optional(v.pipe(v.string(), v.maxLength(512))),
})

export const PlaceOrderInputSchema = v.pipe(
  v.strictObject({
    symbol: v.pipe(
      v.string(),
      v.transform((value) => value.trim().toUpperCase()),
      v.regex(/^[^.]{1,29}\.(?:HK|US)$/, 'Symbol must use <code>.<market>'),
    ),
    side: OrderSideSchema,
    orderType: OrderTypeSchema,
    quantity: positiveIntegerString,
    price: v.optional(positiveDecimalString),
    reason: v.optional(
      v.pipe(
        v.string(),
        v.transform((value) => value.trim()),
        v.maxLength(512),
      ),
    ),
    idempotencyKey: v.pipe(
      v.string(),
      v.minLength(8, 'Must be at least 8 characters'),
      v.maxLength(128, 'Must be at most 128 characters'),
      v.regex(
        /^[A-Za-z0-9][A-Za-z0-9._:-]+$/,
        'Must start with a letter or number and contain only letters, numbers, periods, underscores, colons, or hyphens',
      ),
    ),
  }),
  v.check(
    (input) =>
      (input.orderType === 'LIMIT' && input.price !== undefined) ||
      (input.orderType === 'MARKET' && input.price === undefined),
    'LIMIT orders require price and MARKET orders must not include price',
  ),
)

export const ModifyOrderInputSchema = v.strictObject({
  orderId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  price: positiveDecimalString,
})

export type TradingAccountData = v.InferOutput<typeof TradingAccountDataSchema>
export type PositionData = v.InferOutput<typeof PositionDataSchema>
export type OrderData = v.InferOutput<typeof OrderDataSchema>
export type TradeData = v.InferOutput<typeof TradeDataSchema>
export type SignalData = v.InferOutput<typeof SignalDataSchema>
export type CancelOrderData = v.InferOutput<typeof CancelOrderDataSchema>
export type ModifyOrderData = v.InferOutput<typeof ModifyOrderDataSchema>
export type PositionsData = v.InferOutput<typeof PositionsDataSchema>
export type OrdersData = v.InferOutput<typeof OrdersDataSchema>
export type TradesData = v.InferOutput<typeof TradesDataSchema>
export type AccountOptions = v.InferInput<typeof AccountOptionsSchema>
export type PositionsOptions = v.InferInput<typeof PositionsOptionsSchema>
export type PaginationOptions = v.InferInput<typeof PaginationOptionsSchema>
export type TradesOptions = v.InferInput<typeof TradesOptionsSchema>
export type PlaceOrderInput = v.InferInput<typeof PlaceOrderInputSchema>
export type ModifyOrderInput = v.InferInput<typeof ModifyOrderInputSchema>
export type Market = v.InferOutput<typeof MarketSchema>
export type OrderSide = v.InferOutput<typeof OrderSideSchema>
export type OrderType = v.InferOutput<typeof OrderTypeSchema>
export type OrderStatus = v.InferOutput<typeof OrderStatusSchema>
export type SignalState = v.InferOutput<typeof SignalStateSchema>
