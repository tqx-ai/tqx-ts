import * as v from 'valibot'

import APIs from '../config/APIs'
import {
  CreateFactorInputSchema,
  FactorAnalysisInputSchema,
  FactorAnalysisSchema,
  FactorSaveInputSchema,
  FactorSaveSchema,
  FactorSchema,
  FactorStrategyBacktestResponseSchema,
  FactorStrategyInputSchema,
  FactorStrategyResponseSchema,
  FactorVersionSchema,
  parseResearchInput,
  type CreateFactorInput,
  type Factor,
  type FactorAnalysis,
  type FactorAnalysisInput,
  type FactorSave,
  type FactorSaveInput,
  type FactorVersion,
  type FactorStrategyBacktestResponse,
  type FactorStrategyInput,
  type FactorStrategyResponse,
  type ListQubeResourcesInput,
  type PollOptions,
  type PollResult,
  type QubePage,
  type UpdateFactorInput,
  UpdateFactorInputSchema,
  type VersionPatchInput,
  VersionPatchInputSchema,
} from './schemas'
import { listResources, pollResource, resourceId, type ResearchRequest } from './shared'

export class FactorApi {
  readonly #request: ResearchRequest

  constructor(request: ResearchRequest) {
    this.#request = request
  }

  async createFactor(input: CreateFactorInput): Promise<Factor> {
    const parsed = parseResearchInput(CreateFactorInputSchema, input)
    return this.#request(APIs.RESEARCH_FACTORS, {
      schema: FactorSchema,
      method: 'POST',
      body: {
        name: parsed.name,
        description: parsed.description,
        code: parsed.code,
        code_type: parsed.codeType,
        market: parsed.market,
        analysis_params:
          parsed.analysisParams === undefined
            ? undefined
            : toAnalysisParamsBody(parsed.analysisParams),
        source_session_id: parsed.sourceSessionId,
      },
    })
  }

  getFactor(factorId: number): Promise<Factor> {
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}`, {
      schema: FactorSchema,
    })
  }

  async updateFactor(factorId: number, input: UpdateFactorInput): Promise<Factor> {
    const parsed = parseResearchInput(UpdateFactorInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}`, {
      schema: FactorSchema,
      method: 'PATCH',
      body: {
        name: parsed.name,
        description: parsed.description,
        code: parsed.code,
        code_type: parsed.codeType,
        market: parsed.market,
      },
    })
  }

  listFactors(input: ListQubeResourcesInput = {}): Promise<QubePage<Factor>> {
    return listResources(this.#request, APIs.RESEARCH_FACTORS, input, FactorSchema)
  }

  async deleteFactor(factorId: number): Promise<void> {
    await this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}`, {
      schema: v.unknown(),
      method: 'DELETE',
    })
  }

  async createFactorAnalysis(
    factorId: number,
    input: FactorAnalysisInput = {},
  ): Promise<FactorAnalysis> {
    const parsed = parseResearchInput(FactorAnalysisInputSchema, input)
    const id = resourceId(factorId)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${id}/analyses`, {
      schema: FactorAnalysisSchema,
      method: 'POST',
      body: {
        factor_id: Number(id),
        factor_version_id: parsed.factorVersionId,
        name: parsed.name,
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        adjustment_cycle: parsed.adjustmentCycle,
        group_number: parsed.groupNumber,
        factor_direction: parsed.factorDirection,
        stock_pool: parsed.stockPool,
        market_type: parsed.marketType,
      },
    })
  }

  getFactorAnalysis(analysisId: number): Promise<FactorAnalysis> {
    return this.#request(`${APIs.RESEARCH_FACTOR_ANALYSES}/${resourceId(analysisId)}`, {
      schema: FactorAnalysisSchema,
    })
  }

  cancelFactorAnalysis(analysisId: number): Promise<FactorAnalysis> {
    return this.#request(`${APIs.RESEARCH_FACTOR_ANALYSES}/${resourceId(analysisId)}/cancel`, {
      schema: FactorAnalysisSchema,
      method: 'POST',
    })
  }

  pollFactorAnalysis(
    analysisId: number,
    options: PollOptions<FactorAnalysis> = {},
  ): Promise<PollResult<FactorAnalysis>> {
    return pollResource(
      () => this.getFactorAnalysis(analysisId),
      new Set(['done', 'failed', 'cancelled']),
      options,
    )
  }

  listFactorAnalyses(factorId: number, limit = 50): Promise<FactorAnalysis[]> {
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/analyses`, {
      schema: v.array(FactorAnalysisSchema),
      query: { limit },
    })
  }

  listAnalyses(limit = 50): Promise<FactorAnalysis[]> {
    return this.#request(APIs.RESEARCH_FACTOR_ANALYSES, {
      schema: v.array(FactorAnalysisSchema),
      query: { limit },
    })
  }

  async createStrategyFromFactor(
    factorId: number,
    input: FactorStrategyInput = {},
  ): Promise<FactorStrategyResponse> {
    const parsed = parseResearchInput(FactorStrategyInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/strategy`, {
      schema: FactorStrategyResponseSchema,
      method: 'POST',
      body: toFactorStrategyBody(parsed),
    })
  }

  async createStrategyAndBacktestFromFactor(
    factorId: number,
    input: FactorStrategyInput = {},
  ): Promise<FactorStrategyBacktestResponse> {
    const parsed = parseResearchInput(FactorStrategyInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/strategy-backtest`, {
      schema: FactorStrategyBacktestResponseSchema,
      method: 'POST',
      body: toFactorStrategyBody(parsed),
    })
  }

  async saveFactor(factorId: number, input: FactorSaveInput): Promise<FactorSave> {
    const parsed = parseResearchInput(FactorSaveInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/save`, {
      schema: FactorSaveSchema,
      method: 'PUT',
      body: {
        name: parsed.name,
        description: parsed.description,
        code: parsed.code,
        code_type: parsed.codeType,
        market: parsed.market,
        analysis_params: toAnalysisParamsBody(parsed.analysisParams),
        base_version_id: parsed.baseVersionId,
        source_session_id: parsed.sourceSessionId,
        confirm_rebase: parsed.confirmRebase,
      },
    })
  }

  listFactorVersions(factorId: number): Promise<FactorVersion[]> {
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/versions`, {
      schema: v.array(FactorVersionSchema),
    })
  }

  async updateFactorVersion(
    factorId: number,
    versionNumber: number,
    input: VersionPatchInput,
  ): Promise<FactorVersion> {
    const parsed = parseResearchInput(VersionPatchInputSchema, input)
    return this.#request(
      `${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/versions/${resourceId(versionNumber)}`,
      { schema: FactorVersionSchema, method: 'PATCH', body: parsed },
    )
  }

  revertFactorVersion(factorId: number, versionNumber: number): Promise<FactorVersion> {
    return this.#request(
      `${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/versions/${resourceId(versionNumber)}/revert`,
      { schema: FactorVersionSchema, method: 'POST' },
    )
  }
}

function toAnalysisParamsBody(input: {
  periodStart?: string
  periodEnd?: string
  adjustmentCycle?: number
  groupNumber?: number
  factorDirection?: 0 | 1
  stockPool?: string
  marketType?: string
}): Record<string, unknown> {
  return {
    period_start: input.periodStart,
    period_end: input.periodEnd,
    adjustment_cycle: input.adjustmentCycle,
    group_number: input.groupNumber,
    factor_direction: input.factorDirection,
    stock_pool: input.stockPool,
    market_type: input.marketType,
  }
}

function toFactorStrategyBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    period_start: input.periodStart,
    period_end: input.periodEnd,
    init_balance: input.initBalance,
    rebalance_period: input.rebalancePeriod,
    top_n: input.topN,
    stock_pool: input.stockPool,
    factor_direction: input.factorDirection,
    weighting: input.weighting,
    max_position_per_stock: input.maxPositionPerStock,
    take_profit_pct: input.takeProfitPct,
    stop_loss_pct: input.stopLossPct,
    min_holding_days: input.minHoldingDays,
    exclude_st: input.excludeSt,
    rebalance_threshold_buffer: input.rebalanceThresholdBuffer,
    lots_per_symbol: input.lotsPerSymbol,
    strategy_name: input.strategyName,
  }
}
