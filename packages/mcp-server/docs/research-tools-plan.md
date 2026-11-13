# Qube Research MCP Tools 规划

**调研基线：2026-11-12；方案简化与实现：2026-11-13；状态：P0/P1 已实现，部署环境的 Research audience 与网关鉴权仍需集成验证。**

## 1. 范围与结论

面向投研 Agent / LLM，只新增两个公开 MCP tools：

- tqx_research_explore：不传 action 时返回目录；传 action 时返回该 action 的完整说明书。
- tqx_research_call：通过 action 执行读取、校验、创建、修改、提交、取消、恢复等操作。

查询通过 call 的读取 action 完成。同步操作直接返回业务数据；异步分析和回测提交返回上游运行 ID，Agent 随后调用状态与结果 action。不新增独立查询工具、query ref、签名 handle 或本地任务存储。

本期覆盖因子、因子分析、策略、回测结果、版本和分析快照。只支持 hk / us，保持 Research 与交易账户体系独立。

明确排除：

- tqx_data / tqx-data 数据工具、数据函数目录、市场行情和财务数据查询。
- 独立标的 K 线查询；现有 BacktestApi 的 symbol-klines 也是数据读取，本期不暴露。
- 调优、ML 因子创建、转换、Research SSE watch，以及交易账户、持仓和下单。
- 任意 URL、HTTP method、Python 执行或任意 JSON 转发。

固定的工具层和逐步展开的 action 层：

```text
explore({})
  -> action 名称和含义
explore({ action: "strategy.backtest.submit" })
  -> input/output schema、前置条件、调用案例、相关文档、组合流程
call({ action: "strategy.backtest.submit", input: { ... } })
  -> backtest 运行 ID
call({ action: "strategy.backtest.get", input: { runId } })
  -> 运行状态、进度、指标
call({ action: "backtest.result.get", input: { runId, field: "trades" } })
  -> 结果页
```

## 2. 探索依据与适配边界

已核对仓库内的资源客户端与 schema：

| 来源                                      | 已有能力                                                            | 本方案处理                                        |
| ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| packages/sdk/src/research/factor-api.ts   | 28 个方法，包含因子、分析、版本、快照、调优和轮询                   | 保留普通因子研究；轮询由 Agent 重复 get；调优排除 |
| packages/sdk/src/research/strategy-api.ts | 29 个方法，包含策略、回测、版本、因子版本绑定、调优、本地校验和轮询 | 保留普通策略研究；全局因子版本搜索统一命名        |
| packages/sdk/src/research/backtest-api.ts | 结果页、曲线、标的 K 线，共 3 个方法                                | 保留前两个结果读取 action；K 线排除               |
| packages/sdk/src/research/events.ts       | 4 个流式订阅入口                                                    | 本期不实现                                        |
| packages/sdk/src/research/schemas.ts      | 输入校验、资源/运行/结果响应 schema                                 | 以此核对字段、ID、revision、日期和分页限制        |
| packages/sdk/src/config/APIs.ts           | 相对 qube/api 路径                                                  | 作为公开 gateway 路径基线                         |
| skills/tqx-research/references/sdk.md     | SDK 用法和 Research 状态语义                                        | action 说明书的关联文档                           |
| packages/mcp-server/AGENTS.md             | 独立 gateway、无数据库、token exchange、Valibot                     | 实现必须遵循                                      |

以下是**拟新增 MCP action 合同**，并不表示同名 SDK 方法或上游 endpoint 已经存在。MCP 输入和稳定输出使用 camelCase；gateway 负责与上游 snake_case 映射。引擎生成的指标、图表与结果行内部键保持原值，不递归改名或重新计算指标。

MCP server 不导入 @tqx-ai/sdk 或 @tqx-ai/cli，包括类型和相对源文件导入。在自身包内实现 gateway 和 schemas。Research base URL 以 /tqxApi 结尾，路径保持相对 qube/api，不能因根路径拼接丢失 /tqxApi。

本期共有 **43 个内部 action：P0 21 个、P1 22 个**。action 数量不等于 tools/list 的公开工具数量；后者固定增加 2 个。合并原先重复的 strategy.factor_versions.search / factor.version.search，只保留 factor.version.search；补齐独立的因子分析结果读取和策略版本全局搜索。

## 3. 两个工具的用法

### 3.1 tqx_research_explore

```ts
type ActionName = string // 第 5 节列出的 action 白名单
type ExploreInput = { action?: ActionName }

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }
```

不传 action，返回当前部署已上线的全部 action 名称和含义：

```ts
type ActionCatalog = {
  actions: Array<{ action: ActionName; description: string }>
}
```

P0 部署只列 P0，P1 上线后增加 P1。目录按名称排序，一次返回，不展开全部 schema。

传入 action，返回该 action 的输入输出 schema 和一份使用说明：

```ts
type ActionDetail = {
  action: ActionName
  description: string
  inputSchema: JsonObject // call 的 input 对象
  outputSchema: JsonObject // 该 action 成功时直接返回的业务对象
  documentation: string // Markdown
}
```

