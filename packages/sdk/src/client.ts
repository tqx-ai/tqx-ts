import * as v from 'valibot'

import { TqxApiError, TqxConfigurationError, TqxNetworkError, TqxProtocolError } from './errors'
import {
  ApiEnvelopeSchema,
  ApiKeyVerificationDataSchema,
  HealthDataSchema,
  type ApiKeyVerificationData,
  type HealthData,
} from './schemas'
import APIs from './config/APIs'
import { ResearchApiClient, type ResearchApi } from './research/api'
import { TradingApiClient, type TradingApi } from './trading/trading-api'
import { UserApiClient, type UserApi } from './user/user-api'

export type { TradingApi } from './trading/trading-api'
export type { UserApi } from './user/user-api'

export interface TqxClientOptions {
  baseUrl?: string
  tradingBaseUrl?: string
  apiKey?: string
  fetch?: typeof globalThis.fetch
}

export interface AuthApi {
  verify(): Promise<ApiKeyVerificationData>
}

interface RequestOptions<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>> {
  baseUrl?: string
  schema: TSchema
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: unknown
  headers?: Record<string, string>
  authenticated?: boolean
  responseType?: 'openapi' | 'gateway'
}

export class TqxClient {
  readonly auth: AuthApi
  readonly trading: TradingApi
  readonly research: ResearchApi
  readonly user: UserApi

  readonly #baseUrl?: string
  readonly #tradingBaseUrl: string
  readonly #apiKey?: string
  readonly #fetch: typeof globalThis.fetch

  constructor(clientOptions: TqxClientOptions) {
    const runtimeBaseUrl = process.env.TQX_BASE_URL?.trim() || undefined
    const defaultBaseUrl =
      clientOptions.baseUrl !== undefined
        ? clientOptions.baseUrl
        : (runtimeBaseUrl ?? __TQX_BUILD_DEFAULT_BASE_URL__)
    this.#baseUrl = defaultBaseUrl === undefined ? undefined : normalizeBaseUrl(defaultBaseUrl)
    this.#tradingBaseUrl = normalizeBaseUrl(
      runtimeBaseUrl ??
        clientOptions.tradingBaseUrl ??
        (__TQX_BUILD_DEFAULT_TRADING_BASE_URL__.trim() || this.#baseUrl),
    )
    this.#apiKey = clientOptions.apiKey?.trim() || undefined
    this.#fetch = clientOptions.fetch ?? globalThis.fetch
    if (typeof this.#fetch !== 'function') {
      throw new TqxConfigurationError('A Fetch API implementation is required')
    }

    this.trading = new TradingApiClient((path, options) =>
      this.#request(path, { ...options, baseUrl: this.#tradingBaseUrl }),
    )
    this.research = new ResearchApiClient((path, options) =>
      this.#request(path, { ...options, baseUrl: this.#baseUrl, responseType: 'gateway' }),
    )
    this.user = new UserApiClient({
      request: (path, options) =>
        this.#request(path, { ...options, baseUrl: this.#baseUrl, responseType: 'gateway' }),
      verify: () =>
        this.#request(APIs.AUTH_VERIFY, {
          baseUrl: this.#tradingBaseUrl,
          schema: ApiKeyVerificationDataSchema,
        }),
      getStatus: () =>
        this.#request(APIs.HEALTH, {
          baseUrl: this.#tradingBaseUrl,
          authenticated: false,
          schema: HealthDataSchema,
        }),
    })
    this.auth = { verify: () => this.user.verify() }
  }

  health(): Promise<HealthData> {
    return this.user.getStatus()
  }

  async #request<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    path: string,
    options: RequestOptions<TSchema>,
  ): Promise<v.InferOutput<TSchema>> {
    const authenticated = options.authenticated ?? true
    if (authenticated && !this.#apiKey) {
      throw new TqxConfigurationError('An API key is required for this request')
    }

    const baseUrl = options.baseUrl ?? this.#baseUrl
    if (!baseUrl) {
      throw new TqxConfigurationError(
        'baseUrl is required because the SDK was built without TQX_BUILD_BASE_URL',
      )
    }
    const url = new URL(path, `${baseUrl}/`)
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value))
    }

    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    if (authenticated) headers.set('X-API-Key', this.#apiKey!)
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')

    let response: Response
    try {
      response = await this.#fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
    } catch (error) {
      throw new TqxNetworkError('Unable to reach the TQX API', { cause: error })
    }

    if (response.status === 204) {
      const dataResult = v.safeParse(options.schema, undefined)
      if (!dataResult.success) {
        throw protocolError(response, 'The TQX API returned invalid response data', url)
      }
      return dataResult.output
    }

    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw protocolError(response, 'The TQX API returned a non-JSON response', url)
    }

    const data =
      options.responseType === 'gateway'
        ? decodeGatewayResponse(raw, response)
        : decodeOpenApiResponse(raw, response)

    const dataResult = v.safeParse(options.schema, data)
    if (!dataResult.success) {
      throw protocolError(response, 'The TQX API returned invalid response data', url)
    }
    return dataResult.output
  }
}

