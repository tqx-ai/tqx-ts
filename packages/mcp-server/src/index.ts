import { createApp } from './app'
import { getDefaultPluginSkills } from './skills'
import { getLogger } from './utils/logger'
import { readReportHtml } from './apps/qube/backtest/resource'

const skills = await getDefaultPluginSkills()
const app = createApp({ skills })
if (process.env.TQX_MCP_RESEARCH_BASE_URL !== undefined) await readReportHtml()
const resourceUrl = process.env.TQX_MCP_RESOURCE_URL ?? ''
const issuer = process.env.TQX_MCP_OAUTH_ISSUER ?? ''
const allowedOrigins = (process.env.TQX_MCP_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

getLogger('server').info({
  event: 'mcp.config_loaded',
  resourceUrl,
  issuer,
  allowedOriginCount: allowedOrigins.length,
  skillCount: skills.entries.length,
})

export default {
  hostname: process.env.TQX_MCP_BIND_HOST ?? '127.0.0.1',
  port: 61102,
  fetch: app.fetch,
}
