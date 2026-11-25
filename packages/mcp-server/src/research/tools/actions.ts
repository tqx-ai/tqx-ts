import type { AuthInfo } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import APIs from '../../config/APIs'
import { ResearchError } from '../errors'
import {
  type ResearchGateway,
  array,
  object,
  type ResearchRequest,
  type ResearchScope,
} from '../gateway'
import * as p from '../projections'
import * as s from '../schemas'
import { tuningActions } from './tunings'
import { readBacktest, readBacktestChart, readBacktestResult } from '../backtests'

const backtestViewNote =
  'After a requested strategy backtest reaches status=succeeded, automatically call tqx_open_backtest_view({type:"qube",runId:<submission id>}) unless the user requested text only. Keep runId internally; do not ask the user to supply it or request display again. Retry report errors against the same run, never resubmit.'

export interface Action {
  name: string
  description: string
  scope: ResearchScope
  input: v.GenericSchema
  output: v.GenericSchema
  execute: (
    request: (request: ResearchRequest) => Promise<p.Input>,
    input: p.Input,
  ) => Promise<unknown>
  exampleInput: p.Input
  exampleOutput: p.Input
  related: string[]
  notes: string
}
const registry = new Map<string, Action>()
function add(action: Action) {
  if (registry.has(action.name)) throw new Error('Duplicate Research action')
  registry.set(action.name, Object.freeze(action))
}
const read = 'research:read',
  execute = 'research:run',
  write = 'research:write'
const resourceId = '0123456789abcdef01234567',
  runId = '89abcdef0123456789abcdef',
  versionId = 'fedcba987654321001234567'
const revExample = {
  requestId: 'research-demo-1',
  expectedSourceRevision: 3,
  expectedConfigRevision: 2,
}
const emptyPage = { items: [], hasMore: false, nextCursor: null }
const resourceExample = (kind: p.ResourceKind) => ({
  kind,
  id: resourceId,
  title: 'Research example',
  market: 'us',
  codeType: kind === 'factor' ? 'formula' : 'python',
  sourceRevision: 3,
  configRevision: 2,
  parameters: {},
})
const runExample = (kind: p.ResourceKind, status: 'queued' | 'succeeded' = 'succeeded') => ({
  kind: kind === 'factor' ? 'factor_analysis' : 'backtest',
  id: runId,
  resourceId,
  status,
  terminal: status === 'succeeded',
})
const versionExample = (kind: p.ResourceKind) => ({
  kind: `${kind}_version`,
  id: versionId,
  resourceId,
  version: 1,
  name: 'Research example',
  runId,
  readOnly: true,
})
const sourceNote =
  'Source code is omitted by default; use get_source or includeSource=true to fetch source. market is limited to hk or us. parameters preserves engine fields and cannot be passed as arbitrary update input.'
const runNote =
  'queued, preparing, and running are non-terminal. Poll get about every 2 seconds and back off on rate limits; factor results are readable only after succeeded, whereas backtest results and charts may return empty or partial outputs while preserving partial and available range fields. On LIVE_RESULT_UNAVAILABLE, back off and retry reading the same runId rather than resubmitting. Stop dependent steps on failed or cancelled. Keep the ID on timeout and do not auto-cancel the remote job.'
const revisionNote =
  'Read the current sourceRevision and configRevision with get before submitting. Reuse a requestId only to retry the exact same intent and input; a network timeout may still have succeeded remotely, so verify remote state first. On a revision conflict, re-read with get before deciding rather than blindly overwriting.'
const paramsNote =
  'Omitted parameters inherit upstream saved settings and defaults. Analysis dates must be strictly increasing and span at most 5 years; daily backtests span at most 10 years, and 1M (minute frequency) spans at most 1 year. For factor analyses and tunings, stockPool currently supports only all (full market). Legacy index stock pools must be explicitly updated to all and are not rewritten automatically. standardSymbol must use an index for the selected market (excluding all); cross-market parameters are rejected upstream.'
