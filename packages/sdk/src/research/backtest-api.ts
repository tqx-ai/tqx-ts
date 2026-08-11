import APIs from '../config/APIs'
import {
  BacktestVersionPageResponseSchema,
  BacktestSchema,
  BacktestCancelResultSchema,
  type Backtest,
  type BacktestCancelResult,
  type ListQubeResourcesInput,
  ListQubeResourcesInputSchema,
  ListBacktestsInputSchema,
  type ListBacktestsInput,
  type PollOptions,
  type PollResult,
  type QubePage,
  QubePageResponseSchema,
  parseResearchInput,
} from './schemas'
import { listResources, pollResource, resourceId, type ResearchRequest } from './shared'

export class BacktestApi {
  readonly #request: ResearchRequest

  constructor(request: ResearchRequest) {
    this.#request = request
  }

  getBacktest(runId: number): Promise<Backtest> {
    return this.#request(`${APIs.RESEARCH_BACKTESTS}/${resourceId(runId)}`, {
      schema: BacktestSchema,
    })
  }

  cancelBacktest(runId: number): Promise<BacktestCancelResult> {
    return this.#request(`${APIs.RESEARCH_BACKTESTS}/${resourceId(runId)}/cancel`, {
      schema: BacktestCancelResultSchema,
      method: 'POST',
    })
  }

  listBacktests(input: ListQubeResourcesInput = {}): Promise<QubePage<Backtest>> {
    return listResources(this.#request, APIs.RESEARCH_BACKTESTS, input, BacktestSchema)
  }

  async listBacktestPage(input: ListBacktestsInput = {}): Promise<QubePage<Backtest>> {
    const parsed = parseResearchInput(ListBacktestsInputSchema, input)
    const response = await this.#request(`${APIs.RESEARCH_BACKTESTS}/page`, {
      schema: QubePageResponseSchema,
      query: {
        offset: parsed.offset,
        limit: parsed.limit,
        market: parsed.market,
        keyword: parsed.keyword,
        strategy_id: parsed.strategyId,
        strategy_version_id: parsed.strategyVersionId,
        null_version: parsed.nullVersion === undefined ? undefined : String(parsed.nullVersion),
      },
    })
    const rawItems = Array.isArray(response) ? response : (response.items ?? [])
    return {
      items: rawItems.map((item) => parseResearchInput(BacktestSchema, item)),
      hasMore: !Array.isArray(response) && response.has_more === true,
      nextOffset:
        !Array.isArray(response) && typeof response.next_offset === 'number'
          ? response.next_offset
          : null,
    }
  }

  async listBacktestVersionPage(
    input: ListQubeResourcesInput = {},
  ): Promise<QubePage<Record<string, unknown>> & { total: number }> {
    const parsed = parseResearchInput(ListQubeResourcesInputSchema, input)
    const response = await this.#request(`${APIs.RESEARCH_BACKTESTS}/versions/page`, {
      schema: BacktestVersionPageResponseSchema,
      query: {
        offset: parsed.offset,
        limit: parsed.limit,
        market: parsed.market,
        keyword: parsed.keyword,
      },
    })
    return {
      items: response.items ?? [],
      hasMore: response.has_more === true,
      nextOffset: typeof response.next_offset === 'number' ? response.next_offset : null,
      total: response.total ?? 0,
    }
  }

  pollBacktest(runId: number, options: PollOptions<Backtest> = {}): Promise<PollResult<Backtest>> {
    return pollResource(
      () => this.getBacktest(runId),
      new Set(['done', 'failed', 'cancelled']),
      options,
    )
  }
}
