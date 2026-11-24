import {
  ProtocolError,
  ProtocolErrorCode,
  ResourceNotFoundError,
  ResourceTemplate,
  requireScopes,
} from '@modelcontextprotocol/server'
import type { AuthInfo, McpServer } from '@modelcontextprotocol/server'

import APIs from '../../config/APIs'
import { resourceIcons } from '../../utils/icons'
import { ResearchError, researchError } from '../errors'
import type { ResearchGateway } from '../gateway'
import * as p from '../projections'
import {
  type CachedStrategyVersion,
  type StrategyCompletionCache,
  extractObjectId,
} from './strategy-cache'

export const STRATEGY_URI_TEMPLATE = 'tqx://qube/strategies/{strategy}'
export const STRATEGY_VERSION_URI_TEMPLATE = 'tqx://qube/strategies/{strategy}/versions/{version}'
export const PYTHON_MIME_TYPE = 'text/x-python'

const VERSION_NUMBER_RE = /^v?(\d+)$/i

export interface StrategyAccessContext {
  auth?: AuthInfo
  gateway: ResearchGateway
  cache: StrategyCompletionCache
}

export interface LoadedLatestStrategy {
  readonly kind: 'latest'
  readonly uri: string
  readonly strategyId: string
  readonly data: Record<string, unknown>
  readonly text: string
}

export interface LoadedStrategyVersion {
  readonly kind: 'version'
  readonly uri: string
  readonly strategyId: string
  readonly versionId: string
  readonly versionNumber?: number
  readonly data: Record<string, unknown>
  readonly text: string
}

export type LoadedStrategyResource = LoadedLatestStrategy | LoadedStrategyVersion

export function strategyResourceUri(strategyId: string): string {
  return `tqx://qube/strategies/${strategyId}`
}

export function strategyVersionResourceUri(strategyId: string, versionId: string): string {
  return `tqx://qube/strategies/${strategyId}/versions/${versionId}`
}

export function decodeTemplateVariable(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

export function isStrategyNotFoundOrForbidden(error: unknown): error is ResearchError {
  if (!(error instanceof ResearchError)) return false
  const status = error.details?.status
  if (status === 404 || status === 403) return true
  return [
    'NOT_FOUND',
    'STRATEGY_NOT_FOUND',
    'VERSION_NOT_FOUND',
    'FORBIDDEN',
    'ACCESS_DENIED',
  ].includes(error.code)
}

export function requireResearchReadAuth(auth: AuthInfo | undefined): AuthInfo {
  if (!auth || !auth.scopes.includes('research:read')) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidRequest,
      'Research read authorization required',
    )
  }
  return auth
}

function matchCachedVersion(
  versions: readonly CachedStrategyVersion[],
  rawVersion: string,
): CachedStrategyVersion | undefined {
  const numMatch = VERSION_NUMBER_RE.exec(rawVersion)
  if (numMatch) {
    const target = Number(numMatch[1])
    const byNumber = versions.find((item) => item.version === target)
    if (byNumber) return byNumber
  }
  const needle = rawVersion.toLowerCase()
  return versions.find((item) => item.name?.toLowerCase() === needle)
}

export async function readStrategyResource(
  gateway: ResearchGateway,
  auth: AuthInfo,
  cache: StrategyCompletionCache,
  strategyId: string,
  rawVersion?: string,
): Promise<LoadedStrategyResource> {
  const normalizedStrategyId = strategyId.toLowerCase()
  const requestedVersion = rawVersion?.trim() || undefined

  if (!requestedVersion) {
    const raw = await gateway.request(auth, 'research:read', {
      path: `${APIs.RESEARCH_STRATEGIES}/${normalizedStrategyId}/source`,
    })
    if (typeof raw.id !== 'string' || raw.id.toLowerCase() !== normalizedStrategyId) {
      throw new ResearchError('INVALID_RESPONSE', 'Research response identity mismatch')
    }
    if (typeof raw.code !== 'string') {
      throw new ResearchError('INVALID_RESPONSE', 'Missing Research source')
    }
    const data = p.resource(raw, 'strategy', true)
    return {
      kind: 'latest',
      uri: strategyResourceUri(normalizedStrategyId),
      strategyId: normalizedStrategyId,
      data,
      text: raw.code,
    }
  }

  let versionId = extractObjectId(requestedVersion)
  if (!versionId) {
    const versions = await cache.listVersions(gateway, auth, normalizedStrategyId)
    const matched = matchCachedVersion(versions, requestedVersion)
    if (!matched) {
      throw new ResearchError('VERSION_NOT_FOUND', 'Requested strategy version was not found', {
        status: 404,
      })
    }
    versionId = matched.id
  }

  const raw = await gateway.request(auth, 'research:read', {
    path: `${APIs.RESEARCH_STRATEGY_VERSIONS}/${versionId}`,
  })
  if (typeof raw.id !== 'string' || raw.id.toLowerCase() !== versionId) {
    throw new ResearchError('INVALID_RESPONSE', 'Research response identity mismatch')
  }
  if (
    typeof raw.strategy_id !== 'string' ||
    raw.strategy_id.toLowerCase() !== normalizedStrategyId
  ) {
    throw new ResearchError(
      'VERSION_NOT_FOUND',
      'Requested strategy version does not belong to this strategy',
      { status: 404 },
    )
  }
  if (typeof raw.code !== 'string') {
    throw new ResearchError('INVALID_RESPONSE', 'Missing Research source')
  }
  const data: p.Input = p.version(raw, 'strategy', true)
  return {
    kind: 'version',
    uri: strategyVersionResourceUri(normalizedStrategyId, versionId),
    strategyId: normalizedStrategyId,
    versionId,
    versionNumber: typeof data.version === 'number' ? data.version : undefined,
    data,
    text: raw.code,
  }
}

