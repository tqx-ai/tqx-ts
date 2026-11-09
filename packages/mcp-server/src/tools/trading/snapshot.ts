import type { McpServer } from '@modelcontextprotocol/server'

import { publicError } from '../../trading/errors'
import { snapshotSchema } from '../../trading/schemas'
import { registerTradingTool, result, type TradingToolContext } from './shared'

export function registerSnapshot(server: McpServer, context: TradingToolContext): void {
  registerTradingTool(
    server,
    context,
    {
      name: 'trading_snapshot',
      schema: snapshotSchema,
      description:
        'Read account and/or positions for the authorized agent. Sections default to both. Currency affects account only; symbol/market/cursor affect positions. Default page 20, max 100; pass next_cursor unchanged for more. Sections are not an atomic snapshot; preserve as_of/is_stale. Does not place trades.',
    },
    async (request, auth) => {
      const sections = [...new Set(request.sections)]
      const responses = await Promise.allSettled(
        sections.map((section) =>
          section === 'account'
            ? context.gateway.call(auth, 'account', { query: { currency: request.currency } })
            : context.gateway.call(auth, 'positions', {
                query: {
                  symbol: request.symbol,
                  market: request.market,
                  limit: request.limit,
                  cursor: request.cursor,
                },
              }),
        ),
      )
      const data: Record<string, unknown> = {}
      const errors: unknown[] = []
      responses.forEach((response, index) => {
        const section = sections[index]!
        data[section] = response.status === 'fulfilled' ? response.value : null
        if (response.status === 'rejected')
          errors.push({ section, ...publicError(response.reason) })
      })
      return result('trading.snapshot', data, context.now, errors)
    },
  )
}
