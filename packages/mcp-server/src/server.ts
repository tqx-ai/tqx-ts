import { McpServer } from '@modelcontextprotocol/server'
import type { McpRequestContext } from '@modelcontextprotocol/server'

import { version } from '../package.json'
import { registerPingTool } from './tools/ping'
import { registerSnapshot } from './tools/trading/snapshot'
import { registerActivity } from './tools/trading/activity'
import { registerLookup } from './tools/trading/lookup'
import { registerOrder } from './tools/trading/order'
import { registerControl } from './tools/trading/control'
import { registerBugReportPrompt } from './tools/bug-report/prompt'
import { registerBugReport } from './tools/bug-report/submit'
import type { TradingGateway } from './trading/gateway'
import type { ResearchGateway } from './research/gateway'
import { registerInspectStrategyPrompt } from './research/prompts/inspect-strategy'
import { registerStrategyResources } from './research/resources/strategy'
import { StrategyCompletionCache } from './research/resources/strategy-cache'
import { registerResearchTools } from './research/tools/research'

const CACHE_TTL_MS = 5 * 60 * 1000

export function createServer(
  context?: McpRequestContext,
  options: {
    gateway?: TradingGateway
    researchGateway?: ResearchGateway
    researchStrategyCache?: StrategyCompletionCache
    now?: () => number
    demoPing?: boolean
  } = {},
) {
  const server = new McpServer(
    { name: '@tqx-ai/mcp-server', version },
    {
      cacheHints: {
        'server/discover': { ttlMs: CACHE_TTL_MS, cacheScope: 'public' },
        'tools/list': { ttlMs: CACHE_TTL_MS, cacheScope: 'public' },
        'prompts/list': { ttlMs: CACHE_TTL_MS, cacheScope: 'public' },
      },
    },
  )

  if (options.demoPing !== false) registerPingTool(server)
  if (options.researchGateway) {
    const strategyContext = {
      auth: context?.authInfo,
      gateway: options.researchGateway,
      cache: options.researchStrategyCache ?? new StrategyCompletionCache({ now: options.now }),
    }
    registerResearchTools(server, { auth: context?.authInfo, gateway: options.researchGateway })
    registerStrategyResources(server, strategyContext)
    registerInspectStrategyPrompt(server, strategyContext)
  }
  if (options.gateway) {
    registerBugReportPrompt(server)
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
    registerBugReport(server, tools)
  }

  return server
}