documentation 写清字段约束、所需 scope、前置条件、同步/异步行为、调用与响应案例、常见错误、相关文档及与其他 action 组合使用的方法。组合示例用自然语言、JSON 案例或表格表达，写明 ID 和 revision 的来源即可，不设计 bindings / when / repeat 等工作流结构。

schema 由执行时使用的同一份 Valibot schema 生成。文档作为静态 Markdown 随服务发布，返回必要说明和公开参考文档链接；不能只返回远程 Agent 无法访问的本机文件路径。

explore 只读取公开能力目录，不访问上游业务数据。缺少 scope 时仍可阅读说明，执行权限由 call 校验；不再维护 available、domain、phase 等展示元数据。不存在或尚未上线的 action 返回 UNKNOWN_ACTION。

### 3.2 tqx_research_call

```ts
type CallInput = {
  action: ActionName
  input: JsonObject
  confirm?: boolean // 仅删除 action 要求为 true
}
```

成功时直接返回第 5、6 节定义的业务对象，不增加 ok / action / data / nextActions 包装。例如提交回测直接返回：

```json
{
  "kind": "backtest",
  "id": "89abcdef0123456789abcdef",
  "resourceId": "0123456789abcdef01234567",
  "status": "queued",
  "terminal": false
}
```

异步任务后续使用哪个 action、如何轮询和读取结果，由 explore 的使用说明讲清，不让每次响应都携带下一步指令。

错误统一返回：

```ts
type ActionError = {
  error: {
    code: string
    message: string
    requestId?: string
    details?: JsonObject
  }
}
```

权限不足沿用现有 MCP scope challenge。handler 内的 action 输入校验、执行或响应校验错误使用 MCP 的 isError=true，并在结果中返回上述错误。工具外层参数校验和协议错误保留 SDK 原有格式。读取到远端 status='failed' 或 valid=false 仍是正常业务响应，不算工具执行错误。

### 3.3 schema 与 MCP 返回的关系

MCP 的 structuredContent / content 是标准工具结果结构；这里移除的是额外的业务包装。成功时 structuredContent 就是该 action 的业务对象，content 提供同一 JSON 的文本表示；错误时返回 ActionError 并设置 isError=true。

公开工具的 outputSchema 是可选项。首期 call 不声明覆盖全部 action 的公开 outputSchema，handler 按 registry 中对应的输出 schema 校验业务对象；精确 schema 由 explore({ action }) 按需返回。explore 也按自身目录/详情 schema 校验结果。不需要聚合 43 个 action 的输出或另定义一层 envelope。

call 的公开 inputSchema 只描述 action、input、confirm，handler 再按 action 校验具体 input。requestId 只放在相关 action 的 input 中。无需记录 Agent 是否先调用过 explore；熟悉合同的调用方可以直接 call。

call 混合读写，工具 annotations 采用保守值，不标记为只读；权限按具体 action 判定，不统一要求 write scope。

## 4. 通用输入定义

以下类型和各表共同定义每个 action 的完整输入；表中字段均带类型。所有整数必须是安全整数，所有数值必须有限，未知字段拒绝。

```ts
type Market = 'hk' | 'us'
type ResourceId = string // /^[0-9a-f]{24}$/
type RequestId = string // 1..128；/^[A-Za-z0-9][A-Za-z0-9._:-]*$/
type Revision = number // integer >= 1
type Code = string // UTF-8 <= 1 MiB
type Title = string // 1..200 Unicode 字符，无首尾空白、路径、控制字符、源码扩展名
type Description = string // <= 2000 字符
type Name = string // trim 后 1..120 字符
type Keyword = string // <= 200 字符
type Cursor = string // 1..1024 字符
type DateOnly = string // 合法 YYYY-MM-DD
type TimeFilter = string // DateOnly 或带时区的 ISO datetime
type RunStatus = 'preparing' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
type Origin = { sessionId: string; chatRunId: string } // 每个字段 1..128 字符

type ResourceListInput = {
  market?: Market
  keyword?: Keyword
  cursor?: Cursor
  limit?: number // 1..100，MCP 默认 20
}
type FactorListInput = ResourceListInput & { bindableOnly?: boolean }

type RunSearchInput = {
  market?: Market
  keyword?: Keyword
  title?: Keyword
  description?: Keyword
  cursor?: Cursor
  limit?: number // 1..10，默认 10
  status?: RunStatus
  timeField?: 'created_at' | 'updated_at'
  from?: TimeFilter
  to?: TimeFilter
}
type FactorAnalysisSearchInput = RunSearchInput & { factorId?: ResourceId }
type StrategyBacktestSearchInput = RunSearchInput & { strategyId?: ResourceId }
type StrategyVersionSearchInput = Omit<RunSearchInput, 'status' | 'timeField'> & {
  strategyId?: ResourceId
  timeField?: 'created_at'
}
type FactorVersionSearchInput = {
  market: Market
  query?: Keyword
  factorId?: ResourceId
  cursor?: Cursor
  limit?: number // 1..100，默认 20
}

type FactorAnalysisParameters = {
  periodStart?: DateOnly
  periodEnd?: DateOnly
  adjustmentCycle?: 1 | 3 | 5 | 10 | 20 | 30
  groupNumber?: 3 | 5 | 10 | 20
  factorDirection?: 1 | -1
  stockPool?: '沪深全A' | '沪深300' | '中证500' | '中证1000'
  marketType?: '主力'
}
type BacktestParameters = {
  periodStart?: DateOnly
  periodEnd?: DateOnly
  initBalance?: number // > 0
  commissionRate?: number // >= 0
  slippage?: number // >= 0
  frequency?: '1d' | '1M'
  standardSymbol?: 'sse_composite' | 'csi300' | 'csi500' | 'csi1000'
  marginRate?: number // integer >= 1
}
type FactorBinding = { factorId: ResourceId; factorVersionId: ResourceId }
type ExpectedRevisions = {
  expectedSourceRevision: Revision
  expectedConfigRevision: Revision
}
type RestoreInput = ExpectedRevisions & { requestId: RequestId }
type SourceUpdateInput = {
  requestId: RequestId
  baseSourceRevision: Revision
  code: Code
  origin?: Origin
}
type VersionCreateInput = {
  requestId: RequestId
  runId: ResourceId
  name: Name
  description?: Description
}
type ResultField = 'equity' | 'trades' | 'logs' | 'symbol_performance' | 'account_summary'
type FactorResultField =
  | 'factor_data'
  | 'group_return_summary'
  | 'last_date_top_factor'
  | 'return_chart'
  | 'ic_charts'
type OffsetPageInput = {
  offset?: number // integer >= 0，默认 0
  limit?: number // 1..500，默认 100
}
```

