import { requireScopes } from '@modelcontextprotocol/server'
import type { AuthInfo, CallToolResult, McpServer } from '@modelcontextprotocol/server'

import { toolSchema } from '../../../utils/tool-schema'
import { toolIcons } from '../../../utils/icons'
import {
  isToolAuthError,
  oauthSecuritySchemes,
  toolAuthChallenge,
} from '../../../auth/tool-challenge'
import { researchError } from '../../../research/errors'
import { loadReport, type ReportContext } from '../../../research/backtest-report/load'
import { REPORT_META, viewInput, summarySchema } from '../../../research/backtest-report/contract'
import type { Report } from '../../../research/backtest-report/contract'
import { REPORT_URI } from './resource'

function result(data: Report): CallToolResult {
  const summary = data.summary
  return {
    structuredContent: summary,
    content: [{ type: 'text', text: JSON.stringify(summary) }],
    _meta: { [REPORT_META]: data },
  }
}
function failure(error: unknown, auth?: AuthInfo): CallToolResult {
  const output = { error: researchError(error) }
  return {
    isError: true,
    ...(isToolAuthError(error) ? { _meta: toolAuthChallenge(auth, ['research:read']) } : {}),
    structuredContent: output,
    content: [{ type: 'text', text: JSON.stringify(output) }],
  }
}
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

export function registerBacktestApp(server: McpServer, context: ReportContext) {
  // Keep discovery stable across clients. Apps hosts enforce standard visibility;
  // text-only hosts can consume the same bounded summary without loading HTML.
  server.registerTool(
    'tqx_open_backtest_view',
    {
      title: 'Qube backtest report',
      icons: toolIcons.tqx_research_call,
      description:
        'Show a read-only backtest report. Only TQX Qube is supported: pass type="qube". After a user-requested Qube backtest reaches status=succeeded, call this automatically unless the user requested text only. Use the submission response id as runId; do not ask the user for the type, ID, or another request to show results. Also reopens existing runs. Does not start a backtest. Hosts without MCP Apps receive a text summary.',
      inputSchema: toolSchema(viewInput),
      outputSchema: toolSchema(summarySchema),
      annotations,
      scopeChallenge: requireScopes('research:read'),
      _meta: {
        ui: { resourceUri: REPORT_URI, visibility: ['model', 'app'] },
        ...oauthSecuritySchemes(['research:read']),
      },
    },
    async (input) => {
      try {
        return result(await loadReport(context, input))
      } catch (error) {
        return failure(error, context.auth)
      }
    },
  )
}
