import { describe, expect, it, vi } from 'vitest'
import {
  resolveTqxEndpoints,
  TqxClient,
  TqxConfigurationError,
  type TqxClientOptions,
} from '../src/index'

const profiles = {
  TQX_LOCAL_BASE_URL: 'https://local-research.example.test/pandaApi/',
  TQX_LOCAL_TRADING_BASE_URL: 'http://127.0.0.1:8102/',
  TQX_TEST_BASE_URL: 'https://test-research.example.test/pandaApi/',
  TQX_TEST_TRADING_BASE_URL: 'https://test-trading.example.test/',
  TQX_PROD_BASE_URL: 'https://prod-research.example.test/pandaApi/',
  TQX_PROD_TRADING_BASE_URL: 'https://prod-trading.example.test/',
}
function envelope(data: unknown): Response {
  return Response.json({ code: '0', message: 'ok', data, request_id: null, timestamp: 1 })
}

describe('SDK optional deployment configuration (offline)', () => {
  it.each(['local', 'test', 'prod'] as const)(
    'uses the configured %s endpoints without changing authentication',
    async (environment) => {
      const runtime = { ...profiles, TQX_ENV: environment, NODE_ENV: 'production' }
      const endpoints = resolveTqxEndpoints({}, runtime)
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(envelope({ items: [] }))
        .mockResolvedValueOnce(Response.json({ code: 0, data: { balance: '1' } }))
      const client = new TqxClient({
        runtimeEnvironment: runtime,
        apiKey: 'synthetic-explicit-key',
        fetch,
      })
      await expect(client.trading.listOrders()).resolves.toEqual({ items: [] })
      await expect(client.user.getBalance()).resolves.toEqual({ balance: '1' })
      const prefix = `TQX_${environment.toUpperCase()}`
      expect(endpoints).toEqual({
        environment,
        requestedEnvironment: environment,
        baseUrl: profiles[`${prefix}_BASE_URL` as keyof typeof profiles].replace(/\/$/, ''),
        tradingBaseUrl: profiles[`${prefix}_TRADING_BASE_URL` as keyof typeof profiles].replace(
          /\/$/,
          '',
        ),
      })
      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
        `${endpoints.tradingBaseUrl}/openapi/v1/trading/orders`,
        `${endpoints.baseUrl}/userWallet/myWallet`,
      ])
      expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('X-API-Key')).toBe(
        'synthetic-explicit-key',
      )
    },
  )

  it('keeps the original explicit-option and generic-variable priority over selected profile defaults', () => {
    const options = {
      environment: 'test' as const,
      baseUrl: 'https://explicit-research.example.test/pandaApi',
      tradingBaseUrl: 'https://explicit-trading.example.test',
    }
    expect(
      resolveTqxEndpoints(options, {
        ...profiles,
        TQX_ENV: 'prod',
        TQX_BASE_URL: 'https://generic.example.test',
      }),
    ).toEqual({
      environment: 'test',
      requestedEnvironment: 'test',
      baseUrl: options.baseUrl,
      tradingBaseUrl: 'https://generic.example.test',
    })
    expect(resolveTqxEndpoints(options, profiles)).toMatchObject({
      baseUrl: options.baseUrl,
      tradingBaseUrl: options.tradingBaseUrl,
    })
  })

  it.each(['test', 'prod'] as const)(
    'retains prior build/generic defaults when %s profile fields are omitted',
    (environment) => {
      expect(resolveTqxEndpoints({}, { TQX_ENV: environment })).toEqual({
        environment,
        requestedEnvironment: environment,
        baseUrl: 'https://build-default-api.example.test',
        tradingBaseUrl: 'https://build-default-trading-api.example.test',
      })
      expect(
        resolveTqxEndpoints({}, { TQX_ENV: environment, TQX_BASE_URL: 'http://127.0.0.1:8102' }),
      ).toMatchObject({ baseUrl: 'http://127.0.0.1:8102', tradingBaseUrl: 'http://127.0.0.1:8102' })
    },
  )

  it.each(['', 'dev', 'pro', 'production', 'TEST', 'staging'])(
    'does not add a startup rejection for selector %j',
    (TQX_ENV) => {
      expect(resolveTqxEndpoints({}, { ...profiles, TQX_ENV })).toEqual({
        requestedEnvironment: TQX_ENV,
        baseUrl: 'https://build-default-api.example.test',
        tradingBaseUrl: 'https://build-default-trading-api.example.test',
      })
    },
  )

  it('does not use NODE_ENV as deployment selection', () => {
    expect(resolveTqxEndpoints({}, { ...profiles, NODE_ENV: 'production' })).toEqual({
      baseUrl: 'https://build-default-api.example.test',
      tradingBaseUrl: 'https://build-default-trading-api.example.test',
    })
  })

  it('can use a configured profile base as the common gateway', () => {
    expect(
      resolveTqxEndpoints(
        {},
        { TQX_ENV: 'test', TQX_TEST_BASE_URL: 'https://one-gateway.example.test/pandaApi' },
      ),
    ).toEqual({
      environment: 'test',
      requestedEnvironment: 'test',
      baseUrl: 'https://one-gateway.example.test/pandaApi',
      tradingBaseUrl: 'https://one-gateway.example.test/pandaApi',
    })
  })

  it.each([{ apiKey: 'synthetic-api-key' }, { bearerToken: 'synthetic-api-token' }])(
    'keeps existing explicit constructor credentials usable with selected public configuration: %j',
    async (credential) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(envelope({ items: [] }))
        .mockResolvedValueOnce(envelope({ status: 'ok', service: 'fixture', version: '1' }))
      const client = new TqxClient({
        ...credential,
        runtimeEnvironment: { ...profiles, TQX_ENV: 'prod' },
        fetch,
      })
      await client.trading.listOrders()
      await client.health()
      const authenticated = new Headers(fetch.mock.calls[0]?.[1]?.headers)
      expect(authenticated.get('X-API-Key')).toBe(credential.apiKey ?? null)
      expect(authenticated.get('Authorization')).toBe(
        credential.bearerToken ? `Bearer ${credential.bearerToken}` : null,
      )
      const publicHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers)
      expect(publicHeaders.has('X-API-Key')).toBe(false)
      expect(publicHeaders.has('Authorization')).toBe(false)
    },
  )

  it('keeps existing HTTP(S) URL validation without adding HTTPS/loopback policies', () => {
    expect(
      resolveTqxEndpoints(
        {},
        { TQX_ENV: 'prod', TQX_PROD_TRADING_BASE_URL: 'http://127.0.0.1:8102' },
      ).tradingBaseUrl,
    ).toBe('http://127.0.0.1:8102')
    for (const value of ['', 123, 'not-a-url', 'file:///local']) {
      expect(
        () =>
          new TqxClient({
            environment: 'prod',
            tradingBaseUrl: value,
            runtimeEnvironment: profiles,
          } as unknown as TqxClientOptions),
      ).toThrow(TqxConfigurationError)
    }
  })

  it('never reads credential fields while resolving public endpoints', () => {
    const readCredential = vi.fn(() => {
      throw new Error('Credential access is not allowed')
    })
    const runtime = Object.defineProperty({ TQX_ENV: 'local', ...profiles }, 'TQX_API_KEY', {
      get: readCredential,
    })
    expect(resolveTqxEndpoints({}, runtime).environment).toBe('local')
    expect(readCredential).not.toHaveBeenCalled()
  })
})