日期与市场约束：

- 因子分析起止严格递增，最长五年；回测起止不倒序，日频最长十年，1M 是分钟频率、最长一年。
- 日期过滤按现有 Research 语义：纯日期使用上海自然日，to 包含完整当日；带时间的过滤必须含时区，起点早于终点。
- stockPool、marketType、standardSymbol 是 SDK 中现有的历史市场兼容枚举，不是新增港美股池或基准。MCP 不擅自解释为 hk/us 标的；沿用上游市场校验，相关 action 详情必须解释适用性和默认行为。
- 未传参数沿用上游保存配置和默认值；不编造港美股专属参数或覆盖上游默认。
- 一次只使用所属领域的 factorId 或 strategyId；普通运行搜索不能使用调优状态 cancelling / no_valid_candidates。
- factorBinding 必须绑定同市场且上游允许绑定的因子版本；解除绑定使用 null。
- 参数更新和提交中的 partial 对象遵循各上游接口语义；MCP 不自动补全未知值。

## 5. 完整 action 清单

下表“输出”均为 call 直接返回的业务对象。R / X / W 分别表示 research:read / research:run / research:write。只有两个 submit 是异步 action，其余同步返回数据或错误；cancel 返回的是取消请求后的状态，未必已经取消完成。

### 5.1 因子：8 个 action

| Action             | 阶段 / scope | input                                                                                                                                           | 输出                                       |
| ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| factor.list        | P0 / R       | FactorListInput                                                                                                                                 | Page<FactorSummary>                        |
| factor.get         | P0 / R       | { factorId: ResourceId; includeSource?: boolean }                                                                                               | FactorDetail；includeSource=true 时含 code |
| factor.get_source  | P0 / R       | { factorId: ResourceId }                                                                                                                        | FactorSource                               |
| factor.validate    | P0 / X       | { factorId: ResourceId; expectedSourceRevision?: Revision } 或 { code: Code; market: Market; codeType: 'python' \| 'formula' }                  | ValidationResult                           |
| factor.create      | P1 / W       | { requestId: RequestId; title: Title; description?: Description; code: Code; codeType: 'python' \| 'formula'; market: Market; origin?: Origin } | FactorDetail                               |
| factor.update      | P1 / W       | { factorId: ResourceId; baseConfigRevision: Revision; title?: Title; description?: Description; parameters?: FactorAnalysisParameters }         | FactorDetail                               |
| factor.save_source | P1 / W       | { factorId: ResourceId } & SourceUpdateInput                                                                                                    | FactorDetail                               |
| factor.delete      | P1 / W       | { factorId: ResourceId }，外层 confirm=true                                                                                                     | DeletedResource                            |

factor.update 至少包含 title / description / parameters 中的一项。get_source 明确读取源码；普通列表和写 action 输出默认省略 code，避免把源码反复返回给 Agent。

### 5.2 因子分析与快照：9 个 action

