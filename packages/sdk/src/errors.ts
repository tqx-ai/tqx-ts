import type { BaseIssue } from 'valibot'

export class TqxError extends Error {
  override readonly name: string = 'TqxError'
}

export class TqxConfigurationError extends TqxError {
  override readonly name = 'TqxConfigurationError'
}

export class TqxValidationError extends TqxError {
  override readonly name = 'TqxValidationError'

  constructor(
    message: string,
    readonly issues: readonly BaseIssue<unknown>[],
  ) {
    super(message)
  }
}

export class TqxNetworkError extends TqxError {
  override readonly name = 'TqxNetworkError'
}

export class TqxProtocolError extends TqxError {
  override readonly name = 'TqxProtocolError'

  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null = null,
    readonly contentType: string | null = null,
    readonly url: string | null = null,
  ) {
    super(message)
  }
}

/** Business error codes exposed by the Trading Open API. */
export type TradingApiErrorCode =
  | 'invalid_api_key'
  | 'insufficient_scope'
  | 'binding_unavailable'
  | 'rate_limit_exceeded'
  | 'invalid_request'
  | 'order_not_found'
  | 'signal_not_found'
  | 'order_not_cancellable'
  | 'order_not_modifiable'
  | 'data_unavailable'
  | 'idempotency_conflict'
  | 'insufficient_funds'
  | 'insufficient_position'
  | 'position_direction_conflict'
  | 'market_closed'
  | 'account_locked'
  | 'invalid_trade_date'
  | 'market_not_permitted'
  | 'invalid_lot_size'
  | 'invalid_order_price'
  | 'invalid_symbol'
  | 'risk_control_blocked'
  | 'order_rejected'
  | 'upstream_rejected'
  | 'trading_service_unavailable'
  | 'trading_timeout'
  | 'trading_data_mapping_error'

export class TqxApiError extends TqxError {
  override readonly name = 'TqxApiError'

  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null,
    readonly data: unknown = null,
  ) {
    super(message)
  }
}
