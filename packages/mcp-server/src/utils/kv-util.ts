interface Entry<T> {
  value: T
  expireAt: number
}

export class KvUtil<T> {
  readonly #entries = new Map<string, Entry<T>>()
  readonly #now: () => number
  readonly #maxEntries: number
  #timer?: ReturnType<typeof setInterval>

  constructor(options: { now?: () => number; maxEntries?: number } = {}) {
    this.#now = options.now ?? Date.now
    this.#maxEntries = options.maxEntries ?? 1000
    if (!Number.isSafeInteger(this.#maxEntries) || this.#maxEntries < 1)
      throw new Error('Invalid cache capacity')
  }

  get size(): number {
    this.sweep()
    return this.#entries.size
  }

  get(key: string): T | undefined {
    const entry = this.#entries.get(key)
    if (!entry) return undefined
    if (entry.expireAt <= this.#now()) {
      this.#entries.delete(key)
      return undefined
    }
    this.#entries.delete(key)
    this.#entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, ttlMs: number): void {
    const expireAt = this.#now() + ttlMs
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || !Number.isFinite(expireAt))
      throw new Error('Invalid cache TTL')
    this.#entries.delete(key)
    if (this.#entries.size >= this.#maxEntries) this.sweep()
    if (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next().value
      if (oldest !== undefined) this.#entries.delete(oldest)
    }
    this.#entries.set(key, { value, expireAt })
  }

  delete(key: string): boolean {
    return this.#entries.delete(key)
  }

  sweep(): void {
    const now = this.#now()
    for (const [key, entry] of this.#entries) {
      if (entry.expireAt <= now) this.#entries.delete(key)
    }
  }

  startCleanup(intervalMs = 60_000): void {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('Invalid cleanup interval')
    if (this.#timer) return
    this.#timer = setInterval(() => this.sweep(), intervalMs)
    this.#timer.unref?.()
  }

  clear(): void {
    this.#entries.clear()
  }

  dispose(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = undefined
    this.clear()
  }
}
