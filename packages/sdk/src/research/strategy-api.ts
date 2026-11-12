import * as v from 'valibot'

import APIs from '../config/APIs'
import {
  BacktestSchema,
  CreateStrategyInputSchema,
  CreateVersionInputSchema,
  FactorVersionSchema,
  ResearchSummarySchema,
  RestoreInputSchema,
  SourceUpdateInputSchema,
  StrategySchema,
  StrategySourceSchema,
  StrategyVersionSchema,
  UpdateStrategyInputSchema,
  ValidateStrategyInputSchema,
  parseResearchInput,
  StrategyBacktestInputSchema,
  ListQubeResourcesInputSchema,
  ListFactorVersionsInputSchema,
  ListStrategyBacktestsInputSchema,
  type ListStrategyBacktestsInput,
  type ListFactorVersionsInput,
  ValidationResultSchema,
  StrategyTuningInputSchema,
  StrategyTuningSchema,
  DeletedResourceSchema,
  type StrategyTuning,
  StrategyTuningApplyInputSchema,
  TuningRerunInputSchema,
  type ListQubeResourcesInput,
  type QubeMarket,
  type Backtest,
  type CreateStrategyInput,
  type CreateVersionInput,
  type ListResearchInput,
  type PollOptions,
  type PollResult,
  type QubePage,
  type RestoreInput,
  type SourceUpdateInput,
  type Strategy,
  type StrategyBacktestInput,
  type StrategyVersion,
  type UpdateStrategyInput,
  type ValidateStrategyInput,
  type StrategyTuningInput,
  type StrategyTuningApplyInput,
  type TuningRerunInput,
} from './schemas'
import {
  backtestBody,
  listResearch,
  listResources,
  originBody,
  pollResource,
  resourceId,
  revisionBody,
  sourceBody,
  strategyTuningBody,
  type ResearchRequest,
} from './shared'

import {
  validateStrategyCode,
  type StrategyValidationOptions,
} from './strategy-validation/validate'