function protocolError(response: Response, message: string, requestUrl: URL): TqxProtocolError {
  return new TqxProtocolError(
    message,
    response.status,
    response.headers.get('X-Request-ID'),
    response.headers.get('Content-Type'),
    response.url || requestUrl.toString(),
  )
}

function decodeOpenApiResponse(raw: unknown, response: Response): unknown {
  const envelopeResult = v.safeParse(ApiEnvelopeSchema, raw)
  if (!envelopeResult.success) {
    throw new TqxProtocolError(
      'The TQX API returned an invalid response envelope',
      response.status,
      response.headers.get('X-Request-ID'),
      response.headers.get('Content-Type'),
      response.url || null,
    )
  }
  const envelope = envelopeResult.output
  if (!response.ok || envelope.code !== '0') {
    throw new TqxApiError(
      envelope.message,
      response.status,
      envelope.code,
      envelope.request_id,
      envelope.data,
    )
  }
  return envelope.data
}

function decodeGatewayResponse(raw: unknown, response: Response): unknown {
  const record = isRecord(raw) ? raw : undefined
  const envelope = record !== undefined && isGatewayEnvelope(record)
  const code = envelope && record !== undefined ? gatewayCode(record) : undefined
  const requestId = envelope
    ? (stringOrNull(record.request_id) ?? response.headers.get('X-Request-ID'))
    : response.headers.get('X-Request-ID')
  const data = envelope && 'data' in record ? record.data : raw
  const message =
    !response.ok || envelope
      ? gatewayMessage(record, response.statusText || 'TQX gateway request failed')
      : response.statusText || 'TQX gateway request failed'

  if (!response.ok) {
    throw new TqxApiError(
      message,
      response.status,
      code ??
        (record && typeof record.code !== 'undefined'
          ? String(record.code)
          : `http_${response.status}`),
      requestId,
      record && 'data' in record ? record.data : data,
    )
  }
  if (code !== undefined && !['0', '200', 'COMMON_SUCCESS'].includes(code)) {
    throw new TqxApiError(message, response.status, code, requestId, data)
  }
  return data
}

function isGatewayEnvelope(record: Record<string, unknown>): boolean {
  const hasEnvelopeMarker =
    'data' in record ||
    'request_id' in record ||
    'detail' in record ||
    'message' in record ||
    'msgKey' in record
  return hasEnvelopeMarker && gatewayCode(record) !== undefined
}

function gatewayCode(record: Record<string, unknown>): string | undefined {
  if (typeof record.code === 'number' && Number.isFinite(record.code)) return String(record.code)
  if (typeof record.code !== 'string') return undefined
  const code = record.code.trim()
  return ['0', '200', '401', '403', 'COMMON_SUCCESS'].includes(code) ? code : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function gatewayMessage(record: Record<string, unknown> | undefined, fallback: string): string {
  if (!record) return fallback
  const detail = record.detail
  if (typeof detail === 'string') return detail
  if (isRecord(detail) && typeof detail.message === 'string') return detail.message
  if (detail !== undefined) return JSON.stringify(detail)
  if (typeof record.message === 'string') return record.message
  if (typeof record.msgKey === 'string') return record.msgKey
  return fallback
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new TqxConfigurationError(
      'baseUrl is required because the SDK was built without TQX_BUILD_BASE_URL',
    )
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new TqxConfigurationError('baseUrl must be an absolute HTTP(S) URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TqxConfigurationError('baseUrl must use HTTP or HTTPS')
  }
  return parsed.toString().replace(/\/$/, '')
}
