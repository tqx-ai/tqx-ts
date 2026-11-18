import * as v from 'valibot'

export const integer = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
export const revision = v.pipe(integer, v.minValue(1))
export const finite = v.pipe(
  v.number(),
  v.check((value) => Number.isFinite(value), 'Expected a finite number'),
)
const text = (max: number) => v.pipe(v.string(), v.maxLength(max))
export const id = v.pipe(v.string(), v.regex(/^[0-9a-f]{24}$/))
export const requestId = v.pipe(text(128), v.minLength(1), v.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/))
export const market = v.picklist(['hk', 'us'])
export const status = v.picklist([
  'preparing',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])
export const tuningStatus = v.picklist([
  'queued',
  'running',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
  'no_valid_candidates',
])
const codeType = v.picklist(['python', 'formula'])
const code = v.pipe(
  v.string(),
  v.check((s) => new TextEncoder().encode(s).length <= 1_048_576, 'Code exceeds 1 MiB'),
)
export const date = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/),
  v.check((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
  }, 'Expected a valid YYYY-MM-DD date'),
)
export const time = v.pipe(
  v.string(),
  v.check(
    (s) =>
      v.safeParse(date, s).success ||
      (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) &&
        v.safeParse(date, s.slice(0, 10)).success &&
        Number.isFinite(Date.parse(s))),
    'Expected a date or timezone-aware ISO datetime',
  ),
)
const title = v.pipe(
  v.string(),
  v.check(
    (s) =>
      [...s].length >= 1 &&
      [...s].length <= 200 &&
      s === s.trim() &&
      !/[\p{Cc}\p{Cs}\\/]/u.test(s) &&
      !['.', '..'].includes(s) &&
      !/\.(py|formula)$/i.test(s),
    'Expected a business title without paths or source extensions',
  ),
)
const name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))
export const origin = v.strictObject({
  sessionId: v.pipe(text(128), v.minLength(1)),
  chatRunId: v.pipe(text(128), v.minLength(1)),
})
const binding = v.strictObject({ factorId: id, factorVersionId: id })
const bound = (max: number, min = 1) => v.pipe(integer, v.minValue(min), v.maxValue(max))
export const offsetEntries = { offset: v.optional(integer, 0), limit: v.optional(bound(500), 100) }
export const listEntries = {
  market: v.optional(market),
  keyword: v.optional(text(200)),
  cursor: v.optional(v.pipe(text(1024), v.minLength(1))),
  limit: v.optional(bound(100), 20),
}
export const revisions = {
  requestId,
  expectedSourceRevision: revision,
  expectedConfigRevision: revision,
}

