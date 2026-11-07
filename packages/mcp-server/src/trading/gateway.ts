import type { AuthInfo } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import type { ApiTokenProvider } from '../auth/api-token-provider'
import { readJson } from '../utils/http-json'
import { TradingError } from './errors'
import { operations, type OperationName } from './operations'
import { signalResponse } from './schemas'

const envelopeSchema = v.object({
  code: v.string(),
  data: v.unknown(),
  request_id: v.optional(v.nullable(v.string())),
})
const safeCode = /^(?:[a-z][a-z0-9_]{0,80}|[1-5][0-9]{2})$/

export interface GatewayRequest {
  id?: string
  query?: Record<string, string | number | undefined>
  body?: Record<string, unknown>
  idempotencyKey?: string
}

export class TradingGateway {
  readonly #fetch: typeof globalThis.fetch
  readonly #now: () => number
  #active = 0
  readonly #principalActive = new Map<string, number>()

  constructor(
    readonly baseUrl: string,
    readonly tokens: ApiTokenProvider,
    readonly options: {
      fetch?: typeof globalThis.fetch
      now?: () => number
      timeoutMs?: number
      maxConcurrent?: number
      maxPerPrincipal?: number
      audit?: (event: TradingAuditEvent) => void
    } = {},
  ) {
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#now = options.now ?? Date.now
  }

