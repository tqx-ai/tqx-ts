import type { AuthInfo } from '@modelcontextprotocol/server'

import type { ApiTokenProvider } from '../auth/api-token-provider'
import { readJson } from '../utils/http-json'
import { withTimeout } from '../utils/timeout'
import { ResearchError } from './errors'

export type ResearchScope = 'research:read' | 'research:run' | 'research:write'
export interface ResearchRequest {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, unknown>
  body?: Record<string, unknown>
}
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ResearchError('INVALID_RESPONSE', 'Expected a Research response object')
  return value as Record<string, unknown>
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new ResearchError('INVALID_RESPONSE', 'Expected a Research response list')
  return value
}
const safeCode = /^[A-Za-z0-9_.:-]{1,128}$/
const requestId = (value: unknown) =>
  typeof value === 'string' && safeCode.test(value) ? value : undefined

export interface ResearchGatewayOptions {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
  maxResponseBytes?: number
  maxOutputBytes?: number
  maxConcurrent?: number
  maxPerPrincipal?: number
}

export class ResearchGateway {
  #active = 0
  readonly #principals = new Map<string, number>()
  readonly #fetch: typeof globalThis.fetch
  readonly baseUrl: string

  constructor(
    baseUrl: string,
    readonly tokens: ApiTokenProvider,
    readonly options: ResearchGatewayOptions = {},
  ) {
    const base = new URL(baseUrl)
    if (
      !['https:', 'http:'].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !/^\/tqxApi\/?$/.test(base.pathname)
    )
      throw new Error('Invalid Research base URL')
    this.baseUrl = `${base.origin}/tqxApi/`
    this.#fetch = options.fetch ?? globalThis.fetch
    for (const value of [
      options.timeoutMs ?? 10_000,
      options.maxResponseBytes ?? 4_194_304,
      options.maxOutputBytes ?? 1_048_576,
      options.maxConcurrent ?? 100,
      options.maxPerPrincipal ?? 4,
    ]) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error('Invalid Research gateway limit')
    }
  }

  async request(
    auth: AuthInfo,
    scope: ResearchScope,
    request: ResearchRequest,
  ): Promise<Record<string, unknown>> {
    const principal = JSON.stringify([auth.extra?.sub, auth.clientId])
    const active = this.#principals.get(principal) ?? 0
    if (
      this.#active >= (this.options.maxConcurrent ?? 100) ||
      active >= (this.options.maxPerPrincipal ?? 4)
    )
      throw new ResearchError('BUSY', 'Research gateway busy; retry later')
    // Only registry-built relative resource paths can reach the gateway.
    if (
      !/^qube\/api\/(?:factors|strategies|factor-analyses|strategy-backtests|factor-versions|strategy-versions|factor-tunings|strategy-tunings)(?:\/(?:[0-9a-f]{24}|source|validate|analyses|backtests|cancel|versions|restore|analysis-snapshots|result|chart|tunings|rerun|apply))*$/.test(
        request.path,
      )
    )
      throw new ResearchError('INVALID_INPUT', 'Unsupported Research path')
    this.#active += 1
    this.#principals.set(principal, active + 1)
    const write =
      scope !== 'research:read' || (request.method !== undefined && request.method !== 'GET')
    try {
      let token = await this.tokens.get(auth, [scope], write, false)
      try {
        return await this.#execute(token.token, request, write)
      } catch (error) {
        if (!(error instanceof ResearchError) || error.details?.status !== 401) throw error
        await this.tokens.invalidate(auth, [scope], token)
        if (write) throw error
        token = await this.tokens.get(auth, [scope], false, false)
        try {
          return await this.#execute(token.token, request, false)
        } catch (retryError) {
          if (retryError instanceof ResearchError && retryError.details?.status === 401)
            await this.tokens.invalidate(auth, [scope], token)
          throw retryError
        }
      }
    } finally {
      this.#active -= 1
      const remaining = (this.#principals.get(principal) ?? 1) - 1
      if (remaining > 0) this.#principals.set(principal, remaining)
      else this.#principals.delete(principal)
    }
  }

  async #execute(
    token: string,
    request: ResearchRequest,
    write: boolean,
  ): Promise<Record<string, unknown>> {
    const url = new URL(request.path, this.baseUrl)
    for (const [key, value] of Object.entries(request.query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value))
    const timeout = this.options.timeoutMs ?? 10_000
    const signal = AbortSignal.timeout(timeout)
    let id: string | undefined
    try {
      return await withTimeout(
        (async () => {
          const response = await this.#fetch(url, {
            method: request.method ?? 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
              ...(request.body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: request.body ? JSON.stringify(request.body) : undefined,
            credentials: 'omit',
            redirect: 'error',
            signal,
          })
          id = requestId(response.headers.get('X-Request-ID'))
          if (response.status === 401) {
            await response.body?.cancel()
            throw new ResearchError(
              'AUTHORIZATION_REQUIRED',
              'Research token rejected',
              { status: 401 },
              id,
            )
          }
          let raw: Record<string, unknown>
          try {
            raw = object(await readJson(response, this.options.maxResponseBytes ?? 4_194_304))
          } catch (error) {
            if (signal.aborted) throw error
            if (
              error instanceof Error &&
              (error.message === 'JSON response too large' ||
                Number(response.headers.get('Content-Length')) >
                  (this.options.maxResponseBytes ?? 4_194_304))
            )
              throw new ResearchError(
                'RESULT_TOO_LARGE',
                'Research response exceeds the byte limit; reduce the requested range',
                { outcomeUnknown: write },
                id,
              )
            throw new ResearchError(
              'INVALID_RESPONSE',
              'Invalid Research gateway JSON',
              { outcomeUnknown: write },
              id,
            )
          }
          // A resource's Python source is named code too. Identity distinguishes it
          // from a gateway envelope; both direct and enveloped responses are valid.
          const envelope =
            !('id' in raw) &&
            !('code_type' in raw) &&
            ('data' in raw || 'detail' in raw || 'msgKey' in raw) &&
            (typeof raw.code === 'string' || typeof raw.code === 'number')
          const code = envelope ? String(raw.code).trim() : undefined
          id = requestId(raw.request_id) ?? id
          if (
            !response.ok ||
            (code !== undefined && !['0', '200', 'COMMON_SUCCESS'].includes(code))
          ) {
            const detail =
              raw.detail && typeof raw.detail === 'object' && !Array.isArray(raw.detail)
                ? object(raw.detail)
                : {}
            const candidate = detail.code ?? code ?? `HTTP_${response.status}`
            const publicCode =
              typeof candidate === 'string' && safeCode.test(candidate)
                ? candidate
                : 'UPSTREAM_ERROR'
            throw new ResearchError(
              publicCode,
              `Research API rejected operation (${publicCode})`,
              { status: response.status, outcomeUnknown: write && response.status >= 500 },
              id,
            )
          }
          return object(envelope ? raw.data : raw)
        })(),
        timeout,
      )
    } catch (error) {
      if (error instanceof ResearchError) throw error
      const timedOut =
        signal.aborted || (error instanceof Error && error.message === 'Request timed out')
      throw new ResearchError(
        timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        timedOut
          ? 'Research request timed out; verify the remote state before retrying'
          : 'Research gateway unreachable; verify the remote state before retrying',
        { outcomeUnknown: write },
        id,
      )
    }
  }
}
