import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  PlaceOrderInputSchema,
  type PlaceOrderInput,
  type SignalData,
  TqxApiError,
  TqxClient,
  TqxNetworkError,
  TqxProtocolError,
  TqxValidationError,
} from '@tqx-ai/sdk'
import { type Config, REQUIRED_SCOPE, WRITE_SCOPE } from './config'
import type { ApiAccess } from './exchange'
import { readBoundedBody, UpstreamError } from './network'

export interface TradingContext {
  config: Config
  access: ApiAccess
  signal: AbortSignal
}

type TradingScope = typeof REQUIRED_SCOPE | typeof WRITE_SCOPE
type Outcome<T> =
  | { ok: true; data: T; requestId: string | null }
  | { ok: false; error: string; uncertain: boolean; requestId?: string | null; data?: unknown }
export type SubmissionStatus = 'accepted' | 'failed' | 'unknown' | 'not_submitted'
export interface SubmissionResult {
  index?: number
  idempotencyKey: string
  status: SubmissionStatus
  data?: unknown
  error?: string
  request_id?: string | null
}

// Only stable public codes and selected reconciliation IDs cross the error boundary.
const publicErrors = new Set([
  'trading_operation_pending',
  'trading_outcome_unknown',
  'cash_flows_unsupported',
  'idempotency_conflict',
  'order_not_found',
  'signal_not_found',
  'order_not_cancellable',
  'order_not_modifiable',
  'insufficient_funds',
  'insufficient_position',
  'position_direction_conflict',
  'market_closed',
  'account_locked',
  'agent_cooldown',
  'invalid_trade_date',
  'market_not_permitted',
  'invalid_lot_size',
  'invalid_order_price',
  'price_out_of_range',
  'price_validation_unavailable',
  'invalid_symbol',
  'risk_control_blocked',
  'order_rejected',
  'upstream_rejected',
  'trading_timeout',
  'trading_service_unavailable',
])
// Public tool-result codes include both upstream allowlisted codes and local mappings.
// Acceptance clients consume this same boundary rather than maintaining a partial copy.
export const PUBLIC_TRADING_TOOL_ERROR_CODES: readonly string[] = Object.freeze([
  ...publicErrors,
  'authorization_required',
  'permission_denied',
  'rate_limit_exceeded',
  'invalid_arguments',
  'trading_request_rejected',
  'upstream_protocol_error',
  'dependency_unavailable',
  'trading_configuration_error',
])
export function isPublicTradingToolErrorCode(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_TRADING_TOOL_ERROR_CODES.includes(value)
}
const uncertainCodes = new Set([
  'trading_operation_pending',
  'trading_outcome_unknown',
  'trading_timeout',
])

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[\x20-\x7e]{1,256}$/.test(value) ? value : undefined
}

function uncertainData(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const data: Record<string, string> = {}
  if (raw.status === 'UNKNOWN' || raw.status === 'RESERVED') data.status = raw.status
  if (raw.state === 'UNKNOWN') data.state = raw.state
  if (
    typeof raw.operation === 'string' &&
    ['PLACE_ORDER', 'MODIFY_ORDER', 'CANCEL_ORDER'].includes(raw.operation)
  )
    data.operation = raw.operation
  for (const field of ['request_id', 'signal_id', 'action_id', 'order_id']) {
    const id = safeIdentifier(raw[field])
    if (id) data[field] = id
  }
  return Object.keys(data).length ? data : undefined
}

function errorCode(failure: unknown): string {
  if (failure instanceof TqxApiError) {
    if (failure.status === 401) return 'authorization_required'
    if (failure.status === 403) return 'permission_denied'
    if (failure.status === 429) return 'rate_limit_exceeded'
    if (publicErrors.has(failure.code)) return failure.code
    if (failure.status >= 400 && failure.status < 500) return 'trading_request_rejected'
  } else if (failure instanceof TqxValidationError) return 'invalid_arguments'
  else if (failure instanceof TqxProtocolError) return 'upstream_protocol_error'
  else if (failure instanceof UpstreamError) return failure.code
  return 'dependency_unavailable'
}

