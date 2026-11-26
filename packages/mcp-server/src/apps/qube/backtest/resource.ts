import { readFile } from 'node:fs/promises'
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { ProtocolError, ProtocolErrorCode, requireScopes } from '@modelcontextprotocol/server'
import type { AuthInfo, McpServer, Resource } from '@modelcontextprotocol/server'

export const REPORT_URI = 'ui://tqx/qube/backtest/report-v1.html'
export const REPORT_MIME = RESOURCE_MIME_TYPE
export const reportPath = new URL(
  '../../../../dist/apps/qube/backtest/report-v1.html',
  import.meta.url,
)
export const reportResource: Resource = {
  name: 'qube-backtest-report',
  title: 'TQX Qube backtest report',
  uri: REPORT_URI,
  mimeType: REPORT_MIME,
  description: 'Interactive read-only report for a Qube strategy backtest.',
}

export async function readReportHtml() {
  try {
    return await readFile(reportPath, 'utf8')
  } catch {
    throw new Error('Backtest App build missing; run bun run --cwd packages/mcp-server build:ui')
  }
}

export function supportsApps(capabilities: unknown): boolean {
  if (!capabilities || typeof capabilities !== 'object') return false
  const extensions = (capabilities as Record<string, unknown>).extensions
  if (!extensions || typeof extensions !== 'object') return false
  const ui = (extensions as Record<string, unknown>)['io.modelcontextprotocol/ui']
  return (
    !!ui &&
    typeof ui === 'object' &&
    Array.isArray((ui as Record<string, unknown>).mimeTypes) &&
    ((ui as Record<string, unknown>).mimeTypes as unknown[]).includes(REPORT_MIME)
  )
}

export function registerReportResource(server: McpServer, auth?: AuthInfo) {
  server.registerResource(
    reportResource.name,
    REPORT_URI,
    {
      title: reportResource.title,
      mimeType: REPORT_MIME,
      description: reportResource.description,
      scopeChallenge: requireScopes('research:read'),
    },
    async () => {
      if (!auth?.scopes.includes('research:read'))
        throw new ProtocolError(
          ProtocolErrorCode.InvalidRequest,
          'Research resource authorization required',
        )
      try {
        return {
          contents: [
            {
              uri: REPORT_URI,
              mimeType: REPORT_MIME,
              text: await readReportHtml(),
              _meta: {
                ui: {
                  prefersBorder: false,
                  csp: {
                    connectDomains: [],
                    resourceDomains: [],
                    frameDomains: [],
                    baseUriDomains: [],
                  },
                  permissions: {},
                },
              },
            },
          ],
        }
      } catch {
        throw new ProtocolError(ProtocolErrorCode.InternalError, 'Backtest App build unavailable')
      }
    },
  )
}
