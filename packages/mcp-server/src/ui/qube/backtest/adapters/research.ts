import * as v from 'valibot'

import { queryInput, queryResultSchema } from '../../../../research/backtest-report/contract'
import type { Query, QueryResult, Summary } from '../../../../research/backtest-report/contract'
import {
  enforceBudget,
  projectChart,
  projectResult,
  projectRun,
  report,
  UI_BUDGET,
} from '../../../../research/backtest-report/project'

type Action = 'strategy.backtest.get' | 'backtest.chart.get' | 'backtest.result.get'
export type ResearchCall = (
  action: Action,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>
const object = v.record(v.string(), v.unknown())

// Components use report data; only this adapter knows the public Research actions.
export function createResearchQuery(call: ResearchCall, current: () => Summary | undefined) {
  return async (input: Query): Promise<QueryResult> => {
    const query = v.parse(queryInput, input)
    const identity = { schemaVersion: 1 as const, type: query.type, runId: query.runId }
    async function read(action: Action, args: Record<string, unknown>) {
      const result = await call(action, args)
      if (result.isError)
        throw new Error('Report query failed. Retry without starting a new backtest.')
      const data = v.parse(object, result.structuredContent)
      enforceBudget(data, UI_BUDGET)
      if ((action === 'strategy.backtest.get' ? data.id : data.runId) !== query.runId)
        throw new Error('Report response identity mismatch')
      return data
    }
    async function chart(args: Record<string, unknown>) {
      const data = await read('backtest.chart.get', args)
      const result = projectChart(data)
      const maxPoints = Number(args.maxPoints)
      if (result.points.length > maxPoints || (result.benchmark?.points.length ?? 0) > maxPoints)
        throw new Error('Chart exceeds maxPoints')
      return result
    }
    let result: QueryResult
    if (query.operation === 'overview') {
      // Preserve verified frozen display metadata omitted by the public run-state action.
      const previous = current()
      const [state, curve] = await Promise.allSettled([
        read('strategy.backtest.get', { runId: query.runId }),
        chart({ runId: query.runId, maxPoints: 600 }),
      ])
      if (state.status === 'rejected') throw state.reason
      const metadata =
        previous?.runId === query.runId && previous.type === query.type ? previous : undefined
      if (metadata && state.value.resourceId !== metadata.strategyId)
        throw new Error('Report response identity mismatch')
      const summary = projectRun(state.value, new Date().toISOString(), metadata)
      result =
        curve.status === 'fulfilled'
          ? report(summary, curve.value)
          : report(summary, null, {
              code: 'CHART_UNAVAILABLE',
              message: 'Chart unavailable. Refresh or narrow the range.',
            })
    } else if (query.operation === 'chart') {
      result = {
        ...identity,
        operation: 'chart',
        chart: await chart({
          runId: query.runId,
          from: query.from,
          to: query.to,
          maxPoints: query.maxPoints,
        }),
      }
    } else {
      const { type: _type, operation: _operation, ...args } = query
      result = {
        ...identity,
        operation: 'result',
        result: projectResult(await read('backtest.result.get', args), query),
      }
    }
    enforceBudget(result, UI_BUDGET)
    return v.parse(queryResultSchema, result)
  }
}
