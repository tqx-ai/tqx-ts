import type { AuthInfo } from '@modelcontextprotocol/server'

import { ResearchError, researchError } from '../errors'
import type { ResearchGateway } from '../gateway'
import { readBacktest, readBacktestChart } from '../backtests'
import * as p from '../projections'
import { projectChart, projectRun, report } from './project'
import type { Identity, Report } from './contract'

export interface ReportContext {
  webBaseUrl?: string
  auth?: AuthInfo
  gateway: ResearchGateway
  now?: () => number
}
function request(context: ReportContext) {
  const auth = context.auth
  if (!auth?.scopes.includes('research:read'))
    throw new ResearchError('AUTHORIZATION_REQUIRED', 'Research action authorization required')
  return (input: Parameters<ResearchGateway['request']>[2]) =>
    context.gateway.request(auth, 'research:read', input)
}

export async function loadReport(context: ReportContext, input: Identity): Promise<Report> {
  const read = request(context)
  const [run, curve] = await Promise.allSettled([
    readBacktest(read, input.runId),
    readBacktestChart(read, { runId: input.runId, maxPoints: 600 }).then((raw) =>
      projectChart(p.chart(raw)),
    ),
  ])
  if (run.status === 'rejected') throw run.reason
  const summary = projectRun(
    p.run(run.value, 'strategy'),
    new Date((context.now ?? Date.now)()).toISOString(),
    run.value,
  )
  return {
    ...(curve.status === 'fulfilled'
      ? report(summary, curve.value)
      : report(summary, null, researchError(curve.reason))),
    strategyUrl: new URL(
      `/qube/strategies/${encodeURIComponent(summary.strategyId)}`,
      context.webBaseUrl ?? 'https://www.tqx.ai',
    ).href,
  }
}
