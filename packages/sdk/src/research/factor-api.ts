import * as v from 'valibot'

import APIs from '../config/APIs'
import {
  CreateVersionInputSchema,
  CreateFactorInputSchema,
  FactorAnalysisInputSchema,
  FactorAnalysisSchema,
  FactorAnalysisSubmissionSchema,
  FactorSchema,
  FactorSourceSchema,
  FactorVersionSchema,
  FactorTuningInputSchema,
  FactorTuningApplyInputSchema,
  TuningRerunInputSchema,
  FactorSnapshotInputSchema,
  FactorSnapshotSchema,
  FactorTuningSchema,
  type FactorSnapshot,
  type FactorTuning,
  ListFactorsInputSchema,
  ResearchSummarySchema,
  RestoreInputSchema,
  ValidationResultSchema,
  SourceUpdateInputSchema,
  UpdateFactorInputSchema,
  ValidateFactorInputSchema,
  parseResearchInput,
  type CreateFactorInput,
  type Factor,
  type FactorAnalysis,
  type FactorAnalysisInput,
  type FactorAnalysisSubmission,
  type FactorVersion,
  type ListFactorsInput,
  type ListResearchInput,
  type PollOptions,
  type PollResult,
  type QubePage,
  type RestoreInput,
  type SourceUpdateInput,
  type UpdateFactorInput,
  type ValidateFactorInput,
  type FactorTuningInput,
  type FactorTuningApplyInput,
  type TuningRerunInput,
  type FactorSnapshotInput,
} from './schemas'
import {
  analysisBody,
  listResources,
  listResearch,
  originBody,
  pollResource,
  resourceId,
  sourceBody,
  type ResearchRequest,
  revisionBody,
  factorTuningBody,
} from './shared'

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
        request_id: parsed.requestId,
        title: parsed.title,
        description: parsed.description ?? '',
        code: parsed.code,
        code_type: parsed.codeType,
        market: parsed.market,
        origin: originBody(parsed.origin),
      },
    })
  }
  getFactor(factorId: string): Promise<Factor> {
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}`, {
      schema: FactorSchema,
    })
  }
  getFactorSource(factorId: string): Promise<Factor> {
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/source`, {
      schema: FactorSourceSchema,
    })
  }
  async updateFactor(factorId: string, input: UpdateFactorInput): Promise<Factor> {
    const parsed = parseResearchInput(UpdateFactorInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}`, {
      schema: FactorSchema,
      method: 'PATCH',
      body: {
        base_config_revision: parsed.baseConfigRevision,
        title: parsed.title,
        description: parsed.description,
        parameters: analysisBody(parsed.parameters),
      },
    })
  }
  async updateFactorSource(factorId: string, input: SourceUpdateInput): Promise<Factor> {
    const parsed = parseResearchInput(SourceUpdateInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/source`, {
      schema: FactorSourceSchema,
      method: 'PUT',
      body: sourceBody(parsed),
    })
  }
  listFactors(input: ListFactorsInput = {}): Promise<QubePage<Factor>> {
    const parsed = parseResearchInput(ListFactorsInputSchema, input)
    return listResources(
      this.#request,
      APIs.RESEARCH_FACTORS,
      {
        limit: parsed.limit,
        cursor: parsed.cursor,
        market: parsed.market,
        keyword: parsed.keyword,
      },
      FactorSchema,
      'factors',
      { bindable_only: parsed.bindableOnly === true ? 'true' : undefined },
    )
  }
  async deleteFactor(factorId: string): Promise<Factor> {
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}`, {
      schema: FactorSchema,
      method: 'DELETE',
    })
  }
  async validateFactor(input: ValidateFactorInput): Promise<Record<string, unknown>> {
    const parsed = parseResearchInput(ValidateFactorInputSchema, input)
    const body =
      'factorId' in parsed
        ? { factor_id: parsed.factorId, expected_source_revision: parsed.expectedSourceRevision }
        : { code: parsed.code, market: parsed.market, code_type: parsed.codeType }
    return this.#request(`${APIs.RESEARCH_FACTORS}/validate`, {
      schema: ValidationResultSchema,
      method: 'POST',
      body,
    })
  }
  async createFactorAnalysis(
    factorId: string,
    input: FactorAnalysisInput,
  ): Promise<FactorAnalysisSubmission> {
    const parsed = parseResearchInput(FactorAnalysisInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/analyses`, {
      schema: FactorAnalysisSubmissionSchema,
      method: 'POST',
      body: {
        ...revisionBody(parsed),
        parameters: analysisBody(parsed.parameters),
        origin: originBody(parsed.origin),
      },
    })
  }
  getFactorAnalysis(analysisId: string): Promise<FactorAnalysis> {
    return this.#request(`${APIs.RESEARCH_FACTOR_ANALYSES}/${resourceId(analysisId)}`, {
      schema: FactorAnalysisSchema,
    })
  }
  cancelFactorAnalysis(analysisId: string): Promise<FactorAnalysis> {
    return this.#request(`${APIs.RESEARCH_FACTOR_ANALYSES}/${resourceId(analysisId)}/cancel`, {
      schema: FactorAnalysisSchema,
      method: 'POST',
    })
  }
  listFactorAnalyses(
    factorId: string,
    input: Omit<ListResearchInput, 'strategyId' | 'factorId'> = {},
  ): Promise<QubePage<Record<string, unknown>>> {
    return listResearch(
      this.#request,
      APIs.RESEARCH_FACTOR_ANALYSES,
      { ...input, factorId },
      ResearchSummarySchema,
      'runs',
      'factor',
    )
  }
  listAnalyses(input: ListResearchInput = {}): Promise<QubePage<Record<string, unknown>>> {
    return listResearch(
      this.#request,
      APIs.RESEARCH_FACTOR_ANALYSES,
      input,
      ResearchSummarySchema,
      'runs',
      'factor',
    )
  }
  listFactorSnapshots(factorId: string): Promise<FactorSnapshot[]> {
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/analysis-snapshots`, {
      schema: v.looseObject({ snapshots: v.array(FactorSnapshotSchema) }),
    }).then((value) => value.snapshots)
  }
  async createFactorSnapshot(
    factorId: string,
    input: FactorSnapshotInput,
  ): Promise<FactorSnapshot> {
    const parsed = parseResearchInput(FactorSnapshotInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/analysis-snapshots`, {
      schema: FactorSnapshotSchema,
      method: 'POST',
      body: { run_id: parsed.runId, name: parsed.name },
    })
  }
  listFactorTunings(factorId: string): Promise<FactorTuning[]> {
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/tunings`, {
      schema: v.looseObject({ tunings: v.array(FactorTuningSchema) }),
    }).then((value) => value.tunings)
  }
  async createFactorTuning(factorId: string, input: FactorTuningInput): Promise<FactorTuning> {
    const parsed = parseResearchInput(FactorTuningInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/tunings`, {
      schema: FactorTuningSchema,
      method: 'POST',
      body: factorTuningBody(parsed),
    })
  }
  getFactorTuning(tuningId: string): Promise<FactorTuning> {
    return this.#request(`${APIs.RESEARCH_FACTOR_TUNINGS}/${resourceId(tuningId)}`, {
      schema: FactorTuningSchema,
    })
  }
  cancelFactorTuning(tuningId: string): Promise<FactorTuning> {
    return this.#request(`${APIs.RESEARCH_FACTOR_TUNINGS}/${resourceId(tuningId)}/cancel`, {
      schema: FactorTuningSchema,
      method: 'POST',
    })
  }
  async rerunFactorTuning(tuningId: string, input: TuningRerunInput): Promise<FactorTuning> {
    const parsed = parseResearchInput(TuningRerunInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTOR_TUNINGS}/${resourceId(tuningId)}/rerun`, {
      schema: FactorTuningSchema,
      method: 'POST',
      body: { request_id: parsed.requestId },
    })
  }
  async applyFactorTuning(tuningId: string, input: FactorTuningApplyInput) {
    const parsed = parseResearchInput(FactorTuningApplyInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTOR_TUNINGS}/${resourceId(tuningId)}/apply`, {
      schema: v.looseObject({ tuning: FactorTuningSchema, factor: FactorSchema }),
      method: 'POST',
      body: {
        request_id: parsed.requestId,
        trial_id: parsed.trialId,
        expected_source_revision: parsed.expectedSourceRevision,
        expected_config_revision: parsed.expectedConfigRevision,
      },
    })
  }
  listFactorTuningSummaries(
    input: ListResearchInput = {},
  ): Promise<QubePage<Record<string, unknown>>> {
    return listResearch(
      this.#request,
      APIs.RESEARCH_FACTOR_TUNINGS,
      input,
      ResearchSummarySchema,
      'tunings',
      'factor',
    )
  }
  listFactorVersions(factorId: string): Promise<FactorVersion[]> {
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/versions`, {
      schema: v.looseObject({ versions: v.array(FactorVersionSchema) }),
    }).then((value) => value.versions)
  }
  getFactorVersion(versionId: string): Promise<FactorVersion> {
    return this.#request(`${APIs.RESEARCH_FACTOR_VERSIONS}/${resourceId(versionId)}`, {
      schema: FactorVersionSchema,
    })
  }
  async createFactorVersion(
    factorId: string,
    input: { requestId: string; runId: string; name: string; description?: string },
  ): Promise<FactorVersion> {
    const body = parseResearchInput(CreateVersionInputSchema, input)
    return this.#request(`${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/versions`, {
      schema: FactorVersionSchema,
      method: 'POST',
      body: {
        request_id: body.requestId,
        run_id: body.runId,
        name: body.name,
        description: body.description ?? '',
      },
    })
  }
  restoreFactorVersion(factorId: string, versionId: string, input: RestoreInput): Promise<Factor> {
    return this.#request(
      `${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/versions/${resourceId(versionId)}/restore`,
      {
        schema: v.looseObject({ factor: FactorSchema }),
        method: 'POST',
        body: revisionBody(parseResearchInput(RestoreInputSchema, input)),
      },
    ).then((value) => value.factor)
  }
  restoreFactorAnalysis(factorId: string, runId: string, input: RestoreInput): Promise<Factor> {
    return this.#request(
      `${APIs.RESEARCH_FACTORS}/${resourceId(factorId)}/analyses/${resourceId(runId)}/restore`,
      {
        schema: v.looseObject({ factor: FactorSchema }),
        method: 'POST',
        body: revisionBody(parseResearchInput(RestoreInputSchema, input)),
      },
    ).then((value) => value.factor)
  }
  pollFactorAnalysis(
    analysisId: string,
    options: PollOptions<FactorAnalysis> = {},
  ): Promise<PollResult<FactorAnalysis>> {
    return pollResource(
      () => this.getFactorAnalysis(analysisId),
      new Set(['succeeded', 'failed', 'cancelled']),
      options,
    )
  }
}
