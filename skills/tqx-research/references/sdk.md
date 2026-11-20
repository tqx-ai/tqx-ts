# TQX Research TypeScript SDK

The Qube Next research API is exposed by `@tqx-ai/sdk` through `client.research`. Use a base URL ending in `/tqxApi`; resource paths are relative to that gateway and use `qube/api/...`. Authenticated requests send `X-API-Key`.

```ts
import { TqxClient } from '@tqx-ai/sdk'

const client = new TqxClient({
  apiKey: process.env.TQX_API_KEY!,
  baseUrl: process.env.TQX_BASE_URL!, // https://gateway.example/tqxApi
})
```

Resource IDs are lowercase 24-character Mongo ObjectIds. Create, source updates, analyses, backtests, versions, and tunings use `requestId`; configuration updates use `baseConfigRevision`, while run and restore requests use expected revision fields for idempotency and optimistic concurrency. The SDK maps camelCase inputs to the server's snake_case payloads and validates inputs and responses with Valibot.

The main methods are shown below; `?` marks optional fields (signature notation):

```text
client.research.createFactor({ requestId, title, description?, code, codeType, market })
client.research.getFactor(id)
client.research.getFactorSource(id)
client.research.updateFactorSource(id, { requestId, baseSourceRevision, code })
client.research.updateFactor(id, { baseConfigRevision, title?, description?, parameters? })
client.research.listFactors({ limit?, cursor?, market?, keyword?, bindableOnly? })
client.research.createFactorAnalysis(id, {
  requestId, expectedSourceRevision, expectedConfigRevision, parameters?, origin?
})
client.research.listFactorAnalyses(id, { includeDeleted?, status? })
client.research.getFactorAnalysis(runId)
client.research.cancelFactorAnalysis(runId)

client.research.createStrategy({ requestId, title, description?, code, market, backtest?, factorBinding? })
client.research.getStrategy(id)
client.research.getStrategySource(id)
client.research.updateStrategySource(id, { requestId, baseSourceRevision, code })
client.research.updateStrategy(id, { requestId?, baseConfigRevision, title?, description?, backtest?, factorBinding? })
client.research.runStrategyBacktest(id, {
  requestId, expectedSourceRevision, expectedConfigRevision, backtest?, origin?
})
client.research.listStrategyBacktests(id, { limit? })
client.research.getBacktest(runId)
client.research.cancelBacktest(runId)
client.research.getBacktestResultPage(runId, { field, offset?, limit?, keyword?, symbol? })
client.research.getBacktestChart(runId, { from?, to?, maxPoints? })
client.research.getBacktestSymbolKlines(runId, symbol)
```

Library and summary lists return `{ items, hasMore, nextCursor, counts? }`. `listStrategyBacktests` returns `{ runs }` and accepts `limit` from 1 to 200 (server default 100). Qube research summaries use a limit of at most 10; library lists use at most 100. The server's raw fields remain available on loose response types so new service fields can be adopted without an SDK release.

Summary filters use Shanghai calendar days for date-only `from`/`to`, with the entire `to` day included. Datetimes require a timezone and `from < to`. Run lists accept run states; tuning lists additionally allow `cancelling` and `no_valid_candidates` but not `preparing`. Strategy version summaries accept no `status` and only `created_at` ordering.

Versions, snapshots, and tuning tasks are also available through the corresponding list/create/get/restore, `createFactorSnapshot`, `createFactorTuning`, and `createStrategyTuning` methods. Tuning requests must include the server-defined candidates, research period or trading dates, objective, and expected revisions.

`pollFactorAnalysis` and `pollBacktest` stop on `succeeded`, `failed`, or `cancelled`; a timeout returns the latest response with `cli_status: 'TIMEOUT'` and does not cancel the remote task. Transport, gateway, protocol, and validation failures use `TqxNetworkError`, `TqxApiError`, `TqxProtocolError`, and `TqxValidationError` respectively.

`streamFactorAnalysis`, `streamBacktest`, `streamFactorTuning`, and `streamStrategyTuning` return async
iterables of `{event, id, seq, value}` using server SSE protocol 1 full snapshots. Events are
`snapshot`, `done`, `error`, or `cancelled`; the terminal event closes the iterator. Pass an
`AbortSignal` to stop reading, or pass the last `seq` as `after` when reopening a stream. Streams
do not reconnect automatically. Protocol 2 patch reduction is not exposed by this SDK.

```ts
const controller = new AbortController()
for await (const event of client.research.streamBacktest(runId, { signal: controller.signal })) {
  console.log(event.seq, event.value.status)
}
```

## Saved configuration and temporary runs

For ordinary runs, use `updateFactor(id, {baseConfigRevision, parameters})` or `updateStrategy(id, {baseConfigRevision, backtest})` to persist requested settings. Inspect returned `parameters`, `parameter_validation` and `parameters_draft`; validation must be valid for the returned `config_revision` with no draft. Use `getFactor`/`getStrategy` when necessary evidence is missing. Submit with the returned source/configuration revisions and omit analysis `parameters` or strategy `backtest`. Explicit temporary overrides remain supported and do not save settings. See [the workflow](workflow.md).

Factor analysis and tuning `stockPool` currently accept only `all` (full market). Omitting it preserves saved configuration and server defaults; explicitly update historical index pools to `all` before running. Backtest `standardSymbol` accepts same-market benchmarks: HK `HSI.HK`, `HSCE.HK`, `HSTECH.HK`; US `SPX`, `IXIC`, `NDX`, `DJI`. Saved/server parameter fields remain snake_case.

Backtest result pages retain optional `partial`, `available_from`, `available_total`; charts retain `partial`, `complete` and optional `benchmark: {standard_symbol, points}`. These fields can describe running or empty artifacts. A missing benchmark is not a zero return. Preserve status, pagination and snapshot metadata when interpreting results.

Factor and strategy resource schemas explicitly retain optional nullable `parameters_draft`. Source and parameter validation are separate; static validity does not establish successful execution. Current Qube server strategy validation rejects direct `tqx_data` imports, including aliases and from-imports; select `panda_backtest` public APIs for strategy history.