| Action                     | 阶段 / scope | input                                                                                                                      | 输出                           |
| -------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| factor.analysis.submit     | P0 / X       | { factorId: ResourceId; requestId: RequestId; parameters?: FactorAnalysisParameters; origin?: Origin } & ExpectedRevisions | RunSubmission                  |
| factor.analysis.get        | P0 / R       | { analysisId: ResourceId }                                                                                                 | RunState，kind=factor_analysis |
| factor.analysis.list       | P0 / R       | { factorId: ResourceId; includeDeleted?: boolean; status?: RunStatus } & OffsetPageInput                                   | Page<RunState>                 |
| factor.analysis.search     | P0 / R       | FactorAnalysisSearchInput                                                                                                  | Page<RunSummary>               |
| factor.analysis.result.get | P0 / R       | { analysisId: ResourceId; field: FactorResultField } & OffsetPageInput                                                     | FactorResultPage               |
| factor.analysis.cancel     | P0 / X       | { analysisId: ResourceId }                                                                                                 | RunState，kind=factor_analysis |
| factor.analysis.restore    | P1 / W       | { factorId: ResourceId; runId: ResourceId } & RestoreInput                                                                 | FactorDetail                   |
| factor.snapshot.list       | P1 / R       | { factorId: ResourceId } & OffsetPageInput                                                                                 | Page<FactorSnapshot>           |
| factor.snapshot.create     | P1 / W       | { factorId: ResourceId; runId: ResourceId; name: Name }                                                                    | FactorSnapshot                 |

分析 submit 返回上游 run_id，规范化为 RunSubmission.id；后续 analysisId 即该值。分析快照从成功分析创建；其上游输入没有 requestId，MCP 不伪造幂等承诺。

factor.analysis.result.get 是对现有分析详情的受控投影，不假定上游存在独立结果分页 endpoint。get 只输出轻量状态，结果 action 按 field 从同一公开详情中提取并分页。MCP 不自行计算因子或指标。

### 5.3 策略：8 个 action

| Action               | 阶段 / scope | input                                                                                                                                                                                           | 输出                                         |
| -------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| strategy.list        | P0 / R       | ResourceListInput                                                                                                                                                                               | Page<StrategySummary>                        |
| strategy.get         | P0 / R       | { strategyId: ResourceId; includeSource?: boolean }                                                                                                                                             | StrategyDetail；includeSource=true 时含 code |
| strategy.get_source  | P0 / R       | { strategyId: ResourceId }                                                                                                                                                                      | StrategySource                               |
| strategy.validate    | P0 / X       | { strategyId: ResourceId; expectedSourceRevision: Revision } 或 { code: Code; market: Market }                                                                                                  | ValidationResult                             |
| strategy.create      | P1 / W       | { requestId: RequestId; title: Title; description?: Description; code: Code; market: Market; backtest?: BacktestParameters; factorBinding?: FactorBinding \| null; origin?: Origin }            | StrategyDetail                               |
| strategy.update      | P1 / W       | { strategyId: ResourceId; requestId?: RequestId; baseConfigRevision: Revision; title?: Title; description?: Description; backtest?: BacktestParameters; factorBinding?: FactorBinding \| null } | StrategyDetail                               |
| strategy.save_source | P1 / W       | { strategyId: ResourceId } & SourceUpdateInput                                                                                                                                                  | StrategyDetail                               |
| strategy.delete      | P1 / W       | { strategyId: ResourceId }，外层 confirm=true                                                                                                                                                   | DeletedResource                              |

策略源码为 Python。strategy.update 至少包含 title / description / backtest / factorBinding 中的一项。factor.version.search 已覆盖可绑定因子版本搜索，不重复提供同义 strategy action。

### 5.4 策略回测与结果：8 个 action

| Action                    | 阶段 / scope | input                                                                                                                | 输出                    |
| ------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| strategy.backtest.submit  | P0 / X       | { strategyId: ResourceId; requestId: RequestId; backtest?: BacktestParameters; origin?: Origin } & ExpectedRevisions | RunSubmission           |
| strategy.backtest.get     | P0 / R       | { runId: ResourceId }                                                                                                | RunState，kind=backtest |
| strategy.backtest.list    | P0 / R       | { strategyId: ResourceId; limit?: number }，limit=1..200，默认 100                                                   | RecentBacktests         |
| strategy.backtest.search  | P0 / R       | StrategyBacktestSearchInput                                                                                          | Page<RunSummary>        |
| strategy.backtest.cancel  | P0 / X       | { runId: ResourceId }                                                                                                | RunState，kind=backtest |
| strategy.backtest.restore | P1 / W       | { strategyId: ResourceId; runId: ResourceId } & RestoreInput                                                         | StrategyDetail          |
| backtest.result.get       | P0 / R       | { runId: ResourceId; field: ResultField; keyword?: Keyword; symbol?: string } & OffsetPageInput，symbol=1..64 字符   | BacktestResultPage      |
| backtest.chart.get        | P0 / R       | { runId: ResourceId; from?: TimeFilter; to?: TimeFilter; maxPoints?: number }，maxPoints=2..5000，默认 1000          | BacktestChart           |

symbol 只允许用于 field=trades。chart 的 from 不晚于 to。结果 action 在远端 succeeded 后使用；未完成返回 RUN_NOT_READY，error.details.status 保留当前状态，调用方按文档继续 get。失败/取消时保留真实终态，不把空结果当作成功。

