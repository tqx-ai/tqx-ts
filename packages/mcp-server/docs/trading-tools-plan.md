# TQX Trading MCP Tools 设计方案

状态：首期实现完成；真实 OAuth/Trading 部署联调待完成

范围：把现有 trading API 能力以独立 MCP 接口提供，不引入 `@tqx-ai/cli` 或 `@tqx-ai/sdk` 依赖  
前提：按需求，MCP Token 置换 API Token 已完成，本方案不重新设计认证。OAuth 服务已实现置换协议；本轮在 MCP 包内新增 HTTP Basic/表单调用端、只读缓存和独立 trading gateway，按已完成服务的公开 HTTP 契约接入。

目标：在保持完整交易能力的同时，控制 `tools/list` 的上下文成本、减少模型选错工具的机会，并把读操作与外部写操作清晰隔离。

## 1. 结论

建议首期注册 **5 个 trading tools**，开发环境保留现有 `ping`，生产停用演示工具：

| Tool               | 主要职责                     | 覆盖交易操作                                | 权限                                  | 是否改变账户状态              |
| ------------------ | ---------------------------- | ------------------------------------------- | ------------------------------------- | ----------------------------- |
| `trading_snapshot` | 读取账户概览、持仓           | `getAccount`、`listPositions`               | `trade:read`                          | 否                            |
| `trading_activity` | 读取订单、成交、资金流水列表 | `listOrders`、`listTrades`、`listCashFlows` | `trade:read`                          | 否                            |
| `trading_lookup`   | 查询单个订单或交易信号       | `getOrder`、`getSignal`                     | 订单 `trade:read`；信号 `order:write` | 否                            |
| `trading_order`    | 下单、改单、撤单             | `placeOrder`、`modifyOrder`、`cancelOrder`  | `order:write`                         | 是                            |
| `trading_control`  | 标记 agent 当日活跃          | `hold`                                      | `trade:read`                          | 会改变 agent 活跃状态，不下单 |

这个数量的理由是：

- 读操作按用户任务分组，而不是按 HTTP endpoint 分组。
- 单条记录查询与分页列表查询分开，避免一个 schema 同时包含大量互斥参数。
- 所有会影响订单或 agent 状态的操作集中到明确的写 tool，便于客户端审批、审计和限流。
- 下单、改单、撤单共享订单生命周期，但输入使用互斥的 `action` 分支，避免暴露三个几乎重复的 tool。
- `hold` 保持单独 tool，避免模型把“保持活跃”误认为订单操作。

如果后续发现 `trading_activity` 的多态 schema 让目标模型选择率下降，可以把它拆成 `trading_orders` 和 `trading_ledger`，总数变为 6；不建议一开始就拆成每个接口一个 tool。

### 1.2 Bug report capability

已完成 `submit_bug_report` MCP tool 和 `prepare_bug_report` prompt：

- `submit_bug_report` 调用 `POST /openapi/v1/bug-reports`，输入为 `title`、`description` 和可选 `idempotencyKey`，返回 `bug_id` 与 `created_at`。
- 该 tool 是外部写操作，annotations 为 `readOnlyHint=false`、`destructiveHint=true`、`idempotentHint=true`，每次调用都绕过下游 token 只读缓存。
- MCP tool 从当前 MCP token 动态选择已有 Trading Resource scope：优先使用 `ranking:read`（不要求 Agent），没有时使用带 Agent 的 `trade:read` 或 `order:write`。没有可用 Trading scope 时返回 `ranking:read` scope challenge，让客户端可以进行 step-up 授权。本次不新增 `bug:write`，也不修改 `tqx-oauth` 或 `panda_openapi` 的 scope 契约。当前真实 OAuth、panda_openapi 和部署联调仍待完成。
- `prepare_bug_report` 只在 trading gateway 启用时注册，不接收预填参数，只生成给 Agent 的工作流指令：先排查问题归属，只有证据表明是 TQX 问题时才整理证据；整理完成后直接调用 `submit_bug_report`，并在调用后用用户当前对话的语言和文字体系报告发送状态、`bug_id`/`created_at`，优先使用 client/host 支持的“信封”式富 UI 展示实际提交的标题和 description，不支持时退化为 Markdown，也不伪造未支持的 UI 协议。API 字段名、标识符、代码、日志和请求/响应值保持原样。Prompt 本身不访问上游，实际提交由 Agent 调用 tool 完成。
- 当前仍依赖已有 trading resource 配置；使用 `ranking:read` 时 bug report 不依赖 Agent，上游只有 `trade:read`/`order:write` 时则沿用其 Agent 绑定要求。真实 OAuth、panda_openapi 和部署联调待完成。

## 1.1 独立实现边界

`packages/mcp-server` 必须是独立的 MCP resource server：

- 不在 `package.json` 中增加 `@tqx-ai/cli` 或 `@tqx-ai/sdk`。
- 不从 CLI/SDK 导入运行时代码、类型、Valibot schema、error class 或 client。
- 不通过 workspace dependency、路径别名或构建配置间接依赖这两个包。
- MCP server 自己维护 trading gateway client、请求/响应类型、输入校验、错误映射和测试 fixture。
- CLI 和 SDK 源码只用于人工确认现有 API 契约；后续两边的重构不应自动改变 MCP 的工具契约。

这样可以保证 MCP 的发布、升级和故障隔离不会影响已经稳定的 CLI；也避免 MCP 为了复用代码而把 CLI 的输出、凭证或生命周期耦合进来。

