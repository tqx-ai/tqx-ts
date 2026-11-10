import type { McpServer } from '@modelcontextprotocol/server'
import { toStandardJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'

export function registerPingTool(server: McpServer) {
  server.registerTool(
    'tqx_ping',
    {
      description: 'Say pong to the given name.',
      inputSchema: toStandardJsonSchema(v.object({ name: v.string('name must be a string') })),
    },
    async ({ name }) => ({ content: [{ type: 'text', text: `pong, ${name}` }] }),
  )
}