### 5.5 因子与策略版本：10 个 action

| Action                   | 阶段 / scope | input                                                            | 输出                                        |
| ------------------------ | ------------ | ---------------------------------------------------------------- | ------------------------------------------- |
| factor.version.list      | P1 / R       | { factorId: ResourceId } & OffsetPageInput                       | Page<VersionSummary>，kind=factor_version   |
| factor.version.search    | P1 / R       | FactorVersionSearchInput                                         | Page<VersionSummary>，kind=factor_version   |
| factor.version.get       | P1 / R       | { versionId: ResourceId }                                        | VersionDetail，kind=factor_version          |
| factor.version.create    | P1 / W       | { factorId: ResourceId } & VersionCreateInput                    | VersionSummary，kind=factor_version         |
| factor.version.restore   | P1 / W       | { factorId: ResourceId; versionId: ResourceId } & RestoreInput   | FactorDetail                                |
| strategy.version.list    | P1 / R       | { strategyId: ResourceId } & OffsetPageInput                     | Page<VersionSummary>，kind=strategy_version |
| strategy.version.search  | P1 / R       | StrategyVersionSearchInput                                       | Page<VersionSummary>，kind=strategy_version |
| strategy.version.get     | P1 / R       | { versionId: ResourceId }                                        | VersionDetail，kind=strategy_version        |
| strategy.version.create  | P1 / W       | { strategyId: ResourceId } & VersionCreateInput                  | VersionSummary，kind=strategy_version       |
| strategy.version.restore | P1 / W       | { strategyId: ResourceId; versionId: ResourceId } & RestoreInput | StrategyDetail                              |

版本 create 仅接受所属资源的成功普通分析/回测 ID，不能用调优或转换运行代替。restore 使用请求 ID 与双 revision；冲突后先读取当前资源，再由 Agent 决定是否按用户目标重新提交，不自动覆盖。

## 6. 输出结构

### 6.1 资源摘要、详情和源码

```ts
type ResourceSummary = {
  id: ResourceId
  title: string
  description?: string
  market: Market
  codeType: 'python' | 'formula'
  sourceRevision: Revision
  configRevision: Revision
  createdAt?: string | null
  updatedAt?: string | null
}
type FactorSummary = ResourceSummary & { kind: 'factor' }
type StrategySummary = ResourceSummary & { kind: 'strategy'; codeType: 'python' }

type ResourceDetail = ResourceSummary & {
  parameters: JsonObject
  validation?: JsonObject | null
  parameterValidation?: JsonObject | null
  codeSha256?: string | null
  code?: string
}
type FactorDetail = ResourceDetail & { kind: 'factor' }
type StrategyDetail = ResourceDetail & {
  kind: 'strategy'
  codeType: 'python'
  factorBinding?: FactorBinding | null
}
type FactorSource = FactorDetail & { code: string }
type StrategySource = StrategyDetail & { code: string }
type DeletedResource = { id: ResourceId; deleted: true }
```

parameters 是上游持久化的公开配置，允许保留引擎字段；不能把它直接作为任意 update 输入，更新仍使用第 4、5 节的严格类型。includeSource=false 或未传时必须省略 code。删除成功直接返回 tombstone，不再读取已删除资源。

### 6.2 校验

```ts
type ValidationResult = {
  valid: boolean
  diagnostics: Array<{
    message: string
    code?: string
    field?: string | null
    line?: number
    column?: number
  }>
  codeSha256: string
  sourceRevision?: Revision
}
```

valid=false 是校验的正常业务结果，Agent 应按 diagnostics 修改源码，不应继续提交分析/回测。参数格式错误或校验请求失败才作为工具执行错误返回。

### 6.3 异步提交和运行状态

```ts
type RunSubmission = {
  kind: 'factor_analysis' | 'backtest'
  id: ResourceId
  resourceId: ResourceId
  status: RunStatus
  terminal: boolean
  idempotent?: boolean
  codeSha256?: string
  parameters?: JsonObject
}

type RunState = {
  kind: 'factor_analysis' | 'backtest'
  id: ResourceId
  resourceId: ResourceId
  status: RunStatus
  terminal: boolean
  progress?: JsonObject | null
  metrics?: JsonObject | null
  parameters?: JsonObject | null
  sourceRevision?: Revision
  configRevision?: Revision
  cancelRequested?: boolean
  error?: Json
  createdAt?: string | null
  updatedAt?: string | null
}
type RunSummary = {
  kind: 'factor_analysis' | 'backtest'
  id: ResourceId
  resourceId: ResourceId
  status: RunStatus
  market?: Market
  title?: string
  description?: string
  sourceRevision?: Revision
  configRevision?: Revision
  progress?: JsonObject | null
  metrics?: JsonObject | null
  createdAt?: string | null
  updatedAt?: string | null
}
```

terminal 只在 succeeded / failed / cancelled 时为 true；queued / preparing / running 都不是成功。submit 必须保留上游实际状态，包括幂等重放时可能已经达到的终态，不强行改成 accepted 或 succeeded。

