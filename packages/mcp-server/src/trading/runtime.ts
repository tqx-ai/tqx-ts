import { ApiTokenProvider } from '../auth/api-token-provider'
import { createTokenExchange } from '../auth/token-exchange'
import type { TokenExchange } from '../auth/token-exchange'
import type { TradingConfig } from './config'
import { TradingGateway, type TradingAuditEvent } from './gateway'

export interface TradingRuntimeOptions {
  fetch?: typeof globalThis.fetch
  now?: () => number
  exchange?: TokenExchange
  audit?: (event: TradingAuditEvent) => void
  maxEntries?: number
  maxPending?: number
  exchangeTimeoutMs?: number
  gatewayTimeoutMs?: number
  maxConcurrent?: number
  maxPerPrincipal?: number
}

export function createTradingRuntime(
  issuer: string,
  config: TradingConfig,
  options: TradingRuntimeOptions = {},
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
    {
      now: options.now,
      maxEntries: options.maxEntries,
      maxPending: options.maxPending,
      exchangeTimeoutMs: options.exchangeTimeoutMs,
    },
  )
  const gateway = new TradingGateway(config.baseUrl, tokens, {
    fetch: options.fetch,
    now: options.now,
    timeoutMs: options.gatewayTimeoutMs,
    maxConcurrent: options.maxConcurrent,
    maxPerPrincipal: options.maxPerPrincipal,
    audit: options.audit,
  })
  return { gateway, dispose: () => tokens.dispose() }
}
