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
  type QubeMarket,
  type Strategy,
  type StrategyBacktestParams,
  type StrategySave,
  type StrategySaveInput,
  type StrategyVersion,
  StrategySchema,
  StrategyBacktestParamsSchema,
  StrategySaveInputSchema,
  StrategySaveSchema,
  StrategyVersionSchema,
  type UpdateStrategyInput,
  UpdateStrategyInputSchema,
  type VersionPatchInput,
  VersionPatchInputSchema,
} from './schemas'
import {
  type StrategyValidationOptions,
  validateStrategyCode,
} from './strategy-validation/validate'
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
        params: mergeBacktestParams(parsed.params, parsed.backtest),
      },
    })
  }

  async validateStrategyCode(
    code: string,
    market: QubeMarket | string,
    options?: StrategyValidationOptions,
  ): Promise<void> {
    validateStrategyCode(code, market, options)
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
        params: mergeBacktestParams(parsed.params, parsed.backtest),
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

  getStrategyBacktestParameters(strategyId: number): Promise<StrategyBacktestParams> {
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/backtest-params`, {
      schema: StrategyBacktestParamsSchema,
    })
  }

  async saveStrategyBacktestParameters(
    strategyId: number,
    input: BacktestParameters,
  ): Promise<StrategyBacktestParams> {
    const parsed = parseResearchInput(BacktestParametersSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/backtest-params`, {
      schema: StrategyBacktestParamsSchema,
      method: 'PUT',
      body: toBacktestBody(parsed),
    })
  }

  async saveStrategy(strategyId: number, input: StrategySaveInput): Promise<StrategySave> {
    const parsed = parseResearchInput(StrategySaveInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/save`, {
      schema: StrategySaveSchema,
      method: 'PUT',
      body: {
        code: parsed.code,
        name: parsed.name,
        description: parsed.description,
        base_version_id: parsed.baseVersionId,
        confirm_rebase: parsed.confirmRebase,
        backtest_params:
          parsed.backtest === undefined ? undefined : toBacktestBody(parsed.backtest),
      },
    })
  }

  listStrategyVersions(strategyId: number): Promise<StrategyVersion[]> {
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/versions`, {
      schema: v.array(StrategyVersionSchema),
    })
  }

  getStrategyVersion(strategyId: number, versionNumber: number): Promise<StrategyVersion> {
    return this.#request(
      `${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/versions/${resourceId(versionNumber)}`,
      { schema: StrategyVersionSchema },
    )
  }

  revertStrategyVersion(strategyId: number, versionNumber: number): Promise<StrategyVersion> {
    return this.#request(
      `${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/versions/${resourceId(versionNumber)}/revert`,
      { schema: StrategyVersionSchema, method: 'POST' },
    )
  }

  async updateStrategyVersion(
    strategyId: number,
    versionNumber: number,
    input: VersionPatchInput,
  ): Promise<StrategyVersion> {
    const parsed = parseResearchInput(VersionPatchInputSchema, input)
    return this.#request(
      `${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/versions/${resourceId(versionNumber)}`,
      { schema: StrategyVersionSchema, method: 'PATCH', body: parsed },
    )
  }

  runStrategyVersionBacktest(versionId: number): Promise<Backtest> {
    return this.#request(`${APIs.RESEARCH_STRATEGY_VERSIONS}/${resourceId(versionId)}/backtests`, {
      schema: BacktestSchema,
      method: 'POST',
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
    standard_symbol: input.standardSymbol,
    margin_rate: input.marginRate,
    matching_type: input.matchingType,
  }
}

function mergeBacktestParams(
  params: Record<string, unknown> | undefined,
  backtest: BacktestParameters | undefined,
): Record<string, unknown> | undefined {
  if (params === undefined && backtest === undefined) return undefined
  return {
    ...params,
    ...(backtest === undefined ? {} : { backtest: toBacktestBody(backtest) }),
  }
}
