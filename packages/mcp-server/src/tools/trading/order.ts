import type { McpServer } from '@modelcontextprotocol/server'

import { orderSchema } from '../../trading/schemas'
import { registerTradingTool, result, type TradingToolContext } from './shared'

export function registerOrder(server: McpServer, context: TradingToolContext): void {
  registerTradingTool(
    server,
    context,
    {
      name: 'trading_order',
      schema: orderSchema,
      write: true,
      destructive: true,
      description:
        'Place, modify price, or cancel an HK/US stock order for the authorized account. Requires order:write and user authorization. Quantity is an integer string; LIMIT needs price, MARKET forbids it; validity DAY only. For place supply a stable idempotencyKey: identical intent retries reuse it and identical parameters, new intent uses a new key. Result is signal/request acceptance, not fill/cancellation. Use trading_lookup for status. Unknown write outcomes must not be blindly retried.',
    },
    async (request, auth) => {
      if (request.action === 'place') {
        const signal = await context.gateway.call(auth, 'place', {
          idempotencyKey: request.idempotencyKey,
          body: {
            symbol: request.symbol,
            side: request.side,
            order_type: request.orderType,
            quantity: request.quantity,
            price: request.orderType === 'LIMIT' ? request.price : undefined,
            reason: request.reason?.trim() || undefined,
            time_in_force: request.timeInForce ?? 'DAY',
          },
        })
        return result('trading.order', { action: 'place', ...signal }, context.now)
      }
      const response = await context.gateway.call(auth, request.action, {
        id: request.orderId,
        body: request.action === 'modify' ? { price: request.price } : undefined,
      })
      return result('trading.order', { action: request.action, ...response }, context.now)
    },
  )
}
