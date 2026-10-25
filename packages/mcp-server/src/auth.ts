import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { RequestHandler } from 'express'
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import { type Config, exchangeScopes, resourceMetadataUrl, supportedScopes } from './config'
import { createExchange } from './exchange'
import { abortable, UpstreamError } from './network'

export interface Principal {
  subject: string
  clientId: string
  sessionId: string
  tokenId: string
  scopes: string[]
  expiresAt: number
  agentId?: string
  grantId?: string
}

export class TokenError extends Error {
  constructor(readonly status: 401 | 403) {
    super('Authorization failed')
  }
}

export function createTokenVerifier(config: Config) {
  const lifetime = new AbortController()
  // Only this operator-configured URL is trusted. JOSE never follows jku/x5u.
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: config.jwksTimeoutMs,
    cacheMaxAge: config.jwksCacheMaxAgeMs,
    cooldownDuration: config.jwksCooldownMs,
    // The cache/fetch is shared across requests, so only service shutdown cancels it.
    // Individual disconnected callers stop waiting without disrupting other clients.
    [customFetch]: (url, options) =>
      fetch(url, {
        ...options,
        signal: AbortSignal.any([options.signal, lifetime.signal]),
      }),
  })
  const verify = async (
    token: string,
    signal: AbortSignal = lifetime.signal,
  ): Promise<Principal> => {
    try {
      const { payload } = await abortable(
        () =>
          jwtVerify(token, jwks, {
            algorithms: ['RS256'],
            issuer: config.issuer,
            audience: config.resource,
            requiredClaims: ['iss', 'aud', 'exp', 'sub', 'client_id', 'sid', 'jti'],
            clockTolerance: 0,
          }),
        AbortSignal.any([signal, lifetime.signal]),
      )
      const aud = payload.aud
      if (
        aud !== config.resource &&
        !(Array.isArray(aud) && aud.length === 1 && aud[0] === config.resource)
      )
        throw new TokenError(401)
      for (const claim of ['sub', 'client_id', 'sid', 'jti'] as const) {
        if (typeof payload[claim] !== 'string' || !payload[claim].trim()) throw new TokenError(401)
      }
      if (!Number.isSafeInteger(payload.exp)) throw new TokenError(401)
      if (config.tradingToolsEnabled) {
        for (const claim of ['agent_id', 'grant_id'] as const) {
          if (typeof payload[claim] !== 'string' || !payload[claim].trim())
            throw new TokenError(401)
        }
      }
      if (payload.scope !== undefined && typeof payload.scope !== 'string')
        throw new TokenError(401)
      const scope = payload.scope as string | undefined
      if (scope && !/^[\x21\x23-\x5B\x5D-\x7E]+(?: [\x21\x23-\x5B\x5D-\x7E]+)*$/.test(scope))
        throw new TokenError(401)
      const scopes = scope ? scope.split(' ') : []
      if (exchangeScopes(config, scopes).length === 0) throw new TokenError(403)
      return {
        subject: payload.sub as string,
        clientId: payload.client_id as string,
        sessionId: payload.sid as string,
        tokenId: payload.jti as string,
        expiresAt: payload.exp as number,
        scopes,
        ...(config.tradingToolsEnabled
          ? {
              agentId: payload.agent_id as string,
              grantId: payload.grant_id as string,
            }
          : {}),
      }
    } catch (error) {
      if (error instanceof TokenError) throw error
      // No raw JOSE/JWKS/network exception or credential crosses the boundary.
      throw new TokenError(401)
    }
  }
  return Object.assign(verify, {
    close: () => {
      lifetime.abort()
    },
  })
}

function rejectAuthorization(
  config: Config,
  res: Parameters<RequestHandler>[1],
  status: 401 | 403,
) {
  const code = status === 403 ? 'insufficient_scope' : 'invalid_token'
  res.setHeader(
    'WWW-Authenticate',
    `Bearer error="${code}", scope="${supportedScopes(config).join(' ')}", resource_metadata="${resourceMetadataUrl(config)}"`,
  )
  res.status(status).json({ error: code })
}

export function authMiddleware(config: Config) {
  const verify = createTokenVerifier(config)
  const downstream = config.tradingToolsEnabled ? createExchange(config) : undefined
  const middleware: RequestHandler = async (req, res, next) => {
    if (res.destroyed) return
    const disconnected = new AbortController()
    const onClose = () => {
      disconnected.abort()
    }
    res.once('close', onClose)
    res.setHeader('Cache-Control', 'no-store')
    try {
      const authorization = req.headers.authorization
      const match = authorization?.match(
        /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
      )
      // A single Authorization field only; reject merged/ambiguous credentials.
      const count = req.rawHeaders.filter(
        (_, i) => i % 2 === 0 && req.rawHeaders[i]?.toLowerCase() === 'authorization',
      ).length
      if (!match?.[1] || count !== 1) throw new TokenError(401)
      const token = match[1]
      const principal = await verify(token, disconnected.signal)
      if (res.destroyed || disconnected.signal.aborted) return
      const auth: AuthInfo = {
        token,
        clientId: principal.clientId,
        scopes: principal.scopes,
        expiresAt: principal.expiresAt,
        resource: new URL(config.resource),
        extra: {
          sub: principal.subject,
          sid: principal.sessionId,
          jti: principal.tokenId,
          ...(principal.agentId
            ? { agent_id: principal.agentId, grant_id: principal.grantId }
            : {}),
        },
      }
      Object.assign(req, { auth })
      res.locals.principal = principal
      next()
    } catch (error) {
      if (res.destroyed || disconnected.signal.aborted) return
      const status = error instanceof TokenError ? error.status : 401
      rejectAuthorization(config, res, status)
    } finally {
      res.off('close', onClose)
    }
  }
  const ensureFresh: RequestHandler = async (req, res, next) => {
    if (res.destroyed) return
    const principal = res.locals.principal as Principal | undefined
    // Authentication precedes body parsing to reject unauthenticated uploads early.
    // Check expiry again after that asynchronous boundary, before MCP dispatch.
    if (!principal || principal.expiresAt <= Math.floor(Date.now() / 1000)) {
      rejectAuthorization(config, res, 401)
      return
    }
    if (!downstream) {
      next()
      return
    }
    const disconnected = new AbortController()
    const onClose = () => {
      disconnected.abort()
    }
    res.once('close', onClose)
    try {
      const token = req.headers.authorization?.slice(7)
      if (!token) {
        rejectAuthorization(config, res, 401)
        return
      }
      res.locals.apiAccess = await downstream.exchange(token, principal, disconnected.signal)
      if (res.destroyed || disconnected.signal.aborted) return
      if (principal.expiresAt <= Math.floor(Date.now() / 1000)) {
        rejectAuthorization(config, res, 401)
        return
      }
      next()
    } catch (error) {
      if (res.destroyed || disconnected.signal.aborted) return
      // AS/JWKS waits can outlive the source. A derived-token error must not hide
      // the refresh challenge once the presented source credential has expired.
      if (principal.expiresAt <= Math.floor(Date.now() / 1000)) {
        rejectAuthorization(config, res, 401)
        return
      }
      const failure =
        error instanceof UpstreamError ? error : new UpstreamError(503, 'exchange_unavailable')
      if (failure.status === 401 || failure.status === 403)
        rejectAuthorization(config, res, failure.status)
      else res.status(failure.status).json({ error: failure.code })
    } finally {
      res.off('close', onClose)
    }
  }
  return Object.assign(middleware, {
    close: () => {
      verify.close()
      downstream?.close()
    },
    ensureFresh,
  })
}
