import APIs from '../config/APIs'
import { ResearchError } from './errors'
import { array, object, type ResearchRequest } from './gateway'

type Request = (input: ResearchRequest) => Promise<Record<string, unknown>>

export async function readBacktest(request: Request, runId: string) {
  const raw = await request({ path: `${APIs.RESEARCH_BACKTESTS}/${runId}` })
  if (raw.id !== runId)
    throw new ResearchError('INVALID_RESPONSE', 'Research response identity mismatch')
  return raw
}

export async function readBacktestChart(
  request: Request,
  input: { runId: string; from?: string; to?: string; maxPoints: number },
) {
  const raw = await request({
    path: `${APIs.RESEARCH_BACKTESTS}/${input.runId}/chart`,
    query: { from: input.from, to: input.to, max_points: input.maxPoints },
  })
  if (raw.run_id !== input.runId)
    throw new ResearchError('INVALID_RESPONSE', 'Research response identity mismatch')
  if (
    array(raw.points).length > input.maxPoints ||
    (raw.benchmark !== undefined && array(object(raw.benchmark).points).length > input.maxPoints)
  )
    throw new ResearchError('INVALID_RESPONSE', 'Chart exceeds maxPoints')
  return raw
}

export function readBacktestResult(
  request: Request,
  input: {
    runId: string
    field: string
    offset: number
    limit: number
    keyword?: string
    symbol?: string
  },
) {
  return request({
    path: `${APIs.RESEARCH_BACKTESTS}/${input.runId}/result`,
    query: {
      field: input.field,
      offset: input.offset,
      limit: input.limit,
      q: input.keyword,
      symbol: input.symbol,
    },
  })
}
