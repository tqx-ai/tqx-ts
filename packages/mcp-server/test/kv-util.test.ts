import { describe, expect, it, vi } from 'vitest'

import { KvUtil } from '../src/utils/kv-util'

describe('in-memory KV', () => {
  it('expires at the exact boundary and does not extend TTL on reads', () => {
    let now = 100
    const kv = new KvUtil<{ token: string }>({ now: () => now })
    kv.set('a', { token: 'a' }, 50)
    now = 149
    expect(kv.get('a')).toEqual({ token: 'a' })
    now = 150
    expect(kv.get('a')).toBeUndefined()
    expect(kv.size).toBe(0)
  })

  it('evicts expired entries first, then the least recently used item', () => {
    let now = 0
    const kv = new KvUtil<number>({ now: () => now, maxEntries: 2 })
    kv.set('a', 1, 10)
    kv.set('b', 2, 100)
    now = 10
    kv.set('c', 3, 100)
    expect(kv.get('a')).toBeUndefined()
    expect(kv.get('b')).toBe(2)
    kv.set('d', 4, 100)
    expect(kv.get('c')).toBeUndefined()
    expect(kv.get('d')).toBe(4)
    expect(kv.size).toBe(2)
    kv.set('b', 5, 100)
    expect(kv.get('b')).toBe(5)
    expect(kv.delete('b')).toBe(true)
    expect(kv.delete('missing')).toBe(false)
  })

  it.each([0, -1, NaN, Infinity])('rejects invalid TTL %s', (ttl) => {
    expect(() => new KvUtil().set('x', 'x', ttl)).toThrow('Invalid cache TTL')
  })

  it.each([0, -1, 1.2, Infinity])('rejects invalid capacity %s', (maxEntries) => {
    expect(() => new KvUtil({ maxEntries })).toThrow('Invalid cache capacity')
  })

  it('starts cleanup once and releases its timer and values on dispose', () => {
    vi.useFakeTimers()
    try {
      const kv = new KvUtil()
      kv.startCleanup(10)
      kv.startCleanup(10)
      kv.set('a', 'a', 20)
      expect(vi.getTimerCount()).toBe(1)
      vi.advanceTimersByTime(20)
      expect(kv.size).toBe(0)
      kv.dispose()
      kv.dispose()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
