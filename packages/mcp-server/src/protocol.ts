import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { REQUIRED_SCOPE, WRITE_SCOPE } from './config'
import { callTrading, callWrite, placeOrders, type TradingContext } from './trading'

const identifier = z.string().min(1).max(128)
const pagination = {
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().max(512).optional(),
}
const dateFilter = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const idempotencyKey = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/)
  .describe(
    'Stable key for this exact intent. Preserve it when checking an uncertain result; never invent a replacement on retry.',
  )
const price = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .refine((value) => /[1-9]/.test(value))
const order = z
  .strictObject({
    symbol: z
      .string()
      .min(3)
      .max(64)
      .describe('Symbol as <code>.HK or <code>.US; the SDK normalizes case and whitespace.'),
    side: z.enum(['BUY', 'SELL']),
    orderType: z.enum(['MARKET', 'LIMIT']),
    quantity: z
      .string()
      .regex(/^[1-9]\d*$/)
      .describe('Positive integer quantity as a string; never a floating point number.'),
    price: price
      .optional()
      .describe('Positive decimal string. Required for LIMIT, forbidden for MARKET.'),
    reason: z.string().max(512).optional(),
    timeInForce: z.enum(['DAY']).optional(),
    idempotencyKey,
  })
  .refine(
    (input) =>
      input.orderType === 'LIMIT' ? input.price !== undefined : input.price === undefined,
    'LIMIT requires price; MARKET forbids price',
  )

export function createProtocolServer(context?: TradingContext): McpServer {
  const server = new McpServer(
    { name: 'tqx-mcp-server', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )
  const readAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  }
  const writeAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  }
  if (context?.config.tradingToolsEnabled && context.access.scopes.includes(REQUIRED_SCOPE)) {
    server.registerTool(
      'getAccount',
      {
        description:
          'Read the account bound to the authorized Agent. Preserve decimal strings, nulls, actual mode and freshness.',
        inputSchema: z.strictObject({ currency: z.enum(['HKD', 'USD']).optional() }),
        annotations: readAnnotations,
      },
      async (args, extra) =>
        callTrading(context, extra.signal, (client) => client.trading.getAccount(args)),
    )
    server.registerTool(
      'listPositions',
      {
        description:
          'Read positions for the authorized Agent; preserve decimal strings, nulls and pagination.',
        inputSchema: z.strictObject({
          symbol: z.string().min(3).max(32).optional(),
          market: z.enum(['HK', 'US']).optional(),
          ...pagination,
        }),
        annotations: readAnnotations,
      },
      async (args, extra) =>
        callTrading(context, extra.signal, (client) => client.trading.listPositions(args)),
    )
    server.registerTool(
      'listOrders',
      {
        description:
          'Read current active provider orders for the authorized Agent with Trading-service filtering and opaque cursor pagination. Filters combine with AND; dates are inclusive Hong Kong submitted dates.',
        inputSchema: z.strictObject({
          ...pagination,
          startDate: dateFilter.optional(),
          endDate: dateFilter.optional(),
          status: z
            .string()
            .optional()
            .describe('Case-insensitive order status; unknown values return no matches.'),
          symbol: z.string().min(3).max(32).optional(),
        }),
        annotations: readAnnotations,
      },
      async (args, extra) =>
        callTrading(context, extra.signal, (client) => client.trading.listOrders(args)),
    )
    server.registerTool(
      'getOrder',
      {
        description:
          'Read one current order belonging to the authorized Agent. Preserve its actual lifecycle status.',
        inputSchema: z.strictObject({ orderId: identifier }),
        annotations: readAnnotations,
      },
      async (args, extra) =>
        callTrading(context, extra.signal, (client) => client.trading.getOrder(args.orderId)),
    )
    server.registerTool(
      'listTrades',
      {
        description:
          'Read actual executions for the authorized Agent; preserve native currency, decimal strings and null fee values.',
        inputSchema: z.strictObject({
          market: z.enum(['HK', 'US']).optional(),
          orderId: identifier.optional(),
          ...pagination,
        }),
        annotations: readAnnotations,
      },
      async (args, extra) =>
        callTrading(context, extra.signal, (client) => client.trading.listTrades(args)),
    )
    server.registerTool(
      'listCashFlows',
      {
        description:
          'Read native-currency cash ledger rows. An unsupported channel returns cash_flows_unsupported, never a fabricated empty ledger.',
        inputSchema: z.strictObject({
          startDate: dateFilter.optional(),
          endDate: dateFilter.optional(),
          currency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .optional(),
          ...pagination,
        }),
        annotations: readAnnotations,
      },
      async (args, extra) =>
        callTrading(context, extra.signal, (client) => client.trading.listCashFlows(args)),
    )
    server.registerTool(
      'getSignal',
      {
        description:
          'Read a signal for the authorized Agent. PENDING/ACCEPTED acknowledge a request, not a fill; UNKNOWN requires reconciliation.',
        inputSchema: z.strictObject({ signalId: z.string().min(8).max(128) }),
        annotations: readAnnotations,
      },
      async (args, extra) =>
        callTrading(context, extra.signal, (client) => client.trading.getSignal(args.signalId)),
    )
  }
  if (
    context?.config.tradingToolsEnabled &&
    context.config.tradingWriteToolsEnabled &&
    context.access.scopes.includes(WRITE_SCOPE)
  ) {
    server.registerTool(
      'placeOrder',
      {
        description:
          'Submit a trading instruction with a stable idempotency key. accepted means signal/request accepted, never filled. unknown requires checking the same intent; do not retry with a new key.',
        inputSchema: order,
        annotations: writeAnnotations,
      },
      async (args, extra) =>
        callWrite(context, extra.signal, args.idempotencyKey, (client) =>
          client.trading.placeOrder(args),
        ),
    )
    server.registerTool(
      'modifyOrder',
      {
        description:
          'Request a price change for an owned order with a stable idempotency key. accepted acknowledges the request, not the final order state.',
        inputSchema: z.strictObject({ orderId: identifier, price, idempotencyKey }),
        annotations: writeAnnotations,
      },
      async (args, extra) =>
        callWrite(context, extra.signal, args.idempotencyKey, (client) =>
          client.trading.modifyOrder(args),
        ),
    )
    server.registerTool(
      'cancelOrder',
      {
        description:
          'Request cancellation of an owned order with a stable idempotency key. accepted is not confirmation of CANCELLED; unknown must be reconciled.',
        inputSchema: z.strictObject({ orderId: identifier, idempotencyKey }),
        annotations: writeAnnotations,
      },
      async (args, extra) =>
        callWrite(context, extra.signal, args.idempotencyKey, (client) =>
          client.trading.cancelOrder(args.orderId, { idempotencyKey: args.idempotencyKey }),
        ),
    )
    server.registerTool(
      'placeOrders',
      {
        description:
          'Submit 1..20 instructions sequentially after full validation and unique-key checks. Stop at the first failed/unknown result. Each index is accepted, failed, unknown or not_submitted. No MCP retries or new keys; accepted is never a fill.',
        inputSchema: z.strictObject({ orders: z.array(order).min(1).max(20) }),
        annotations: writeAnnotations,
      },
      async (args, extra) => placeOrders(context, extra.signal, args.orders),
    )
  }
  if (!context?.config.tradingToolsEnabled) {
    // Feature-disabled default preserves the empty stateless protocol surface.
    server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }))
  }
  return server
}
