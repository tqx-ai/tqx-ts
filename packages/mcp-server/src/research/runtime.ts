import { ApiTokenProvider } from '../auth/api-token-provider'
import { createTokenExchange, type TokenExchange } from '../auth/token-exchange'
import type { ResearchConfig } from './config'
import { ResearchGateway, type ResearchGatewayOptions } from './gateway'

export interface ResearchRuntimeOptions extends Omit<ResearchGatewayOptions, 'timeoutMs'> {
  now?: () => number
  exchange?: TokenExchange
  maxEntries?: number
  maxPending?: number
  exchangeTimeoutMs?: number
  gatewayTimeoutMs?: number
}

export function createResearchRuntime(
  issuer: string,
  config: ResearchConfig,
  options: ResearchRuntimeOptions = {},
) {
  const tokens = new ApiTokenProvider(
    issuer,
    config.resource,
    options.exchange ??
      createTokenExchange(config, {
        fetch: options.fetch,
        now: options.now,
        timeoutMs: options.exchangeTimeoutMs,
      }),
    options,
  )
  const gateway = new ResearchGateway(config.baseUrl, tokens, {
    ...options,
    timeoutMs: options.gatewayTimeoutMs,
  })
  return { gateway, dispose: () => tokens.dispose() }
}
