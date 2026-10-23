import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  TqxApiError,
  TqxClient,
  TqxNetworkError,
  TqxProtocolError,
  TqxValidationError,
} from '@tqx-ai/sdk'
import type { Config } from './config'
import type { ApiAccess } from './exchange'
import { readBoundedBody, UpstreamError } from './network'

export interface TradingContext {
  config: Config
  access: ApiAccess
  signal: AbortSignal
}

export async function callTrading(
  context: TradingContext,
  caller: AbortSignal,
  operation: (client: TqxClient) => Promise<unknown>,
): Promise<CallToolResult> {
  const signal = AbortSignal.any([
    context.signal,
    caller,
    AbortSignal.timeout(context.config.tradingTimeoutMs),
  ])
  try {
    const base = new URL(context.config.tradingBaseUrl)
    const transport: typeof fetch = async (input, init) => {
      signal.throwIfAborted()
      if (context.access.expiresAt <= Math.floor(Date.now() / 1000))
        throw new UpstreamError(401, 'authorization_required')
      const url = new URL(input instanceof Request ? input.url : String(input))
      // The SDK supports a global TQX_BASE_URL override. Fail closed if it points elsewhere.
      // Do not let an ambient SDK setting redirect a request-local bearer to another origin.
      if (url.origin !== base.origin) throw new UpstreamError(503, 'trading_configuration_error')
      const response = await fetch(input, {
        ...init,
        redirect: 'manual',
        signal,
      })
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel()
        throw new UpstreamError(502, 'upstream_protocol_error')
      }
      const bytes = await readBoundedBody(response, 1_048_576, signal)
      const headers = new Headers(response.headers)
      headers.delete('content-length')
      headers.delete('content-encoding')
      return new Response(bytes as Uint8Array<ArrayBuffer>, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    const client = new TqxClient({
      baseUrl: context.config.tradingBaseUrl,
      tradingBaseUrl: context.config.tradingBaseUrl,
      bearerToken: context.access.token,
      fetch: transport,
    })
    const data = await operation(client)
    return { content: [{ type: 'text', text: JSON.stringify(data) }] }
  } catch (error) {
    const failure =
      error instanceof TqxNetworkError && error.cause instanceof UpstreamError ? error.cause : error
    let code = 'dependency_unavailable'
    if (failure instanceof TqxApiError) {
      if (failure.status === 401) code = 'authorization_required'
      else if (failure.status === 403) code = 'permission_denied'
      else if (failure.status === 429) code = 'rate_limit_exceeded'
      else if (failure.status >= 400 && failure.status < 500) code = 'trading_request_rejected'
    } else if (failure instanceof TqxValidationError) code = 'invalid_arguments'
    else if (failure instanceof TqxProtocolError) code = 'upstream_protocol_error'
    // SDK transport wraps network exceptions. Do not expose nested exception messages/URLs.
    else if (failure instanceof UpstreamError) code = failure.code
    else if (!(failure instanceof TqxNetworkError)) code = 'dependency_unavailable'
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: code }) }],
    }
  }
}
