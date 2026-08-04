import APIs from '../config/APIs'
import {
  BacktestSchema,
  type Backtest,
  type ListQubeResourcesInput,
  type PollOptions,
  type PollResult,
  type QubePage,
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

  cancelBacktest(runId: number): Promise<Backtest> {
    return this.#request(`${APIs.RESEARCH_BACKTESTS}/${resourceId(runId)}/cancel`, {
      schema: BacktestSchema,
      method: 'POST',
    })
  }

  listBacktests(input: ListQubeResourcesInput = {}): Promise<QubePage<Backtest>> {
    return listResources(this.#request, APIs.RESEARCH_BACKTESTS, input, BacktestSchema)
  }

  pollBacktest(runId: number, options: PollOptions<Backtest> = {}): Promise<PollResult<Backtest>> {
    return pollResource(
      () => this.getBacktest(runId),
      new Set(['done', 'failed', 'cancelled']),
      options,
    )
  }
}