## 2. 设计原则

### 2.1 Tool 是用户任务边界，不是 API 映射

MCP tool 的名称和描述是模型选择工具时看到的主要信息。应围绕以下自然语言任务设计：

- “看看账户和当前持仓” → `trading_snapshot`
- “查最近成交/订单/资金变化” → `trading_activity`
- “这个订单或信号现在什么状态” → `trading_lookup`
- “帮我下单/改单/撤单” → `trading_order`
- “今天标记为 active” → `trading_control`

不要把 `GET /openapi/v1/trading/orders`、`PATCH /orders/:id` 直接暴露为工具名。endpoint 是 MCP gateway 内部实现细节，不应成为模型的概念模型。

### 2.2 读和写必须在工具层可见

工具描述、annotations、scope 和返回结构都要让客户端能在调用前判断风险：

- 所有 tools 显式设置 `openWorldHint: true`，因为会访问外部 trading 服务。
- 只读 tool：`readOnlyHint: true`、`destructiveHint: false`、`idempotentHint: true`。
- `trading_order`：`readOnlyHint: false`、`destructiveHint: true`、`idempotentHint: false`。其中是否真正“破坏性”由客户端审批策略决定，但下单、改单、撤单都应默认要求确认。
- `trading_control`：`readOnlyHint: false`、`destructiveHint: false`、`idempotentHint: true`。
- 这些 annotation 是给客户端的行为提示，不代替服务端 scope、输入校验、幂等键或二次确认。

MCP 官方工具规范将 annotations 定义为客户端可用的行为提示；MCP server 使用当前已安装的 MCP SDK v2 注册工具。交易输入、响应和错误由 MCP server 自己维护，不能通过引入 CLI/SDK 包来复用。

### 2.3 返回结果要面向模型，而不是复制 CLI 文本

CLI 的 human/plain/json 三种输出契约不应直接搬进 MCP；CLI 只作为行为参考，不是 MCP 的运行时依赖。MCP handler 返回结构化 JSON 内容，建议：

- 顶层固定 `kind`、`data`、`meta`。`data` 中业务字段沿用 trading API 的 snake_case，只有 MCP 外层元数据使用 camelCase。不要静默丢弃订单状态、金额币种或错误诊断字段。
- 分页列表返回 `items` 和 `next_cursor`。
- 写操作明确区分“请求已接受”和“最终状态已确认”。
- 不在返回值中回显 API token、MCP token、内部 URL、上游 Authorization header 或完整请求体中的敏感字段。
- 数量、价格、金额继续使用字符串，避免 JSON number 的精度损失。
- 时间使用上游返回的 ISO 字符串；资金流水保留原生币种，不在 MCP 层猜测换算结果。

通过 MCP `structuredContent` 返回该对象，并按兼容要求提供 JSON text content；这两份内容可能被 host 同时传给模型，需要计入实际响应预算。原始业务时间和 stale 标记留在 data 中，`retrievedAt` 仅表示取回时间，不能冒充数据新鲜度。

建议的公共返回包装：

```json
{
  "kind": "trading.activity",
  "data": {
    "type": "orders",
    "items": [],
    "next_cursor": null
  },
  "meta": {
    "retrievedAt": "2026-11-05T08:00:00Z"
  }
}
```

MCP server 定义自己的 typed error 分类和错误映射，保持与上游 trading API 的错误 code 对齐，但不导入 SDK error 类型。tool handler 把可恢复的业务错误转换为 `isError: true` 的清晰文本或结构化错误数据；不要把原始 parser、Fetch 或 schema 异常泄漏给 MCP 客户端。

## 3. 五个 tools 的具体契约

下面的字段是面向 MCP 的建议输入。MCP server 自己负责 Valibot schema、URL 编码、query/body 映射、Fetch 调用和响应解码；所有 endpoint 集中定义在 MCP server 内部的 trading gateway 模块。

### 3.1 `trading_snapshot`

用途：回答账户资产和当前持仓问题。一次调用可以请求一个或两个 section，减少模型为了回答“账户和持仓”而连续调用两个 tool。

建议输入：

```ts
{
  sections: Array<'account' | 'positions'> // 默认 ['account', 'positions']
  currency?: 'HKD' | 'USD'       // 仅 account
  symbol?: string                 // 仅 positions
  market?: 'HK' | 'US'            // 仅 positions
  limit?: number
  cursor?: string
}
```

约束：

- `sections` 至少一个元素，去重后执行。
- `currency`、`symbol`、`market` 只影响对应 section；未选择对应 section 时拒绝这些参数，避免静默忽略筛选条件。两个 section 并发读取但不保证原子快照，保留各自时间。
- 当同时请求两个 section 时，返回 `data.account` 和 `data.positions`，一个 section 的失败不能被空数组伪装；成功数据保留，失败 section 为 null，`meta.errors` 标注 section/code/message，整体 `isError: true`。全部成功时省略 errors。
- `is_stale`、`as_of` 等上游字段必须原样保留。
- 只读、幂等、可自动批准。

### 3.2 `trading_activity`

用途：查询分页列表。用 `type` 作为唯一分流字段，避免同时出现多组互斥参数。

建议输入：

```ts
{
  type: 'orders' | 'trades' | 'cash_flows'
  market?: 'HK' | 'US'       // 仅 trades 可用
  orderId?: string           // trades 可用
  startDate?: string         // cash_flows，可选 YYYY-MM-DD
  endDate?: string           // cash_flows，可选 YYYY-MM-DD
  currency?: string          // cash_flows
  limit?: number
  cursor?: string
}
```

