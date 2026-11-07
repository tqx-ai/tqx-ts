import { McpServer } from '@modelcontextprotocol/server'
import type { McpRequestContext } from '@modelcontextprotocol/server'

import { version } from '../package.json'
import { registerPingTool } from './tools/ping'
import { registerSnapshot } from './tools/trading/snapshot'
import { registerActivity } from './tools/trading/activity'
import { registerLookup } from './tools/trading/lookup'
import { registerOrder } from './tools/trading/order'
import { registerControl } from './tools/trading/control'
import type { TradingGateway } from './trading/gateway'

export function createServer(
  context?: McpRequestContext,
  options: { gateway?: TradingGateway; now?: () => number; demoPing?: boolean } = {},
) {
  const server = new McpServer({ name: '@tqx-ai/mcp-server', version })

  if (options.demoPing !== false) registerPingTool(server)
  if (options.gateway) {
    const tools = {
      auth: context?.authInfo,
      gateway: options.gateway,
      now: options.now ?? Date.now,
    }
    registerSnapshot(server, tools)
    registerActivity(server, tools)
    registerLookup(server, tools)
    registerOrder(server, tools)
    registerControl(server, tools)
  }

  return server
}
