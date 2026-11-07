import type { AuthInfo } from '@modelcontextprotocol/server'

import { TradingError } from '../trading/errors'
import { KvUtil } from '../utils/kv-util'
import { withTimeout } from '../utils/timeout'
import type { ExchangedToken, TokenExchange } from './token-exchange'

export class ApiTokenProvider {
  readonly #cache: KvUtil<ExchangedToken>
  readonly #pending = new Map<string, Promise<ExchangedToken>>()
  readonly #now: () => number
  readonly #maxPending: number
  readonly #exchange: TokenExchange
  readonly #timeoutMs: number
  #closed = false

  constructor(
    readonly issuer: string,
    readonly resource: string,
    exchange: TokenExchange,
    options: {
      now?: () => number
      maxEntries?: number
      maxPending?: number
      exchangeTimeoutMs?: number
    } = {},
  ) {
    this.#now = options.now ?? Date.now
    this.#exchange = exchange
    this.#timeoutMs = options.exchangeTimeoutMs ?? 5000
    this.#maxPending = options.maxPending ?? 100
    if (!Number.isSafeInteger(this.#maxPending) || this.#maxPending < 1)
      throw new Error('Invalid token exchange concurrency')
    this.#cache = new KvUtil({ now: this.#now, maxEntries: options.maxEntries })
  }

  async #key(auth: AuthInfo, scopes: readonly string[]): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth.token))
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    return JSON.stringify([
      1,
      this.issuer,
      hash,
      auth.clientId,
      auth.extra?.sub,
      auth.extra?.agent_id,
      this.resource,
      scopes,
    ])
  }

  #validateAuth(auth: AuthInfo, scopes: readonly string[]): void {
    if (
      !auth.token ||
      !Number.isFinite(auth.expiresAt) ||
      auth.expiresAt! * 1000 <= this.#now() ||
      typeof auth.extra?.agent_id !== 'string' ||
      !auth.extra.agent_id ||
      !scopes.every((scope) => auth.scopes.includes(scope))
    )
      throw new TradingError('authorization', 'Valid trading authorization and agent required')
  }

  async get(
    auth: AuthInfo,
    requestedScopes: readonly string[],
    write = false,
  ): Promise<ExchangedToken> {
    const scopes = [...new Set(requestedScopes)].toSorted()
    if (this.#closed) throw new TradingError('busy', 'Token provider closed')
    this.#validateAuth(auth, scopes)
    if (write) return this.#fresh(auth, scopes)
    const key = await this.#key(auth, scopes)
    const cached = this.#cache.get(key)
    if (cached) return cached
    const pending = this.#pending.get(key)
    if (pending) return pending
    if (this.#pending.size >= this.#maxPending)
      throw new TradingError('busy', 'Token exchange busy; retry later')
    const startedAt = this.#now()
    const promise = this.#fresh(auth, scopes).then((token) => {
      const ttl =
        Math.min(startedAt + 300_000, token.expiresAt, auth.expiresAt! * 1000) -
        30_000 -
        this.#now()
      if (ttl > 0 && !this.#closed) this.#cache.set(key, token, ttl)
      return token
    })
    this.#pending.set(key, promise)
    try {
      return await promise
    } finally {
      if (this.#pending.get(key) === promise) this.#pending.delete(key)
    }
  }

  async #fresh(auth: AuthInfo, scopes: readonly string[]): Promise<ExchangedToken> {
    let token: ExchangedToken
    try {
      token = await withTimeout(
        this.#exchange({ subjectToken: auth.token, resource: this.resource, scopes }),
        this.#timeoutMs,
      )
    } catch (error) {
      if (error instanceof TradingError) throw error
      throw new TradingError('network', 'Token exchange unavailable')
    }
    if (
      this.#closed ||
      !token.token ||
      token.token === auth.token ||
      Math.min(token.expiresAt, auth.expiresAt! * 1000) <= this.#now() + 30_000 ||
      !Number.isFinite(token.expiresAt) ||
      token.scopes.length !== scopes.length ||
      !scopes.every((scope) => token.scopes.includes(scope))
    )
      throw new TradingError(
        'authorization',
        'Exchanged token has insufficient lifetime or permissions',
      )
    return token
  }

  async invalidate(
    auth: AuthInfo,
    scopes: readonly string[],
    token: ExchangedToken,
  ): Promise<void> {
    const key = await this.#key(auth, [...new Set(scopes)].toSorted())
    if (this.#cache.get(key) === token) this.#cache.delete(key)
  }

  dispose(): void {
    this.#closed = true
    this.#cache.dispose()
  }
}