实现上最好定义三个 Valibot 分支，再用 discriminated union 生成 JSON Schema：

- `orders`：只接受 `limit`、`cursor`；当前只查询活跃订单，不承诺历史订单或 market 筛选。
- `trades`：只接受 `market`、`orderId`、`limit`、`cursor`。
- `cash_flows`：只接受 `startDate`、`endDate`、`currency`、`limit`、`cursor`。

不要允许“所有字段都可选”的宽松对象；那会增加模型的组合空间，也容易把订单筛选字段错误传给资金流水接口。对于 `cash_flows_unsupported`，返回明确的业务错误，不能转换为空列表。

### 3.3 `trading_lookup`

用途：查询一个订单或信号的当前状态。

建议输入：

```ts
{
  type: 'order' | 'signal'
  id: string
}
```

行为：

- `type: 'order'` 调用 `getOrder`。
- `type: 'signal'` 调用 `getSignal`。
- 订单 ID 和 signal ID 由 MCP server 自己校验长度并进行 URL 编码；signal ID 最少 8 字符，两者最多 128 字符。
- 对 signal 返回必须说明：`state` 是 signal 生命周期，不等于关联订单最终状态；`order_status` 可能暂时为空。
- 对订单状态返回必须区分 `PENDING`、`SUBMITTED`、`PARTIAL_FILLED`、`FILLED`、`CANCELLED`、`REJECTED` 等状态，不在 MCP 层自行归类。

### 3.4 `trading_order`

用途：所有订单写操作。使用 `action` discriminated union，避免模型把改单参数和下单参数混用。

建议输入：

```ts
{
  action: 'place'
  symbol: string
  side: 'BUY' | 'SELL'
  orderType: 'MARKET' | 'LIMIT'
  quantity: string
  price?: string
  reason?: string
  timeInForce?: 'DAY'
  idempotencyKey: string
}
```

或：

```ts
{
  action: 'modify'
  orderId: string
  price: string
}
```

或：

```ts
{
  action: 'cancel'
  orderId: string
}
```

安全要求：

- `place` 必须要求显式 `idempotencyKey`，由调用方在第一次请求前生成并保存。同一交易意图重试必须复用原 key 和完全相同的参数，新交易意图必须新建 key。无状态 server 不在每次调用时随机补 key，也不引入本地幂等数据库。
- `MARKET` 禁止 `price`，`LIMIT` 必须有 `price`。在 MCP server 内定义等价的严格校验；不能复用 SDK schema。
- 首期不在 schema 中增加 `confirm` 或 `yes` 字段。MCP 客户端的用户确认属于 host 交互层；服务端以 `order:write` scope、风险策略和审计为准。若部署明确要求服务端二次确认，应另设计一次性 confirmation token，而不是布尔值。
- place 的返回是 signal envelope；必须明确 `state: ACCEPTED` 只表示请求被接受，不表示订单已经成交。
- modify 的返回 `accepted` 只表示改单请求被接受。
- cancel 的返回 `accepted` 只表示撤单请求被接受，不表示订单已经是 `CANCELLED`。
- 写请求出现网络超时不能当作未执行。place 优先查询已有 signal；无 signal ID 时只能使用同一个 key、相同参数重试，并以已验证的上游幂等契约为前提。后端 modify/cancel 支持可选幂等键，缺省时按账户、订单和目标价派生；MCP 首期不暴露此可选参数，仍禁止自动重试，先查询订单并报告不确定状态。
- 同一调用不自动轮询订单最终状态。模型需要最终状态时，再调用 `trading_lookup`；这能控制延迟和下游压力。
- 写操作每次执行前都做实时 token exchange，不使用只读 token cache；这一点与 MCP 包现有架构约束一致。

### 3.5 `trading_control`

用途：执行不下单但会改变 agent 活跃状态的控制操作。

建议输入：

```ts
{
  action: 'hold'
}
```

行为：

- 调用 MCP server 自己的 trading gateway `hold` 操作。
- 返回上游 API 的原始业务字段 `agent_id`、`activity_date`、`is_active`、`first_active_at`、`newly_marked`。
- `hold` 应当是幂等的：重复调用不会重复产生交易。
- 工具描述必须写清“不会下单”，避免模型把它当成交易确认或订单操作。
- 后端当前要求 `trade:read`；权限与是否写入状态分开定义，不能根据 HTTP method 推导 scope。即便使用读取权限，hold 仍需要实时 exchange，不复用缓存。

## 4. 为什么不采用其他归并方式

### 一个万能 `trading` tool

不建议。它会同时暴露账户、列表、单条查询、下单、改单、撤单和 hold 的大量可选字段。模型容易生成互相冲突的参数；写操作也会和只读操作共享一个工具入口，客户端更难做审批和 scope 呈现。

### 每个 SDK method 一个 tool

不建议作为首期方案。11 个 trading tools 会把同一领域的描述、schema 和参数重复注入上下文；`getOrder`、`getSignal`，以及 `listOrders`、`listTrades`、`listCashFlows` 都属于可以用 `type` 清晰归并的同类任务。

### 一个“提交并等待最终结果”的复合 tool

不建议。下单响应是 signal 状态，订单最终状态需要后续查询；把轮询塞入一个 tool 会增加不可控延迟、超时和重复请求风险，也会掩盖“accepted 不等于 filled/cancelled”的业务语义。

