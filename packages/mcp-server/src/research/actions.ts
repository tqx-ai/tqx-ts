import type { AuthInfo } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import { ResearchError } from './errors'
import {
  type ResearchGateway,
  array,
  object,
  paths,
  type ResearchRequest,
  type ResearchScope,
} from './gateway'
import * as p from './projections'
import * as s from './schemas'

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
  '默认不返回源码；get_source 或 includeSource=true 返回源码。market 仅限 hk/us。parameters 保留引擎字段，不能作为任意更新输入。'
const runNote =
  'queued/preparing/running 尚未完成。约每 2 秒 get 一次，限流时退避；仅 succeeded 后读取结果。failed/cancelled 时停止后续步骤。等待超时保留 ID，不自动取消远端任务。'
const revisionNote =
  '先 get 当前 sourceRevision/configRevision，再提交。复用 requestId 仅重试完全相同的意图和输入；网络超时可能已经生效，先核实远端状态。revision 冲突时重新 get 后再决定，不自动覆盖。'
const paramsNote =
  '未传参数沿用上游保存配置与默认值。分析日期严格递增、最长五年；回测日频最长十年，1M 表示分钟频率、最长一年。stockPool/marketType/standardSymbol 是历史兼容枚举，不代表港美股专属池或基准；适用性由上游校验，不擅自替换。'
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
    base = paths[kind],
    key = `${kind}Id`,
    rawKey = `${kind}_id`
  const child = kind === 'factor' ? 'analysis' : 'backtest',
    children = kind === 'factor' ? 'analyses' : 'backtests'
  const runBase = kind === 'factor' ? paths.factorAnalysis : paths.backtest
  const runKey = kind === 'factor' ? 'analysisId' : 'runId'
  const runKind = kind === 'factor' ? 'factor_analysis' : 'backtest'
  const label = kind === 'factor' ? '因子' : '策略',
    runLabel = kind === 'factor' ? '因子分析' : '策略回测'
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
    description: `列出可访问的${label}，支持市场、关键词和游标`,
    input: inputs.list,
    output: s.pageOutput(s.resourceOutput(kind)),
    exampleInput: { market: 'us', limit: 20 },
    exampleOutput: emptyPage,
    notes: `${sourceNote} nextCursor 原样用于下一次同条件调用；不自动拉取所有页。因子 bindableOnly=true 仅筛选上游允许绑定的资源。`,
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
    description: `读取${label}详情及当前 revision，可选源码`,
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
    description: `读取${label}当前源码及 revision`,
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
    description: `校验${label}当前或临时源码，不提交运行`,
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
      '可以按资源 ID 校验，也可以提供临时 code 和 market；两种形状不能混用。valid=false 是正常业务结果，先根据 diagnostics 修正源码；valid=true 不保证运行成功，也不证明策略没有前视偏差。',
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
    description: `提交异步${runLabel}并返回运行 ID 和真实状态`,
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
    notes: `${revisionNote} ${paramsNote} ${runNote} 响应 id 作为后续 ${runKey}，幂等重放可能直接返回终态。`,
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
      description: cancel ? `请求取消${runLabel}，返回当前状态` : `读取${runLabel}状态、进度和指标`,
      scope: cancel ? execute : read,
      input: kind === 'factor' ? s.factorRunInput : s.backtestRunInput,
      output: s.runOutput(runKind),
      exampleInput: runIds,
      exampleOutput: runExample(kind, cancel ? 'queued' : 'succeeded'),
      related: [
        `${kind}.${child}.get`,
        kind === 'factor' ? 'factor.analysis.result.get' : 'backtest.result.get',
      ],
      notes: `${runNote} ${cancel ? 'cancelRequested=true 只表示取消已请求，不表示 status=cancelled；取消不承诺额外幂等性，超时后先 get。' : '状态响应不返回源码或大结果数组；错误摘要不会返回上游堆栈。'}`,
      execute: async (request, input) => {
        const raw = await request({
          path: `${runBase}/${String(input[runKey])}${cancel ? '/cancel' : ''}`,
          method: cancel ? 'POST' : 'GET',
        })
        expectIdentity(raw, 'id', input[runKey])
        return p.run(raw, kind)
      },
    })
  add({
    name: `${kind}.${child}.list`,
    description: `读取指定${label}的${runLabel}历史`,
    scope: read,
    input: kind === 'factor' ? s.factorHistoryInput : s.backtestHistoryInput,
    output: kind === 'factor' ? s.pageOutput(s.runOutput(runKind)) : s.recentOutput,
    exampleInput: ids,
    exampleOutput:
      kind === 'factor' ? emptyPage : { items: [], requestedLimit: 100, possiblyTruncated: false },
    related: [`${kind}.${child}.search`, `${kind}.${child}.get`],
    notes:
      kind === 'factor'
        ? '上游最多返回最近 200 条，MCP 按 offset/limit 做切片；hasMore 仅指这批数据内仍有下一页，使用 nextOffset，nextCursor=null。possiblyTruncated=true 时通过 factor.analysis.search 按 factorId 检索完整历史。'
        : '上游只支持最近 N 条（默认 100，上限 200）。possiblyTruncated=true 时无法证明全部历史已返回；完整检索使用 strategy.backtest.search。',
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
    description: `跨${label}搜索${runLabel}摘要，支持状态、时间和游标`,
    scope: read,
    input: s.searchInput(kind),
    output: s.pageOutput(s.runOutput(runKind, 'summary')),
    exampleInput: { market: 'us', status: 'succeeded', limit: 10 },
    exampleOutput: emptyPage,
    related: [`${kind}.${child}.get`],
    notes:
      'summary 默认 10 条、最多 10 条；纯日期过滤按上海自然日，to 包含当日。带时间的输入必须有时区。过滤条件保持不变，原样传回 nextCursor。摘要不逐项补拉详情。',
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
    description: `创建${label}资源并返回 ID 和 revision`,
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
    notes: `${revisionNote} ${paramsNote} 策略 factorBinding 只能绑定同市场且上游允许绑定的因子版本。创建本身不运行分析或回测。`,
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
    description: `更新${label}名称、配置或因子绑定`,
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
    notes: `${revisionNote} ${paramsNote} 至少传一项变更；不修改源码。策略解除绑定传 factorBinding=null。`,
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
    description: `使用 source revision 保存${label}源码`,
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
    notes: `${revisionNote} 保存不自动校验或运行；继续 validate，再 submit。`,
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
    description: `删除${label}资源，要求外层 confirm=true`,
    scope: write,
    input: inputs.delete,
    output: s.deletedOutput,
    exampleInput: ids,
    exampleOutput: { id: resourceId, deleted: true },
    related: [`${kind}.get`],
    notes:
      '仅在用户明确要求删除时调用，call 外层必须 confirm=true。布尔参数不替代客户端授权策略。删除没有额外幂等保证；超时后先核实状态。成功后不再次 get 已删除资源。',
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
    description: `从成功${runLabel}恢复当前${label}资源`,
    scope: write,
    input: inputs.restoreRun,
    output: detail,
    exampleInput: { ...ids, runId, ...revExample },
    exampleOutput: resourceExample(kind),
    related: [`${kind}.get`, `${kind}.${child}.get`],
    notes: `${revisionNote} 只能使用本资源的成功普通运行；上游检查归属和可恢复性。`,
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
  const versionBase = kind === 'factor' ? paths.factorVersion : paths.strategyVersion
  add({
    name: `${kind}.version.list`,
    description: `列出指定${label}的冻结版本`,
    scope: read,
    input: inputs.versions,
    output: s.pageOutput(s.versionOutput(kind)),
    exampleInput: ids,
    exampleOutput: emptyPage,
    related: [`${kind}.version.get`, `${kind}.version.restore`],
    notes:
      '上游最多返回 1000 个版本，MCP 按 offset/limit 切片；下一页用 nextOffset。possiblyTruncated=true 时改用 version.search，hasMore 只指本批内的下一页。摘要不含源码，get 才返回冻结源码。',
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
    description: `全局搜索${label}冻结版本`,
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
        ? '因子版本搜索必须传 market，query 映射为上游 q，可用于策略因子绑定。游标保持原值，最多 100 条。'
        : '策略版本不可变，不支持 status 或 updated_at 排序；最多 10 条，日期过滤按上海自然日。',
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
    description: `读取${label}版本及冻结源码`,
    scope: read,
    input: s.versionInput,
    output: s.versionOutput(kind, true),
    exampleInput: { versionId },
    exampleOutput: { ...versionExample(kind), code: '# Frozen source' },
    related: [`${kind}.version.restore`],
    notes: '版本只读；读取版本不会修改当前资源。需要修改时先 restore，再单独编辑当前资源。',
    execute: async (request, input) => {
      const raw = await request({ path: `${versionBase}/${String(input.versionId)}` })
      expectIdentity(raw, 'id', input.versionId)
      return p.version(raw, kind, true)
    },
  })
  add({
    name: `${kind}.version.create`,
    description: `从成功${runLabel}保存冻结版本`,
    scope: write,
    input: inputs.createVersion,
    output: s.versionOutput(kind),
    exampleInput: { ...ids, requestId: 'version-demo-1', runId, name: 'Research example' },
    exampleOutput: versionExample(kind),
    related: [`${kind}.${child}.get`, `${kind}.version.get`],
    notes: `${revisionNote} 必须传所属资源成功的普通分析/回测 runId，不接受调优运行。name 是版本名，不是路径。`,
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
    description: `从冻结版本恢复当前${label}`,
    scope: write,
    input: inputs.restoreVersion,
    output: detail,
    exampleInput: { ...ids, versionId, ...revExample },
    exampleOutput: resourceExample(kind),
    related: [`${kind}.get`, `${kind}.version.get`, `${kind}.validate`],
    notes: `${revisionNote} restore 修改当前资源，不修改冻结版本；恢复后重新 validate，再决定是否运行。`,
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
  description: '分页读取成功因子分析的统计表或图表条目',
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
    '仅 succeeded 可读。factor_data/last_date_top_factor 按数组行分页；group_return_summary/return_chart/ic_charts 按对象键稳定排序，返回 {key,value}。null 是空结果。保留内部指标键和单位，不截断单个图表。当前上游仍一次返回完整分析；超预算时失败，不伪称上游已分页。',
  execute: async (request, input) =>
    p.factorResults(
      await request({ path: `${paths.factorAnalysis}/${String(input.analysisId)}` }),
      input,
    ),
})
add({
  name: 'backtest.result.get',
  description: '分页读取回测净值、成交、日志、标的表现或账户汇总',
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
    '先通过 strategy.backtest.get 确认 succeeded，再读取结果。keyword 可搜索结果行，symbol 仅用于 trades。hasMore=true 时使用 nextOffset。引擎行字段保持原值；account_summary 的 rows 为空或含一个对象，logs 保留日志行。数据属于回测产物，不是真实交易账户。',
  execute: async (request, input) => {
    const state = await request({ path: `${paths.backtest}/${String(input.runId)}` })
    expectIdentity(state, 'id', input.runId)
    const projected = p.run(state, 'strategy')
    if (projected.status !== 'succeeded')
      throw new ResearchError('RUN_NOT_READY', 'Backtest results require a successful run', {
        status: projected.status,
      })
    return p.backtestResults(
      await request({
        path: `${paths.backtest}/${String(input.runId)}/result`,
        query: {
          field: input.field,
          offset: input.offset,
          limit: input.limit,
          q: input.keyword,
          symbol: input.symbol,
        },
      }),
      input,
    )
  },
})
add({
  name: 'backtest.chart.get',
  description: '读取回测净值曲线、采样信息和成交日摘要',
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
    '先确认回测 succeeded。maxPoints 只限制净值 points，不限制 tradeDays/trades；响应超限时收窄 from/to。保留 sampled/sourceCount/totalCount/complete，不将抽样结果称为完整结果。不提供标的 K 线。',
  execute: async (request, input) => {
    const state = await request({ path: `${paths.backtest}/${String(input.runId)}` })
    expectIdentity(state, 'id', input.runId)
    const projected = p.run(state, 'strategy')
    if (projected.status !== 'succeeded')
      throw new ResearchError('RUN_NOT_READY', 'Backtest chart requires a successful run', {
        status: projected.status,
      })
    const raw = await request({
      path: `${paths.backtest}/${String(input.runId)}/chart`,
      query: { from: input.from, to: input.to, max_points: input.maxPoints },
    })
    expectIdentity(raw, 'run_id', input.runId)
    if (array(raw.points).length > Number(input.maxPoints))
      throw new ResearchError('INVALID_RESPONSE', 'Chart exceeds maxPoints')
    return p.chart(raw)
  },
})
for (const create of [false, true])
  add({
    name: `factor.snapshot.${create ? 'create' : 'list'}`,
    description: create ? '为因子分析保存命名快照' : '读取因子的分析快照列表',
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
      ? '保存快照不重跑分析；归属和可用性由上游检查。不承诺额外幂等性，超时后先 list 核实。'
      : '上游最多返回最近 200 个快照，再按 offset/limit 切片；possiblyTruncated=true 表示可能还有更早快照，当前没有接口继续翻上游历史。hasMore 只指本批内的下一页。不存在独立快照 GET；从条目取 runId，作为 analysisId 调用分析状态和结果 action。',
    execute: async (request, input) => {
      const raw = await request({
        path: `${paths.factor}/${String(input.factorId)}/analysis-snapshots`,
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
