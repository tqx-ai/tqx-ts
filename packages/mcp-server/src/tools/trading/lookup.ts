import type { McpServer } from '@modelcontextprotocol/server'
import { requireScopes } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import { operations } from '../../trading/operations'
import { lookupSchema } from '../../trading/schemas'
import { registerTradingTool, result, type TradingToolContext } from './shared'

export function registerLookup(server: McpServer, context: TradingToolContext): void {
  registerTradingTool(
    server,
    context,
    {
      name: 'tqx_trading_lookup',
      schema: lookupSchema,
      scopeChallenge: (challengeContext) => {
        const parsed = v.safeParse(
          v.object({ request: v.object({ type: v.unknown() }) }),
          challengeContext.request.params?.arguments,
        )
        // Authorization depends only on the discriminator, before ID validation.
        const operation =
          parsed.success && parsed.output.request.type === 'signal' ? 'signal' : 'order'
        return requireScopes(operations[operation].scope)(challengeContext)
      },
      description:
        'Read one active order (trade:read) or trading signal (order:write) by exact opaque ID. A signal state is not the order lifecycle: ACCEPTED does not mean FILLED, and order_status may be null. Use after placing/modifying/cancelling; an unavailable active order does not prove cancellation or fill. Never reconstruct IDs.',
    },
    async (request, auth) =>
      result(
        'trading.lookup',
        {
          type: request.type,
          ...(await context.gateway.call(auth, request.type, { id: request.id })),
        },
        context.now,
      ),
  )
}