### 把搜索/行情能力混入 trading tools

不建议。当前 trading API 契约没有报价、搜索标的或行情接口。未来如接入行情，应按研究/市场数据任务单独设计，不能在 `trading_snapshot` 或 `trading_order` 中隐式补数据。

## 5. 权限、认证和调用流程

业务 tool 接入前必须沿用 MCP 包的 Bearer 校验与已完成的 RFC 8693 token exchange 能力边界：

```text
MCP access token
  -> 验证 issuer / audience / exp / scope
  -> 按 tool 所需 scope 做授权
  -> exchange 为下游 API token
  -> 创建 MCP server 自己的 trading gateway client
  -> 调用集中定义的 trading operation
  -> 返回脱敏、结构化结果
```

建议 scope 绑定：

| Tool               | 必需 scope                            | Token cache                         |
| ------------------ | ------------------------------------- | ----------------------------------- |
| `trading_snapshot` | `trade:read`                          | 允许短 TTL 只读缓存                 |
| `trading_activity` | `trade:read`                          | 允许短 TTL 只读缓存                 |
| `trading_lookup`   | 订单 `trade:read`；信号 `order:write` | 订单允许缓存；信号每次实时 exchange |
| `trading_order`    | `order:write`                         | 禁止复用只读缓存，每次实时 exchange |
| `trading_control`  | `trade:read`                          | 必须实时 exchange，不读写缓存       |

必须把 scope 检查放在 handler 执行之前。缺 scope 返回 HTTP/MCP 约定的 `403 insufficient_scope`，不要等到下游 API 才发现权限不足。MCP token 不得直接作为 trading API token 转发。

`trading_lookup` 的权限挑战只读取 `type`：`signal` 要求 `order:write`，其余情况默认要求 `trade:read`。即便 id 长度非法或参数缺失，缺权限仍先返回 403；权限通过后才执行完整的 Valibot 输入校验。

### Trading Resource 调用契约（2026-11-06 核对）

- 向 `<issuer>/oauth/token` 发送 RFC 8693 表单，使用 HTTP Basic `<TQX_MCP_EXCHANGE_CLIENT_ID>:<secret>`；`resource` 通常为 `https://www.tqx.trade/openapi`，须与同一环境的后端 audience 精确一致。
- trading 请求只发送 `Authorization: Bearer <置换后的 API Token>`，不发送 `X-API-Key`，不透传原始 MCP Token。后端会拒绝混合或重复凭证；无效 Bearer 不回退 API Key。
- 账户、持仓、订单列表、成交、资金流水和订单详情要求 `trade:read`；信号详情要求 `order:write`；`hold` 要求 `trade:read`。后端路径为 `/openapi/v1/trading/...`，scope 不根据 method 推导。
- 后端验证 RS256、issuer、精确 audience、`client_id`、`act.sub`、`delegated_client_id` 和有效期，并查询派生 JTI 的实时 active 状态以及 user/agent 归属。MCP 不自行构造这些声明。
- 业务成功同时要求 HTTP 2xx 与 envelope `code == "0"`。信号 `time_in_force` 允许 null；改单返回的 `new_order_id` 和 action 状态必须保留，后续应跟踪新订单 ID。信号返回的 `available_cash`、`cash_max_quantity`、`margin_max_quantity` 保留，不能把含融资购买力当作现金可买额度。
- 本地后端 OAuth 单测与 MCP 调用测试用于验证契约；它们不代表真实部署联调完成。

部署时两侧配置必须逐项一致：

| MCP server                 | Trading Resource         | 约定                                                      |
| -------------------------- | ------------------------ | --------------------------------------------------------- |
| `TQX_MCP_OAUTH_ISSUER`     | `OPENAPI_OAUTH_ISSUER`   | 同一个签发方，通常 `https://auth.tqx.ai`                  |
| `TQX_MCP_TRADING_RESOURCE` | `OPENAPI_OAUTH_AUDIENCE` | 同一个下游 audience，通常 `https://www.tqx.trade/openapi` |

`TQX_MCP_RESOURCE_URL` 仍为 MCP 自身的 audience（通常 `/mcp`），不要与 trading resource 混用。上述变量定义部署契约，并不表示已经读取或验证线上环境的实际值。

### 5.1 进程内 KV 与 API Token 缓存

采用用户提供的 `KvUtil` 思路：以 `Map` 保存值与绝对过期时间，读取时检查过期，后台清理只负责回收内存。只缓存已置换的 API Token，不缓存交易结果，不引入 Redis、数据库或磁盘持久化。进程重启或请求落到另一个副本时，缓存未命中就重新置换，不影响业务正确性。

分为两层，均在 MCP 包内独立实现：

| 模块                             | 职责                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `src/utils/kv-util.ts`           | 通用、实例化的 `KvUtil<T>`：TTL、容量上限、LRU 淘汰、删除、清理；不理解 OAuth 或权限 |
| `src/auth/api-token-provider.ts` | 对接已完成的 token exchange；负责缓存键、有效期、scope、读写策略、并发合并和失效处理 |

已实现的 KV 接口形态如下：

```ts
interface KvStore<T> {
  get(key: string): T | undefined
  set(key: string, value: T, ttlMs: number): void
  delete(key: string): boolean
  sweep(): void
  clear(): void
  dispose(): void
}
```