function expectIdentity(raw: p.Input, key: string, expected: unknown) {
  if (raw[key] !== expected)
    throw new ResearchError('INVALID_RESPONSE', 'Research response identity mismatch')
}
function query(input: p.Input, summary = false): p.Input {
  return {
    limit: input.limit,
    cursor: input.cursor,
    market: input.market,
    q: input.keyword,
    ...(summary
      ? {
          view: 'summary',
          title: input.title,
          description: input.description,
          status: input.status,
          factor_id: input.factorId,
          strategy_id: input.strategyId,
          time_field: input.timeField,
          from: input.from,
          to: input.to,
        }
      : {}),
  }
}
function parameters(input: p.Input, kind: p.ResourceKind) {
  return kind === 'factor'
    ? p.toSnake(input.parameters)
    : input.backtest === undefined
      ? undefined
      : { backtest: p.toSnake(input.backtest) }
}

for (const kind of ['factor', 'strategy'] as const) {
  const inputs = s.resourceInputs(kind),
    base = kind === 'factor' ? APIs.RESEARCH_FACTORS : APIs.RESEARCH_STRATEGIES,
    key = `${kind}Id`,
    rawKey = `${kind}_id`
  const child = kind === 'factor' ? 'analysis' : 'backtest',
    children = kind === 'factor' ? 'analyses' : 'backtests'
  const runBase = kind === 'factor' ? APIs.RESEARCH_FACTOR_ANALYSES : APIs.RESEARCH_BACKTESTS
  const runKey = kind === 'factor' ? 'analysisId' : 'runId'
  const runKind = kind === 'factor' ? 'factor_analysis' : 'backtest'
  const label = kind === 'factor' ? 'factor' : 'strategy',
    pluralLabel = kind === 'factor' ? 'factors' : 'strategies',
    runLabel = kind === 'factor' ? 'factor analysis' : 'strategy backtest'
  const ids = { [key]: resourceId },
    runIds = { [runKey]: runId }
  const detail = s.resourceOutput(kind, true)
  const path = (input: p.Input) => `${base}/${String(input[key])}`
  const baseAction = {
    notes: sourceNote,
    related: [`${kind}.get`, `${kind}.get_source`],
    scope: read as ResearchScope,
  }
  add({
    ...baseAction,
    name: `${kind}.list`,
    description: `List accessible ${pluralLabel} with market, keyword, and cursor filters`,
    input: inputs.list,
    output: s.pageOutput(s.resourceOutput(kind)),
    exampleInput: { market: 'us', limit: 20 },
    exampleOutput: emptyPage,
    notes: `${sourceNote} Pass nextCursor unchanged to fetch the next page with the same filters; do not auto-fetch all pages. For factors, bindableOnly=true restricts results to resources upstream allows binding.`,
    execute: async (request, input) =>
      p.cursorPage(
        await request({
          path: base,
          query: {
            ...query(input),
            ...(kind === 'factor'
              ? { bindable_only: input.bindableOnly === true ? true : undefined }
              : {}),
          },
        }),
        kind === 'factor' ? 'factors' : 'strategies',
        (raw) => p.resource(raw, kind),
        Number(input.limit),
      ),
  })
  add({
    ...baseAction,
    name: `${kind}.get`,
    description: `Read ${label} details and current revisions, with optional source code`,
    input: inputs.get,
    output: detail,
    exampleInput: ids,
    exampleOutput: resourceExample(kind),
    execute: async (request, input) => {
      const raw = await request({ path: path(input) + (input.includeSource ? '/source' : '') })
      expectIdentity(raw, 'id', input[key])
      if (input.includeSource && typeof raw.code !== 'string')
        throw new ResearchError('INVALID_RESPONSE', 'Missing Research source')
      return p.resource(raw, kind, input.includeSource === true)
    },
  })
  add({
    ...baseAction,
    name: `${kind}.get_source`,
    description: `Read the current ${label} source code and revisions`,
    input: inputs.source,
    output: s.resourceOutput(kind, true, true),
    exampleInput: ids,
    exampleOutput: {
      ...resourceExample(kind),
      code: kind === 'factor' ? 'close' : '# Saved strategy source',
    },
    execute: async (request, input) => {
      const raw = await request({ path: `${path(input)}/source` })
      expectIdentity(raw, 'id', input[key])
      return p.resource(raw, kind, true)
    },
  })
  add({
    name: `${kind}.validate`,
    description: `Validate saved or draft ${label} source code without submitting a run`,
    scope: execute,
    input: inputs.validate,
    output: s.validationOutput,
    exampleInput: { ...ids, expectedSourceRevision: 3 },
    exampleOutput: {
      valid: true,
      diagnostics: [],
      codeSha256: 'example-sha256',
      sourceRevision: 3,
    },
    related: [`${kind}.get`, `${kind}.save_source`, `${kind}.${child}.submit`],
    notes:
      'Validate either by resource ID or by supplying draft code and market; do not mix the two input shapes. valid=false is a normal business result -- fix source diagnostics before proceeding. valid=true does not guarantee runtime success or absence of look-ahead bias.',
    execute: async (request, input) =>
      p.validation(
        await request({
          path: `${base}/validate`,
          method: 'POST',
          body:
            input[key] === undefined
              ? {
                  code: input.code,
                  market: input.market,
                  code_type: kind === 'factor' ? input.codeType : 'python',
                }
              : { [rawKey]: input[key], expected_source_revision: input.expectedSourceRevision },
        }),
      ),
  })
  add({
    name: `${kind}.${child}.submit`,
    description: `Submit an asynchronous ${runLabel} and return its run ID and status`,
    scope: execute,
    input: inputs.submit,
    output: s.runOutput(runKind, 'submission'),
    exampleInput: { ...ids, ...revExample },
    exampleOutput: runExample(kind, 'queued'),
    related: [
      `${kind}.get`,
      `${kind}.validate`,
      `${kind}.${child}.get`,
      kind === 'factor' ? 'factor.analysis.result.get' : 'backtest.result.get',
    ],
    notes: `${revisionNote} ${paramsNote} For ordinary runs, save user-specified settings with ${kind}.update first, verify parameters, parameterValidation.status=valid, aligned revisions, and no parametersDraft, then submit without ${kind === 'factor' ? 'parameters' : 'backtest'}. Only pass a one-off override when the user explicitly requests a temporary trial run; overrides are not persisted. ${runNote} Use the response id as ${runKey}; idempotent replays may return a terminal state immediately. ${kind === 'strategy' ? backtestViewNote : ''}`,
    execute: async (request, input) => {
      const raw = await request({
        path: `${path(input)}/${children}`,
        method: 'POST',
        body: {
          ...p.toSnake({
            requestId: input.requestId,
            expectedSourceRevision: input.expectedSourceRevision,
            expectedConfigRevision: input.expectedConfigRevision,
          }),
          parameters: parameters(input, kind),
          origin: p.toSnake(input.origin),
        },
      })
      expectIdentity(raw, rawKey, input[key])
      return p.run(raw, kind, true)
    },
  })
  for (const cancel of [false, true])
    add({
      name: `${kind}.${child}.${cancel ? 'cancel' : 'get'}`,
      description: cancel
        ? `Request cancellation of a ${runLabel} and return its current status`
        : `Read ${runLabel} status, progress, and metrics`,
      scope: cancel ? execute : read,
      input: kind === 'factor' ? s.factorRunInput : s.backtestRunInput,
      output: s.runOutput(runKind),
      exampleInput: runIds,
      exampleOutput: runExample(kind, cancel ? 'queued' : 'succeeded'),
      related: [
        `${kind}.${child}.get`,
        kind === 'factor' ? 'factor.analysis.result.get' : 'backtest.result.get',
      ],
      notes: `${runNote} ${cancel ? 'cancelRequested=true only indicates cancellation was requested, not that status=cancelled; cancel does not guarantee extra idempotency, so poll get after a timeout.' : 'Status responses omit source code and large result arrays, and error summaries never expose upstream stack traces.'} ${kind === 'strategy' && !cancel ? backtestViewNote : ''}`,
      execute: async (request, input) => {
        const raw =
          kind === 'strategy' && !cancel
            ? await readBacktest(request, String(input.runId))
            : await request({
                path: `${runBase}/${String(input[runKey])}${cancel ? '/cancel' : ''}`,
                method: cancel ? 'POST' : 'GET',
              })
        expectIdentity(raw, 'id', input[runKey])
        return p.run(raw, kind)
      },
    })
  add({
    name: `${kind}.${child}.list`,
    description: `List recent ${runLabel} runs for a specific ${label}`,
    scope: read,
    input: kind === 'factor' ? s.factorHistoryInput : s.backtestHistoryInput,
    output: kind === 'factor' ? s.pageOutput(s.runOutput(runKind)) : s.recentOutput,
    exampleInput: ids,
    exampleOutput:
      kind === 'factor' ? emptyPage : { items: [], requestedLimit: 100, possiblyTruncated: false },
    related: [`${kind}.${child}.search`, `${kind}.${child}.get`],
    notes:
      kind === 'factor'
        ? 'Upstream returns at most the 200 most recent runs and MCP slices by offset/limit; hasMore applies only within this batch (use nextOffset; nextCursor is null). When possiblyTruncated=true, use factor.analysis.search with factorId for complete history.'
        : 'Upstream returns only the most recent N runs (default 100, max 200). When possiblyTruncated=true, complete history cannot be guaranteed; use strategy.backtest.search for full search.',
    execute: async (request, input) => {
      const raw = await request({
        path: `${path(input)}/${children}`,
        query:
          kind === 'factor'
            ? { include_deleted: input.includeDeleted, status: input.status }
            : { limit: input.limit },
      })
      const rows = array(raw.runs).map((row) => {
        const item = object(row)
        expectIdentity(item, rawKey, input[key])
        return p.run(item, kind)
      })
      if (kind === 'factor') return p.slicePage(rows, input, 200)
      if (rows.length > Number(input.limit))
        throw new ResearchError('INVALID_RESPONSE', 'Backtest list exceeds the requested limit')
      return {
        items: rows,
        requestedLimit: input.limit,
        possiblyTruncated: rows.length === input.limit,
      }
    },
  })
  add({
    name: `${kind}.${child}.search`,
    description: `Search ${runLabel} summaries across ${pluralLabel} by status, time, and cursor`,
    scope: read,
    input: s.searchInput(kind),
    output: s.pageOutput(s.runOutput(runKind, 'summary')),
    exampleInput: { market: 'us', status: 'succeeded', limit: 10 },
    exampleOutput: emptyPage,
    related: [`${kind}.${child}.get`],
    notes:
      'Summary pages default to and cap at 10 items. Date-only filters use Asia/Shanghai calendar days with an inclusive end date; datetime inputs must include a timezone offset. Keep filter parameters identical when passing nextCursor. Summaries do not auto-fetch item details.',
    execute: async (request, input) =>
      p.cursorPage(
        await request({ path: runBase, query: query(input, true) }),
        'runs',
        (raw) => p.run(raw, kind),
        Number(input.limit),
      ),
  })

  // P1 uses the same registry and transport, without another runtime layer.
  add({
    name: `${kind}.create`,
    description: `Create a ${label} resource and return its ID and revisions`,
    scope: write,
    input: inputs.create,
    output: detail,
    exampleInput: {
      requestId: 'create-demo-1',
      title: 'Research example',
      market: 'us',
      code: kind === 'factor' ? 'close' : '# User-provided strategy source',
      ...(kind === 'factor' ? { codeType: 'formula' } : {}),
    },
    exampleOutput: resourceExample(kind),
    related: [`${kind}.validate`, `${kind}.${child}.submit`],
    notes: `${revisionNote} ${paramsNote} Strategy factorBinding may bind only a bindable factor version from the same market. Creating a resource does not start an analysis or backtest.`,
    execute: async (request, input) =>
      p.resource(
        await request({
          path: base,
          method: 'POST',
          body: {
            request_id: input.requestId,
            title: input.title,
            description: input.description ?? '',
            code: input.code,
            market: input.market,
            code_type: kind === 'factor' ? input.codeType : 'python',
            ...(kind === 'strategy'
              ? {
                  parameters: parameters(input, kind),
                  factor_binding:
                    input.factorBinding === null ? null : p.toSnake(input.factorBinding),
                }
              : {}),
            origin: p.toSnake(input.origin),
          },
        }),
        kind,
      ),
  })
  add({
    name: `${kind}.update`,
    description: `Update ${label} title, configuration, or factor binding`,
    scope: write,
    input: inputs.update,
    output: detail,
    exampleInput: { ...ids, baseConfigRevision: 2, title: 'Updated research example' },
    exampleOutput: {
      ...resourceExample(kind),
      title: 'Updated research example',
      configRevision: 3,
    },
    related: [`${kind}.get`, `${kind}.${child}.submit`],
    notes: `${revisionNote} ${paramsNote} Provide at least one change; this action does not modify source code. Verify returned parameters match user settings, parameterValidation.status=valid with aligned configRevision, and no parametersDraft remains. Fix any validation errors or drafts before submitting a run. Pass factorBinding=null on a strategy to unbind.`,
    execute: async (request, input) => {
      const raw = await request({
        path: path(input),
        method: 'PATCH',
        body: {
          base_config_revision: input.baseConfigRevision,
          title: input.title,
          description: input.description,
          parameters: parameters(input, kind),
          ...(kind === 'strategy'
            ? {
                request_id: input.requestId,
                factor_binding:
                  input.factorBinding === null ? null : p.toSnake(input.factorBinding),
              }
            : {}),
        },
      })
      expectIdentity(raw, 'id', input[key])
      return p.resource(raw, kind)
    },
  })
  add({
    name: `${kind}.save_source`,
    description: `Save ${label} source code using optimistic source revision locking`,
    scope: write,
    input: inputs.saveSource,
    output: detail,
    exampleInput: {
      ...ids,
      requestId: 'source-demo-1',
      baseSourceRevision: 3,
      code: kind === 'factor' ? 'close' : '# User-provided strategy source',
    },
    exampleOutput: { ...resourceExample(kind), sourceRevision: 4 },
    related: [`${kind}.get_source`, `${kind}.validate`],
    notes: `${revisionNote} Saving source does not trigger a run; inspect the returned validation receipt and call validate if missing or mismatched with the current source revision/hash before submitting.`,
    execute: async (request, input) => {
      const raw = await request({
        path: `${path(input)}/source`,
        method: 'PUT',
        body: {
          request_id: input.requestId,
          base_source_revision: input.baseSourceRevision,
          code: input.code,
          origin: p.toSnake(input.origin),
        },
      })
      expectIdentity(raw, 'id', input[key])
      return p.resource(raw, kind)
    },
  })
  add({
    name: `${kind}.delete`,
    description: `Delete a ${label} resource (requires top-level confirm=true)`,
    scope: write,
    input: inputs.delete,
    output: s.deletedOutput,
    exampleInput: ids,
    exampleOutput: { id: resourceId, deleted: true },
    related: [`${kind}.get`],
    notes:
      'Call only when the user explicitly requests deletion; the outer call must pass confirm=true. This boolean flag does not replace client authorization policies. Deletion has no extra idempotency guarantee; verify state after a timeout and do not call get on a deleted resource after success.',
    execute: async (request, input) => {
      const raw = await request({ path: path(input), method: 'DELETE' })
      expectIdentity(raw, 'id', input[key])
      // Factor DELETE currently returns the deleted resource; strategy DELETE a tombstone.
      if (kind === 'factor') {
        const parsed = v.safeParse(s.resourceOutput(kind, true), p.resource(raw, kind))
        if (!parsed.success && raw.deleted !== true)
          throw new ResearchError('INVALID_RESPONSE', 'Invalid deleted factor response')
      } else if (raw.deleted !== true)
        throw new ResearchError('INVALID_RESPONSE', 'Invalid deleted strategy response')
      return { id: input[key], deleted: true }
    },
  })
  add({
    name: `${kind}.${child}.restore`,
    description: `Restore the current ${label} resource from a succeeded ${runLabel}`,
    scope: write,
    input: inputs.restoreRun,
    output: detail,
    exampleInput: { ...ids, runId, ...revExample },
    exampleOutput: resourceExample(kind),
    related: [`${kind}.get`, `${kind}.${child}.get`],
    notes: `${revisionNote} Only a succeeded ordinary run belonging to this resource may be restored; upstream validates ownership and restorability.`,
    execute: async (request, input) => {
      const raw = object(
        (
          await request({
            path: `${path(input)}/${children}/${String(input.runId)}/restore`,
            method: 'POST',
            body: p.toSnake({
              requestId: input.requestId,
              expectedSourceRevision: input.expectedSourceRevision,
              expectedConfigRevision: input.expectedConfigRevision,
            }),
          })
        )[kind],
      )
      expectIdentity(raw, 'id', input[key])
      return p.resource(raw, kind)
    },
  })
  const versionBase =
    kind === 'factor' ? APIs.RESEARCH_FACTOR_VERSIONS : APIs.RESEARCH_STRATEGY_VERSIONS
  add({
    name: `${kind}.version.list`,
    description: `List frozen versions of a specific ${label}`,
    scope: read,
    input: inputs.versions,
    output: s.pageOutput(s.versionOutput(kind)),
    exampleInput: ids,
    exampleOutput: emptyPage,
    related: [`${kind}.version.get`, `${kind}.version.restore`],
    notes:
      'Upstream returns at most 1,000 versions and MCP slices by offset/limit; use nextOffset for the next page. When possiblyTruncated=true, switch to version.search; hasMore applies only within this batch. Summaries omit source code -- call get to read frozen source.',
    execute: async (request, input) => {
      const raw = await request({ path: `${path(input)}/versions` })
      return p.slicePage(
        array(raw.versions).map((row) => {
          const item = object(row)
          expectIdentity(item, rawKey, input[key])
          return p.version(item, kind)
        }),
        input,
        1000,
      )
    },
  })
  add({
    name: `${kind}.version.search`,
    description: `Search frozen ${label} versions globally`,
    scope: read,
    input: kind === 'factor' ? s.factorVersionSearch : s.searchInput('strategy', true),
    output: s.pageOutput(s.versionOutput(kind)),
    exampleInput: { market: 'us', limit: kind === 'factor' ? 20 : 10 },
    exampleOutput: emptyPage,
    related: [
      `${kind}.version.get`,
      ...(kind === 'factor' ? ['strategy.create', 'strategy.update'] : []),
    ],
    notes:
      kind === 'factor'
        ? 'Factor version search requires market; query maps to upstream q and is useful for strategy factor binding. Pass cursor unchanged; max 100 items per page.'
        : 'Strategy versions are immutable and do not support status or updated_at sorting; max 10 items per page, with date-only filters evaluated in Asia/Shanghai calendar days.',
    execute: async (request, input) =>
      p.cursorPage(
        await request({
          path: versionBase,
          query:
            kind === 'factor'
              ? {
                  limit: input.limit,
                  cursor: input.cursor,
                  market: input.market,
                  q: input.query,
                  factor_id: input.factorId,
                }
              : query(input, true),
        }),
        'versions',
        (raw) => p.version(raw, kind),
        Number(input.limit),
      ),
  })
  add({
    name: `${kind}.version.get`,
    description: `Read a frozen ${label} version and its source code`,
    scope: read,
    input: s.versionInput,
    output: s.versionOutput(kind, true),
    exampleInput: { versionId },
    exampleOutput: { ...versionExample(kind), code: '# Frozen source' },
    related: [`${kind}.version.restore`],
    notes:
      'Versions are read-only; reading a version does not modify the current resource. To make changes, restore it first and then edit the current resource separately.',
    execute: async (request, input) => {
      const raw = await request({ path: `${versionBase}/${String(input.versionId)}` })
      expectIdentity(raw, 'id', input.versionId)
      return p.version(raw, kind, true)
    },
  })
  add({
    name: `${kind}.version.create`,
    description: `Save an immutable frozen version from a succeeded ${runLabel}`,
    scope: write,
    input: inputs.createVersion,
    output: s.versionOutput(kind),
    exampleInput: { ...ids, requestId: 'version-demo-1', runId, name: 'Research example' },
    exampleOutput: versionExample(kind),
    related: [`${kind}.${child}.get`, `${kind}.version.get`],
    notes: `${revisionNote} Pass a succeeded ordinary analysis/backtest runId belonging to this resource; tuning runs are not accepted. name is a display label, not a file path.`,
    execute: async (request, input) => {
      const raw = await request({
        path: `${path(input)}/versions`,
        method: 'POST',
        body: {
          request_id: input.requestId,
          run_id: input.runId,
          name: input.name,
          description: input.description ?? '',
        },
      })
      expectIdentity(raw, rawKey, input[key])
      return p.version(raw, kind)
    },
  })
  add({
    name: `${kind}.version.restore`,
    description: `Restore the current ${label} from a frozen version`,
    scope: write,
    input: inputs.restoreVersion,
    output: detail,
    exampleInput: { ...ids, versionId, ...revExample },
    exampleOutput: resourceExample(kind),
    related: [`${kind}.get`, `${kind}.version.get`, `${kind}.validate`],
    notes: `${revisionNote} restore updates the current resource without altering the frozen version; re-validate after restoring before deciding to run.`,
    execute: async (request, input) => {
      const raw = object(
        (
          await request({
            path: `${path(input)}/versions/${String(input.versionId)}/restore`,
            method: 'POST',
            body: p.toSnake({
              requestId: input.requestId,
              expectedSourceRevision: input.expectedSourceRevision,
              expectedConfigRevision: input.expectedConfigRevision,
            }),
          })
        )[kind],
      )
      expectIdentity(raw, 'id', input[key])
      return p.resource(raw, kind)
    },
  })
}

