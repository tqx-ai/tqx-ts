import type { OAuthTokenVerifier } from '@modelcontextprotocol/server'
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server'
import { createRemoteJWKSet, customFetch, decodeProtectedHeader, errors, jwtVerify } from 'jose'
import * as v from 'valibot'

import type { McpConfig } from '../config'
import { accessTokenClaimsSchema } from './claims'
import { fetchOAuthJson } from './http'

const CACHE_TTL_MS = 600_000
const RETRY_COOLDOWN_MS = 30_000
const MAX_TOKEN_LENGTH = 16_384
const metadataSchema = v.object({ issuer: v.string(), jwks_uri: v.pipe(v.string(), v.url()) })
const jwksSchema = v.object({
  keys: v.pipe(v.array(v.record(v.string(), v.unknown())), v.minLength(1), v.maxLength(32)),
})

export interface VerifierOptions {
  fetch?: typeof globalThis.fetch
  now?: () => number
}

function invalidToken(): OAuthError {
  return new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or expired access token')
}

export function createTokenVerifier(
  config: McpConfig,
  options: VerifierOptions = {},
): OAuthTokenVerifier {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const now = options.now ?? (() => Date.now())
  const issuer = new URL(config.issuer)
  const metadataUrl = new URL(
    `/.well-known/oauth-authorization-server${issuer.pathname === '/' ? '' : issuer.pathname}`,
    issuer.origin,
  )
  let resolver: ReturnType<typeof createRemoteJWKSet> | undefined
  let metadataExpiresAt = 0
  let metadataRetryAt = 0
  let pending: Promise<ReturnType<typeof createRemoteJWKSet>> | undefined

  async function loadResolver() {
    const metadata = v.parse(
      metadataSchema,
      await fetchOAuthJson(metadataUrl.href, fetchImplementation),
    )
    const jwksUrl = new URL(metadata.jwks_uri)
    // Pin key discovery to the configured AS origin, never a token-supplied URL.
    if (
      metadata.issuer !== config.issuer ||
      jwksUrl.origin !== issuer.origin ||
      jwksUrl.username ||
      jwksUrl.password ||
      jwksUrl.search ||
      jwksUrl.hash
    ) {
      throw new Error('OAuth discovery unavailable')
    }
    let jwksRetryAt = 0
    const keys = createRemoteJWKSet(jwksUrl, {
      timeoutDuration: 5000,
      cacheMaxAge: CACHE_TTL_MS,
      cooldownDuration: RETRY_COOLDOWN_MS,
      [customFetch]: async (url, init) => {
        if (now() < jwksRetryAt) throw new Error('OAuth keys unavailable')
        try {
          const document = v.parse(
            jwksSchema,
            await fetchOAuthJson(url, fetchImplementation, init?.signal ?? undefined),
          )
          return Response.json(document)
        } catch {
          jwksRetryAt = now() + RETRY_COOLDOWN_MS
          throw new Error('OAuth keys unavailable')
        }
      },
    })
    resolver = keys
    metadataExpiresAt = now() + CACHE_TTL_MS
    return keys
  }

  async function discover() {
    if (resolver && now() < metadataExpiresAt) return resolver
    if (pending) return pending
    if (now() < metadataRetryAt) throw new Error('OAuth discovery unavailable')
    pending = loadResolver()
    try {
      return await pending
    } catch {
      metadataRetryAt = now() + RETRY_COOLDOWN_MS
      throw new Error('OAuth discovery unavailable')
    } finally {
      pending = undefined
    }
  }

  return {
    async verifyAccessToken(token) {
      try {
        if (token.length > MAX_TOKEN_LENGTH) throw invalidToken()
        let header: ReturnType<typeof decodeProtectedHeader>
        try {
          header = decodeProtectedHeader(token)
        } catch {
          throw invalidToken()
        }
        if (
          header.alg !== 'RS256' ||
          typeof header.kid !== 'string' ||
          !header.kid ||
          header.kid.length > 256
        ) {
          throw invalidToken()
        }
        const { payload } = await jwtVerify(token, await discover(), {
          algorithms: ['RS256'],
          issuer: config.issuer,
          audience: config.resourceUrl,
          requiredClaims: ['iss', 'aud', 'sub', 'client_id', 'sid', 'jti', 'scope', 'iat', 'exp'],
          currentDate: new Date(now()),
        })
        const result = v.safeParse(accessTokenClaimsSchema, payload)
        if (!result.success) throw invalidToken()
        const claims = result.output
        if (
          claims.aud !== config.resourceUrl ||
          claims.iat > Math.floor(now() / 1000) + 5 ||
          claims.exp <= claims.iat
        ) {
          throw invalidToken()
        }
        return {
          token,
          clientId: claims.client_id,
          scopes: claims.scope.split(' '),
          expiresAt: claims.exp,
          resource: new URL(claims.aud),
          extra: {
            sub: claims.sub,
            sid: claims.sid,
            jti: claims.jti,
            ...(claims.agent_id ? { agent_id: claims.agent_id } : {}),
          },
        }
      } catch (error) {
        if (error instanceof OAuthError) throw error
        if (
          error instanceof errors.JWTClaimValidationFailed ||
          error instanceof errors.JWTExpired ||
          error instanceof errors.JWTInvalid ||
          error instanceof errors.JWSInvalid ||
          error instanceof errors.JOSEAlgNotAllowed ||
          error instanceof errors.JOSENotSupported ||
          error instanceof errors.JWSSignatureVerificationFailed ||
          error instanceof errors.JWKSNoMatchingKey
        ) {
          throw invalidToken()
        }
        throw new OAuthError(OAuthErrorCode.ServerError, 'Authorization service unavailable')
      }
    },
  }
}
