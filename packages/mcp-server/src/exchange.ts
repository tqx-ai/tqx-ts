import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import type { Principal } from './auth'
import { type Config, EXCHANGE_CLIENT_ID, exchangeScopes } from './config'
import { abortable, readBoundedBody, UpstreamError } from './network'

export interface ApiAccess {
  token: string
  expiresAt: number
  scopes: string[]
}

export function createExchange(config: Config) {
  const lifetime = new AbortController()
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: config.jwksTimeoutMs,
    cacheMaxAge: config.jwksCacheMaxAgeMs,
    cooldownDuration: config.jwksCooldownMs,
    [customFetch]: (url, options) =>
      fetch(url, {
        ...options,
        signal: AbortSignal.any([options.signal, lifetime.signal]),
      }),
  })
  const exchange = async (
    token: string,
    source: Principal,
    caller: AbortSignal,
  ): Promise<ApiAccess> => {
    const signal = AbortSignal.any([
      caller,
      lifetime.signal,
      AbortSignal.timeout(config.exchangeTimeoutMs),
    ])
    const startedAt = Math.floor(Date.now() / 1000)
    const scopes = exchangeScopes(config, source.scopes)
    const scope = scopes.join(' ')
    try {
      signal.throwIfAborted()
      if (!scope) throw new UpstreamError(403, 'insufficient_scope')
      if (!config.exchangeClientSecret) throw new UpstreamError(503, 'exchange_unavailable')
      const encode = (value: string) => new URLSearchParams({ v: value }).toString().slice(2)
      const basic = Buffer.from(
        `${encode(EXCHANGE_CLIENT_ID)}:${encode(config.exchangeClientSecret)}`,
      ).toString('base64')
      const response = await fetch(`${config.issuer.replace(/\/$/, '')}/oauth/token`, {
        method: 'POST',
        redirect: 'manual',
        signal,
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
          subject_token: token,
          requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
          resource: config.apiResource,
          scope,
        }),
      })
      if (
        (response.status >= 300 && response.status < 400) ||
        response.status === 429 ||
        response.status >= 500
      ) {
        await response.body?.cancel()
        throw new UpstreamError(
          response.status >= 500 || response.status === 429 ? 503 : 502,
          'exchange_unavailable',
        )
      }
      const bytes = await readBoundedBody(response, 65_536, signal)
      if (
        response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
      )
        throw new UpstreamError(502, 'upstream_protocol_error')
      let raw: unknown
      try {
        raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      } catch {
        throw new UpstreamError(502, 'upstream_protocol_error')
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new UpstreamError(502, 'upstream_protocol_error')
      const body = raw as Record<string, unknown>
      if (!response.ok) {
        if (body.error === 'invalid_grant') throw new UpstreamError(401, 'invalid_token')
        if (body.error === 'invalid_scope') throw new UpstreamError(403, 'insufficient_scope')
        if (
          body.error === 'invalid_client' ||
          body.error === 'unauthorized_client' ||
          body.error === 'invalid_target' ||
          body.error === 'temporarily_unavailable'
        )
          throw new UpstreamError(503, 'exchange_unavailable')
        throw new UpstreamError(502, 'upstream_protocol_error')
      }
      if (
        response.status !== 200 ||
        typeof body.access_token !== 'string' ||
        body.token_type !== 'Bearer' ||
        body.issued_token_type !== 'urn:ietf:params:oauth:token-type:access_token' ||
        body.scope !== scope ||
        !Number.isSafeInteger(body.expires_in) ||
        (body.expires_in as number) < 1 ||
        (body.expires_in as number) > 300 ||
        'refresh_token' in body
      )
        throw new UpstreamError(502, 'upstream_protocol_error')
      const { payload } = await abortable(
        () =>
          jwtVerify(body.access_token as string, jwks, {
            issuer: config.issuer,
            audience: config.apiResource,
            algorithms: ['RS256'],
            clockTolerance: 0,
            requiredClaims: [
              'iss',
              'sub',
              'aud',
              'iat',
              'exp',
              'sid',
              'jti',
              'grant_id',
              'agent_id',
              'client_id',
              'source_client_id',
              'act',
              'scope',
            ],
          }),
        signal,
      )
      const now = Math.floor(Date.now() / 1000)
      if (source.expiresAt <= now) throw new UpstreamError(401, 'invalid_token')
      const actor = payload.act
      if (
        !(
          payload.aud === config.apiResource ||
          (Array.isArray(payload.aud) &&
            payload.aud.length === 1 &&
            payload.aud[0] === config.apiResource)
        ) ||
        payload.sub !== source.subject ||
        payload.sid !== source.sessionId ||
        payload.grant_id !== source.grantId ||
        payload.agent_id !== source.agentId ||
        payload.client_id !== EXCHANGE_CLIENT_ID ||
        payload.source_client_id !== source.clientId ||
        payload.scope !== scope ||
        !actor ||
        typeof actor !== 'object' ||
        Array.isArray(actor) ||
        (actor as Record<string, unknown>).sub !== EXCHANGE_CLIENT_ID ||
        Object.keys(actor).length !== 1 ||
        typeof payload.jti !== 'string' ||
        !payload.jti.trim() ||
        payload.jti === source.tokenId ||
        !Number.isSafeInteger(payload.iat) ||
        !Number.isSafeInteger(payload.exp) ||
        (payload.iat as number) < startedAt - 1 ||
        (payload.iat as number) > now + 1 ||
        (payload.exp as number) > source.expiresAt ||
        (payload.exp as number) - (payload.iat as number) !== body.expires_in
      )
        throw new UpstreamError(502, 'upstream_protocol_error')
      return { token: body.access_token, expiresAt: payload.exp as number, scopes }
    } catch (error) {
      if (error instanceof UpstreamError) throw error
      if (signal.aborted || error instanceof TypeError)
        throw new UpstreamError(503, 'exchange_unavailable')
      throw new UpstreamError(502, 'upstream_protocol_error')
    }
  }
  return {
    exchange,
    close: () => {
      lifetime.abort()
    },
  }
}
