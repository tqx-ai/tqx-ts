import { createHmac, timingSafeEqual, type KeyObject } from 'node:crypto'
import { ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server'
import type { AuthInfo, McpServer, Resource } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import APIs from '../../config/APIs'
import { resourceIcons } from '../../utils/icons'
import { ResearchError, researchError } from '../errors'
import { id, time } from '../schemas'
import { factorMimeType, factorResourceUri } from './factor'
import { type StrategyAccessContext, PYTHON_MIME_TYPE, strategyResourceUri } from './strategy'

const PAGE_SIZE = 50
const upstreamCursor = v.pipe(v.string(), v.maxLength(1024))
const cursorSchema = v.strictObject({
  version: v.literal(2),
  kind: v.picklist(['strategy', 'factor']),
  cursor: v.optional(upstreamCursor),
  uiListed: v.optional(v.boolean()),
})
type Cursor = v.InferOutput<typeof cursorSchema>

const summarySchema = v.object({
  id,
  title: v.string(),
  description: v.nullish(v.string()),
  code_type: v.optional(v.picklist(['python', 'formula'])),
  updated_at: v.nullish(time),
})

function principalKey(auth: AuthInfo): string {
  const sub = auth.extra?.sub
  if (typeof sub !== 'string' || sub.length === 0)
    throw new ProtocolError(ProtocolErrorCode.InvalidRequest, 'Research resource subject required')
  return JSON.stringify([sub, auth.clientId])
}

function invalidCursor(): ProtocolError {
  return new ProtocolError(ProtocolErrorCode.InvalidParams, 'Invalid Research resource cursor')
}

function cursorTag(payload: string, principal: string, key: KeyObject): Buffer {
  return createHmac('sha256', key)
    .update(JSON.stringify([principal, payload]))
    .digest()
}

function decodeCursor(value: string | undefined, principal: string, key: KeyObject): Cursor {
  if (value === undefined) return { version: 2, kind: 'strategy' }
  try {
    if (value.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))
      throw invalidCursor()
    const [payload, signature] = value.split('.') as [string, string]
    const tag = Buffer.from(signature, 'base64url')
    const expected = cursorTag(payload, principal, key)
    if (
      tag.toString('base64url') !== signature ||
      tag.length !== expected.length ||
      !timingSafeEqual(tag, expected)
    )
      throw invalidCursor()
    const bytes = Buffer.from(payload, 'base64url')
    if (bytes.toString('base64url') !== payload) throw invalidCursor()
    const parsed = v.safeParse(cursorSchema, JSON.parse(bytes.toString('utf8')))
    if (!parsed.success) throw invalidCursor()
    return parsed.output
  } catch {
    throw invalidCursor()
  }
}

function encodeCursor(cursor: Cursor, principal: string, key: KeyObject): string {
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url')
  return `${payload}.${cursorTag(payload, principal, key).toString('base64url')}`
}

function resourceSummary(raw: unknown, kind: Cursor['kind']): Resource {
  const parsed = v.safeParse(summarySchema, raw)
  if (!parsed.success)
    throw new ResearchError('INVALID_RESPONSE', 'Invalid Research resource summary')
  const row = parsed.output
  if (kind === 'strategy' && row.code_type !== undefined && row.code_type !== 'python')
    throw new ResearchError('INVALID_RESPONSE', 'Invalid Research strategy code type')
  return {
    uri: kind === 'strategy' ? strategyResourceUri(row.id) : factorResourceUri(row.id),
    name: `${kind}-${row.id}`,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    mimeType: kind === 'strategy' ? PYTHON_MIME_TYPE : factorMimeType(row.code_type),
    icons: kind === 'strategy' ? resourceIcons.qube_strategy : resourceIcons.qube_factor,
    ...(row.updated_at == null ? {} : { annotations: { lastModified: row.updated_at } }),
  }
}

export function registerResearchResourceList(
  server: McpServer,
  context: StrategyAccessContext,
  cursorKey: KeyObject,
  staticResources: () => Resource[] = () => [],
): void {
  // SDK 2.4 merges template lists but drops their nextCursor and does not pass the request cursor.
  // This owns the entire server's resources/list, bypassing SDK static/template lists.
  // Initialize resources capability/handlers before installing it (see createServer).
  // Future resource modules must compose their catalogs here before registering resources.
  // Registered templates still own reads and completions.
  server.server.setRequestHandler('resources/list', async (request) => {
    const auth = context.auth
    if (!auth?.scopes.includes('research:read')) return { resources: [] }
    const principal = principalKey(auth)
    let position: Cursor | undefined = decodeCursor(request.params?.cursor, principal, cursorKey)
    const resources: Resource[] = []
    const ui = position.uiListed ? [] : staticResources()
    const uiListed = position.uiListed || ui.length > 0
    if (ui.length > 0) resources.push(...ui)
    try {
      // At most one upstream page per kind; never prefetch the complete catalog.
      while (position && resources.length < PAGE_SIZE) {
        const kind: Cursor['kind'] = position.kind
        const key = kind === 'strategy' ? 'strategies' : 'factors'
        const limit = PAGE_SIZE - resources.length
        // eslint-disable-next-line no-await-in-loop -- The remaining limit and next kind depend on this page.
        const raw = await context.gateway.request(auth, 'research:read', {
          path: kind === 'strategy' ? APIs.RESEARCH_STRATEGIES : APIs.RESEARCH_FACTORS,
          query: { limit, cursor: position.cursor },
        })
        const parsed = v.safeParse(
          v.object({
            rows: v.pipe(v.array(v.unknown()), v.maxLength(limit)),
            next_cursor: v.nullable(upstreamCursor),
            has_more: v.optional(v.boolean()),
          }),
          { rows: raw[key], next_cursor: raw.next_cursor, has_more: raw.has_more },
        )
        if (!parsed.success)
          throw new ResearchError('INVALID_RESPONSE', 'Invalid Research resource page')
        const next = parsed.output.next_cursor
        const hasMore = parsed.output.has_more ?? next !== null
        if (hasMore && (next === null || next === position.cursor))
          throw new ResearchError('INVALID_RESPONSE', 'Invalid Research next cursor')
        resources.push(...parsed.output.rows.map((row) => resourceSummary(row, kind)))
        if (hasMore) {
          position = { version: 2, kind, cursor: next! }
          break
        }
        position = kind === 'strategy' ? { version: 2, kind: 'factor' } : undefined
      }
      return {
        resources,
        ...(position === undefined
          ? {}
          : {
              nextCursor: encodeCursor(
                { ...position, ...(uiListed ? { uiListed: true } : {}) },
                principal,
                cursorKey,
              ),
            }),
      }
    } catch (error) {
      if (
        error instanceof ResearchError &&
        ['INVALID_CURSOR', 'INVALID_INPUT'].includes(error.code)
      )
        throw invalidCursor()
      throw new ProtocolError(ProtocolErrorCode.InternalError, researchError(error).message)
    }
  })
}