export function createStrategyCompleters(context: StrategyAccessContext) {
  const completeStrategy = async (value: string): Promise<string[]> => {
    if (!context.auth || !context.auth.scopes.includes('research:read')) return []
    try {
      return await context.cache.searchStrategies(context.gateway, context.auth, value)
    } catch {
      return []
    }
  }

  const completeVersion = async (
    value: string,
    completionContext?: { arguments?: Record<string, string> },
  ): Promise<string[]> => {
    if (!context.auth || !context.auth.scopes.includes('research:read')) return []
    const rawStrategy = decodeTemplateVariable(completionContext?.arguments?.strategy)
    const strategyId = extractObjectId(rawStrategy)
    if (!strategyId) return []
    try {
      return await context.cache.searchVersions(context.gateway, context.auth, strategyId, value)
    } catch {
      return []
    }
  }

  return { completeStrategy, completeVersion }
}

export function registerStrategyResources(server: McpServer, context: StrategyAccessContext): void {
  const { completeStrategy, completeVersion } = createStrategyCompleters(context)

  server.registerResource(
    'qube_strategy',
    new ResourceTemplate(STRATEGY_URI_TEMPLATE, {
      list: undefined,
      complete: {
        strategy: completeStrategy,
      },
    }),
    {
      title: 'Qube Strategy (Latest)',
      icons: resourceIcons.qube_strategy,
      description: 'Read the Python source of the latest workspace version of a Qube strategy.',
      mimeType: PYTHON_MIME_TYPE,
      scopeChallenge: requireScopes('research:read'),
    },
    async (uri, variables) => {
      const auth = requireResearchReadAuth(context.auth)
      const strategyId = extractObjectId(decodeTemplateVariable(variables.strategy))
      if (!strategyId) throw new ResourceNotFoundError(uri.href)
      try {
        const loaded = await readStrategyResource(context.gateway, auth, context.cache, strategyId)
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: PYTHON_MIME_TYPE,
              text: loaded.text,
            },
          ],
        }
      } catch (error) {
        if (isStrategyNotFoundOrForbidden(error)) throw new ResourceNotFoundError(uri.href)
        throw new ProtocolError(ProtocolErrorCode.InternalError, researchError(error).message)
      }
    },
  )

  server.registerResource(
    'qube_strategy_version',
    new ResourceTemplate(STRATEGY_VERSION_URI_TEMPLATE, {
      list: undefined,
      complete: {
        strategy: completeStrategy,
        version: completeVersion,
      },
    }),
    {
      title: 'Qube Strategy Version',
      icons: resourceIcons.qube_strategy_version,
      description: 'Read the Python source of a specific frozen version of a Qube strategy.',
      mimeType: PYTHON_MIME_TYPE,
      scopeChallenge: requireScopes('research:read'),
    },
    async (uri, variables) => {
      const auth = requireResearchReadAuth(context.auth)
      const strategyId = extractObjectId(decodeTemplateVariable(variables.strategy))
      const rawVersion = decodeTemplateVariable(variables.version)
      if (!strategyId || !rawVersion) throw new ResourceNotFoundError(uri.href)
      try {
        const loaded = await readStrategyResource(
          context.gateway,
          auth,
          context.cache,
          strategyId,
          rawVersion,
        )
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: PYTHON_MIME_TYPE,
              text: loaded.text,
            },
          ],
        }
      } catch (error) {
        if (isStrategyNotFoundOrForbidden(error)) throw new ResourceNotFoundError(uri.href)
        throw new ProtocolError(ProtocolErrorCode.InternalError, researchError(error).message)
      }
    },
  )
}
