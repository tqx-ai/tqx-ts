import { requireScopes } from '@modelcontextprotocol/server'
import type { AuthInfo, CallToolResult, McpServer } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import { toolSchema } from '../../utils/tool-schema'
import { toolIcons } from '../../utils/icons'
import { isToolAuthError, oauthSecuritySchemes, toolAuthChallenge } from '../../auth/tool-challenge'
import { ResearchError, researchError } from '../errors'
import type { ResearchGateway } from '../gateway'
import { catalogOutput, detailOutput, exploreInput, callInput } from '../schemas'
import { actions, callAction } from './actions'
import { describeAction } from './documentation'

function result(output: Record<string, unknown>, isError = false): CallToolResult {
  return {
    ...(isError ? { isError: true } : {}),
    structuredContent: output,
    content: [{ type: 'text', text: JSON.stringify(output) }],
  }
}
function getAction(name: string) {
  const action = actions.get(name)
  if (!action)
    throw new ResearchError(
      'UNKNOWN_ACTION',
      'Unknown Research action; use tqx_research_explore for the deployed catalog',
    )
  return action
}

export function registerResearchTools(
  server: McpServer,
  context: { auth?: AuthInfo; gateway: ResearchGateway },
) {
  server.registerTool(
    'tqx_research_explore',
    {
      icons: toolIcons.tqx_research_explore,
      description:
        'Discover Qube Research actions for factors, strategies, analyses, backtests, versions, snapshots and parameter tuning. Omit action for the catalog; pass an action for exact input/output schemas, usage examples, docs and composition guidance. Does not access research data. Execute through tqx_research_call.',
      inputSchema: toolSchema(exploreInput),
      _meta: { ui: { visibility: ['model'] }, ...oauthSecuritySchemes() },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ action }) => {
      try {
        const output =
          action === undefined
            ? v.safeParse(catalogOutput, {
                actions: [...actions.values()]
                  .toSorted((a, b) => a.name.localeCompare(b.name))
                  .map(({ name, description }) => ({ action: name, description })),
              })
            : v.safeParse(detailOutput, describeAction(getAction(action)))
        if (!output.success)
          throw new ResearchError('INVALID_RESPONSE', 'Invalid Research action documentation')
        return result(output.output)
      } catch (error) {
        return result({ error: researchError(error) }, true)
      }
    },
  )
  server.registerTool(
    'tqx_research_call',
    {
      icons: toolIcons.tqx_research_call,
      description:
        'Execute a whitelisted Qube Research action with {action,input,confirm?}. Use tqx_research_explore for exact action inputs and direct business outputs. Async submissions return an ID; poll the matching get action. When a requested strategy backtest succeeds, call tqx_open_backtest_view with {type:"qube",runId:<submission id>} automatically unless the user requested text only; no user-supplied runId is needed. Permissions are checked per action. Deletion requires confirm=true. Excludes market data and trading.',
      inputSchema: toolSchema(callInput),
      // The required business scope varies by action; the SDK challenges it below.
      _meta: { ui: { visibility: ['model', 'app'] }, ...oauthSecuritySchemes() },
      scopeChallenge: (ctx) => {
        const parsed = v.safeParse(v.object({ action: v.string() }), ctx.request.params?.arguments)
        const action = parsed.success ? actions.get(parsed.output.action) : undefined
        return action ? requireScopes(action.scope)(ctx) : undefined
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ action: name, input, confirm }) => {
      try {
        const action = getAction(name)
        if (!context.auth || !context.auth.scopes.includes(action.scope))
          throw new ResearchError(
            'AUTHORIZATION_REQUIRED',
            'Research action authorization required',
          )
        return result(await callAction(context.gateway, context.auth, action, input, confirm))
      } catch (error) {
        const output = researchError(error)
        const scope = actions.get(name)?.scope
        return {
          ...result({ error: output }, true),
          ...(isToolAuthError(error)
            ? { _meta: toolAuthChallenge(context.auth, scope ? [scope] : []) }
            : {}),
        }
      }
    },
  )
}
