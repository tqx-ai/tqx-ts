import type {
  AuthInfo,
  McpServer,
  CallToolResult,
  ScopeChallengeHandler,
} from '@modelcontextprotocol/server'
import { requireScopes } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import { publicError, TradingError } from '../../trading/errors'
import type { TradingGateway } from '../../trading/gateway'
import { toolSchema } from '../../utils/tool-schema'

export interface TradingToolContext {
  auth?: AuthInfo
  gateway: TradingGateway
  now: () => number
}

export function result(
  kind: string,
  data: Record<string, unknown>,
  now: () => number,
  errors?: unknown[],
): CallToolResult {
  const output = {
    kind,
    data,
    meta: { retrievedAt: new Date(now()).toISOString(), ...(errors?.length ? { errors } : {}) },
  }
  return {
    ...(errors?.length ? { isError: true } : {}),
    structuredContent: output,
    content: [{ type: 'text', text: JSON.stringify(output) }],
  }
}

export function registerTradingTool<T extends v.GenericSchema>(
  server: McpServer,
  context: TradingToolContext,
  definition: {
    name: string
    description: string
    schema: T
    write?: boolean
    scopeChallenge?: ScopeChallengeHandler
    destructive?: boolean
    idempotent?: boolean
  },
  handler: (request: v.InferOutput<T>, auth: AuthInfo) => Promise<CallToolResult>,
): void {
  server.registerTool(
    definition.name,
    {
      description: definition.description,
      inputSchema: toolSchema(v.strictObject({ request: definition.schema })),
      scopeChallenge:
        definition.scopeChallenge ?? requireScopes(definition.write ? 'order:write' : 'trade:read'),
      annotations: {
        readOnlyHint: !definition.write,
        destructiveHint: definition.destructive ?? false,
        idempotentHint: definition.idempotent ?? !definition.write,
        openWorldHint: true,
      },
    },
    async ({ request }) => {
      try {
        if (!context.auth) throw new TradingError('authorization', 'Trading authorization required')
        return await handler(request, context.auth)
      } catch (error) {
        const output = { kind: 'trading.error', error: publicError(error) }
        return {
          isError: true,
          structuredContent: output,
          content: [{ type: 'text', text: JSON.stringify(output) }],
        }
      }
    },
  )
}
