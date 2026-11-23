import { ApiTokenProvider } from '../auth/api-token-provider'
import { createTokenExchange, type TokenExchange } from '../auth/token-exchange'
import type { ResearchConfig } from './config'
import { ResearchGateway, type ResearchGatewayOptions } from './gateway'
import { StrategyCompletionCache } from './resources/strategy-cache'

export interface ResearchRuntimeOptions extends Omit<ResearchGatewayOptions, 'timeoutMs'> {
  now?: () => number
  exchange?: TokenExchange
  maxEntries?: number
  maxPending?: number
  exchangeTimeoutMs?: number
  gatewayTimeoutMs?: number
  strategyCacheTtlMs?: number
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
  const strategyCache = new StrategyCompletionCache({
    ttlMs: options.strategyCacheTtlMs,
    maxEntries: options.maxEntries,
    now: options.now,
  })
  return {
    gateway,
    strategyCache,
    dispose: () => {
      strategyCache.dispose()
      tokens.dispose()
    },
  }
}
