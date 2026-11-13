import * as v from 'valibot'

import { ResearchError } from './errors'
import { array, object } from './gateway'
import { integer, revision, status } from './schemas'

export type Input = Record<string, unknown>
export type ResourceKind = 'factor' | 'strategy'
export function fields(raw: Input, mapping: Record<string, string>): Input {
  return Object.fromEntries(
    Object.entries(mapping)
      .filter(([key]) => raw[key] !== undefined)
      .map(([key, name]) => [name, raw[key]]),
  )
}
export function toSnake(input: unknown): Input | undefined {
  if (input === undefined) return undefined
  return Object.fromEntries(
    Object.entries(object(input)).map(([key, value]) => [
      key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      value,
    ]),
  )
}
export function resource(raw: Input, kind: ResourceKind, includeSource = false): Input {
  return {
    kind,
    ...fields(raw, {
      id: 'id',
      title: 'title',
      description: 'description',
      market: 'market',
      code_type: 'codeType',
      source_revision: 'sourceRevision',
      config_revision: 'configRevision',
      parameters: 'parameters',
      validation: 'validation',
      parameter_validation: 'parameterValidation',
      code_sha256: 'codeSha256',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    }),
    ...(includeSource ? { code: raw.code } : {}),
    ...(kind === 'strategy' && raw.factor_binding !== undefined
      ? {
          factorBinding:
            raw.factor_binding === null
              ? null
              : fields(object(raw.factor_binding), {
                  factor_id: 'factorId',
                  factor_version_id: 'factorVersionId',
                }),
        }
      : {}),
  }
}
function publicRunError(value: unknown) {
  if (value === null || value === undefined) return value
  const code = typeof value === 'object' && !Array.isArray(value) ? object(value).code : undefined
  return {
    message: 'Remote Research run failed; inspect the run in Qube for diagnostics',
    ...(typeof code === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(code) ? { code } : {}),
  }
}
export function run(raw: Input, kind: ResourceKind, submission = false): Input {
  const parsed = v.safeParse(status, raw.status)
  if (!parsed.success) throw new ResearchError('INVALID_RESPONSE', 'Invalid Research run status')
  const optional = fields(raw, {
    idempotent: 'idempotent',
    code_sha256: 'codeSha256',
    progress: 'progress',
    metrics: 'metrics',
    source_revision: 'sourceRevision',
    config_revision: 'configRevision',
    cancel_requested: 'cancelRequested',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    market: 'market',
    title: 'title',
    description: 'description',
  })
  for (const key of [
    'codeSha256',
    'sourceRevision',
    'configRevision',
    'market',
    'title',
    'description',
  ]) {
    if (optional[key] === null) delete optional[key]
  }
  const parameters = kind === 'factor' ? raw.params : raw.parameters
  return {
    kind: kind === 'factor' ? 'factor_analysis' : 'backtest',
    id: submission && kind === 'factor' ? raw.run_id : raw.id,
    resourceId: raw[`${kind}_id`],
    status: parsed.output,
    terminal: ['succeeded', 'failed', 'cancelled'].includes(parsed.output),
    ...optional,
    ...(parameters === undefined ? {} : { parameters }),
    ...(raw.error !== undefined ? { error: publicRunError(raw.error) } : {}),
  }
}
export function cursorPage(raw: Input, key: string, project: (row: Input) => Input, limit: number) {
  const rows = array(raw[key])
  if (
    rows.length > limit ||
    !(raw.next_cursor === null || typeof raw.next_cursor === 'string') ||
    (raw.has_more !== undefined && typeof raw.has_more !== 'boolean')
  )
    throw new ResearchError('INVALID_RESPONSE', 'Invalid Research cursor page')
  const hasMore = raw.has_more ?? raw.next_cursor !== null
  if (hasMore && !raw.next_cursor)
    throw new ResearchError('INVALID_RESPONSE', 'Missing Research next cursor')
  return {
    items: rows.map((row) => project(object(row))),
    hasMore,
    nextCursor: raw.next_cursor,
    ...(raw.counts === undefined ? {} : { counts: raw.counts }),
  }
}
export function slicePage(rows: unknown[], input: Input, upstreamCap?: number) {
  const offset = Number(input.offset),
    limit = Number(input.limit)
  const items = rows.slice(offset, offset + limit)
  const hasMore = offset + items.length < rows.length
  return {
    items,
    hasMore,
    nextCursor: null,
    ...(upstreamCap === undefined ? {} : { possiblyTruncated: rows.length >= upstreamCap }),
    ...(hasMore ? { nextOffset: offset + items.length } : {}),
  }
}
export function validation(raw: Input) {
  return {
    ...fields(raw, {
      valid: 'valid',
      code_sha256: 'codeSha256',
      source_revision: 'sourceRevision',
    }),
    diagnostics: array(raw.diagnostics).map((row) => {
      const diagnostic = fields(object(row), {
        message: 'message',
        code: 'code',
        field: 'field',
        line: 'line',
        column: 'column',
      })
      if (diagnostic.line === null) delete diagnostic.line
      if (diagnostic.column === null) delete diagnostic.column
      return diagnostic
    }),
  }
}
export function version(raw: Input, kind: ResourceKind, detail = false) {
  return {
    kind: `${kind}_version`,
    resourceId: raw[`${kind}_id`],
    readOnly: true,
    ...fields(raw, {
      id: 'id',
      version: 'version',
      name: 'name',
      run_id: 'runId',
      description: 'description',
      market: 'market',
      code_type: 'codeType',
      created_at: 'createdAt',
    }),
    ...(detail
      ? {
          ...fields(raw, { code: 'code', code_sha256: 'codeSha256', parameters: 'parameters' }),
          ...(raw.factor_binding === undefined
            ? {}
            : {
                factorBinding:
                  raw.factor_binding === null
                    ? null
                    : fields(object(raw.factor_binding), {
                        factor_id: 'factorId',
                        factor_version_id: 'factorVersionId',
                      }),
              }),
        }
      : {}),
  }
}
export function snapshot(raw: Input, factorId: unknown) {
  const results = raw.results === undefined ? undefined : object(raw.results)
  return {
    factorId,
    ...fields(raw, {
      id: 'id',
      run_id: 'runId',
      name: 'name',
      created_at: 'createdAt',
      parameters: 'parameters',
    }),
    ...(results
      ? {
          results: fields(results, {
            status: 'status',
            metrics: 'metrics',
            performance_preview: 'performancePreview',
            group_return_summary: 'groupReturnSummary',
            last_date_top_factor: 'lastDateTopFactor',
          }),
        }
      : {}),
  }
}
export function factorResults(raw: Input, input: Input) {
  if (raw.id !== input.analysisId)
    throw new ResearchError('INVALID_RESPONSE', 'Research analysis ID mismatch')
  const state = v.safeParse(status, raw.status)
  if (!state.success) throw new ResearchError('INVALID_RESPONSE', 'Invalid Research run status')
  if (state.output !== 'succeeded')
    throw new ResearchError('RUN_NOT_READY', 'Factor results require a successful analysis', {
      status: state.output,
    })
  const result = raw.results === undefined ? raw : object(raw.results)
  const field = String(input.field)
  const value = result[field]
  if (value === undefined)
    throw new ResearchError('INVALID_RESPONSE', 'Missing factor result field')
  const rows =
    value === null
      ? []
      : ['factor_data', 'last_date_top_factor'].includes(field)
        ? array(value)
        : Object.entries(object(value))
            .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, entry]) => ({ key, value: entry }))
  const page = slicePage(rows, input)
  return {
    analysisId: input.analysisId,
    field,
    rows: page.items,
    total: rows.length,
    offset: input.offset,
    limit: input.limit,
    hasMore: page.hasMore,
    ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
  }
}
export function backtestResults(raw: Input, input: Input) {
  const offset = v.safeParse(integer, raw.offset),
    limit = v.safeParse(revision, raw.limit),
    total = v.safeParse(integer, raw.total)
  const rows = array(raw.rows)
  if (
    !offset.success ||
    !limit.success ||
    !total.success ||
    raw.offset !== input.offset ||
    raw.limit !== input.limit ||
    rows.length > Number(input.limit) ||
    typeof raw.has_more !== 'boolean' ||
    (raw.has_more && rows.length === 0) ||
    (raw.run_id !== undefined && raw.run_id !== input.runId) ||
    (raw.field !== undefined && raw.field !== input.field)
  )
    throw new ResearchError('INVALID_RESPONSE', 'Invalid backtest result page')
  return {
    runId: input.runId,
    field: input.field,
    rows,
    total: raw.total,
    offset: raw.offset,
    limit: raw.limit,
    hasMore: raw.has_more,
    ...(raw.has_more ? { nextOffset: Number(raw.offset) + rows.length } : {}),
  }
}
export function chart(raw: Input) {
  return {
    ...fields(raw, {
      run_id: 'runId',
      range: 'range',
      extent: 'extent',
      source_count: 'sourceCount',
      total_count: 'totalCount',
      sampled: 'sampled',
      complete: 'complete',
      date_anchors: 'dateAnchors',
    }),
    points: array(raw.points).map((row) =>
      fields(object(row), { ts: 'ts', equity: 'equity', break_before: 'breakBefore' }),
    ),
    tradeDays: array(raw.trade_days).map((row) =>
      fields(object(row), {
        day: 'day',
        ts: 'ts',
        equity: 'equity',
        buy_count: 'buyCount',
        sell_count: 'sellCount',
        total: 'total',
        counts: 'counts',
        trades: 'trades',
      }),
    ),
  }
}
