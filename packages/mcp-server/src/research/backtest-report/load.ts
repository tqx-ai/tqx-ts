import type { AuthInfo } from '@modelcontextprotocol/server'

import { ResearchError, researchError } from '../errors'
import type { ResearchGateway } from '../gateway'
import { readBacktest, readBacktestChart, readBacktestResult } from '../backtests'
import { projectChart, projectResult, projectRun, report } from './project'
import type { Identity, Query, QueryResult, Report } from './contract'

export interface ReportContext {
  auth?: AuthInfo
  gateway: ResearchGateway
  now?: () => number
}
export const UI_BUDGET = 524_288
export function enforceBudget(value: unknown, limit: number) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > limit)
    throw new ResearchError(
      'RESULT_TOO_LARGE',
      'Backtest report exceeds the output limit; reduce the page or range',
    )
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
    readBacktestChart(read, { runId: input.runId, maxPoints: 600 }).then(projectChart),
  ])
  if (run.status === 'rejected') throw run.reason
  const summary = projectRun(run.value, new Date((context.now ?? Date.now)()).toISOString())
  let chart = null
  try {
    if (curve.status === 'rejected') throw curve.reason
    enforceBudget(curve.value, UI_BUDGET - 16_384)
    chart = curve.value
    summary.sections.chart = { state: chart.points.length ? 'ready' : 'empty' }
    if (chart.sampled)
      summary.warnings.push('Curve is sampled; inspection snaps to returned samples.')
    if (chart.partial || chart.complete !== true)
      summary.warnings.push('Chart completeness is not confirmed; available data may be partial.')
  } catch (error) {
    const safe = researchError(error)
    summary.sections.chart = { state: 'error', code: safe.code, message: safe.message }
    summary.warnings.push(
      'Chart unavailable. Metrics remain available; refresh or narrow the range.',
    )
  }
  enforceBudget(summary, 16_384)
  const result = report(summary, chart)
  enforceBudget(result, UI_BUDGET)
  return result
}

export async function loadQuery(context: ReportContext, input: Query): Promise<QueryResult> {
  if (input.operation === 'overview') return loadReport(context, input)
  const read = request(context)
  // Recheck the requested run on every query; never rely on a previously opened card.
  await readBacktest(read, input.runId)
  const identity = { schemaVersion: 1 as const, type: input.type, runId: input.runId }
  const result: QueryResult =
    input.operation === 'chart'
      ? {
          ...identity,
          operation: 'chart',
          chart: projectChart(await readBacktestChart(read, input)),
        }
      : {
          ...identity,
          operation: 'result',
          result: projectResult(await readBacktestResult(read, input), input),
        }
  enforceBudget(result, UI_BUDGET)
  return result
}
