import { describe, expect, it, vi } from 'vitest'

import type { TokenExchange } from '../src/auth/token-exchange'
import { createTradingRuntime, type TradingRuntimeOptions } from '../src/trading/runtime'
import { account, auth, envelope, tradingConfig } from './helpers/trading'

function setup(options: TradingRuntimeOptions = {}) {
  let sequence = 0
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) =>
    String(url) === tradingConfig.tokenEndpoint
      ? Response.json({
          access_token: `api-${++sequence}`,
          token_type: 'Bearer',
          expires_in: 300,
          issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
          scope: (init!.body as URLSearchParams).get('scope'),
        })
      : envelope(account),
  )
  const runtime = createTradingRuntime('https://auth.example.test', tradingConfig, {
    fetch,
    ...options,
  })
  return { runtime, fetch }
}

function delayedResponse(ms: number, response: Response, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve(response)
    }, ms)
    function abort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

describe('trading runtime options', () => {
  it.each(['exchange', 'gateway'] as const)(
    'does not let the other layer timeout abort a slow %s request',
    async (layer) => {
      const s = setup({
        exchangeTimeoutMs: layer === 'exchange' ? 1000 : 5,
        gatewayTimeoutMs: layer === 'gateway' ? 1000 : 5,
      })
      const respond = s.fetch.getMockImplementation()!
      s.fetch.mockImplementation(async (url, init) => {
        const response = await respond(url, init)
        const isExchange = String(url) === tradingConfig.tokenEndpoint
        return isExchange === (layer === 'exchange')
          ? delayedResponse(30, response, init!.signal!)
          : response
      })
      try {
        expect(await s.runtime.gateway.call(auth(), 'account')).toEqual(account)
      } finally {
        s.runtime.dispose()
      }
    },
  )

  it.each(['exchange', 'gateway'] as const)('enforces the configured %s timeout', async (layer) => {
    const s = setup({
      exchangeTimeoutMs: layer === 'exchange' ? 5 : 1000,
      gatewayTimeoutMs: layer === 'gateway' ? 5 : 1000,
    })
    const respond = s.fetch.getMockImplementation()!
    s.fetch.mockImplementation(async (url, init) => {
      const response = await respond(url, init)
      const isExchange = String(url) === tradingConfig.tokenEndpoint
      return isExchange === (layer === 'exchange')
        ? delayedResponse(1000, response, init!.signal!)
        : response
    })
    try {
      await expect(s.runtime.gateway.call(auth(), 'account')).rejects.toMatchObject({
        kind: 'network',
      })
      expect(s.fetch).toHaveBeenCalledTimes(layer === 'exchange' ? 1 : 2)
    } finally {
      s.runtime.dispose()
    }
  })

  it('bounds injected exchanges with exchangeTimeoutMs too', async () => {
    const s = setup({ exchangeTimeoutMs: 5, exchange: () => new Promise(() => undefined) })
    try {
      await expect(s.runtime.gateway.call(auth(), 'account')).rejects.toMatchObject({
        kind: 'network',
      })
      expect(s.fetch).not.toHaveBeenCalled()
    } finally {
      s.runtime.dispose()
    }
  })

  it('applies the configured token cache capacity', async () => {
    const s = setup({ maxEntries: 1 })
    const principal = auth()
    try {
      await s.runtime.gateway.call(principal, 'account')
      await s.runtime.gateway.call({ ...principal, token: 'other-token' }, 'account')
      await s.runtime.gateway.call(principal, 'account')
      expect(
        s.fetch.mock.calls.filter(([url]) => String(url) === tradingConfig.tokenEndpoint),
      ).toHaveLength(3)
    } finally {
      s.runtime.dispose()
    }
  })

  it('applies the configured distinct pending exchange limit', async () => {
    let finish!: (token: Awaited<ReturnType<TokenExchange>>) => void
    const pending = new Promise<Awaited<ReturnType<TokenExchange>>>((resolve) => {
      finish = resolve
    })
    const exchange = vi.fn<TokenExchange>(() => pending)
    const s = setup({ maxPending: 1, exchange })
    const principal = auth()
    const first = s.runtime.gateway.call(principal, 'account')
    try {
      await vi.waitFor(() => expect(exchange).toHaveBeenCalledTimes(1))
      await expect(
        s.runtime.gateway.call({ ...principal, token: 'other-token' }, 'account'),
      ).rejects.toMatchObject({ kind: 'busy' })
    } finally {
      finish({ token: 'api-1', scopes: ['trade:read'], expiresAt: Date.now() + 300_000 })
      await first
      s.runtime.dispose()
    }
  })

  it.each(['global', 'principal'] as const)('applies the %s concurrency limit', async (limit) => {
    const s = setup(limit === 'global' ? { maxConcurrent: 1 } : { maxPerPrincipal: 1 })
    let finish!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      finish = resolve
    })
    const respond = s.fetch.getMockImplementation()!
    s.fetch.mockImplementation((url, init) =>
      String(url) === tradingConfig.tokenEndpoint ? respond(url, init) : pending,
    )
    const principal = auth()
    const first = s.runtime.gateway.call(principal, 'account')
    try {
      await expect(
        s.runtime.gateway.call(
          limit === 'global'
            ? { ...principal, token: 'other-token', clientId: 'other-client' }
            : principal,
          'account',
        ),
      ).rejects.toMatchObject({ kind: 'busy' })
    } finally {
      finish(envelope(account))
      await first
      s.runtime.dispose()
    }
  })
})
