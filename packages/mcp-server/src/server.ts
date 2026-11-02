import { McpServer } from '@modelcontextprotocol/server'

import { version } from '../package.json'
import { registerPingTool } from './tools/ping'

export function createServer() {
  const server = new McpServer({ name: '@tqx-ai/mcp-server', version })

  registerPingTool(server)

  return server
}
