import { describe, expect, it, vi } from 'vitest'

import { ApiTokenProvider } from '../src/auth/api-token-provider'
import type { TokenExchange } from '../src/auth/token-exchange'
import { auth } from './helpers/trading'

const scopes = ['trade:read']
const issuer = 'https://auth.example.test'
const resource = 'https://trade.example.test/openapi'

function setup(
  options: { maxEntries?: number; maxPending?: number; exchangeTimeoutMs?: number } = {},
) {
  let now = 1_000_000
  let counter = 0
  const exchange = vi.fn<TokenExchange>(async (input) => ({
    token: `api-${++counter}`,
    scopes: input.scopes,
    expiresAt: now + 300_000,
  }))
  const provider = new ApiTokenProvider(issuer, resource, exchange, { now: () => now, ...options })
  return {
    provider,
    exchange,
    auth: auth(now),
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('API token provider', () => {
  it('times out a stuck exchange, clears in-flight state and permits recovery', async () => {
    const s = setup({ exchangeTimeoutMs: 5 })
    s.exchange.mockImplementationOnce(() => new Promise(() => undefined))
    await expect(s.provider.get(s.auth, scopes)).rejects.toThrow('Token exchange unavailable')
    await s.provider.get(s.auth, scopes)
    expect(s.exchange).toHaveBeenCalledTimes(2)
  })

  it('does not pass through the incoming MCP token even if exchange returned it', async () => {
    const s = setup()
    s.exchange.mockResolvedValueOnce({ token: s.auth.token, scopes, expiresAt: 1_300_000 })
    await expect(s.provider.get(s.auth, scopes)).rejects.toThrow('permissions')
  })

  it('merges concurrent reads and expires without sliding TTL', async () => {
    const s = setup()
    const tokens = await Promise.all(
      Array.from({ length: 10 }, () => s.provider.get(s.auth, scopes)),
    )
    expect(s.exchange).toHaveBeenCalledTimes(1)
    expect(tokens.every((t) => t === tokens[0])).toBe(true)
    s.advance(269_999)
    await s.provider.get(s.auth, scopes)
    expect(s.exchange).toHaveBeenCalledTimes(1)
    s.advance(1)
    await s.provider.get(s.auth, scopes)
    expect(s.exchange).toHaveBeenCalledTimes(2)
  })

  it('does not merge or cache any write exchange', async () => {
    const s = setup()
    await s.provider.get(s.auth, scopes)
    await Promise.all(
      Array.from({ length: 4 }, () => s.provider.get(s.auth, ['order:write'], true)),
    )
    expect(s.exchange).toHaveBeenCalledTimes(5)
    await s.provider.get(s.auth, scopes)
    expect(s.exchange).toHaveBeenCalledTimes(5)
  })

  it('isolates tokens, clients, agents, scopes and resources', async () => {
    const s = setup()
    await s.provider.get(s.auth, scopes)
    await s.provider.get({ ...s.auth, token: 'other' }, scopes)
    await s.provider.get({ ...s.auth, clientId: 'other' }, scopes)
    await s.provider.get({ ...s.auth, extra: { ...s.auth.extra, agent_id: 'other' } }, scopes)
    await s.provider.get(s.auth, ['order:write'])
    const research = new ApiTokenProvider(
      issuer,
      'https://trade.example.test/pandaApi',
      s.exchange,
      { now: () => 1_000_000 },
    )
    await research.get(s.auth, scopes)
    expect(s.exchange).toHaveBeenCalledTimes(6)
  })

  it('cleans failed in-flight entries so a later read can recover', async () => {
    const s = setup()
    s.exchange.mockRejectedValueOnce(new Error('test failure'))
    await expect(s.provider.get(s.auth, scopes)).rejects.toThrow('Token exchange unavailable')
    await s.provider.get(s.auth, scopes)
    expect(s.exchange).toHaveBeenCalledTimes(2)
  })

  it('rejects excess distinct pending reads while permitting same-key waiters', async () => {
    const s = setup({ maxPending: 1 })
    let finish!: (value: Awaited<ReturnType<TokenExchange>>) => void
    s.exchange.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const first = s.provider.get(s.auth, scopes)
    await vi.waitFor(() => expect(s.exchange).toHaveBeenCalledTimes(1))
    const same = s.provider.get(s.auth, scopes)
    await expect(s.provider.get({ ...s.auth, token: 'another' }, scopes)).rejects.toThrow('busy')
    finish({ token: 'api', scopes, expiresAt: 1_300_000 })
    expect(await first).toEqual(await same)
    await s.provider.get({ ...s.auth, token: 'another' }, scopes)
    expect(s.exchange).toHaveBeenCalledTimes(2)
  })

  it('checks agent, scope and expiry before consulting cache', async () => {
    const s = setup()
    await s.provider.get(s.auth, scopes)
    await Promise.all(
      [
        { ...s.auth, scopes: [] },
        { ...s.auth, expiresAt: 1000 },
        { ...s.auth, expiresAt: undefined },
        { ...s.auth, extra: {} },
      ].map((identity) =>
        expect(s.provider.get(identity, scopes)).rejects.toThrow('authorization'),
      ),
    )
    expect(s.exchange).toHaveBeenCalledTimes(1)
  })

  it('allows a non-Agent exchange when the caller opts out of the Agent requirement', async () => {
    const s = setup()
    const identity = { ...s.auth, scopes: ['ranking:read'], extra: { sub: 'user-1' } }
    await expect(s.provider.get(identity, ['ranking:read'], true, false)).resolves.toMatchObject({
      scopes: ['ranking:read'],
    })
    expect(s.exchange).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['ranking:read'] }))
  })

  it('invalidates a cached non-Agent exchange with the same cache key', async () => {
    const s = setup()
    const identity = { ...s.auth, scopes: ['ranking:read'], extra: { sub: 'user-1' } }
    const first = await s.provider.get(identity, ['ranking:read'], false, false)
    await s.provider.invalidate(identity, ['ranking:read'], first)
    const second = await s.provider.get(identity, ['ranking:read'], false, false)
    expect(second).not.toBe(first)
    expect(s.exchange).toHaveBeenCalledTimes(2)
  })

  it('caps caching at the incoming MCP token lifetime', async () => {
    const s = setup()
    s.auth.expiresAt = 1100
    await s.provider.get(s.auth, scopes)
    s.advance(70_000)
    await expect(s.provider.get(s.auth, scopes)).rejects.toThrow('lifetime')
    expect(s.exchange).toHaveBeenCalledTimes(2)
  })

  it('caps at the downstream lifetime and rejects tokens too close to expiry', async () => {
    const s = setup()
    s.exchange.mockResolvedValueOnce({ token: 'short', scopes, expiresAt: 1_060_000 })
    await s.provider.get(s.auth, scopes)
    s.advance(30_000)
    await s.provider.get(s.auth, scopes)
    expect(s.exchange).toHaveBeenCalledTimes(2)
    s.exchange.mockResolvedValueOnce({ token: 'invalid', scopes, expiresAt: 1_030_000 })
    await expect(s.provider.get(s.auth, scopes, true)).rejects.toThrow('lifetime')
  })

  it('does not let failure of an older token delete its replacement', async () => {
    const s = setup()
    const old = await s.provider.get(s.auth, scopes)
    await s.provider.invalidate(s.auth, scopes, old)
    const replacement = await s.provider.get(s.auth, scopes)
    await s.provider.invalidate(s.auth, scopes, old)
    expect(await s.provider.get(s.auth, scopes)).toBe(replacement)
    expect(s.exchange).toHaveBeenCalledTimes(2)
    s.provider.dispose()
    await expect(s.provider.get(s.auth, scopes)).rejects.toThrow('closed')
    expect(s.exchange).toHaveBeenCalledTimes(2)
  })
})
