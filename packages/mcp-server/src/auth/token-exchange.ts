import * as v from 'valibot'

import type { TradingConfig } from '../trading/config'
import { TradingError } from '../trading/errors'
import { readJson } from '../utils/http-json'

const tokenType = 'urn:ietf:params:oauth:token-type:access_token'
const responseSchema = v.object({
  access_token: v.pipe(v.string(), v.minLength(1), v.maxLength(16_384), v.regex(/^[\x21-\x7e]+$/)),
  issued_token_type: v.literal(tokenType),
  token_type: v.literal('Bearer'),
  expires_in: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  scope: v.pipe(v.string(), v.minLength(1), v.maxLength(512)),
})

export interface ExchangedToken {
  token: string
  scopes: readonly string[]
  expiresAt: number
}

export type TokenExchange = (input: {
  subjectToken: string
  resource: string
  scopes: readonly string[]
}) => Promise<ExchangedToken>

export function createTokenExchange(
  config: TradingConfig,
  options: { fetch?: typeof globalThis.fetch; now?: () => number; timeoutMs?: number } = {},
): TokenExchange {
  const fetch = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const authorization = `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`
  return async ({ subjectToken, resource, scopes }) => {
    const startedAt = now()
    try {
      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { Authorization: authorization, Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token: subjectToken,
          subject_token_type: tokenType,
          requested_token_type: tokenType,
          resource,
          scope: scopes.join(' '),
        }),
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      })
      if (response.status === 429) {
        throw new TradingError('busy', 'Token exchange rate limited; retry later', { status: 429 })
      }
      const raw = await readJson(response, 65_536)
      if (!response.ok) {
        const parsed = v.safeParse(v.object({ error: v.string() }), raw)
        const code = parsed.success ? parsed.output.error : ''
        if (code === 'invalid_grant')
          throw new TradingError('authorization', 'Authorization expired or revoked; reconnect')
        if (code === 'invalid_scope')
          throw new TradingError('authorization', 'Requested trading permission unavailable')
        if (code === 'temporarily_unavailable')
          throw new TradingError('busy', 'Token exchange temporarily unavailable; retry later', {
            status: response.status,
          })
        throw new TradingError('network', 'Token exchange unavailable')
      }
      const parsed = v.safeParse(responseSchema, raw)
      if (!parsed.success) throw new TradingError('protocol', 'Invalid token exchange response')
      const result = parsed.output
      const granted = result.scope.split(' ')
      if (
        granted.length !== scopes.length ||
        new Set(granted).size !== granted.length ||
        !scopes.every((scope) => granted.includes(scope))
      )
        throw new TradingError('protocol', 'Invalid token exchange permissions')
      return {
        token: result.access_token,
        scopes: granted,
        expiresAt: startedAt + result.expires_in * 1000,
      }
    } catch (error) {
      if (error instanceof TradingError) throw error
      throw new TradingError('network', 'Token exchange unavailable')
    }
  }
}
