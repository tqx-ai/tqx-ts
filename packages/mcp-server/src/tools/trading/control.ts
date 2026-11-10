import type { McpServer } from '@modelcontextprotocol/server'
import { requireScopes } from '@modelcontextprotocol/server'

import { operations } from '../../trading/operations'
import { controlSchema } from '../../trading/schemas'
import { registerTradingTool, result, type TradingToolContext } from './shared'

export function registerControl(server: McpServer, context: TradingToolContext): void {
  registerTradingTool(
    server,
    context,
    {
      name: 'tqx_trading_control',
      schema: controlSchema,
      write: true,
      scopeChallenge: requireScopes(operations.hold.scope),
      idempotent: true,
      description:
        'Mark the authorized agent active for today with action hold. Does not place or confirm an order. Changes agent activity; requires trade:read and a fresh token exchange. Uses the server activity_date, not the client date.',
    },
    async (_request, auth) =>
      result('trading.control', await context.gateway.call(auth, 'hold'), context.now),
  )
}
