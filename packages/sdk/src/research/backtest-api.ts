import * as v from 'valibot'
import APIs from '../config/APIs'
import {
  ResultPageInputSchema,
  ResultPageSchema,
  ChartInputSchema,
  BacktestChartSchema,
  BacktestSymbolKlinesSchema,
  parseResearchInput,
  type ResultPageInput,
  type ChartInput,
} from './schemas'
import { resourceId, type ResearchRequest } from './shared'

export class BacktestApi {
  readonly #request: ResearchRequest
  constructor(request: ResearchRequest) {
    this.#request = request
  }
  getBacktestResultPage(runId: string, input: ResultPageInput) {
    const parsed = parseResearchInput(ResultPageInputSchema, input)
    return this.#request(`${APIs.RESEARCH_BACKTESTS}/${resourceId(runId)}/result`, {
      schema: ResultPageSchema,
      query: {
        field: parsed.field,
        offset: parsed.offset,
        limit: parsed.limit,
        q: parsed.keyword,
        symbol: parsed.symbol,
      },
    })
  }
  getBacktestChart(runId: string, input: ChartInput = {}) {
    const parsed = parseResearchInput(ChartInputSchema, input)
    return this.#request(`${APIs.RESEARCH_BACKTESTS}/${resourceId(runId)}/chart`, {
      schema: BacktestChartSchema,
      query: { from: parsed.from, to: parsed.to, max_points: parsed.maxPoints },
    })
  }
  getBacktestSymbolKlines(runId: string, symbol: string) {
    const parsed = parseResearchInput(v.pipe(v.string(), v.minLength(1), v.maxLength(64)), symbol)
    return this.#request(`${APIs.RESEARCH_BACKTESTS}/${resourceId(runId)}/symbol-klines`, {
      schema: BacktestSymbolKlinesSchema,
      query: { symbol: parsed },
    })
  }
}