实现采用惰性清理；通用 KV 另提供可选 `startCleanup()`，Token provider 默认不启动定时器。构造时注入 `now: () => number` 和 `maxEntries`；统一使用毫秒，避免原实现中 set 用分钟、inc 用秒的混用。缓存存储泛型对象，不要求把 token 元数据序列化为字符串。只在应用启动时创建一个有容量上限的缓存实例并注入 provider，不能随每次 MCP server/request 创建新缓存；也不使用公开的 static Map 或全局“当前用户”。缓存实例可共享，条目必须按身份和权限隔离。

#### 相比原 KvUtil 的调整

- 过期条件统一为 `expireAt <= now`，避免 getter 与定时清理在边界时间行为不同。
- TTL 必须为有限正数；非法配置报错，已临近过期的 token 不入缓存，不默认延长寿命。
- 设置容量上限，建议初始 `maxEntries=1000`，作为可调工程默认值；优先清理过期项，仍满时淘汰最久未使用项。命中只更新 LRU 顺序，不续期。
- 读取时惰性删除过期项；可每分钟 sweep 一次，但不能依赖 interval 保证有效期。启动清理应幂等，`dispose()` 清除定时器和条目，测试不遗留 timer；支持时对 timer 调用 `unref()`。
- 不沿用 `LIU_REDIS_KEY_PREFIX`、`LiuTimer` 或 `valTool` 依赖；配置由 MCP 包注入。通用 KV 不默认提供 10 分钟 token TTL。
- 首期不需要 `toInc`；计数器和限流不是 token cache 的职责。不能用这个单实例 Map 实现跨副本订单幂等或持久化确认状态。

#### 缓存键与有效期

只有当前 MCP Bearer 已完成验证且当前操作 scope 检查通过后，才允许查缓存。provider 使用稳定序列化的元组作为键，至少包含：

```text
cacheVersion + trustedIssuer + SHA256(incomingMcpToken)
  + verifiedClientId + verifiedAgentId
  + downstreamResource + sortedUniqueRequestedScopes
```

摘要由服务端计算；agent/client 来自已验证身份，resource 来自受信任配置。不能仅按 userId、agentId 或 MCP session header 作为键。同一用户的不同授权 token、不同 agent、不同资源和不同 scope 集合不得混用；未来 research/trading 分别按实际下游资源隔离。原始 MCP Token 不进入 Map key，也不记录 key 摘要到日志。

只缓存经过响应校验的成功置换结果，包括 API Token、实际授予的 scopes 和已确认的过期时间。使用已完成 exchange 模块提供的可信有效期；不能靠解码未验证 JWT 推断可信身份或有效期。

```text
cacheExpireAt = min(
  exchangeStartedAt + 5 minutes,
  downstreamTokenExpiresAt,
  incomingMcpTokenExpiresAt
) - safetyMargin
```

建议 `safetyMargin=30 seconds`。如果契约用 `expires_in`，以 exchange 开始时间保守折算有效期；若同时提供多个可信期限，取最早值。没有可确定有效期的响应不缓存，按既有 exchange 契约决定是否可直接使用。有效期不足安全余量时不使用该 token，返回明确错误，不能循环置换。TTL 取 `cacheExpireAt - now`，读命中不滑动延长。

#### 读写策略与并发

- `trading_snapshot/activity` 及 `lookup.order`：命中有效缓存时复用；未命中调用现有 exchange，再缓存满足条件的只读 token。
- `trading_order` 的所有 action 以及 `trading_control.hold`：每次实时 exchange，绕过缓存读取、缓存写入以及只读请求的并发合并；写 token 使用后不放进共享只读缓存。hold 虽然不下单，也属于写操作。
- `trading_lookup.signal` 虽为 GET，但需要 `order:write`，也绕过缓存及并发合并；其只读 annotation 和只读 401 最多刷新一次策略不变。
- 同一个只读缓存键的并发未命中由 provider 使用独立的 in-flight Promise Map 合并，只发起一次 exchange。成功和失败都在 finally 清理；失败不缓存。不同键不合并。
- in-flight 项目数也要有上限，exchange 设置超时，容量耗尽返回可重试的繁忙错误；不能让有效用户的大量不同请求形成无限 pending Map。一个等待方断开不取消其他等待方共享的 exchange。
- 下游明确返回 token 无效/过期时，删除本次使用的缓存项。若该项已被更新，只删除与失败 token 匹配的旧版本。只读调用最多重新置换并重试一次；403 业务拒绝、网络错误或交易错误不能触发无限刷新或扩权。
- 写操作失败仍遵守第 3.4 节的未知状态与幂等规则，token provider 不自动重放写请求。

只读缓存意味着上游授权撤销后，仍可能在缓存剩余期限内被复用，除非下游另有实时撤销检查。不能把最多 5 分钟缓存称为即时撤销。写操作实时 exchange 只有在上游确实校验撤销状态时才提供该保障；已完成模块需按此契约衔接。

缓存只暴露不含身份、key 或 token 的命中/未命中/淘汰数量和大小指标。工具结果、异常、调试日志均不得输出 token 或整个缓存对象。

## 6. Tool 描述和 schema 的写法

每个 tool 的 description 要说明四件事：

1. 解决什么用户任务。
2. 会不会改变账户或 agent 状态。
3. 结果是否为实时最终状态，还是请求受理状态。
4. 何时应该调用另一个 tool。

例如 `trading_order` 的描述应接近：

> Submit, modify, or cancel a HK/US stock order. This changes trading state and requires order:write permission. Place returns a signal acceptance envelope; it does not guarantee fill. Modify and cancel return request acceptance; call trading_lookup to check the later order state.

