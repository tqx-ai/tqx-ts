import type { AuthInfo } from '@modelcontextprotocol/server'
import {
  bearerAuthChallengeResponse,
  OAuthError,
  OAuthErrorCode,
} from '@modelcontextprotocol/server'

import { ResearchError } from '../research/errors'
import { TradingError } from '../trading/errors'

export function isToolAuthError(error: unknown): boolean {
  return (
    (error instanceof TradingError &&
      (error.kind === 'authorization' || error.details.status === 401)) ||
    (error instanceof ResearchError &&
      (error.code === 'AUTHORIZATION_REQUIRED' || error.details?.status === 401))
  )
}

export function oauthSecuritySchemes(scopes: readonly string[] = []) {
  return { securitySchemes: [{ type: 'oauth2', scopes: [...scopes] }] }
}

/** Tool-result equivalent of the HTTP challenge, for hosts with inline OAuth UI. */
export function toolAuthChallenge(auth?: AuthInfo, scopes: readonly string[] = []) {
  const response = bearerAuthChallengeResponse(
    new OAuthError(OAuthErrorCode.InvalidToken, 'Authorization required; reconnect to continue'),
    { resourceMetadataUrl: auth?.resourceMetadataUrl, requiredScopes: [...scopes] },
  )
  return { 'mcp/www_authenticate': [response.headers.get('WWW-Authenticate')!] }
}
