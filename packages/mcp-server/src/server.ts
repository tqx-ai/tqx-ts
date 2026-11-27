import type { KeyObject } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/server'
import type { McpRequestContext } from '@modelcontextprotocol/server'
import type { SkillsExtension } from '@modelcontextprotocol/server/ext/skills'

import { version } from '../package.json'
import { readClientCapabilities } from './utils/client-capabilities'
import { readClientDistribution } from './utils/client-distribution'
import { serverIcons } from './utils/icons'
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
import { registerFactorResources } from './research/resources/factor'
import { registerResearchResourceList } from './research/resources/list'
import { StrategyCompletionCache } from './research/resources/strategy-cache'
import { registerResearchTools } from './research/tools/research'

import { registerBacktestApp } from './apps/qube/backtest/register'
import { registerReportResource, reportResource, supportsApps } from './apps/qube/backtest/resource'

const CACHE_TTL_MS = 5 * 60 * 1000

export function createServer(
  context?: McpRequestContext,
  options: {
    webBaseUrl?: string
    gateway?: TradingGateway
    researchGateway?: ResearchGateway
    researchStrategyCache?: StrategyCompletionCache
    researchResourceCursorKey?: KeyObject
    skills?: SkillsExtension | null
    now?: () => number
    demoPing?: boolean
  } = {},
) {
  const hasLocalSkills = context?.requestInfo
    ? readClientDistribution(context.requestInfo).hasLocalSkills
    : false
  const server = new McpServer(
    { name: '@tqx-ai/mcp-server', version, icons: serverIcons },
    {
      // Initialize the SDK resource handlers before the paginated list override is installed.
      capabilities: { resources: {} },
      cacheHints: {
        'server/discover': { ttlMs: CACHE_TTL_MS, cacheScope: 'private' },
        'tools/list': { ttlMs: CACHE_TTL_MS, cacheScope: 'public' },
        'prompts/list': { ttlMs: CACHE_TTL_MS, cacheScope: 'public' },
      },
    },
  )

  if (options.demoPing !== false) registerPingTool(server)
  if (options.researchGateway) {
    if (!options.researchResourceCursorKey) throw new Error('Missing Research resource cursor key')
    const strategyContext = {
      auth: context?.authInfo,
      gateway: options.researchGateway,
      cache: options.researchStrategyCache ?? new StrategyCompletionCache({ now: options.now }),
    }
    registerResearchTools(server, { auth: context?.authInfo, gateway: options.researchGateway })
    registerBacktestApp(server, {
      webBaseUrl: options.webBaseUrl,
      auth: context?.authInfo,
      gateway: options.researchGateway,
      now: options.now,
    })
    registerReportResource(server, context?.authInfo)
    registerStrategyResources(server, strategyContext)
    registerFactorResources(server, strategyContext)
    registerResearchResourceList(
      server,
      strategyContext,
      options.researchResourceCursorKey,
      (ctx) => (supportsApps(readClientCapabilities(server.server, ctx)) ? [reportResource] : []),
    )
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
  if (!hasLocalSkills) options.skills?.attach(server)

  return server
}