Schema 规则：

- 使用 Valibot 定义输入，再用 `toStandardJsonSchema` 给 `registerTool`。
- 对 action/type 分支使用 discriminated union。MCP 输入 schema 根节点保持 object：用必需的 `request` 对象包裹上述 union，即 `{ request: <上述分支> }`，避免直接生成根级 oneOf。用 Inspector 和目标 host 验证嵌套 union；不支持时使用明确枚举与严格运行时分支校验，并记录兼容代价。Valibot 的自定义 check/transform 不一定完整转换成 JSON Schema，MCP server 的运行时校验仍是最终约束。
- 读 tool 的默认 limit 建议为 20，最大值继续限制为 100；不要让模型默认拉取 100 条并把大响应塞回上下文。
- cursor 必须描述为 opaque cursor，模型不应修改或解释它。
- 字符串金额、数量、价格不能改成 number。
- 日期固定 `YYYY-MM-DD`，并在 description 中注明按交易系统约定的时区解释。
- 在 schema description 中写出 MARKET/LIMIT、accepted/final status、cash flow unsupported 等关键业务约束，减少错误调用。
- 输出 schema（如果当前 SDK/客户端版本启用）与输入 schema 同样保持窄而稳定；否则至少使用固定 JSON 包装。

## 7. 分页和上下文预算

分页是控制上下文成本的关键，不应由 MCP server 自动把所有页拼成一个响应。

建议：

- 默认 `limit=20`，最大 `100`。
- 返回 `next_cursor`；没有下一页时返回 `null`。
- tool description 告诉模型：只有用户要求更多结果时才用下一页 cursor。
- 不在返回中附带重复的自然语言摘要、CLI 表格和原始 HTTP envelope。
- account/positions 的组合调用也应遵守单次响应上限；如果 positions 很多，返回第一页并附 cursor。
- 未来可以增加面向用户的 summary 字段，但必须由服务端明确计算，不能让模型从全量 rows 自行聚合。

### 上下文预算验收

工具数量下降不等于 token 数同比下降：union 中的业务参数仍要描述。实施时对同一份字段契约生成 11 工具基线与 5 工具方案，比较完整 tools/list（含 outputSchema）序列化字节数和目标模型 tokenizer 计数，不预报未经测量的节省比例。建议首期输入工具目录预算 4,000 tokens、默认列表响应预算 8,000 tokens，作为待实测调整的工程目标。超出时优先精简重复描述与 outputSchema，或减小默认页长，不截断 JSON/业务关键字段。

用至少 20 个任务覆盖账户、分页、成交、资金流水、signal 查询、下单、改单、撤单与 hold，记录工具选择正确率、参数校验通过率、平均调用次数及总输入/输出 tokens。特别测试“撤单后查结果”“拒绝信号诊断”“资金流水不支持”“未知成交状态”。保持工具顺序稳定，不在每次调用后动态改变目录；不额外增加 discover/execute 两段式工具，当前 11 项能力不足以抵消发现轮次的成本。

## 8. 错误与审计

下单的拒绝与超时可能返回 HTTP 409/422/504，同时在 envelope.data 携带公开 SignalData。此时结果仍为 `isError: true`，通过 `signalResponse` 校验后，把投影后的载荷放入 `error.signal`，保留 signal_id、state、币种、现金和持仓诊断；未知字段及 envelope.message 不透传。载荷校验失败时不返回 signal，仍保留安全 code、status、requestId。审计从已校验的错误载荷提取 signalId；改单成功时同时记录原 orderId 和 newOrderId。写操作继续禁止自动重试。

合法数字型公共 code（例如 `400`、`401`、`403`、`500`）按原值保留。Token exchange 的 HTTP 429 或 OAuth `temporarily_unavailable` 归类为 `busy`，与本地容量限制一致，不自动重试。

MCP server 应定义自己的 typed error 分类，并至少映射这些上游交易错误 code：

- `order_not_found`
- `order_not_cancellable`
- `order_not_modifiable`
- `insufficient_position`
- `position_direction_conflict`
- `market_closed`
- `account_locked`
- `market_not_permitted`
- `invalid_order_price`
- `order_rejected`
- `trading_service_unavailable`
- `trading_timeout`
- `cash_flows_unsupported`

每次写调用应记录结构化审计事件（由 MCP server 或上游负责，不能写本地数据库）：

- tool 名称、action、用户/agent 身份、client/session 标识。
- symbol、side、orderType、quantity、price 的业务字段。
- idempotency key、上游 request ID、signal ID/order ID。
- 结果状态和 typed error code。
- 禁止记录 MCP access token、exchange token、Authorization header。

## 9. 面向未来投研接入的演进架构

未来 MCP 将同时承载 trading 和 research 能力。这个长期目标不意味着现在就把投研 API 暴露出来，而是要求首期 trading 实现提前保留清晰的领域边界。

建议分成三层：

```text
用户意图
  -> Domain Skill / 路由层
       -> trading 或 research
            -> 语义化 MCP tools（当前阶段）
                 -> capability registry / operation descriptor
                      -> MCP server 自己的 gateway client
                           -> trading gateway
```

### 9.1 Domain 层

未来至少有两个业务域：

- `trading`：账户、持仓、订单、成交、资金流水和 agent 控制；写操作有高风险和幂等要求。
- `research`：策略、因子、回测、市场数据和研究工作流；当前只规划边界，不在本方案实现。

