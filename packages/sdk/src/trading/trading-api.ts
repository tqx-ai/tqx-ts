import * as v from 'valibot'

import { TqxValidationError } from '../errors'
import {
  AccountOptionsSchema,
  CancelOrderDataSchema,
  CancelOrderOptionsSchema,
  CashFlowsDataSchema,
  CashFlowsOptionsSchema,
  ModifyOrderDataSchema,
  ModifyOrderInputSchema,
  OrderDataSchema,
  OrdersDataSchema,
  OrdersOptionsSchema,
  PlaceOrderInputSchema,
  PositionsDataSchema,
  PositionsOptionsSchema,
  SignalDataSchema,
  TradesDataSchema,
  TradesOptionsSchema,
  TradingAccountDataSchema,
  type AccountOptions,
  type CancelOrderData,
  type CancelOrderOptions,
  type CashFlowsData,
  type CashFlowsOptions,
  type ModifyOrderData,
  type ModifyOrderInput,
  type OrderData,
  type OrdersData,
  type OrdersOptions,
  type PlaceOrderInput,
  type PositionsData,
  type PositionsOptions,
  type SignalData,
  type TradesData,
  type TradesOptions,
  type TradingAccountData,
} from './schemas'
import APIs from '../config/APIs'

export interface TradingApi {
  getAccount(options?: AccountOptions): Promise<TradingAccountData>
  listPositions(options?: PositionsOptions): Promise<PositionsData>
  listOrders(options?: OrdersOptions): Promise<OrdersData>
  getOrder(orderId: string): Promise<OrderData>
  /** Returns a signal envelope; `state` is not the linked order's final status. */
  placeOrder(input: PlaceOrderInput): Promise<SignalData>
  modifyOrder(input: ModifyOrderInput): Promise<ModifyOrderData>
  /** Acknowledges a cancellation request; it does not confirm `CANCELLED`. */
  cancelOrder(orderId: string, options?: CancelOrderOptions): Promise<CancelOrderData>
  listTrades(options?: TradesOptions): Promise<TradesData>
  /**
   * Lists broker cash-ledger rows in their native currency. Rejects with
   * `TqxApiError` code `cash_flows_unsupported` when the account's channel
   * cannot provide a complete ledger; an empty list is never used for that.
   */
  listCashFlows(options?: CashFlowsOptions): Promise<CashFlowsData>
  getSignal(signalId: string): Promise<SignalData>
}

export interface TradingRequestOptions<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
> {
  schema: TSchema
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: unknown
  headers?: Record<string, string>
}

export type TradingRequest = <TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  path: string,
  options: TradingRequestOptions<TSchema>,
) => Promise<v.InferOutput<TSchema>>

/**
 * Maps the public trading API to validated OpenAPI requests.
 * Transport and response-envelope handling remain owned by TqxClient.
 */
export class TradingApiClient implements TradingApi {
  readonly #request: TradingRequest

  constructor(request: TradingRequest) {
    this.#request = request
  }

  async getAccount(options: AccountOptions = {}): Promise<TradingAccountData> {
    const input = parseInput(AccountOptionsSchema, options)
    return this.#request(APIs.ACCOUNT, {
      schema: TradingAccountDataSchema,
      query: { currency: input.currency },
    })
  }

  async listPositions(options: PositionsOptions = {}): Promise<PositionsData> {
    const input = parseInput(PositionsOptionsSchema, options)
    return this.#request(APIs.POSITIONS, {
      schema: PositionsDataSchema,
      query: input,
    })
  }

  async listOrders(options: OrdersOptions = {}): Promise<OrdersData> {
    const input = parseInput(OrdersOptionsSchema, options)
    return this.#request(APIs.ORDERS, {
      schema: OrdersDataSchema,
      query: {
        start_date: input.startDate,
        end_date: input.endDate,
        status: input.status,
        symbol: input.symbol,
        limit: input.limit,
        cursor: input.cursor,
      },
    })
  }

  getOrder(orderId: string): Promise<OrderData> {
    return this.#request(`${APIs.ORDERS}/${encodeIdentifier(orderId, 'order ID')}`, {
      schema: OrderDataSchema,
    })
  }

  async placeOrder(input: PlaceOrderInput): Promise<SignalData> {
    const parsed = parseInput(PlaceOrderInputSchema, input)
    return this.#request(APIs.ORDERS, {
      schema: SignalDataSchema,
      method: 'POST',
      headers: { 'Idempotency-Key': parsed.idempotencyKey },
      body: {
        symbol: parsed.symbol,
        side: parsed.side,
        order_type: parsed.orderType,
        quantity: parsed.quantity,
        price: parsed.price,
        reason: parsed.reason || undefined,
        time_in_force: parsed.timeInForce ?? 'DAY',
      },
    })
  }

  async modifyOrder(input: ModifyOrderInput): Promise<ModifyOrderData> {
    const parsed = parseInput(ModifyOrderInputSchema, input)
    return this.#request(`${APIs.ORDERS}/${encodeIdentifier(parsed.orderId, 'order ID')}`, {
      schema: ModifyOrderDataSchema,
      method: 'PATCH',
      headers:
        parsed.idempotencyKey === undefined
          ? undefined
          : { 'Idempotency-Key': parsed.idempotencyKey },
      body: { price: parsed.price },
    })
  }

  cancelOrder(orderId: string, options: CancelOrderOptions = {}): Promise<CancelOrderData> {
    const encodedOrderId = encodeIdentifier(orderId, 'order ID')
    const parsed = parseInput(CancelOrderOptionsSchema, options)
    return this.#request(`${APIs.ORDERS}/${encodedOrderId}`, {
      schema: CancelOrderDataSchema,
      method: 'DELETE',
      headers:
        parsed.idempotencyKey === undefined
          ? undefined
          : { 'Idempotency-Key': parsed.idempotencyKey },
    })
  }

  async listTrades(options: TradesOptions = {}): Promise<TradesData> {
    const input = parseInput(TradesOptionsSchema, options)
    return this.#request(APIs.TRADES, {
      schema: TradesDataSchema,
      query: {
        market: input.market,
        order_id: input.orderId,
        limit: input.limit,
        cursor: input.cursor,
      },
    })
  }

  async listCashFlows(options: CashFlowsOptions = {}): Promise<CashFlowsData> {
    const input = parseInput(CashFlowsOptionsSchema, options)
    return this.#request(APIs.CASH_FLOWS, {
      schema: CashFlowsDataSchema,
      query: {
        start_date: input.startDate,
        end_date: input.endDate,
        currency: input.currency,
        limit: input.limit,
        cursor: input.cursor,
      },
    })
  }

  getSignal(signalId: string): Promise<SignalData> {
    return this.#request(`${APIs.SIGNALS}/${encodeIdentifier(signalId, 'signal ID', 8)}`, {
      schema: SignalDataSchema,
    })
  }
}

function parseInput<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  input: unknown,
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input)
  if (!result.success) throw new TqxValidationError('Invalid SDK input', result.issues)
  return result.output
}

function encodeIdentifier(value: string, name: string, minLength = 1): string {
  const result = v.safeParse(v.pipe(v.string(), v.minLength(minLength), v.maxLength(128)), value)
  if (!result.success) throw new TqxValidationError(`Invalid ${name}`, result.issues)
  return encodeURIComponent(result.output)
}
