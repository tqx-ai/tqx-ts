import * as v from 'valibot'

import APIs from '../config/APIs'
import {
  CreateFactorInputSchema,
  FactorAnalysisInputSchema,
  FactorAnalysisSchema,
  FactorSchema,
  parseResearchInput,
  type CreateFactorInput,
  type Factor,
  type FactorAnalysis,
  type FactorAnalysisInput,
  type ListQubeResourcesInput,
  type PollOptions,
  type PollResult,
  type QubePage,
  type UpdateFactorInput,
  UpdateFactorInputSchema,
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
        name: parsed.name,
        period_start: parsed.periodStart,
        period_end: parsed.periodEnd,
        adjustment_cycle: parsed.adjustmentCycle,
        group_number: parsed.groupNumber,
        factor_direction: parsed.factorDirection,
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
}
