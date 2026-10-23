import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'
import { callTrading, type TradingContext } from './trading'

export function createProtocolServer(context?: TradingContext): McpServer {
  const server = new McpServer(
    { name: 'tqx-mcp-server', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )
  if (context) {
    const annotations = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    }
    server.registerTool(
      'getAccount',
      {
        description:
          'Read the account bound to the authorized Agent. Amounts preserve the API decimal strings.',
        inputSchema: z.strictObject({
          currency: z.enum(['HKD', 'USD']).optional(),
        }),
        annotations,
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
          symbol: z.string().min(1).max(128).optional(),
          market: z.enum(['HK', 'US']).optional(),
          limit: z.number().int().min(1).max(100).optional(),
          cursor: z.string().min(1).max(512).optional(),
        }),
        annotations,
      },
      async (args, extra) =>
        callTrading(context, extra.signal, (client) => client.trading.listPositions(args)),
    )
    return server
  }
  // Feature-disabled default preserves the already verified empty protocol surface.
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [],
  }))
  return server
}