非终态时，Agent 按文档以合理间隔调用同领域 get，遇到限流退避。cancelRequested=true 不能强行把 status 改成 cancelled。Agent 等待超时只停止轮询，不取消远端任务；本期不提供阻塞 wait action。

get 和列表只返回轻量字段，不能夹带源码、大结果数组、内部文件系统路径或上游存储元数据。全局 search 摘要未必含 progress / metrics，不为填充它们对每一项再发详情请求。

### 6.4 分页与近期回测

```ts
type Page<T> = {
  items: T[]
  hasMore: boolean
  nextCursor: string | null
  nextOffset?: number
  possiblyTruncated?: boolean
  counts?: Record<string, number>
}
type RecentBacktests = {
  items: RunState[]
  requestedLimit: number
  possiblyTruncated: boolean
}
```

分页边界：

- 因子/策略库、全局 search 使用上游 cursor，nextOffset 省略；nextCursor 原样传回同一 action，过滤条件必须保持一致。
- 按因子分析历史、快照列表、按资源版本列表的上游接口没有 cursor；MCP 从公开列表做有界切片，使用 offset / limit，nextCursor=null，并在 hasMore 时返回 nextOffset。分析历史、快照上游最多返回最近 200 条，版本最多 1000 条；达到上限时 possiblyTruncated=true。hasMore 仅表示当前批次仍有下一页，不宣称完整历史；分析和版本可用 search 继续检索，快照暂无上游历史分页。这里是结果投影，不引入任务或资源持久化。
- strategy.backtest.list 的上游只支持“最近 N 条”，没有完整分页或 total。返回 possiblyTruncated=(items.length === requestedLimit)，不能将等长列表断言为全部历史。完整历史使用 strategy.backtest.search。
- 一次只返回上限内数据。对必须整体读取的上游响应先设置字节上限和超时；超限返回 RESULT_TOO_LARGE，不宣称已支持上游流式分页。

### 6.5 版本和分析快照

```ts
type VersionSummary = {
  kind: 'factor_version' | 'strategy_version'
  id: ResourceId
  resourceId: ResourceId
  version: number
  name: string
  runId: ResourceId
  description?: string
  market?: Market
  codeType?: 'python' | 'formula'
  createdAt?: string | null
  readOnly: true
}
type VersionDetail = VersionSummary & {
  code: string
  codeSha256?: string | null
  parameters?: JsonObject
  factorBinding?: FactorBinding | null
}
type FactorSnapshot = {
  id: ResourceId
  factorId: ResourceId
  runId: ResourceId
  name: string
  createdAt?: string | null
  parameters?: JsonObject
  results?: {
    status?: RunStatus | null
    metrics?: JsonObject | null
    performancePreview?: JsonObject | null
    groupReturnSummary?: JsonObject | null
    lastDateTopFactor?: Json
  }
}
```

因子/策略版本的 parent ID 分别由 factor_id / strategy_id 映射为 resourceId。列表、搜索、创建输出不承诺源码，明确 get 后才返回冻结源码。快照不提供不存在的单快照 GET endpoint；先 list 取得 runId，再用 factor.analysis.get / factor.analysis.result.get 读取分析。

### 6.6 因子分析结果

```ts
type FactorResultPage = {
  analysisId: ResourceId
  field: FactorResultField
  rows: Json[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset?: number
}
```

field 对应的数据和解释：

| field                | rows 中每项                     | 用途                              |
| -------------------- | ------------------------------- | --------------------------------- |
| factor_data          | 上游因子统计表的一行 JsonObject | IC 等统计结果；字段随引擎输出保留 |
| last_date_top_factor | 上游最新截面的一行 JsonObject   | 最近日期的因子截面                |
| group_return_summary | { key: string; value: Json }    | 分组收益统计对象的顶层条目        |
| return_chart         | { key: string; value: Json }    | 收益图表集合的顶层条目            |
| ic_charts            | { key: string; value: Json }    | IC 图表集合的顶层条目             |

数组按原顺序分页；对象按键稳定排序后分页；null 视为无结果、rows=[]。保留图表内原始坐标、序列、null 和指标单位，不按值抽样或截断单个图表。整个响应超预算时返回 RESULT_TOO_LARGE，提示改取统计表或减少范围；不返回悄悄截短的图表。

因子详情接口当前一次返回全部公开结果；该投影可控制 MCP 输出大小，不能减少上游计算或传输量。若真实规模超过代理预算，后续必须推动上游提供结果分页接口。

### 6.7 回测结果页和曲线

```ts
type BacktestResultPage = {
  runId: ResourceId
  field: ResultField
  rows: Json[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset?: number
}
type BacktestChart = {
  runId: ResourceId
  range: { from: string | null; to: string | null }
  extent: { from: string | null; to: string | null }
  points: Array<{ ts: string; equity: number | null; breakBefore?: boolean }>
  sourceCount: number
  totalCount: number
  sampled: boolean
  tradeDays: Array<{
    day: string
    ts: string
    equity: number | null
    buyCount: number
    sellCount: number
    total: number
    counts: Record<string, number>
    trades: JsonObject[]
  }>
  dateAnchors?: Array<{ day: string; from: string; to: string }>
  complete?: boolean | null
}
```