Domain 路由负责判断用户请求属于哪个领域。Skill 是可选的工作流辅助，普通 MCP host 不一定加载 Skill；参数校验、授权和重试约束必须由服务端保证，不能依赖 Skill 文字作为安全边界。一个 tool 不应为了“减少数量”同时混合交易执行和投研分析；跨域任务应由路由层拆成多个阶段，例如先用 research 生成候选，再由 trading 工具执行经过确认的订单。

### 9.2 Capability registry 层

首期只需静态、代码内的操作登记表集中声明领域、scope 和读写属性。下面是未来扩展字段示意，不要求当前实现动态注册、schema 查询、任务持久化或版本协商：

```ts
type OperationDescriptor = {
  domain: 'trading' | 'research'
  operationId: string
  schemaVersion: string
  requiredScopes: string[]
  riskLevel: 'read' | 'write' | 'run'
  requiresConfirmation: boolean
  supportsIdempotency: boolean
  executionMode: 'sync' | 'async'
}
```

权限和重试策略应登记在具体 gateway operation 粒度，而非复合 tool 粒度。当前映射示意：

| Tool               | operationId 示例                                                          | executionMode                            |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------- |
| `trading_snapshot` | `trading.account.get` / `trading.positions.list`                          | `sync`                                   |
| `trading_activity` | `trading.orders.list` / `trading.trades.list` / `trading.cash_flows.list` | `sync`                                   |
| `trading_lookup`   | `trading.order.get` / `trading.signal.get`                                | `sync`                                   |
| `trading_order`    | `trading.order.place` / `modify` / `cancel`                               | `sync`（返回受理结果，业务状态随后查询） |
| `trading_control`  | `trading.agent.hold`                                                      | `sync`                                   |

上述 operationId 是内部命名示例，不允许模型通过拼接名称调用未注册能力。未来如引入 executionId，只能使用执行服务实际返回的 ID，不能把 signalId 或 orderId 冒充通用 executionId；schemaVersion 是契约版本标识，不是一次执行的标识。registry 是内部实现；在 tool 数量仍可控时，不要把它直接暴露成通用 `execute_tools`。

### 9.3 什么时候引入 Meta Tools

当 research 接入后，若能力仍能按少量稳定任务分组，就继续使用语义化 tools。例如回测、策略验证、因子查询可以各自拥有稳定入口。以下信号可用于评估是否引入 SpringBrand 风格的 meta-tools：

- 能力数量达到几十个以上，且持续增加。
- 能力主要由动态服务或插件提供，无法在 server 发布时固定目录。
- 每个能力都有可查询的版本化 input/output schema。
- 异步执行、费用/配额、权限和结果保存已经是统一平台能力。
- 有明确的 `search -> schema -> execute -> get_execution` 生命周期和审计记录。

届时可以新增独立的 `research` capability discovery，而不是把 trading 写操作直接改成任意 `execute_tools`：

```text
search_capabilities(domain='research')
  -> get_capability_schema(capabilityId)
  -> execute_capability(capabilityId, arguments)
  -> get_execution(executionId)
```

交易领域仍保留 `trading_order` 这类高风险显式 tool，或者至少保留一个强约束的 trading adapter。这样模型能获得动态投研扩展能力，同时订单确认、scope、幂等和撤单语义不会被通用执行器隐藏。

### 9.4 跨域调用边界

投研结果不能自动变成交易指令。跨域流程必须显式传递：

- research 结果的来源、时间和版本。
- 生成交易候选的规则或模型说明。
- 用户确认后的交易参数。
- trading 写操作自己的 scope、idempotencyKey 和审计事件。

MCP server 不应在后台把 research tool 的输出直接拼成订单并执行。跨域编排属于 Skill/agent workflow 层，最终下单仍进入 `trading_order` 的独立安全门禁。

## 10. 分阶段实施

### P0：工具注册和契约

- 新增 `src/tools/trading/`，每个 tool 一个文件，公共类型和转换函数集中管理。
- 在 MCP server 内新增独立的 `src/trading/` 模块，包含 gateway client、请求/响应类型、Valibot schema、错误映射和 operation registry。
- 明确禁止在 `packages/mcp-server/package.json` 增加 `@tqx-ai/cli` 或 `@tqx-ai/sdk`；不从两个包导入运行时代码或类型。
- 为 5 个 tools 编写独立 schema、description、annotations 和 handler。
- 用可注入的 Fetch、token exchange client 和 trading gateway client 测试参数映射和错误转换。

完成标准：开发环境 `tools/list` 最多 7 个工具（含 `ping`）；生产建议停用演示 ping，使用 MCP 协议 ping/HTTP health 检查，保持 6 个业务工具，schema 没有互相冲突的宽松可选字段。

### P1：只读接入

- 实现 snapshot、activity、lookup。
- 接入 `trade:read` scope，按第 5.1 节实现独立 KV util 和 API token provider；衔接已有 exchange，不重复实现置换协议。
- 验证 URL、HTTP method、headers、query、body、分页、响应 schema 和错误映射。

完成标准：现有 trading API 的只读能力都有 MCP 等价路径；CLI 保持未修改，MCP 响应不泄漏认证信息。

### P2：写操作接入

- 实现 `trading_order` 的 place/modify/cancel。
- 实时 token exchange，禁止只读缓存复用。
- 对 place 的 idempotency key、LIMIT/MARKET 互斥条件、accepted 与最终状态说明做 focused tests。
- 在客户端支持的情况下检查写工具 annotations 是否触发确认；服务端仍强制 scope 和审计。