add({
  name: 'factor.analysis.result.get',
  description: 'Read paginated tables or chart entries from a succeeded factor analysis',
  scope: read,
  input: s.factorResultInput,
  output: s.resultOutput(true),
  exampleInput: { analysisId: runId, field: 'factor_data', offset: 0, limit: 100 },
  exampleOutput: {
    analysisId: runId,
    field: 'factor_data',
    rows: [],
    total: 0,
    offset: 0,
    limit: 100,
    hasMore: false,
  },
  related: ['factor.analysis.get'],
  notes:
    'Readable only after succeeded. factor_data and last_date_top_factor paginate by array row; group_return_summary, return_chart, and ic_charts sort object keys deterministically and return {key, value} entries. null indicates an empty result. Preserve internal metric keys and units without truncating individual charts. Upstream currently returns the full analysis payload in one response and fails if it exceeds the byte budget.',
  execute: async (request, input) =>
    p.factorResults(
      await request({ path: `${APIs.RESEARCH_FACTOR_ANALYSES}/${String(input.analysisId)}` }),
      input,
    ),
})
add({
  name: 'backtest.result.get',
  description: 'Read paginated backtest equity, trades, logs, symbol metrics, or account summary',
  scope: read,
  input: s.resultInput,
  output: s.resultOutput(false),
  exampleInput: { runId, field: 'trades', offset: 0, limit: 100 },
  exampleOutput: {
    runId,
    field: 'trades',
    rows: [],
    total: 0,
    offset: 0,
    limit: 100,
    hasMore: false,
  },
  related: ['strategy.backtest.get', 'backtest.chart.get'],
  notes:
    'Supports intermediate results provided by upstream. partial=true indicates the run is still incomplete, and availableFrom/availableTotal describe the currently readable window; an empty page does not mean the run finished. On LIVE_RESULT_UNAVAILABLE, keep runId and retry with backoff. keyword filters result rows, and symbol applies only to trades. Use nextOffset when hasMore=true. Engine row fields keep original keys; account_summary has zero or one row object, and logs preserves log lines. All figures are backtest outputs, not a live trading account.',
  execute: async (request, input) => {
    return p.backtestResults(
      await readBacktestResult(request, {
        runId: String(input.runId),
        field: String(input.field),
        offset: Number(input.offset),
        limit: Number(input.limit),
        ...(input.keyword === undefined ? {} : { keyword: String(input.keyword) }),
        ...(input.symbol === undefined ? {} : { symbol: String(input.symbol) }),
      }),
      input,
    )
  },
})
add({
  name: 'backtest.chart.get',
  description: 'Read backtest equity curve, sampling metadata, and trade-day summaries',
  scope: read,
  input: s.chartInput,
  output: s.chartOutput,
  exampleInput: { runId, maxPoints: 1000 },
  exampleOutput: {
    runId,
    range: { from: null, to: null },
    extent: { from: null, to: null },
    points: [],
    sourceCount: 0,
    totalCount: 0,
    sampled: false,
    tradeDays: [],
  },
  related: ['strategy.backtest.get', 'backtest.result.get'],
  notes:
    'Supports available curves during queued, running, and terminal states; do not treat partial=true or complete=false as final results. On LIVE_RESULT_UNAVAILABLE, keep runId and retry with backoff. benchmark preserves the benchmark symbol and curve. maxPoints caps equity points only, not tradeDays or trades; narrow from/to if the response exceeds size limits. Preserve sampled, sourceCount, totalCount, complete, and partial without claiming sampled points are complete. Does not provide symbol K-lines.',
  execute: async (request, input) => {
    const raw = await readBacktestChart(request, {
      runId: String(input.runId),
      from: input.from as string | undefined,
      to: input.to as string | undefined,
      maxPoints: Number(input.maxPoints),
    })
    return p.chart(raw)
  },
})
for (const create of [false, true])
  add({
    name: `factor.snapshot.${create ? 'create' : 'list'}`,
    description: create
      ? 'Save a named snapshot for a factor analysis'
      : 'List saved analysis snapshots for a factor',
    scope: create ? write : read,
    input: create ? s.snapshotCreateInput : s.snapshotListInput,
    output: create ? s.snapshotOutput : s.pageOutput(s.snapshotOutput),
    exampleInput: create
      ? { factorId: resourceId, runId, name: 'Research example' }
      : { factorId: resourceId },
    exampleOutput: create
      ? { id: versionId, factorId: resourceId, runId, name: 'Research example' }
      : emptyPage,
    related: ['factor.analysis.get', 'factor.analysis.result.get'],
    notes: create
      ? 'Saving a snapshot does not re-run the analysis; upstream verifies ownership and availability. Extra idempotency is not guaranteed, so call list to verify after a timeout.'
      : 'Upstream returns at most the 200 most recent snapshots and MCP slices by offset/limit; possiblyTruncated=true means older snapshots may exist without another upstream paging endpoint. hasMore applies only within this batch. There is no standalone snapshot get action -- pass an item runId as analysisId to factor.analysis.get and factor.analysis.result.get.',
    execute: async (request, input) => {
      const raw = await request({
        path: `${APIs.RESEARCH_FACTORS}/${String(input.factorId)}/analysis-snapshots`,
        method: create ? 'POST' : 'GET',
        ...(create ? { body: { run_id: input.runId, name: input.name } } : {}),
      })
      return create
        ? p.snapshot(raw, input.factorId)
        : p.slicePage(
            array(raw.snapshots).map((row) => p.snapshot(object(row), input.factorId)),
            input,
            200,
          )
    },
  })

