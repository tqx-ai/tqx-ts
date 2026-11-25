import { requireScopes } from '@modelcontextprotocol/server'
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'

import { toolSchema } from '../../../utils/tool-schema'
import { toolIcons } from '../../../utils/icons'
import { researchError } from '../../../research/errors'
import { loadReport, loadQuery, type ReportContext } from '../../../research/backtest-report/load'
import {
  REPORT_META,
  viewInput,
  queryInput,
  summarySchema,
  receiptSchema,
} from '../../../research/backtest-report/contract'
import type { QueryResult } from '../../../research/backtest-report/contract'
import { REPORT_URI } from './resource'

function result(data: QueryResult): CallToolResult {
  const summary =
    data.operation === 'overview'
      ? data.summary
      : {
          schemaVersion: data.schemaVersion,
          type: data.type,
          runId: data.runId,
          operation: data.operation,
        }
  return {
    structuredContent: summary,
    content: [{ type: 'text', text: JSON.stringify(summary) }],
    _meta: { [REPORT_META]: data },
  }
}
function failure(error: unknown): CallToolResult {
  const output = { error: researchError(error) }
  return {
    isError: true,
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
    'tqx_backtest_view',
    {
      title: 'Qube backtest report',
      icons: toolIcons.tqx_research_call,
      description:
        'Show a read-only backtest report. Only TQX Qube is supported: pass type="qube". After a user-requested Qube backtest reaches status=succeeded, call this automatically unless the user requested text only. Use the submission response id as runId; do not ask the user for the type, ID, or another request to show results. Also reopens existing runs. Does not start a backtest. Hosts without MCP Apps receive a text summary.',
      inputSchema: toolSchema(viewInput),
      outputSchema: toolSchema(summarySchema),
      annotations,
      scopeChallenge: requireScopes('research:read'),
      _meta: { ui: { resourceUri: REPORT_URI, visibility: ['model', 'app'] } },
    },
    async (input) => {
      try {
        return result(await loadReport(context, input))
      } catch (error) {
        return failure(error)
      }
    },
  )
  server.registerTool(
    'tqx_backtest_view_query',
    {
      title: 'Query Qube backtest report',
      description:
        'Read the current Qube report overview, chart window, or one bounded result page. App-only; read-only. Pass type="qube" and the current report runId.',
      inputSchema: toolSchema(queryInput),
      outputSchema: toolSchema(receiptSchema),
      annotations,
      scopeChallenge: requireScopes('research:read'),
      _meta: { ui: { visibility: ['app'] } },
    },
    async (input) => {
      try {
        const data = await loadQuery(context, input)
        const receipt = {
          schemaVersion: data.schemaVersion,
          type: data.type,
          runId: data.runId,
          operation: data.operation,
        }
        return {
          structuredContent: receipt,
          content: [{ type: 'text', text: JSON.stringify(receipt) }],
          _meta: { [REPORT_META]: data },
        }
      } catch (error) {
        return failure(error)
      }
    },
  )
}
