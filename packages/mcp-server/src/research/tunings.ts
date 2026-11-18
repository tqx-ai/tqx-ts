import * as v from 'valibot'

import APIs from '../config/APIs'
import type { Action } from './actions'
import { ResearchError } from './errors'
import { array, object } from './gateway'
import * as p from './projections'
import * as s from './schemas'

const parameterName = v.pipe(v.string(), v.regex(/^[A-Za-z][A-Za-z0-9_]{0,127}$/))
const numericParameters = v.record(parameterName, s.finite)
const candidateParameters = v.strictObject({
  adjustmentCycle: v.optional(v.picklist([1, 3, 5, 10, 20, 30])),
  groupNumber: v.optional(v.picklist([3, 5, 10, 20])),
  factorDirection: v.optional(v.picklist([1, -1])),
  stockPool: v.optional(
    v.picklist(['all', 'HSI.HK', 'HSCE.HK', 'HSTECH.HK', 'SPX', 'IXIC', 'NDX', 'DJI']),
  ),
})
const factorCandidate = v.pipe(
  v.strictObject({
    baseline: v.optional(v.boolean(), false),
    parameters: v.optional(candidateParameters),
    factorParameters: v.optional(numericParameters),
  }),
  v.check(
    (input) =>
      !input.baseline ||
      (Object.values(input.parameters ?? {}).every((value) => value === undefined) &&
        Object.keys(input.factorParameters ?? {}).length === 0),
    'Baseline candidates cannot override parameters',
  ),
)
const tuningPeriod = v.pipe(
  v.strictObject({ periodStart: s.date, periodEnd: s.date }),
  v.check((input) => input.periodEnd > input.periodStart, 'periodEnd must be after periodStart'),
)
const factorSubmit = v.pipe(
  v.strictObject({
    factorId: s.id,
    ...s.revisions,
    candidates: v.pipe(v.array(factorCandidate), v.minLength(1), v.maxLength(32)),
    objective: v.optional(v.literal('rank_ic_mean'), 'rank_ic_mean'),
    holdoutEnabled: v.optional(v.literal(false), false),
    researchPeriod: tuningPeriod,
    warmupTradingDays: v.pipe(s.integer, v.maxValue(5000)),
    origin: v.optional(s.origin),
  }),
  v.check(
    (input) => input.candidates.filter((candidate) => candidate.baseline).length === 1,
    'Expected exactly one baseline candidate',
  ),
)
const strategySubmit = v.pipe(
  v.strictObject({
    strategyId: s.id,
    ...s.revisions,
    candidates: v.pipe(
      v.array(
        v.strictObject({
          strategyParameters: v.pipe(numericParameters, v.minEntries(1), v.maxEntries(256)),
        }),
      ),
      v.minLength(1),
    ),
    objective: v.optional(v.picklist(['total_return', 'sharpe', 'max_drawdown']), 'total_return'),
    validationEnabled: v.optional(v.boolean(), true),
    tradingDates: v.pipe(v.array(s.date), v.minLength(2), v.maxLength(4000)),
    origin: v.optional(s.origin),
  }),
  v.check(
    (input) =>
      input.tradingDates.every((date, index, dates) => index === 0 || date > dates[index - 1]!),
    'tradingDates must be sorted and unique',
  ),
  v.check((input) => {
    const candidates = new Map(
      input.candidates.map((candidate) => [
        JSON.stringify(
          Object.entries(candidate.strategyParameters).toSorted(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        ),
        candidate.strategyParameters,
      ]),
    )
    return (
      candidates.size <= 31 &&
      [...candidates.values()].reduce((total, values) => total + Object.keys(values).length, 0) <=
        256
    )
  }, 'Expected at most 31 unique candidates and 256 total strategy parameter keys'),
)
const optionalObject = v.optional(v.nullable(s.jsonObject))
const candidateOutput = v.object({
  id: v.optional(v.nullable(s.id)),
  index: v.optional(s.integer),
  baseline: v.optional(v.boolean()),
  trialId: v.optional(v.nullable(v.string())),
  candidateId: v.optional(v.nullable(s.id)),
  runId: v.optional(v.nullable(s.id)),
  status: v.string(),
  phase: v.optional(v.string()),
  purpose: v.optional(v.string()),
  executionPhase: v.optional(v.nullable(v.string())),
  factorParameters: v.optional(s.jsonObject),
  strategyParameters: v.optional(s.jsonObject),
  analysisParameters: v.optional(s.jsonObject),
  progress: optionalObject,
  metrics: optionalObject,
  performancePreview: optionalObject,
  score: v.optional(v.nullable(s.finite)),
  objectiveValue: v.optional(v.nullable(s.finite)),
  error: v.optional(s.json),
})
function output(kind: p.ResourceKind) {
  return v.object({
    kind: v.literal(`${kind}_tuning`),
    id: s.id,
    resourceId: s.id,
    status: s.tuningStatus,
    terminal: v.boolean(),
    phase: v.optional(v.nullable(v.string())),
    objective: v.optional(v.string()),
    sourceRevision: v.optional(s.revision),
    configRevision: v.optional(s.revision),
    researchPeriod: optionalObject,
    validationPeriod: optionalObject,
    holdoutEnabled: v.optional(v.boolean()),
    validationEnabled: v.optional(v.boolean()),
    warmupTradingDays: v.optional(s.integer),
    bestTrialId: v.optional(v.nullable(v.string())),
    bestCandidateId: v.optional(v.nullable(s.id)),
    bestCandidateIndex: v.optional(v.nullable(s.integer)),
    bestObjectiveValue: v.optional(v.nullable(s.finite)),
    cancelRequested: v.optional(v.boolean()),
    candidates: v.optional(v.array(candidateOutput)),
    candidateCount: v.optional(s.integer),
    researchCount: v.optional(v.nullable(s.integer)),
    validationCount: v.optional(v.nullable(s.integer)),
    apply: v.optional(
      v.nullable(
        v.object({
          requestId: v.optional(s.requestId),
          trialId: v.optional(v.string()),
          candidateId: v.optional(s.id),
          status: v.optional(v.string()),
          sourceRevision: v.optional(s.revision),
          configRevision: v.optional(s.revision),
          appliedAt: v.optional(v.string()),
          outOfSampleValidated: v.optional(v.boolean()),
        }),
      ),
    ),
    validation: v.optional(v.nullable(candidateOutput)),
    createdAt: v.optional(v.nullable(v.string())),
    updatedAt: v.optional(v.nullable(v.string())),
    finishedAt: v.optional(v.nullable(v.string())),
  })
}
function projectCandidate(raw: p.Input) {
  return {
    ...p.fields(raw, {
      id: 'id',
      candidate_index: 'index',
      baseline: 'baseline',
      trial_id: 'trialId',
      candidate_id: 'candidateId',
      run_id: 'runId',
      status: 'status',
      phase: 'phase',
      purpose: 'purpose',
      execution_phase: 'executionPhase',
      factor_parameters: 'factorParameters',
      strategy_parameters: 'strategyParameters',
      analysis_parameters: 'analysisParameters',
      progress: 'progress',
      metrics: 'metrics',
      performance_preview: 'performancePreview',
      score: 'score',
      objective_value: 'objectiveValue',
    }),
    ...(raw.error === undefined ? {} : { error: p.publicRunError(raw.error) }),
  }
}
function project(raw: p.Input, kind: p.ResourceKind) {
  return {
    kind: `${kind}_tuning`,
    id: raw.id,
    resourceId: raw[`${kind}_id`],
    status: raw.status,
    terminal: ['succeeded', 'failed', 'cancelled', 'no_valid_candidates'].includes(
      String(raw.status),
    ),
    ...p.fields(raw, {
      phase: 'phase',
      objective: 'objective',
      source_revision: 'sourceRevision',
      config_revision: 'configRevision',
      research_period: 'researchPeriod',
      validation_period: 'validationPeriod',
      holdout_enabled: 'holdoutEnabled',
      validation_enabled: 'validationEnabled',
      warmup_trading_days: 'warmupTradingDays',
      best_trial_id: 'bestTrialId',
      best_candidate_id: 'bestCandidateId',
      best_candidate_index: 'bestCandidateIndex',
      best_objective_value: 'bestObjectiveValue',
      cancel_requested: 'cancelRequested',
      candidate_count: 'candidateCount',
      research_count: 'researchCount',
      validation_count: 'validationCount',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      finished_at: 'finishedAt',
    }),
    ...(raw.candidates === undefined
      ? {}
      : { candidates: array(raw.candidates).map((row) => projectCandidate(object(row))) }),
    ...(raw.validation === undefined
      ? {}
      : { validation: raw.validation === null ? null : projectCandidate(object(raw.validation)) }),
    ...(raw.apply === undefined
      ? {}
      : {
          apply:
            raw.apply === null
              ? null
              : p.fields(object(raw.apply), {
                  request_id: 'requestId',
                  trial_id: 'trialId',
                  candidate_id: 'candidateId',
                  status: 'status',
                  source_revision: 'sourceRevision',
                  config_revision: 'configRevision',
                  applied_at: 'appliedAt',
                  out_of_sample_validated: 'outOfSampleValidated',
                }),
        }),
  }
}
function revisions(input: p.Input) {
  return p.fields(input, {
    requestId: 'request_id',
    expectedSourceRevision: 'expected_source_revision',
    expectedConfigRevision: 'expected_config_revision',
  })
}
function submitBody(input: p.Input, kind: p.ResourceKind) {
  const candidates = array(input.candidates).map((row) => {
    const value = object(row)
    return kind === 'factor'
      ? {
          baseline: value.baseline,
          parameters: p.toSnake(value.parameters),
          factor_parameters: value.factorParameters,
        }
      : { strategy_parameters: value.strategyParameters }
  })
  return {
    ...revisions(input),
    candidates,
    objective: input.objective,
    origin: p.toSnake(input.origin),
    ...(kind === 'factor'
      ? {
          research_period: p.toSnake(input.researchPeriod),
          holdout_enabled: input.holdoutEnabled,
          warmup_trading_days: input.warmupTradingDays,
        }
      : { validation_enabled: input.validationEnabled, trading_dates: input.tradingDates }),
  }
}
const ID = '0123456789abcdef01234567',
  TUNING = '89abcdef0123456789abcdef'
const revisionExample = {
  requestId: 'tuning-intent-1',
  expectedSourceRevision: 3,
  expectedConfigRevision: 2,
}
const notes =
  '调优为异步任务，约每 2 秒 get 一次并在限流时退避。queued/running/cancelling 尚未结束；no_valid_candidates 也是终态。保留 requestId 和 tuningId，超时后先核实远端状态，不自动重复提交。apply 使用当前资源的 sourceRevision/configRevision，并会修改资源源码或配置。因子使用 trialId，策略使用 candidateId；从 get 响应候选读取，不从序号推测。'
export const tuningActions: Action[] = []
for (const kind of ['factor', 'strategy'] as const) {
  const resourceKey = `${kind}Id`,
    base = kind === 'factor' ? APIs.RESEARCH_FACTORS : APIs.RESEARCH_STRATEGIES
  const tuningBase =
    kind === 'factor' ? APIs.RESEARCH_FACTOR_TUNINGS : APIs.RESEARCH_STRATEGY_TUNINGS
  const prefix = `${kind}.tuning`,
    schema = output(kind)
  const example = {
    kind: `${kind}_tuning`,
    id: TUNING,
    resourceId: ID,
    status: 'queued',
    terminal: false,
  }
  const common = { notes, related: [`${kind}.get`, `${prefix}.get`, `${prefix}.apply`] }
  tuningActions.push({
    ...common,
    name: `${prefix}.submit`,
    description: `提交${kind === 'factor' ? '因子' : '策略'}参数调优`,
    scope: 'research:run',
    input: kind === 'factor' ? factorSubmit : strategySubmit,
    output: schema,
    exampleInput: {
      ...revisionExample,
      [resourceKey]: ID,
      ...(kind === 'factor'
        ? {
            candidates: [{ baseline: true }, { parameters: { adjustmentCycle: 10 } }],
            researchPeriod: { periodStart: '2026-01-01', periodEnd: '2026-02-01' },
            warmupTradingDays: 20,
          }
        : {
            candidates: [{ strategyParameters: { window: 10 } }],
            tradingDates: ['2026-01-02', '2026-01-05'],
          }),
    },
    exampleOutput: example,
    execute: async (request, input) =>
      project(
        await request({
          path: `${base}/${String(input[resourceKey])}/tunings`,
          method: 'POST',
          body: submitBody(input, kind),
        }),
        kind,
      ),
  })
  tuningActions.push({
    ...common,
    name: `${prefix}.list`,
    description: '列出资源最近的参数调优摘要',
    scope: 'research:read',
    input: v.strictObject({ [resourceKey]: s.id, ...s.offsetEntries }),
    output: s.pageOutput(schema),
    exampleInput: { [resourceKey]: ID },
    exampleOutput: { items: [], hasMore: false, nextCursor: null, possiblyTruncated: false },
    notes: `${notes} 上游最多返回最近 200 条且省略候选；offset/limit 只在这批数据内分页。达到上限时 possiblyTruncated=true，完整历史用 search。`,
    execute: async (request, input) =>
      p.slicePage(
        array(
          (await request({ path: `${base}/${String(input[resourceKey])}/tunings` })).tunings,
        ).map((row) => project(object(row), kind)),
        input,
        200,
      ),
  })
  tuningActions.push({
    ...common,
    name: `${prefix}.search`,
    description: '按市场、资源、状态和时间搜索调优历史',
    scope: 'research:read',
    input: s.searchInput(kind, false, true),
    output: s.pageOutput(schema),
    exampleInput: { market: 'us', status: 'succeeded' },
    exampleOutput: { items: [], hasMore: false, nextCursor: null },
    execute: async (request, input) =>
      p.cursorPage(
        await request({
          path: tuningBase,
          query: {
            view: 'summary',
            limit: input.limit,
            cursor: input.cursor,
            market: input.market,
            q: input.keyword,
            title: input.title,
            description: input.description,
            status: input.status,
            [`${kind}_id`]: input[resourceKey],
            time_field: input.timeField,
            from: input.from,
            to: input.to,
          },
        }),
        'tunings',
        (row) => project(row, kind),
        Number(input.limit),
      ),
  })
  for (const operation of ['get', 'cancel', 'rerun', 'apply'] as const) {
    const apply = operation === 'apply',
      selection = kind === 'factor' ? 'trialId' : 'candidateId'
    tuningActions.push({
      ...common,
      name: `${prefix}.${operation}`,
      description: `${operation} ${kind} parameter tuning`,
      scope: operation === 'get' ? 'research:read' : apply ? 'research:write' : 'research:run',
      input: v.strictObject({
        tuningId: s.id,
        ...(apply
          ? {
              ...s.revisions,
              [selection]:
                kind === 'factor' ? v.pipe(v.string(), v.minLength(1), v.maxLength(64)) : s.id,
            }
          : operation === 'rerun'
            ? { requestId: s.requestId }
            : {}),
      }),
      output: apply ? v.object({ tuning: schema, [kind]: s.resourceOutput(kind, true) }) : schema,
      exampleInput: {
        tuningId: TUNING,
        ...(apply
          ? { ...revisionExample, [selection]: kind === 'factor' ? 'trial-1' : ID }
          : operation === 'rerun'
            ? { requestId: 'rerun-intent-1' }
            : {}),
      },
      exampleOutput: apply
        ? {
            tuning: { ...example, status: 'succeeded', terminal: true },
            [kind]: {
              kind,
              id: ID,
              title: 'Tuned research',
              market: 'us',
              codeType: kind === 'factor' ? 'formula' : 'python',
              sourceRevision: 4,
              configRevision: 3,
              parameters: {},
            },
          }
        : example,
      execute: async (request, input) => {
        const raw = await request({
          path: `${tuningBase}/${String(input.tuningId)}${operation === 'get' ? '' : `/${operation}`}`,
          method: operation === 'get' ? 'GET' : 'POST',
          ...(operation === 'rerun'
            ? { body: { request_id: input.requestId } }
            : apply
              ? {
                  body: {
                    ...revisions(input),
                    [kind === 'factor' ? 'trial_id' : 'candidate_id']: input[selection],
                  },
                }
              : {}),
        })
        const tuning = apply ? object(raw.tuning) : raw
        if (operation !== 'rerun' && tuning.id !== input.tuningId)
          throw new ResearchError('INVALID_RESPONSE', 'Research tuning ID mismatch')
        if (apply && object(raw[kind]).id !== tuning[`${kind}_id`])
          throw new ResearchError('INVALID_RESPONSE', 'Research tuning resource ID mismatch')
        return apply
          ? { tuning: project(tuning, kind), [kind]: p.resource(object(raw[kind]), kind) }
          : project(tuning, kind)
      },
    })
  }
}