function period(
  start: string | undefined,
  end: string | undefined,
  years: number,
  strict: boolean,
) {
  if (!start || !end) return true
  const [y, m, d] = start.split('-').map(Number) as [number, number, number]
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate()
  const boundary = `${String(y + years).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
  return (strict ? end > start : end >= start) && end <= boundary
}
export const analysisParameters = v.pipe(
  v.strictObject({
    periodStart: v.optional(date),
    periodEnd: v.optional(date),
    adjustmentCycle: v.optional(v.picklist([1, 3, 5, 10, 20, 30])),
    groupNumber: v.optional(v.picklist([3, 5, 10, 20])),
    factorDirection: v.optional(v.picklist([1, -1])),
    stockPool: v.optional(
      v.picklist([
        '沪深全A',
        '沪深300',
        '中证500',
        '中证1000',
        'all',
        'HSI.HK',
        'HSCE.HK',
        'HSTECH.HK',
        'SPX',
        'IXIC',
        'NDX',
        'DJI',
      ]),
    ),
    marketType: v.optional(v.literal('主力')),
  }),
  v.check(
    (s) => period(s.periodStart, s.periodEnd, 5, true),
    'Analysis period must increase and not exceed five years',
  ),
)
export const backtestParameters = v.pipe(
  v.strictObject({
    periodStart: v.optional(date),
    periodEnd: v.optional(date),
    initBalance: v.optional(v.pipe(finite, v.minValue(Number.MIN_VALUE))),
    commissionRate: v.optional(v.pipe(finite, v.minValue(0))),
    slippage: v.optional(v.pipe(finite, v.minValue(0))),
    frequency: v.optional(v.picklist(['1d', '1M'])),
    standardSymbol: v.optional(
      v.picklist([
        'sse_composite',
        'csi300',
        'csi500',
        'csi1000',
        'HSI.HK',
        'HSCE.HK',
        'HSTECH.HK',
        'SPX',
        'IXIC',
        'NDX',
        'DJI',
      ]),
    ),
    marginRate: v.optional(revision),
  }),
  v.check(
    (s) => period(s.periodStart, s.periodEnd, s.frequency === '1M' ? 1 : 10, false),
    'Backtest period exceeds frequency limit or is reversed',
  ),
)

const searchEntries = {
  ...listEntries,
  limit: v.optional(bound(10), 10),
  title: v.optional(text(200)),
  description: v.optional(text(200)),
  from: v.optional(time),
  to: v.optional(time),
}
const filterTime = (s: string, end: boolean) =>
  s.length === 10 ? Date.parse(`${s}T00:00:00+08:00`) + (end ? 86_400_000 : 0) : Date.parse(s)
export function validRange(s: { from?: string; to?: string }) {
  return !s.from || !s.to || filterTime(s.from, false) < filterTime(s.to, true)
}
export function searchInput(kind: 'factor' | 'strategy', versions = false, tuning = false) {
  const statusEntries: v.ObjectEntries = versions
    ? {}
    : { status: v.optional(tuning ? tuningStatus : status) }
  return v.pipe(
    v.strictObject({
      ...searchEntries,
      [kind === 'factor' ? 'factorId' : 'strategyId']: v.optional(id),
      ...statusEntries,
      timeField: v.optional(
        versions ? v.literal('created_at') : v.picklist(['created_at', 'updated_at']),
      ),
    }),
    v.check((input) => validRange(input), 'from must be earlier than to'),
  )
}
export function resourceInputs(kind: 'factor' | 'strategy') {
  const key = kind === 'factor' ? 'factorId' : 'strategyId'
  const resource = { [key]: id }
  const create = {
    requestId,
    title,
    description: v.optional(text(2000)),
    code,
    market,
    origin: v.optional(origin),
  }
  const config = {
    ...resource,
    baseConfigRevision: revision,
    title: v.optional(title),
    description: v.optional(text(2000)),
  }
  const listExtras: v.ObjectEntries =
    kind === 'factor' ? { bindableOnly: v.optional(v.boolean()) } : {}
  const validateExtras: v.ObjectEntries = kind === 'factor' ? { codeType } : {}
  return {
    list: v.strictObject({
      ...listEntries,
      ...listExtras,
    }),
    get: v.strictObject({ ...resource, includeSource: v.optional(v.boolean(), false) }),
    source: v.strictObject(resource),
    validate: v.union([
      v.strictObject({
        ...resource,
        expectedSourceRevision: kind === 'factor' ? v.optional(revision) : revision,
      }),
      v.strictObject({ code, market, ...validateExtras }),
    ]),
    submit: v.strictObject({
      ...resource,
      ...revisions,
      origin: v.optional(origin),
      ...(kind === 'factor'
        ? { parameters: v.optional(analysisParameters) }
        : { backtest: v.optional(backtestParameters) }),
    }),
    create: v.strictObject({
      ...create,
      ...(kind === 'factor'
        ? { codeType }
        : {
            backtest: v.optional(backtestParameters),
            factorBinding: v.optional(v.nullable(binding)),
          }),
    }),
    update: v.pipe(
      v.strictObject({
        ...config,
        ...(kind === 'factor'
          ? { parameters: v.optional(analysisParameters) }
          : {
              requestId: v.optional(requestId),
              backtest: v.optional(backtestParameters),
              factorBinding: v.optional(v.nullable(binding)),
            }),
      }),
      v.check(
        (s) =>
          ['title', 'description', 'parameters', 'backtest', 'factorBinding'].some(
            (k) => (s as Record<string, unknown>)[k] !== undefined,
          ),
        'Expected a field to update',
      ),
    ),
    saveSource: v.strictObject({
      ...resource,
      requestId,
      baseSourceRevision: revision,
      code,
      origin: v.optional(origin),
    }),
    delete: v.strictObject(resource),
    restoreRun: v.strictObject({ ...resource, runId: id, ...revisions }),
    versions: v.strictObject({ ...resource, ...offsetEntries }),
    createVersion: v.strictObject({
      ...resource,
      requestId,
      runId: id,
      name,
      description: v.optional(text(2000)),
    }),
    restoreVersion: v.strictObject({ ...resource, versionId: id, ...revisions }),
  }
}
export const factorResultField = v.picklist([
  'factor_data',
  'group_return_summary',
  'last_date_top_factor',
  'return_chart',
  'ic_charts',
])
export const resultField = v.picklist([
  'equity',
  'trades',
  'logs',
  'symbol_performance',
  'account_summary',
])
export const factorRunInput = v.strictObject({ analysisId: id })
export const backtestRunInput = v.strictObject({ runId: id })
export const factorHistoryInput = v.strictObject({
  factorId: id,
  includeDeleted: v.optional(v.boolean()),
  status: v.optional(status),
  ...offsetEntries,
})
export const backtestHistoryInput = v.strictObject({
  strategyId: id,
  limit: v.optional(bound(200), 100),
})
export const factorResultInput = v.strictObject({
  analysisId: id,
  field: factorResultField,
  ...offsetEntries,
})
export const resultInput = v.pipe(
  v.strictObject({
    runId: id,
    field: resultField,
    ...offsetEntries,
    keyword: v.optional(text(200)),
    symbol: v.optional(v.pipe(text(64), v.minLength(1))),
  }),
  v.check(
    (s) => s.symbol === undefined || s.field === 'trades',
    'symbol is only supported for trades',
  ),
)
export const chartInput = v.pipe(
  v.strictObject({
    runId: id,
    from: v.optional(time),
    to: v.optional(time),
    maxPoints: v.optional(bound(5000, 2), 1000),
  }),
  v.check(
    (s) => !s.from || !s.to || Date.parse(s.from) <= Date.parse(s.to),
    'from must not be later than to',
  ),
)
export const factorVersionSearch = v.strictObject({
  market,
  query: v.optional(text(200)),
  factorId: v.optional(id),
  cursor: listEntries.cursor,
  limit: listEntries.limit,
})
export const versionInput = v.strictObject({ versionId: id })
export const snapshotListInput = v.strictObject({ factorId: id, ...offsetEntries })
export const snapshotCreateInput = v.strictObject({ factorId: id, runId: id, name })

// Engine values are intentionally open JSON, with bounded depth and complexity.
// An iterative check also bounds cyclic values injected by embedding hosts.
export function isJson(value: unknown): boolean {
  const stack: Array<[unknown, number]> = [[value, 0]]
  let nodes = 0
  while (stack.length) {
    const [item, depth] = stack.pop()!
    if (++nodes > 100_000 || depth > 24) return false
    if (item === null || typeof item === 'boolean') continue
    if (typeof item === 'string') {
      if (item.length > 1_048_576) return false
      continue
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) return false
      continue
    }
    if (Array.isArray(item)) {
      for (const child of item) stack.push([child, depth + 1])
      continue
    }
    if (typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype) return false
    for (const child of Object.values(item)) stack.push([child, depth + 1])
  }
  return true
}
export const json = v.pipe(v.unknown(), v.check(isJson, 'Expected bounded JSON'))
export const jsonObject = v.record(v.string(), json)
const optionalObject = v.optional(v.nullable(jsonObject))
const optionalTime = v.optional(v.nullable(v.string()))
const stamps = { createdAt: optionalTime, updatedAt: optionalTime }
const resourceEntries = {
  id,
  title: v.string(),
  description: v.optional(v.string()),
  market,
  codeType,
  sourceRevision: revision,
  configRevision: revision,
  ...stamps,
}
export function resourceOutput(kind: 'factor' | 'strategy', detail = false, source = false) {
  const bindingEntries: v.ObjectEntries =
    kind === 'strategy' ? { factorBinding: v.optional(v.nullable(binding)) } : {}
  const detailEntries: v.ObjectEntries = detail
    ? {
        parameters: jsonObject,
        parametersDraft: v.optional(
          v.nullable(
            v.pipe(
              v.unknown(),
              v.check((value) => !Array.isArray(value), 'Expected a parameter draft object'),
              jsonObject,
            ),
          ),
        ),
        validation: optionalObject,
        parameterValidation: optionalObject,
        codeSha256: v.optional(v.nullable(v.string())),
        code: source ? v.string() : v.optional(v.string()),
        ...bindingEntries,
      }
    : {}
  return v.object({
    ...resourceEntries,
    kind: v.literal(kind),
    ...(kind === 'strategy' ? { codeType: v.literal('python') } : {}),
    ...detailEntries,
  })
}
export const validationOutput = v.object({
  valid: v.boolean(),
  diagnostics: v.array(
    v.object({
      message: v.string(),
      code: v.optional(v.string()),
      field: v.optional(v.nullable(v.string())),
      line: v.optional(integer),
      column: v.optional(integer),
    }),
  ),
  codeSha256: v.string(),
  sourceRevision: v.optional(revision),
})
export function runOutput(
  kind: 'factor_analysis' | 'backtest',
  mode: 'state' | 'summary' | 'submission' = 'state',
) {
  const common = { kind: v.literal(kind), id, resourceId: id, status }
  if (mode === 'submission')
    return v.object({
      ...common,
      terminal: v.boolean(),
      idempotent: v.optional(v.boolean()),
      codeSha256: v.optional(v.string()),
      parameters: v.optional(jsonObject),
    })
  return v.object({
    ...common,
    progress: optionalObject,
    metrics: optionalObject,
    sourceRevision: v.optional(revision),
    configRevision: v.optional(revision),
    ...stamps,
    ...(mode === 'summary'
      ? {
          market: v.optional(market),
          title: v.optional(v.string()),
          description: v.optional(v.string()),
        }
      : {
          terminal: v.boolean(),
          parameters: optionalObject,
          cancelRequested: v.optional(v.boolean()),
          error: v.optional(json),
        }),
  })
}
export function pageOutput(item: v.GenericSchema) {
  return v.object({
    items: v.array(item),
    hasMore: v.boolean(),
    nextCursor: v.nullable(v.string()),
    nextOffset: v.optional(integer),
    possiblyTruncated: v.optional(v.boolean()),
    counts: v.optional(v.record(v.string(), integer)),
  })
}
export const deletedOutput = v.object({ id, deleted: v.literal(true) })
export const recentOutput = v.object({
  items: v.array(runOutput('backtest')),
  requestedLimit: revision,
  possiblyTruncated: v.boolean(),
})
export function resultOutput(factor: boolean) {
  const completeness: v.ObjectEntries = factor
    ? {}
    : {
        partial: v.optional(v.boolean()),
        availableFrom: v.optional(integer),
        availableTotal: v.optional(integer),
      }
  return v.object({
    [factor ? 'analysisId' : 'runId']: id,
    field: factor ? factorResultField : resultField,
    rows: v.array(json),
    total: integer,
    offset: integer,
    limit: v.pipe(revision, v.maxValue(500)),
    hasMore: v.boolean(),
    nextOffset: v.optional(integer),
    ...completeness,
  })
}
const range = v.object({ from: v.nullable(v.string()), to: v.nullable(v.string()) })
export const chartOutput = v.object({
  runId: id,
  range,
  extent: range,
  points: v.array(
    v.object({ ts: v.string(), equity: v.nullable(finite), breakBefore: v.optional(v.boolean()) }),
  ),
  sourceCount: integer,
  totalCount: integer,
  sampled: v.boolean(),
  tradeDays: v.array(
    v.object({
      day: v.string(),
      ts: v.string(),
      equity: v.nullable(finite),
      buyCount: integer,
      sellCount: integer,
      total: integer,
      counts: v.record(v.string(), integer),
      trades: v.array(jsonObject),
    }),
  ),
  dateAnchors: v.optional(v.array(v.object({ day: v.string(), from: v.string(), to: v.string() }))),
  complete: v.optional(v.nullable(v.boolean())),
  partial: v.optional(v.boolean()),
  benchmark: v.optional(
    v.object({
      standardSymbol: v.string(),
      points: v.array(
        v.object({
          ts: v.string(),
          equity: v.nullable(finite),
          breakBefore: v.optional(v.boolean()),
        }),
      ),
    }),
  ),
})
export function versionOutput(kind: 'factor' | 'strategy', detail = false) {
  const detailEntries: v.ObjectEntries = detail
    ? {
        code: v.string(),
        codeSha256: v.optional(v.nullable(v.string())),
        parameters: v.optional(jsonObject),
        factorBinding: v.optional(v.nullable(binding)),
      }
    : {}
  return v.object({
    kind: v.literal(`${kind}_version`),
    id,
    resourceId: id,
    version: revision,
    name: v.string(),
    runId: id,
    description: v.optional(v.string()),
    market: v.optional(market),
    codeType: v.optional(codeType),
    createdAt: optionalTime,
    readOnly: v.literal(true),
    ...detailEntries,
  })
}
export const snapshotOutput = v.object({
  id,
  factorId: id,
  runId: id,
  name: v.string(),
  createdAt: optionalTime,
  parameters: v.optional(jsonObject),
  results: v.optional(
    v.object({
      status: v.optional(v.nullable(status)),
      metrics: optionalObject,
      performancePreview: optionalObject,
      groupReturnSummary: optionalObject,
      lastDateTopFactor: v.optional(json),
    }),
  ),
})

export const exploreInput = v.strictObject({
  action: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
})
export const callInput = v.strictObject({
  action: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  input: v.record(v.string(), v.unknown()),
  confirm: v.optional(v.boolean()),
})
export const catalogOutput = v.object({
  actions: v.array(v.object({ action: v.string(), description: v.string() })),
})
export const detailOutput = v.object({
  action: v.string(),
  description: v.string(),
  inputSchema: jsonObject,
  outputSchema: jsonObject,
  documentation: v.string(),
})
