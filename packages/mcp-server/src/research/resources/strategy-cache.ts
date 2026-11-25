import type { AuthInfo } from '@modelcontextprotocol/server'

import APIs from '../../config/APIs'
import { array, object, type ResearchGateway } from '../gateway'
import * as p from '../projections'

const DEFAULT_TTL_MS = 20_000
const DEFAULT_MAX_ENTRIES = 200
const STRATEGY_LIST_LIMIT = 100
const SUMMARY_FALLBACK_LIMIT = 10
const COMPLETION_LIMIT = 20
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i
const BRACKETED_OBJECT_ID_RE = /\[\s*([0-9a-f]{24})\s*\]$/i
const HEX_PREFIX_RE = /^[0-9a-f]{6,24}$/i

export interface CachedStrategySummary {
  readonly id: string
  readonly title: string
  readonly market?: string
  readonly updatedAt?: string
}

export interface CachedStrategyVersion {
  readonly id: string
  readonly strategyId: string
  readonly version: number
  readonly name?: string
  readonly createdAt?: string
}

interface StrategyPageCacheEntry {
  readonly items: readonly CachedStrategySummary[]
  readonly hasMore: boolean
  readonly expiresAt: number
}

interface VersionListCacheEntry {
  readonly items: readonly CachedStrategyVersion[]
  readonly expiresAt: number
}

export interface StrategyCompletionCacheOptions {
  ttlMs?: number
  maxEntries?: number
  now?: () => number
}

export function extractObjectId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (OBJECT_ID_RE.test(trimmed)) return trimmed.toLowerCase()
  const bracketed = BRACKETED_OBJECT_ID_RE.exec(trimmed)
  return bracketed?.[1]?.toLowerCase()
}

export function formatStrategyCandidate(
  strategy: Pick<CachedStrategySummary, 'id' | 'title'>,
): string {
  const title = strategy.title.trim()
  return title ? `${title} [${strategy.id}]` : strategy.id
}

export function formatVersionCandidate(
  version: Pick<CachedStrategyVersion, 'id' | 'version' | 'name'>,
): string {
  const label = version.name?.trim()
  return label
    ? `v${version.version} - ${label} [${version.id}]`
    : `v${version.version} [${version.id}]`
}

function principalKey(auth: AuthInfo): string {
  return JSON.stringify([auth.extra?.sub, auth.clientId])
}

function toStrategySummary(raw: Record<string, unknown>): CachedStrategySummary | undefined {
  const projected = p.resource(raw, 'strategy')
  if (typeof projected.id !== 'string' || !OBJECT_ID_RE.test(projected.id)) return undefined
  return {
    id: projected.id.toLowerCase(),
    title: typeof projected.title === 'string' ? projected.title : '',
    market: typeof projected.market === 'string' ? projected.market : undefined,
    updatedAt: typeof projected.updatedAt === 'string' ? projected.updatedAt : undefined,
  }
}

function toStrategyVersion(
  raw: Record<string, unknown>,
  expectedStrategyId: string,
): CachedStrategyVersion | undefined {
  const projected: p.Input = p.version(raw, 'strategy')
  if (
    typeof projected.id !== 'string' ||
    !OBJECT_ID_RE.test(projected.id) ||
    typeof projected.resourceId !== 'string' ||
    projected.resourceId.toLowerCase() !== expectedStrategyId ||
    typeof projected.version !== 'number' ||
    !Number.isSafeInteger(projected.version)
  ) {
    return undefined
  }
  return {
    id: projected.id.toLowerCase(),
    strategyId: expectedStrategyId,
    version: projected.version,
    name:
      typeof projected.name === 'string' && projected.name.trim()
        ? projected.name.trim()
        : undefined,
    createdAt: typeof projected.createdAt === 'string' ? projected.createdAt : undefined,
  }
}

function setBounded<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

function matchesStrategy(strategy: CachedStrategySummary, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  const formatted = formatStrategyCandidate(strategy).toLowerCase()
  return (
    strategy.title.toLowerCase().includes(needle) ||
    strategy.id.startsWith(needle) ||
    formatted.startsWith(needle)
  )
}

function matchesVersion(version: CachedStrategyVersion, query: string): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  const num = String(version.version)
  const vNum = `v${num}`
  const formatted = formatVersionCandidate(version).toLowerCase()
  return (
    num.startsWith(needle) ||
    vNum.startsWith(needle) ||
    (version.name?.toLowerCase().includes(needle) ?? false) ||
    (needle.length >= 4 && version.id.startsWith(needle)) ||
    formatted.startsWith(needle)
  )
}

export class StrategyCompletionCache {
  readonly #ttlMs: number
  readonly #maxEntries: number
  readonly #now: () => number
  readonly #strategies = new Map<string, StrategyPageCacheEntry>()
  readonly #pendingStrategies = new Map<string, Promise<StrategyPageCacheEntry>>()
  readonly #versions = new Map<string, VersionListCacheEntry>()
  readonly #pendingVersions = new Map<string, Promise<VersionListCacheEntry>>()

