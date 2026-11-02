import { createApp } from './app'

export default {
  hostname: process.env.TQX_MCP_BIND_HOST ?? '127.0.0.1',
  port: 61102,
  fetch: createApp().fetch,
}
