import { createApp } from './app'

const app = createApp()
const resourceUrl = process.env.TQX_MCP_RESOURCE_URL ?? ''
const issuer = process.env.TQX_MCP_OAUTH_ISSUER ?? ''
const allowedOrigins = (process.env.TQX_MCP_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

console.info(
  JSON.stringify({
    event: 'mcp.config_loaded',
    resourceUrl,
    issuer,
    allowedOriginCount: allowedOrigins.length,
  }),
)

export default {
  hostname: process.env.TQX_MCP_BIND_HOST ?? '127.0.0.1',
  port: 61102,
  fetch: app.fetch,
}