| field              | rows 内容                          | 分页规则                                       |
| ------------------ | ---------------------------------- | ---------------------------------------------- |
| equity             | 引擎净值记录对象                   | 以记录为行；绘图优先 chart action              |
| trades             | 引擎成交记录对象                   | 支持 keyword 与 symbol；顺序、单位保持上游原值 |
| logs               | 日志行 string 或上游结构化日志对象 | 字符串按上游日志行分页                         |
| symbol_performance | 引擎标的表现记录对象               | 上游结果分页                                   |
| account_summary    | 一个账户汇总对象                   | total=0 或 1，rows=[] 或 [summary]             |

keyword 沿用上游结果行搜索能力；symbol 筛选仅适用于 trades。这些是回测产物，不查询真实交易账户。SDK 对结果 rows 是开放结构，不能在规划中伪造稳定的成交字段；MCP 稳定承诺外层分页与 field，内部引擎字段为受大小/深度约束的 JSON，详情案例使用验证过的固定 fixture 展示。

chart 的 maxPoints 约束净值 points，不能宣称它也限制 tradeDays / trades。对完整图表设置单独响应预算，必要时提示收窄 from/to。保留 sampled / sourceCount / totalCount / complete；不把抽样曲线标为完整原始结果。

## 7. 使用案例与组合用法

下面展示文档中的写法；explore 返回相同形式的 Markdown，不再定义可执行的工作流结构。ID 为虚构值，不会在规划阶段创建远端资源。

### 7.1 按需阅读说明

调用 tqx_research_explore：

```json
{}
```

得到 action 名称和含义。选择能力后，再展开：

```json
{ "action": "strategy.backtest.submit" }
```

详情返回该 action 的 inputSchema、outputSchema 和 documentation。documentation 应给出下面这样的调用案例、字段来源和结果处理方法。

### 7.2 已有策略：校验、提交、读取结果

依次调用 tqx_research_call：

```json
{
  "action": "strategy.get",
  "input": { "strategyId": "0123456789abcdef01234567" }
}
```

从响应根对象读取 sourceRevision 和 configRevision，假设分别为 3 和 2。先校验：

```json
{
  "action": "strategy.validate",
  "input": {
    "strategyId": "0123456789abcdef01234567",
    "expectedSourceRevision": 3
  }
}
```

响应 valid=true 后提交；valid=false 时先按 diagnostics 修正源码：

```json
{
  "action": "strategy.backtest.submit",
  "input": {
    "strategyId": "0123456789abcdef01234567",
    "requestId": "backtest-demo-1",
    "expectedSourceRevision": 3,
    "expectedConfigRevision": 2,
    "backtest": { "periodStart": "2025-01-01", "periodEnd": "2025-12-31", "frequency": "1d" }
  }
}
```

成功提交的业务响应直接为：

```json
{
  "kind": "backtest",
  "id": "89abcdef0123456789abcdef",
  "resourceId": "0123456789abcdef01234567",
  "status": "queued",
  "terminal": false
}
```

把响应 id 用作 runId：

```json
{
  "action": "strategy.backtest.get",
  "input": { "runId": "89abcdef0123456789abcdef" }
}
```

非终态时以合理间隔继续 get，遇到限流退避。仅在响应 status=succeeded 后读取结果：

```json
{
  "action": "backtest.result.get",
  "input": { "runId": "89abcdef0123456789abcdef", "field": "trades", "offset": 0, "limit": 100 }
}
```

响应直接是 BacktestResultPage；hasMore=true 时使用 nextOffset 取下一页。status=failed 时读取 error，cancelled 时结束；轮询超时保留 runId，不能当作远端已取消。提交遇到网络超时，使用相同 requestId 和输入核实或重试，不生成新任务。

### 7.3 因子版本绑定策略

组合用法只需要按顺序说明字段来源：

| action                   | 输入来源或条件                                             |
| ------------------------ | ---------------------------------------------------------- |
| factor.create            | 用户提供名称、源码和 hk/us 市场；响应保留 id 与双 revision |
| factor.validate          | 使用因子 id 与 sourceRevision；valid=false 时先修正源码    |
| factor.analysis.submit   | 使用因子 id 与双 revision；独立 requestId                  |
| factor.analysis.get      | submit 返回的 id 作为 analysisId，直到成功、失败或取消     |
| factor.version.create    | 分析成功后，使用因子 id 和分析运行 id，保留版本 id         |
| strategy.create          | 因子 id 与版本 id 组成 factorBinding，市场相同             |
| strategy.backtest.submit | 使用策略 id 与双 revision；随后 get 并读取回测结果         |

某一步失败后停止依赖它的后续步骤。revision 冲突时重新 get 当前资源，再决定是否按用户目标提交。

