import * as v from 'valibot'

import { TqxValidationError } from '../errors'
import {
  AccountOptionsSchema,
  CancelOrderDataSchema,
  ModifyOrderDataSchema,
  ModifyOrderInputSchema,
  OrderDataSchema,
  OrdersDataSchema,
  PaginationOptionsSchema,
  PlaceOrderInputSchema,
  PositionsDataSchema,
  PositionsOptionsSchema,
  SignalDataSchema,
  TradesDataSchema,
  TradesOptionsSchema,
  TradingAccountDataSchema,
  type AccountOptions,
  type CancelOrderData,
  type ModifyOrderData,
  type ModifyOrderInput,
  type OrderData,
  type OrdersData,
  type PaginationOptions,
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
  listOrders(options?: PaginationOptions): Promise<OrdersData>
  getOrder(orderId: string): Promise<OrderData>
  placeOrder(input: PlaceOrderInput): Promise<SignalData>
  modifyOrder(input: ModifyOrderInput): Promise<ModifyOrderData>
  cancelOrder(orderId: string): Promise<CancelOrderData>
  listTrades(options?: TradesOptions): Promise<TradesData>
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

  async listOrders(options: PaginationOptions = {}): Promise<OrdersData> {
    const input = parseInput(PaginationOptionsSchema, options)
    return this.#request(APIs.ORDERS, {
      schema: OrdersDataSchema,
      query: input,
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
      },
    })
  }

  async modifyOrder(input: ModifyOrderInput): Promise<ModifyOrderData> {
    const parsed = parseInput(ModifyOrderInputSchema, input)
    return this.#request(`${APIs.ORDERS}/${encodeIdentifier(parsed.orderId, 'order ID')}`, {
      schema: ModifyOrderDataSchema,
      method: 'PATCH',
      body: { price: parsed.price },
    })
  }

  cancelOrder(orderId: string): Promise<CancelOrderData> {
    return this.#request(`${APIs.ORDERS}/${encodeIdentifier(orderId, 'order ID')}`, {
      schema: CancelOrderDataSchema,
      method: 'DELETE',
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
