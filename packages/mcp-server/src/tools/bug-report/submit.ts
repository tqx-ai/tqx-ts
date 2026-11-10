import type { AuthInfo, McpServer, ScopeChallengeHandler } from '@modelcontextprotocol/server'

import { bugReportSchema } from './schemas'
import { registerTradingTool, result, type TradingToolContext } from '../trading/shared'
import { TradingError } from '../../trading/errors'
import type { TradingScope } from '../../trading/operations'

function authorization(
  auth: AuthInfo,
): { scope: TradingScope; requiresAgent: boolean } | undefined {
  if (auth.scopes.includes('ranking:read')) return { scope: 'ranking:read', requiresAgent: false }
  if (auth.scopes.includes('trade:read') && auth.extra?.agent_id)
    return { scope: 'trade:read', requiresAgent: true }
  if (auth.scopes.includes('order:write') && auth.extra?.agent_id)
    return { scope: 'order:write', requiresAgent: true }
  return undefined
}

const bugReportScopeChallenge: ScopeChallengeHandler = ({ authInfo }) => {
  if (!authInfo || authorization(authInfo)) return undefined
  return {
    scopes: ['ranking:read'],
    errorDescription: 'Bug reports require a Trading Resource scope',
  }
}

export function registerBugReport(server: McpServer, context: TradingToolContext): void {
  registerTradingTool(
    server,
    context,
    {
      name: 'tqx_submit_bug_report',
      schema: bugReportSchema,
      write: true,
      scopeChallenge: bugReportScopeChallenge,
      errorKind: 'bug_report.error',
      destructive: true,
      idempotent: true,
      description:
        'Submit a reproducible TQX product bug report. This writes an external report and uses an existing Trading Resource scope from the current authorization, preferring ranking:read and falling back to agent-bound trade:read or order:write. Include reproduction steps, environment, complete request and response details, and request_id. Reuse the same idempotencyKey only when retrying the same report.',
    },
    async (request, auth) => {
      const selected = authorization(auth)
      if (!selected)
        throw new TradingError('authorization', 'Bug report Trading Resource scope required')
      const report = await context.gateway.call(auth, 'bugReport', {
        idempotencyKey: request.idempotencyKey,
        requiresAgent: selected.requiresAgent,
        tokenScope: selected.scope,
        body: { title: request.title, description: request.description },
      })
      return result('bug_report.submitted', report, context.now)
    },
  )
}