参考资料随 action 选择性引用并提供必要节选：

- skills/tqx-research/references/sdk.md：资源操作、分页、状态与 revision。
- skills/tqx-research/references/commands.md：现有操作和用户工作流。
- skills/tqx-research/references/factor-creation.md、factor-operators.md：因子源码案例。
- skills/tqx-research/references/strategy_templates.md、strategy-source.md：策略结构和源码约束。

这些路径用于构建时追溯，返回给 Agent 的 Markdown 使用可访问的公开文档引用。相关文档不扩张为 tqx_data 查询 action。

## 8. 必要的执行边界

只保留调用入口需要的约束：

- action 必须存在于 registry；输入严格校验，输出按该 action 的 schema 校验。
- R / X / W 分别使用 research:read / research:run / research:write；归属和业务限制继续由上游校验。
- 复用现有 OAuth、token exchange 和错误处理。只读可使用现有 token cache；执行和写入使用新鲜交换的 token，不透传 MCP token。
- 配置独立的 Research gateway 和 token audience，保持相对路径，不复用交易 gateway 假设。
- 保留上游 requestId、revision 与状态语义。对没有幂等键的 snapshot.create、delete、cancel，不承诺额外幂等性；超时后先核实状态。
- 对分页、响应体大小和请求超时设上限；超限报错，不悄悄截短结果。不创建数据库、本地任务表或工作流执行器。
- 输出不包含 token、API key、内部路径或堆栈。

错误使用第 3.2 节的 ActionError。需要明确处理的错误包括：UNKNOWN_ACTION、INVALID_INPUT、SOURCE_CONFLICT / CONFIG_CONFLICT、RUN_NOT_READY、RESULT_TOO_LARGE、NETWORK_ERROR / TIMEOUT、INVALID_RESPONSE，以及上游安全可公开的业务错误。

冲突时先读取最新 revision；未完成时继续状态读取；响应过大时缩小分页或范围。网络超时或响应校验失败不能推断远端写入未发生，不自动生成新的 requestId 重放。

注册工具使用现有 McpServer.registerTool 和 Valibot 适配。SDK 对工具外层参数产生的校验错误沿用 SDK 格式，未知公开工具等协议错误交给 SDK；进入 handler 后的 action 参数、执行及响应校验错误归一化为 ActionError。无需覆盖协议 handler 或新建错误协议。

## 9. 最小实现与交付顺序

在现有 MCP server 上添加 Research 模块，先按以下职责组织，不要求建立完整框架：

```text
src/research/
  tools.ts             # 注册 explore/call、返回 MCP 结果
  actions.ts           # action 白名单、scope、schema 和 handler
  schemas.ts           # 复用的输入/输出定义
  gateway.ts           # Research 路径、请求映射、响应解码
  documentation.ts     # 按 action 组装静态 Markdown 说明、案例和公开文档引用
```

配置、认证、token exchange、超时与错误辅助函数优先复用现有模块；需要时再拆文件，不为 Research 复制一套运行时。actions 和 docs 是静态内容，跨副本不依赖调用历史。

实现前核实 Research 的公开 base URL、token audience、错误格式和响应上限即可，不单独建立协议冻结阶段。

### P0：两个工具 + 21 个 action

- 因子读取与校验 4 个。
- 因子分析提交、状态、列表、搜索、结果和取消 6 个。
- 策略读取与校验 4 个。
- 回测提交、状态、列表、搜索、取消 5 个。
- 回测结果页和曲线 2 个。

同时提供这些 action 的输入输出 schema、Markdown 调用案例和组合用法。

### P1：22 个 action

- 因子和策略的创建、更新、保存源码、删除：8 个。
- 从分析/回测恢复当前资源：2 个。
- 版本列表、搜索、详情、创建、恢复：10 个。
- 分析快照列表和创建：2 个。

补齐创建、运行、保存版本与绑定策略的使用案例。此次仅简化工具合同和实现组织，不缩减原定的策略、因子、回测功能；以后有新能力再扩展 action，保持两个公开入口。

## 10. 验收标准

- tools/list 只增加 tqx_research_explore、tqx_research_call。
- explore({}) 返回 action 名称和含义；explore({ action }) 返回输入输出 schema 和 Markdown，包含案例、相关文档及组合用法。
- call 直接返回第 5、6 节业务结果；工具执行错误标记 isError，运行失败保留真实 status。
- action 清单、input、output 和示例一致，不残留统一业务包装、下一步指令或结构化工作流协议。
- 保留白名单、输入输出校验、权限、分页、超时、大小限制及 token 隔离；不提供任意 URL 代理。
- 不暴露 tqx_data / tqx-data、行情、财务、K 线或交易能力；不改 CLI / SDK。
- 实现时测试关键请求映射、权限、输入输出校验、分页、异步终态、revision 冲突和幂等重试；不为 Markdown 工作流另建解释器或测试框架。
- 文档执行 bun fmt 并审阅差异；交付前通过 bun run format:check、bun run docs:check 和 bun run test。