完成标准：错误重试不会意外重复下单，写操作的最终状态查询路径清楚可用。

### P3：hold、限流与上线门禁

- 实现 `trading_control`。
- 增加每 session 并发限制、下游超时和写操作审计。
- 确认撤销 token 的在线检查或 token exchange 行为满足生产要求；在离线 JWT 仍无法即时撤销时，不开放真实写工具。
- 更新 README 和权限矩阵。

完成标准：多用户并发不串身份，读写 scope 和 token exchange 均可追踪，完整 workspace checks 通过。

## 11. 测试矩阵

至少补充以下 focused tests：

| 类别           | 必测内容                                                                             |
| -------------- | ------------------------------------------------------------------------------------ |
| tool discovery | tool 名称、描述、annotations、输入 schema、总数                                      |
| bug report     | prompt 整理、动态 Trading scope/step-up challenge、POST 路径、幂等键、响应和写入审计 |
| snapshot       | account/positions 单独和组合调用；字段映射；分页                                     |
| activity       | 三个 type 分支的 query 映射；非法字段被拒绝；cash flow 错误                          |
| lookup         | order/signal ID 编码；signal 与 order 状态说明                                       |
| order          | place/modify/cancel 分支；HTTP method、headers、body；幂等键                         |
| validation     | MARKET/LIMIT、数量/价格、日期、cursor、limit 边界                                    |
| auth           | 缺 scope 的 403；MCP token 不直接下游转发；写操作绕过只读 cache                      |
| errors         | typed API error、network、protocol、validation 错误均不泄漏原始异常                  |
| isolation      | 两个用户并发调用不会复用身份、token 或 client                                        |
| runtime        | Node/Vitest 单元测试，Bun smoke test，完整 `bun run test`                            |

缓存验收需额外覆盖：注入时钟下的到期边界、无滑动续期、LRU 容量、非法 TTL、重复启动/释放 timer；不同 token/agent/resource/scope 隔离；相同键并发仅置换一次、失败后可恢复、in-flight 上限与超时；API/MCP token 有效期取最短；旧 token 失败不误删新条目；只读刷新最多一次；place/modify/cancel/hold 全部绕过缓存和并发合并；进程重启或另一副本缓存为空时正常置换。以上使用假 token 和注入的 exchange/fetch，不连接真实账户。

### 首期实现交付记录

- 实现目录：`src/trading/`、`src/tools/trading/`、`src/tools/bug-report/`、`src/auth/token-exchange.ts`、`src/auth/api-token-provider.ts`、`src/utils/kv-util.ts`。
- 配置：四项 trading/exchange 运行时配置全部提供时启用；全部省略保持认证服务，部分缺失启动失败。production trading 默认发布五个 trading tools 和一个 bug-report tool，共六个业务 tools。
- 输入 schema 用 `toStandardJsonSchema` 注册；转换适配器仅在 JSON Schema 发布时跳过无法表示的 `check`、`trim`、`to_upper_case`，Valibot 运行时仍执行这些动作。symbol 的输入 pattern 允许小写和两端空白，提交与审计使用归一化值。未替换 tools/list 或 tools/call 的底层 handler。
- runtime options 暴露 `maxEntries`、`maxPending`、`maxConcurrent`、`maxPerPrincipal`。`exchangeTimeoutMs` 独立传给 HTTP exchange 和 provider 等待；`gatewayTimeoutMs` 仅控制 trading HTTP，避免两层超时互相覆盖。
- API Token TTL/身份隔离/读请求合并/写绕过、下游只读 401 最多刷新一次、无写重放和单进程并发上限已实现。所有缓存和调用均独立于 CLI/SDK 包。
- 上游错误保留安全 code/requestId，避免透传自由文本错误描述；响应仅投影已声明字段。审计为可注入结构化 sink，默认输出服务端 console。
- 尚未执行真实账户交易或浏览器授权端到端测试；测试使用签名测试 token 和注入的 OAuth/Trading HTTP 响应，不代表公网部署联调通过。工具目录已设序列化字节上限回归测试；目标模型 tokenizer 的计数和 20 个真实任务的模型选择评测仍需目标客户端环境。

## 12. 参考资料

实现前已读取官方 Valibot/Standard Schema 集成文档，并对照已安装的 MCP server 类型定义核对 registerTool、scopeChallenge、AuthInfo 和请求级 factory。工具契约以已确认的 trading API、现有 CLI 行为和包内 AGENTS.md 为研究依据；运行实现不依赖 TQX SDK/CLI。协议规范链接仍保留供后续部署复核。

- MCP Tools specification：<https://modelcontextprotocol.io/specification/2026-07-28/server/tools>
- MCP TypeScript SDK v2 API：<https://ts.sdk.modelcontextprotocol.io/v2/advanced/schema-libraries>
- 本仓库 MCP 认证和 token exchange 约束：<../README.md>
- 现有 trading 行为参考：<../../cli/src/trading/command.ts>
- 现有 trading API 字段参考：<../../sdk/src/trading/schemas.ts>
- MCP 包架构约束：<../AGENTS.md>

参考资料用于解释 MCP 的 tool 注册和行为 annotation；最终可用字段、权限和状态语义以 MCP server 自己的 schema、OAuth 配置和上游 trading API 契约为准。CLI/SDK 文件仅作为迁移时的人工参考。