  constructor(options: StrategyCompletionCacheOptions = {}) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.#now = options.now ?? Date.now
  }

  async listStrategies(
    gateway: ResearchGateway,
    auth: AuthInfo,
  ): Promise<{ readonly items: readonly CachedStrategySummary[]; readonly hasMore: boolean }> {
    const key = principalKey(auth)
    const now = this.#now()
    const cached = this.#strategies.get(key)
    if (cached && cached.expiresAt > now) {
      return { items: cached.items, hasMore: cached.hasMore }
    }
    const existing = this.#pendingStrategies.get(key)
    if (existing) {
      const resolved = await existing
      return { items: resolved.items, hasMore: resolved.hasMore }
    }
    const promise = (async (): Promise<StrategyPageCacheEntry> => {
      const raw = await gateway.request(auth, 'research:read', {
        path: APIs.RESEARCH_STRATEGIES,
        query: { limit: STRATEGY_LIST_LIMIT },
      })
      const items = array(raw.strategies)
        .map((row) => toStrategySummary(object(row)))
        .filter((item): item is CachedStrategySummary => item !== undefined)
      const hasMore =
        raw.has_more === true || (raw.next_cursor !== null && raw.next_cursor !== undefined)
      const entry: StrategyPageCacheEntry = {
        items,
        hasMore,
        expiresAt: this.#now() + this.#ttlMs,
      }
      setBounded(this.#strategies, key, entry, this.#maxEntries)
      return entry
    })()
    this.#pendingStrategies.set(key, promise)
    try {
      const resolved = await promise
      return { items: resolved.items, hasMore: resolved.hasMore }
    } finally {
      this.#pendingStrategies.delete(key)
    }
  }

  async searchStrategies(
    gateway: ResearchGateway,
    auth: AuthInfo,
    rawQuery: string,
  ): Promise<string[]> {
    const query = rawQuery.trim()
    const page = await this.listStrategies(gateway, auth)
    const matched = page.items.filter((item) => matchesStrategy(item, query))
    if (matched.length > 0 || !page.hasMore || !query || HEX_PREFIX_RE.test(query)) {
      return matched.slice(0, COMPLETION_LIMIT).map(formatStrategyCandidate)
    }
    // Only fall back to an upstream title query when the cached first page is truncated.
    const fallback = await gateway.request(auth, 'research:read', {
      path: APIs.RESEARCH_STRATEGIES,
      query: { view: 'summary', title: query, limit: SUMMARY_FALLBACK_LIMIT },
    })
    return array(fallback.strategies)
      .map((row) => toStrategySummary(object(row)))
      .filter((item): item is CachedStrategySummary => item !== undefined)
      .slice(0, COMPLETION_LIMIT)
      .map(formatStrategyCandidate)
  }

  async listVersions(
    gateway: ResearchGateway,
    auth: AuthInfo,
    strategyId: string,
  ): Promise<readonly CachedStrategyVersion[]> {
    const normalizedId = strategyId.toLowerCase()
    const key = `${principalKey(auth)}:${normalizedId}`
    const now = this.#now()
    const cached = this.#versions.get(key)
    if (cached && cached.expiresAt > now) {
      return cached.items
    }
    const existing = this.#pendingVersions.get(key)
    if (existing) {
      return (await existing).items
    }
    const promise = (async (): Promise<VersionListCacheEntry> => {
      const raw = await gateway.request(auth, 'research:read', {
        path: `${APIs.RESEARCH_STRATEGIES}/${normalizedId}/versions`,
      })
      const items = array(raw.versions)
        .map((row) => toStrategyVersion(object(row), normalizedId))
        .filter((item): item is CachedStrategyVersion => item !== undefined)
      const entry: VersionListCacheEntry = {
        items,
        expiresAt: this.#now() + this.#ttlMs,
      }
      setBounded(this.#versions, key, entry, this.#maxEntries)
      return entry
    })()
    this.#pendingVersions.set(key, promise)
    try {
      return (await promise).items
    } finally {
      this.#pendingVersions.delete(key)
    }
  }

  async searchVersions(
    gateway: ResearchGateway,
    auth: AuthInfo,
    strategyId: string,
    rawQuery: string,
  ): Promise<string[]> {
    const query = rawQuery.trim()
    const versions = await this.listVersions(gateway, auth, strategyId)
    return versions
      .filter((item) => matchesVersion(item, query))
      .slice(0, COMPLETION_LIMIT)
      .map(formatVersionCandidate)
  }

  dispose(): void {
    this.#strategies.clear()
    this.#pendingStrategies.clear()
    this.#versions.clear()
    this.#pendingVersions.clear()
  }
}
