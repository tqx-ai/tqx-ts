import * as v from 'valibot'

import APIs from '../config/APIs'
import {
  BacktestParametersSchema,
  BacktestSchema,
  CreateStrategyInputSchema,
  parseResearchInput,
  type Backtest,
  type BacktestParameters,
  type CreateStrategyInput,
  type ListQubeResourcesInput,
  type QubePage,
  type Strategy,
  StrategySchema,
  type UpdateStrategyInput,
  UpdateStrategyInputSchema,
} from './schemas'
import { listResources, resourceId, type ResearchRequest } from './shared'

export class StrategyApi {
  readonly #request: ResearchRequest

  constructor(request: ResearchRequest) {
    this.#request = request
  }

  async createStrategy(input: CreateStrategyInput): Promise<Strategy> {
    const parsed = parseResearchInput(CreateStrategyInputSchema, input)
    return this.#request(APIs.RESEARCH_STRATEGIES, {
      schema: StrategySchema,
      method: 'POST',
      body: {
        name: parsed.name,
        description: parsed.description,
        code: parsed.code,
        market: parsed.market,
        params:
          parsed.backtest === undefined ? undefined : { backtest: toBacktestBody(parsed.backtest) },
      },
    })
  }

  getStrategy(strategyId: number): Promise<Strategy> {
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}`, {
      schema: StrategySchema,
    })
  }

  async updateStrategy(strategyId: number, input: UpdateStrategyInput): Promise<Strategy> {
    const parsed = parseResearchInput(UpdateStrategyInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}`, {
      schema: StrategySchema,
      method: 'PATCH',
      body: {
        name: parsed.name,
        description: parsed.description,
        code: parsed.code,
        market: parsed.market,
        version_summary: parsed.versionSummary,
        params:
          parsed.backtest === undefined ? undefined : { backtest: toBacktestBody(parsed.backtest) },
      },
    })
  }

  listStrategies(input: ListQubeResourcesInput = {}): Promise<QubePage<Strategy>> {
    return listResources(this.#request, APIs.RESEARCH_STRATEGIES, input, StrategySchema)
  }

  async deleteStrategy(strategyId: number): Promise<void> {
    await this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}`, {
      schema: v.unknown(),
      method: 'DELETE',
    })
  }

  async runStrategyBacktest(strategyId: number, input: BacktestParameters = {}): Promise<Backtest> {
    const parsed = parseResearchInput(BacktestParametersSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/run-backtest`, {
      schema: BacktestSchema,
      method: 'POST',
      body: toBacktestBody(parsed),
    })
  }
}

function toBacktestBody(input: BacktestParameters): Record<string, unknown> {
  return {
    period_start: input.periodStart,
    period_end: input.periodEnd,
    init_balance: input.initBalance,
    commission_rate: input.commissionRate,
    slippage: input.slippage,
    frequency: input.frequency,
    symbols: input.symbols,
  }
}