async function runTrading<T>(
  context: TradingContext,
  caller: AbortSignal,
  scope: TradingScope,
  operation: (client: TqxClient) => Promise<T>,
): Promise<Outcome<T>> {
  if (
    !context.config.tradingToolsEnabled ||
    (scope === WRITE_SCOPE && !context.config.tradingWriteToolsEnabled) ||
    !context.access.scopes.includes(scope)
  )
    return { ok: false, error: 'permission_denied', uncertain: false }
  const signal = AbortSignal.any([
    context.signal,
    caller,
    AbortSignal.timeout(context.config.tradingTimeoutMs),
  ])
  let dispatched = false
  let ambiguousAttempt = false
  let requestId: string | null = null
  try {
    const base = new URL(context.config.tradingBaseUrl)
    const transport: typeof fetch = async (input, init) => {
      signal.throwIfAborted()
      if (context.access.expiresAt <= Math.floor(Date.now() / 1000))
        throw new UpstreamError(401, 'authorization_required')
      const url = new URL(input instanceof Request ? input.url : String(input))
      // Fail closed before sending a request-local bearer to an ambient SDK override.
      if (url.origin !== base.origin) throw new UpstreamError(503, 'trading_configuration_error')
      dispatched = true
      requestId = null
      try {
        const response = await fetch(input, { ...init, redirect: 'manual', signal })
        if (response.status >= 500) ambiguousAttempt = true
        if (response.status >= 300 && response.status < 400) {
          ambiguousAttempt = true
          await response.body?.cancel()
          throw new UpstreamError(502, 'upstream_protocol_error')
        }
        const bytes = await readBoundedBody(response, 1_048_576, signal)
        // Capture only this attempt's envelope correlation ID. SDK validation remains authoritative;
        // metadata is returned on success only after that validation completes, outside SDK data.
        try {
          const envelope: unknown = JSON.parse(new TextDecoder().decode(bytes))
          if (
            envelope &&
            typeof envelope === 'object' &&
            'request_id' in envelope &&
            typeof envelope.request_id === 'string'
          )
            requestId = safeIdentifier(envelope.request_id) ?? null
        } catch {
          /* The SDK reports malformed JSON through its sanitized protocol error. */
        }
        const headers = new Headers(response.headers)
        headers.delete('content-length')
        headers.delete('content-encoding')
        return new Response(bytes as Uint8Array<ArrayBuffer>, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      } catch (error) {
        ambiguousAttempt = true
        throw error
      }
    }
    const client = new TqxClient({
      baseUrl: context.config.tradingBaseUrl,
      tradingBaseUrl: context.config.tradingBaseUrl,
      bearerToken: context.access.token,
      fetch: transport,
    })
    const data = await operation(client)
    return { ok: true, data, requestId }
  } catch (error) {
    const failure =
      error instanceof TqxNetworkError && error.cause instanceof UpstreamError ? error.cause : error
    const definiteRejection =
      failure instanceof TqxApiError &&
      !uncertainCodes.has(failure.code) &&
      ((failure.status >= 400 && failure.status < 500) ||
        (failure.status === 200 && publicErrors.has(failure.code)))
    // A later 401 after an SDK retry cannot prove that an earlier lost write did not land.
    const uncertain =
      scope === WRITE_SCOPE && dispatched && (ambiguousAttempt || !definiteRejection)
    return {
      ok: false,
      error: errorCode(failure),
      uncertain,
      ...(failure instanceof TqxApiError
        ? {
            requestId: safeIdentifier(failure.requestId) ?? null,
            ...(uncertain ? { data: uncertainData(failure.data) } : {}),
          }
        : {}),
    }
  }
}

export function toolResult(data: unknown, isError = false): CallToolResult {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text', text: JSON.stringify(data) }],
  }
}

export async function callTrading(
  context: TradingContext,
  caller: AbortSignal,
  operation: (client: TqxClient) => Promise<unknown>,
): Promise<CallToolResult> {
  const outcome = await runTrading(context, caller, REQUIRED_SCOPE, operation)
  return outcome.ok ? toolResult(outcome.data) : toolResult({ error: outcome.error }, true)
}

function submission<T extends SignalData | { accepted: boolean }>(
  key: string,
  outcome: Outcome<T>,
): SubmissionResult {
  if (!outcome.ok)
    return {
      idempotencyKey: key,
      status: outcome.uncertain ? 'unknown' : 'failed',
      error: outcome.error,
      ...(outcome.requestId !== undefined ? { request_id: outcome.requestId } : {}),
      ...(outcome.data ? { data: outcome.data } : {}),
    }
  const data = outcome.data
  const actionStatus = 'status' in data ? data.status : undefined
  let status: SubmissionStatus = 'unknown'
  if (actionStatus === 'UNKNOWN' || actionStatus === 'RESERVED') status = 'unknown'
  else if ('state' in data) {
    if (data.state === 'REJECTED') status = 'failed'
    else if (data.state === 'PENDING' || data.state === 'ACCEPTED') status = 'accepted'
  } else if (actionStatus === 'REJECTED') status = 'failed'
  else if (data.accepted && (actionStatus === undefined || actionStatus === 'SUBMITTED'))
    status = 'accepted'
  return { idempotencyKey: key, status, data, request_id: outcome.requestId }
}

export async function callWrite<T extends SignalData | { accepted: boolean }>(
  context: TradingContext,
  caller: AbortSignal,
  key: string,
  operation: (client: TqxClient) => Promise<T>,
): Promise<CallToolResult> {
  const result = submission(key, await runTrading(context, caller, WRITE_SCOPE, operation))
  return toolResult(result, result.status !== 'accepted')
}

export async function placeOrders(
  context: TradingContext,
  caller: AbortSignal,
  orders: PlaceOrderInput[],
): Promise<CallToolResult> {
  if (orders.length < 1 || orders.length > 20)
    return toolResult({ error: 'invalid_arguments' }, true)
  const validated: PlaceOrderInput[] = []
  const keys = new Set<string>()
  // Use the SDK's public Standard Schema interface: validate/normalize every item before any write.
  // These awaits do no I/O. Submission below is deliberately sequential, never Promise.all.
  /* eslint-disable no-await-in-loop */
  for (const order of orders) {
    const result = await PlaceOrderInputSchema['~standard'].validate(order)
    if (result.issues || keys.has(result.value.idempotencyKey))
      return toolResult({ error: 'invalid_arguments' }, true)
    keys.add(result.value.idempotencyKey)
    validated.push(result.value)
  }
  const results: SubmissionResult[] = []
  let stopped = false
  for (const [index, order] of validated.entries()) {
    if (stopped) {
      results.push({ index, idempotencyKey: order.idempotencyKey, status: 'not_submitted' })
      continue
    }
    const result = submission(
      order.idempotencyKey,
      await runTrading(context, caller, WRITE_SCOPE, (client) => client.trading.placeOrder(order)),
    )
    results.push({ index, ...result })
    stopped = result.status !== 'accepted'
  }
  /* eslint-enable no-await-in-loop */
  return toolResult({ results, stopped }, stopped)
}