for (const action of tuningActions) add(action)

export const actions: ReadonlyMap<string, Action> = registry

export async function callAction(
  gateway: ResearchGateway,
  auth: AuthInfo,
  action: Action,
  input: unknown,
  confirm?: boolean,
) {
  const parsed = v.safeParse(action.input, input)
  if (!parsed.success)
    throw new ResearchError('INVALID_INPUT', 'Invalid Research action input', {
      issues: parsed.issues.slice(0, 20).map((issue) => ({
        message: issue.message,
        path: issue.path?.map((part) => String(part.key)).join('.') ?? '',
      })),
    })
  if (action.name.endsWith('.delete') && confirm !== true)
    throw new ResearchError(
      'CONFIRMATION_REQUIRED',
      'Deleting a Research resource requires confirm=true',
    )
  const raw = await action.execute(
    (request) => gateway.request(auth, action.scope, request),
    object(parsed.output),
  )
  const output = v.safeParse(action.output, raw)
  if (!output.success)
    throw new ResearchError(
      'INVALID_RESPONSE',
      'Research response does not match the action output schema',
    )
  const result = object(output.output)
  if (
    new TextEncoder().encode(JSON.stringify(result)).length >
    (gateway.options.maxOutputBytes ?? 1_048_576)
  )
    throw new ResearchError(
      'RESULT_TOO_LARGE',
      'Research result exceeds the output limit; reduce the page or range',
    )
  return result
}
