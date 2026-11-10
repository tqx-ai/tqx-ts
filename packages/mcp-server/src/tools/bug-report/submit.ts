import type { McpServer } from '@modelcontextprotocol/server'

import { bugReportSchema } from './schemas'
import { registerTradingTool, result, type TradingToolContext } from '../trading/shared'

export function registerBugReport(server: McpServer, context: TradingToolContext): void {
  registerTradingTool(
    server,
    context,
    {
      name: 'tqx_submit_bug_report',
      schema: bugReportSchema,
      write: true,
      // Bug reports are available to any authenticated MCP client. The
      // downstream exchange uses a scope-free Trading Resource token because
      // this endpoint has no user permission boundary.
      scopeChallenge: () => undefined,
      errorKind: 'bug_report.error',
      destructive: true,
      idempotent: true,
      description:
        'Submit a reproducible TQX product bug report. This writes an external report and does not require a Trading permission or Agent binding. Include reproduction steps, environment, complete request and response details, and request_id. Reuse the same idempotencyKey only when retrying the same report.',
    },
    async (request, auth) => {
      const report = await context.gateway.call(auth, 'bugReport', {
        idempotencyKey: request.idempotencyKey,
        requiresAgent: false,
        tokenScopes: [],
        body: { title: request.title, description: request.description },
      })
      return result('bug_report.submitted', report, context.now)
    },
  )
}