  async call<N extends OperationName>(
    auth: AuthInfo,
    name: N,
    request: GatewayRequest = {},
  ): Promise<v.InferOutput<(typeof operations)[N]['schema']>> {
    if (this.#active >= (this.options.maxConcurrent ?? 100))
      throw new TradingError('busy', 'Trading gateway busy; retry later')
    const principal = JSON.stringify([auth.extra?.sub, auth.extra?.agent_id, auth.clientId])
    const active = this.#principalActive.get(principal) ?? 0
    if (active >= (this.options.maxPerPrincipal ?? 4))
      throw new TradingError('busy', 'Trading principal busy; retry later')
    this.#principalActive.set(principal, active + 1)
    this.#active += 1
    const op = operations[name]
    let result: 'success' | 'error' = 'error'
    let requestId: string | undefined
    let code: string | undefined
    let signalId: string | undefined
    let orderId = request.id
    let newOrderId: string | undefined
    try {
      if (
        ['order', 'signal', 'modify', 'cancel'].includes(name) &&
        (typeof request.id !== 'string' ||
          !request.id ||
          request.id.length > 128 ||
          request.id === '.' ||
          request.id === '..')
      )
        throw new TradingError('validation', 'Invalid trading identifier')
      const scopes = [op.scope]
      const bypassCache = op.write || op.scope === 'order:write'
      const token = await this.tokens.get(auth, scopes, bypassCache)
      const url = new URL(
        op.path + (request.id === undefined ? '' : `/${encodeURIComponent(request.id)}`),
        this.baseUrl,
      )
      for (const [key, value] of Object.entries(request.query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value))
      }
      const execute = async (accessToken: string) => {
        const headers = new Headers({
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        })
        if (request.body) headers.set('Content-Type', 'application/json')
        if (request.idempotencyKey) headers.set('Idempotency-Key', request.idempotencyKey)
        let response: Response
        try {
          response = await this.#fetch(url, {
            method: op.method,
            headers,
            body: request.body ? JSON.stringify(request.body) : undefined,
            credentials: 'omit',
            redirect: 'error',
            signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
          })
        } catch {
          throw new TradingError(
            'network',
            'Trading gateway unreachable; execution may be unknown',
            { outcomeUnknown: op.write },
          )
        }
        const headerId = response.headers.get('X-Request-ID') ?? undefined
        let raw: unknown
        try {
          raw = await readJson(response, 1_048_576)
        } catch {
          // A bare 401 is an authentication failure even when the proxy omitted an envelope.
          if (response.status === 401)
            throw new TradingError('api', 'Trading token rejected', { status: 401 })
          throw new TradingError('protocol', 'Invalid trading gateway response', {
            status: response.status,
            outcomeUnknown: op.write,
          })
        }
        const envelope = v.safeParse(envelopeSchema, raw)
        if (!envelope.success)
          throw new TradingError('protocol', 'Invalid trading gateway envelope', {
            status: response.status,
            outcomeUnknown: op.write,
          })
        const data = envelope.output
        const id = (data.request_id ?? headerId)?.slice(0, 128)
        requestId = id
        if (!response.ok || data.code !== '0') {
          const apiCode = safeCode.test(data.code) ? data.code : 'upstream_error'
          // Only signal operations may expose a validated public signal payload.
          const parsedSignal =
            name === 'place' || name === 'signal'
              ? v.safeParse(signalResponse, data.data)
              : undefined
          const signal = parsedSignal?.success ? parsedSignal.output : undefined
          if (signal) {
            signalId = signal.signal_id
            if (signal.order_id !== null) orderId = signal.order_id
          }
          throw new TradingError('api', `Trading API rejected operation (${apiCode})`, {
            code: apiCode,
            status: response.status,
            requestId: id,
            outcomeUnknown: op.write && response.status >= 500,
            ...(signal ? { signal } : {}),
          })
        }
        const parsed = v.safeParse(op.schema, data.data)
        if (!parsed.success)
          throw new TradingError('protocol', 'Invalid trading response data', {
            requestId: id,
            outcomeUnknown: op.write,
          })
        return parsed.output as v.InferOutput<(typeof operations)[N]['schema']>
      }
      let output: v.InferOutput<(typeof operations)[N]['schema']>
      try {
        output = await execute(token.token)
      } catch (error) {
        if (!op.write && error instanceof TradingError && error.details.status === 401) {
          await this.tokens.invalidate(auth, scopes, token)
          const refreshed = await this.tokens.get(auth, scopes, bypassCache)
          try {
            output = await execute(refreshed.token)
          } catch (retryError) {
            if (retryError instanceof TradingError && retryError.details.status === 401)
              await this.tokens.invalidate(auth, scopes, refreshed)
            throw retryError
          }
        } else throw error
      }
      if ('signal_id' in output && typeof output.signal_id === 'string') signalId = output.signal_id
      if ('order_id' in output && typeof output.order_id === 'string') orderId = output.order_id
      if ('new_order_id' in output && typeof output.new_order_id === 'string')
        newOrderId = output.new_order_id
      result = 'success'
      return output
    } catch (error) {
      if (error instanceof TradingError) code = error.details.code ?? error.kind
      throw error
    } finally {
      this.#active -= 1
      const remaining = (this.#principalActive.get(principal) ?? 1) - 1
      if (remaining > 0) this.#principalActive.set(principal, remaining)
      else this.#principalActive.delete(principal)
      if (op.write) {
        // An injected audit sink must not turn a completed order into a retryable failure.
        try {
          this.options.audit?.({
            operation: name,
            at: new Date(this.#now()).toISOString(),
            subject: typeof auth.extra?.sub === 'string' ? auth.extra.sub : undefined,
            agentId: typeof auth.extra?.agent_id === 'string' ? auth.extra.agent_id : undefined,
            clientId: auth.clientId,
            idempotencyKey: request.idempotencyKey,
            orderId,
            newOrderId,
            signalId,
            symbol: typeof request.body?.symbol === 'string' ? request.body.symbol : undefined,
            side: typeof request.body?.side === 'string' ? request.body.side : undefined,
            orderType:
              typeof request.body?.order_type === 'string' ? request.body.order_type : undefined,
            quantity:
              typeof request.body?.quantity === 'string' ? request.body.quantity : undefined,
            price: typeof request.body?.price === 'string' ? request.body.price : undefined,
            result,
            code,
            requestId,
          })
        } catch {
          /* Audit sink failures must be handled by the sink's monitoring. */
        }
      }
    }
  }
}

export interface TradingAuditEvent {
  operation: OperationName
  at: string
  subject?: string
  agentId?: string
  clientId: string
  idempotencyKey?: string
  orderId?: string
  newOrderId?: string
  signalId?: string
  symbol?: string
  side?: string
  orderType?: string
  quantity?: string
  price?: string
  result: 'success' | 'error'
  code?: string
  requestId?: string
}
