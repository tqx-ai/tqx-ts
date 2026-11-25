import type { McpServer } from '@modelcontextprotocol/server'
import { toStandardJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'

import { toolIcons } from '../utils/icons'

export function registerPingTool(server: McpServer) {
  server.registerTool(
    'tqx_ping',
    {
      icons: toolIcons.tqx_ping,
      description: 'Say pong to the given name.',
      inputSchema: toStandardJsonSchema(v.object({ name: v.string('name must be a string') })),
    },
    async ({ name }) => ({ content: [{ type: 'text', text: `pong, ${name}` }] }),
  )
}