export class StrategyApi {
  readonly #request: ResearchRequest
  constructor(request: ResearchRequest) {
    this.#request = request
  }
  async validateStrategyCode(
    code: string,
    market: QubeMarket | string,
    options?: StrategyValidationOptions,
  ): Promise<void> {
    validateStrategyCode(code, market, options)
  }
  async createStrategy(input: CreateStrategyInput): Promise<Strategy> {
    const parsed = parseResearchInput(CreateStrategyInputSchema, input)
    return this.#request(APIs.RESEARCH_STRATEGIES, {
      schema: StrategySchema,
      method: 'POST',
      body: {
        request_id: parsed.requestId,
        title: parsed.title,
        description: parsed.description ?? '',
        code: parsed.code,
        code_type: 'python',
        market: parsed.market,
        parameters:
          parsed.backtest === undefined ? undefined : { backtest: backtestBody(parsed.backtest) },
        factor_binding:
          parsed.factorBinding === undefined
            ? undefined
            : parsed.factorBinding === null
              ? null
              : {
                  factor_id: parsed.factorBinding.factorId,
                  factor_version_id: parsed.factorBinding.factorVersionId,
                },
        origin: originBody(parsed.origin),
      },
    })
  }
  getStrategy(strategyId: string): Promise<Strategy> {
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}`, {
      schema: StrategySchema,
    })
  }
  getStrategySource(strategyId: string): Promise<Strategy> {
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/source`, {
      schema: StrategySourceSchema,
    })
  }
  async updateStrategy(strategyId: string, input: UpdateStrategyInput): Promise<Strategy> {
    const parsed = parseResearchInput(UpdateStrategyInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}`, {
      schema: StrategySchema,
      method: 'PATCH',
      body: {
        request_id: parsed.requestId,
        base_config_revision: parsed.baseConfigRevision,
        title: parsed.title,
        description: parsed.description,
        parameters:
          parsed.backtest === undefined ? undefined : { backtest: backtestBody(parsed.backtest) },
        factor_binding:
          parsed.factorBinding === undefined
            ? undefined
            : parsed.factorBinding === null
              ? null
              : {
                  factor_id: parsed.factorBinding.factorId,
                  factor_version_id: parsed.factorBinding.factorVersionId,
                },
      },
    })
  }
  updateStrategySource(strategyId: string, input: SourceUpdateInput): Promise<Strategy> {
    const parsed = parseResearchInput(SourceUpdateInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/source`, {
      schema: StrategySourceSchema,
      method: 'PUT',
      body: sourceBody(parsed),
    })
  }
  listStrategies(input: ListQubeResourcesInput = {}): Promise<QubePage<Strategy>> {
    const parsed = parseResearchInput(ListQubeResourcesInputSchema, input)
    return listResources(
      this.#request,
      APIs.RESEARCH_STRATEGIES,
      parsed,
      StrategySchema,
      'strategies',
    )
  }
  async deleteStrategy(strategyId: string): Promise<Record<string, unknown>> {
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}`, {
      schema: DeletedResourceSchema,
      method: 'DELETE',
    })
  }
  validateStrategy(input: ValidateStrategyInput): Promise<Record<string, unknown>> {
    const parsed = parseResearchInput(ValidateStrategyInputSchema, input)
    const body =
      'strategyId' in parsed
        ? {
            strategy_id: parsed.strategyId,
            expected_source_revision: parsed.expectedSourceRevision,
          }
        : { code: parsed.code, market: parsed.market, code_type: 'python' }
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/validate`, {
      schema: ValidationResultSchema,
      method: 'POST',
      body,
    })
  }
  async runStrategyBacktest(strategyId: string, input: StrategyBacktestInput): Promise<Backtest> {
    const parsed = parseResearchInput(StrategyBacktestInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/backtests`, {
      schema: BacktestSchema,
      method: 'POST',
      body: {
        ...revisionBody(parsed),
        parameters:
          parsed.backtest === undefined ? undefined : { backtest: backtestBody(parsed.backtest) },
        origin: originBody(parsed.origin),
      },
    })
  }
  listStrategyBacktests(
    strategyId: string,
    input: ListStrategyBacktestsInput = {},
  ): Promise<{ runs: Backtest[] }> {
    const parsed = parseResearchInput(ListStrategyBacktestsInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/backtests`, {
      schema: v.looseObject({ runs: v.array(BacktestSchema) }),
      query: { limit: parsed.limit },
    })
  }
  getBacktest(runId: string): Promise<Backtest> {
    return this.#request(`${APIs.RESEARCH_BACKTESTS}/${resourceId(runId)}`, {
      schema: BacktestSchema,
    })
  }
  cancelBacktest(runId: string): Promise<Backtest> {
    return this.#request(`${APIs.RESEARCH_BACKTESTS}/${resourceId(runId)}/cancel`, {
      schema: BacktestSchema,
      method: 'POST',
    })
  }
  listBacktests(input: ListResearchInput = {}): Promise<QubePage<Record<string, unknown>>> {
    return listResearch(
      this.#request,
      APIs.RESEARCH_BACKTESTS,
      input,
      ResearchSummarySchema,
      'runs',
      'strategy',
    )
  }
  pollBacktest(runId: string, options: PollOptions<Backtest> = {}): Promise<PollResult<Backtest>> {
    return pollResource(
      () => this.getBacktest(runId) as Promise<Backtest & { status: string }>,
      new Set(['succeeded', 'failed', 'cancelled']),
      options,
    )
  }
  listStrategyVersions(strategyId: string): Promise<StrategyVersion[]> {
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/versions`, {
      schema: v.looseObject({ versions: v.array(StrategyVersionSchema) }),
    }).then((value) => value.versions)
  }
  getStrategyVersion(versionId: string): Promise<StrategyVersion> {
    return this.#request(`${APIs.RESEARCH_STRATEGY_VERSIONS}/${resourceId(versionId)}`, {
      schema: StrategyVersionSchema,
    })
  }
  async createStrategyVersion(
    strategyId: string,
    input: CreateVersionInput,
  ): Promise<StrategyVersion> {
    const parsed = parseResearchInput(CreateVersionInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/versions`, {
      schema: StrategyVersionSchema,
      method: 'POST',
      body: {
        request_id: parsed.requestId,
        run_id: parsed.runId,
        name: parsed.name,
        description: parsed.description ?? '',
      },
    })
  }
  restoreStrategyVersion(
    strategyId: string,
    versionId: string,
    input: RestoreInput,
  ): Promise<Strategy> {
    return this.#request(
      `${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/versions/${resourceId(versionId)}/restore`,
      {
        schema: v.looseObject({ strategy: StrategySchema }),
        method: 'POST',
        body: revisionBody(parseResearchInput(RestoreInputSchema, input)),
      },
    ).then((value) => value.strategy)
  }
  restoreBacktest(strategyId: string, runId: string, input: RestoreInput): Promise<Strategy> {
    return this.#request(
      `${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/backtests/${resourceId(runId)}/restore`,
      {
        schema: v.looseObject({ strategy: StrategySchema }),
        method: 'POST',
        body: revisionBody(parseResearchInput(RestoreInputSchema, input)),
      },
    ).then((value) => value.strategy)
  }
  listFactorVersionsForStrategy(
    input: ListFactorVersionsInput = { market: 'hk' },
  ): Promise<QubePage<Record<string, unknown>>> {
    const parsed = parseResearchInput(ListFactorVersionsInputSchema, input)
    return listResources(
      this.#request,
      APIs.RESEARCH_FACTOR_VERSIONS,
      { limit: parsed.limit, cursor: parsed.cursor, market: parsed.market, keyword: parsed.query },
      FactorVersionSchema,
      'versions',
      { factor_id: parsed.factorId },
    )
  }
  listStrategyTunings(strategyId: string): Promise<StrategyTuning[]> {
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/tunings`, {
      schema: v.looseObject({ tunings: v.array(StrategyTuningSchema) }),
    }).then((value) => value.tunings)
  }
  async createStrategyTuning(
    strategyId: string,
    input: StrategyTuningInput,
  ): Promise<StrategyTuning> {
    const parsed = parseResearchInput(StrategyTuningInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGIES}/${resourceId(strategyId)}/tunings`, {
      schema: StrategyTuningSchema,
      method: 'POST',
      body: strategyTuningBody(parsed),
    })
  }
  getStrategyTuning(tuningId: string): Promise<StrategyTuning> {
    return this.#request(`${APIs.RESEARCH_STRATEGY_TUNINGS}/${resourceId(tuningId)}`, {
      schema: StrategyTuningSchema,
    })
  }
  cancelStrategyTuning(tuningId: string): Promise<StrategyTuning> {
    return this.#request(`${APIs.RESEARCH_STRATEGY_TUNINGS}/${resourceId(tuningId)}/cancel`, {
      schema: StrategyTuningSchema,
      method: 'POST',
    })
  }
  async rerunStrategyTuning(tuningId: string, input: TuningRerunInput): Promise<StrategyTuning> {
    const parsed = parseResearchInput(TuningRerunInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGY_TUNINGS}/${resourceId(tuningId)}/rerun`, {
      schema: StrategyTuningSchema,
      method: 'POST',
      body: { request_id: parsed.requestId },
    })
  }
  async applyStrategyTuning(tuningId: string, input: StrategyTuningApplyInput) {
    const parsed = parseResearchInput(StrategyTuningApplyInputSchema, input)
    return this.#request(`${APIs.RESEARCH_STRATEGY_TUNINGS}/${resourceId(tuningId)}/apply`, {
      schema: v.looseObject({ tuning: StrategyTuningSchema, strategy: StrategySchema }),
      method: 'POST',
      body: {
        request_id: parsed.requestId,
        candidate_id: parsed.candidateId,
        expected_source_revision: parsed.expectedSourceRevision,
        expected_config_revision: parsed.expectedConfigRevision,
      },
    })
  }
  listStrategyTuningSummaries(
    input: ListResearchInput = {},
  ): Promise<QubePage<Record<string, unknown>>> {
    return listResearch(
      this.#request,
      APIs.RESEARCH_STRATEGY_TUNINGS,
      input,
      ResearchSummarySchema,
      'tunings',
      'strategy',
    )
  }
  listStrategyVersionSummaries(
    input: ListResearchInput = {},
  ): Promise<QubePage<Record<string, unknown>>> {
    return listResearch(
      this.#request,
      APIs.RESEARCH_STRATEGY_VERSIONS,
      input,
      ResearchSummarySchema,
      'versions',
      'strategy',
    )
  }
}
