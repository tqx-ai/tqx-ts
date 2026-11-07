import type { McpServer } from '@modelcontextprotocol/server'

import { activitySchema } from '../../trading/schemas'
import { registerTradingTool, result, type TradingToolContext } from './shared'

export function registerActivity(server: McpServer, context: TradingToolContext): void {
  registerTradingTool(
    server,
    context,
    {
      name: 'trading_activity',
      schema: activitySchema,
      description:
        'Read one page of active orders, recent trades, or native-currency cash flows. Orders support pagination only, not history/market filters. Dates are YYYY-MM-DD in Hong Kong time. Cash-flow unsupported is an error, not an empty ledger. Default page 20, max 100; reuse opaque next_cursor only when more results are needed.',
    },
    async (request, auth) => {
      const pagination = { limit: request.limit, cursor: request.cursor }
      let page
      if (request.type === 'orders')
        page = await context.gateway.call(auth, 'orders', { query: pagination })
      else if (request.type === 'trades')
        page = await context.gateway.call(auth, 'trades', {
          query: { ...pagination, market: request.market, order_id: request.orderId },
        })
      else
        page = await context.gateway.call(auth, 'cashFlows', {
          query: {
            ...pagination,
            start_date: request.startDate,
            end_date: request.endDate,
            currency: request.currency,
          },
        })
      return result('trading.activity', { type: request.type, ...page }, context.now)
    },
  )
}
