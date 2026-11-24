import {
  ProtocolError,
  ProtocolErrorCode,
  ResourceNotFoundError,
  ResourceTemplate,
  requireScopes,
} from '@modelcontextprotocol/server'
import type { McpServer } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import APIs from '../../config/APIs'
import { resourceIcons } from '../../utils/icons'
import { ResearchError, researchError } from '../errors'
import { id } from '../schemas'
import {
  type StrategyAccessContext,
  PYTHON_MIME_TYPE,
  decodeTemplateVariable,
  isStrategyNotFoundOrForbidden,
  requireResearchReadAuth,
} from './strategy'

export const FACTOR_URI_TEMPLATE = 'tqx://qube/factors/{factor}'
const factorCodeType = v.picklist(['python', 'formula'])

export function factorResourceUri(factorId: string): string {
  return `tqx://qube/factors/${factorId}`
}

export function factorMimeType(codeType: unknown): string {
  const parsed = v.safeParse(factorCodeType, codeType)
  if (!parsed.success)
    throw new ResearchError('INVALID_RESPONSE', 'Invalid Research factor code type')
  return parsed.output === 'python' ? PYTHON_MIME_TYPE : 'text/plain'
}

export function registerFactorResources(server: McpServer, context: StrategyAccessContext): void {
  server.registerResource(
    'qube_factor',
    new ResourceTemplate(FACTOR_URI_TEMPLATE, { list: undefined }),
    {
      title: 'Qube Factor (Latest)',
      icons: resourceIcons.qube_factor,
      description: 'Read the latest Qube factor source: Python code or a plain-text formula.',
      scopeChallenge: requireScopes('research:read'),
    },
    async (uri, variables) => {
      const auth = requireResearchReadAuth(context.auth)
      const parsedId = v.safeParse(id, decodeTemplateVariable(variables.factor).toLowerCase())
      if (!parsedId.success) throw new ResourceNotFoundError(uri.href)
      const factorId = parsedId.output
      try {
        const raw = await context.gateway.request(auth, 'research:read', {
          path: `${APIs.RESEARCH_FACTORS}/${factorId}/source`,
        })
        if (typeof raw.id !== 'string' || raw.id.toLowerCase() !== factorId)
          throw new ResearchError('INVALID_RESPONSE', 'Research response identity mismatch')
        if (typeof raw.code !== 'string')
          throw new ResearchError('INVALID_RESPONSE', 'Missing Research source')
        return {
          contents: [{ uri: uri.href, mimeType: factorMimeType(raw.code_type), text: raw.code }],
        }
      } catch (error) {
        if (
          isStrategyNotFoundOrForbidden(error) ||
          (error instanceof ResearchError && error.code === 'FACTOR_NOT_FOUND')
        )
          throw new ResourceNotFoundError(uri.href)
        throw new ProtocolError(ProtocolErrorCode.InternalError, researchError(error).message)
      }
    },
  )
}
