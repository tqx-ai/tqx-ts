# TQX MCP Server

Stateless Streamable HTTP resource server using MCP SDK v2, Hono, and Valibot.
Every MCP request requires a TQX MCP Bearer token. Research and Trading tools use independently implemented gateway clients; this package does not import the TQX CLI or SDK.
Each request gets a fresh server instance and its own verified identity.

## OAuth configuration

Configure these runtime values before starting the server. They are not SDK/CLI
build variables and are not embedded by tsdown. The package maintains its own
[`.env.example`](.env.example); local values belong in `packages/mcp-server/.env`.

| Variable                  | Meaning                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `TQX_MCP_RESOURCE_URL`    | Canonical public MCP resource, such as `https://www.tqx.trade/mcp`. Must match the AS resource and token `aud`.                        |
| `TQX_MCP_OAUTH_ISSUER`    | Trusted issuer, such as `https://auth.tqx.ai`. AS discovery and JWT `iss` must match it exactly after configuration URL normalization. |
| `TQX_MCP_ALLOWED_HOSTS`   | Comma-separated hostnames without scheme or port, such as `www.tqx.trade,127.0.0.1,localhost,[::1]`.                                   |
| `TQX_MCP_ALLOWED_ORIGINS` | Comma-separated exact browser origins, including scheme and port. An explicitly empty value permits native clients only.               |

All four variables must be explicitly set. Invalid or missing configuration stops
startup; there is no anonymous fallback. Production URLs/origins must use HTTPS.
HTTP URLs/origins, including LAN addresses and hostnames, are allowed outside
`NODE_ENV=production`. Host and Origin
checks remain enabled; native clients without an Origin header are supported.

## Connection source and local skills

Every `/mcp` request resolves its connection source independently. Read
`tqx_distribution` from the URL first, then `X-TQX-Distribution` when the query
value is missing or blank. `agent-plugin` sets `hasLocalSkills: true`; `mcp-url`,
unrecognized values, or no marker set `hasLocalSkills: false`. A nonempty query
value takes precedence even when unrecognized. An unmarked connection is treated
as URL-only with no local skills by product policy, rather than local filesystem
detection. The markers never grant authorization or change OAuth audiences.

Bundle versions use the same per-field priority: `tqx_skill_bundle_version`, then
`X-TQX-Skill-Bundle-Version`. Missing, malformed, or oversized versions are omitted;
a version alone does not imply local skills. The supported distribution values,
the selected channel (`query`, `header`, or `default`), skill availability, and a
valid plugin bundle version are exposed through `readClientDistribution(request)`
in `src/utils/client-distribution.ts` and the request-local `logContext`.

The plugin ships the stable URL
`https://www.tqx.ai/mcp?tqx_distribution=agent-plugin` plus both headers. The bundle
version lives in its header so releases do not change the connection URL.
`bun scripts/sync-plugin-version.ts` updates that version and the Claude marketplace
configuration when bumping the workspace version. Generated Claude and Antigravity
distributions preserve both forms. Clients must retain a marker on every request;
this stateless server does not remember an earlier initialization marker. Clients
that reject fixed headers need a URL-only configuration with the same query marker.

## Logging

`src/utils/logger.ts` manages tslog module loggers and request-local context.
Set `MCP_LOG_LEVEL` to `silly`, `trace`, `debug`, `info`, `warn`, `error`, or
`fatal` (default `info`). `MCP_LOG_FORMAT` accepts `json` or `pretty`; the default
is JSON under `NODE_ENV=production` and pretty otherwise. Invalid values use the
defaults. Production logs are emitted to the container's standard output streams.

The outer HTTP middleware generates a fresh `requestId`, returns it in
`X-Request-ID`, and records `mcp.http_received` / `mcp.http_completed`, including
SDK Host/Origin, JSON parsing and body-size rejections. CORS exposes `X-Request-ID`
for allowed browser origins. Health checks are excluded. HTTP duration ends when
the response is available; an SSE stream may continue after that point.

`mcp.request_received` records bounded JSON-RPC IDs, method, target name,
protocol version and client-reported name/version from the SDK-parsed body after
authentication. Modern requests can provide client identity in `_meta`; legacy
clients provide it on `initialize`, and it is not persisted across this stateless
server's requests. Context fields (including verified OAuth `clientId`) appear
in the JSON record's `_logMeta`; client-reported labels are diagnostic data.
For `/mcp`, that context also includes `distribution`, `distributionSource`,
`hasLocalSkills`, and, when available, `skillBundleVersion`.

`mcp.request_completed` observes terminal SDK messages before transport delivery,
with execution duration and `success`, `tool_error`, or `protocol_error` outcomes.
It covers tool argument validation, unknown tools, list methods and prompts.
Closing a transport before a terminal message records `cancelled`. Notifications
without a JSON-RPC ID have no completion event. `mcp.protocol_rejected` records SDK
reported failures with safe error type/code. Authentication diagnostics retain
`mcp.origin_rejected`, `mcp.authorization_header_rejected`, and
`mcp.authentication_failed`. Early HTTP/authentication rejection may finish before
a server instance exists and is covered by HTTP/authentication events.

`mcp.token_exchange_completed` records resource, scopes, result and duration;
`mcp.token_cache` reports hit, miss, pending-request reuse and write bypass at DEBUG.
`mcp.gateway_completed` records each downstream HTTP attempt, operation, status,
result, duration and returned upstream request ID. Existing `trading.write` and
`bug-report.write` audit events retain their business fields and use the audit
logger with the same request context. Injected audit sinks remain supported.

Request arguments, tool output bodies, raw URL queries, raw errors and credentials
are excluded from request logs. Only validated connection-source and bundle-version
query fields are included as structured context. Sensitive object keys are masked by the logger.
Existing write audit fields include order details and idempotency keys, so deploy
log access controls appropriate for that audit data. MCP protocol logging to
clients and OpenTelemetry are future work. This change is local to the MCP
package; deployment and real-client streaming verification remain pending.

## Run locally

Once workspace dependencies are installed, run in `packages/mcp-server/`.
Copy the example once, adjust its values, then start MCP:

```bash
cp .env.example .env
bun run dev
```

The copy command is only for initial setup; preserve an existing `.env`.
`scripts/dev.mts` explicitly loads the package's `.env` before spawning children,
which inherit the loaded variables. Existing process environment variables take
precedence. The file is optional when variables are already exported; missing
required OAuth configuration still prevents server startup. Deployments can inject
these variables directly.

Use `bun run start` in the same directory to run only the server; Bun loads the
local `.env` for that command.

The `dev` script runs `bun --hot src/index.ts`, waits up to 15 seconds for
anonymous `GET /healthz` to return `{"status":"ok"}`, then launches the official
[MCP Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector)
at `http://127.0.0.1:61102/mcp`. Inspector opens its browser UI automatically;
its first run may download the package. Ctrl+C stops both processes. If either
process exits, the other is stopped too. Use `start` instead of `dev` to run only
the server. The Bun entry listens at `127.0.0.1:61102` by default;
`TQX_MCP_BIND_HOST` overrides its listening address.

Add Inspector's exact browser origin (normally `http://localhost:6274`) to
`TQX_MCP_ALLOWED_ORIGINS` for development. Browser authorization must target a
canonical resource supported by the AS. A loopback listener does not make
`http://127.0.0.1:61102/mcp` a registered resource: use a dedicated test AS/resource,
or a controlled HTTPS test proxy to the local server and connect Inspector to
that public URL. Ensure the proxy forwards the path-aware well-known route too.

## Run with Docker Compose

Configure the package's `.env`, then run from `packages/mcp-server/`:

```bash
docker compose -f docker/compose.yaml up -d --build
docker compose -f docker/compose.yaml logs -f mcp-server
```

The Compose project is named `tqx-ts` and contains only the `mcp-server` service.
It loads `../.env` relative to the Compose file, listens on `0.0.0.0:61102` inside
the container, and publishes port `61102`. It runs the server without Inspector.
The image uses `docker.cnb.cool/liangyunzhijing/docker-sync/oven-bun:1.4.4-slim_amd64`
and the service explicitly targets `linux/amd64`. Dependencies are installed from
the workspace lockfile with `--frozen-lockfile --production` for the MCP package.
The Dockerfile's companion ignore file excludes local configuration, credentials,
development dependencies, and unrelated source files from the build context.

The image defaults to `NODE_ENV=production`, which requires HTTPS public URLs
and browser origins. For local or LAN HTTP testing, add `NODE_ENV=development`
to the package's `.env`, set the resource URL to the client-facing HTTP endpoint,
and add its hostname/IP (without scheme or port) to `TQX_MCP_ALLOWED_HOSTS`.
For browser clients, also add their exact origin to `TQX_MCP_ALLOWED_ORIGINS`.
The OAuth server's resource configuration and token `aud` must match the resource URL.
After changing `.env`, recreate the container with the Compose command above.
Container `localhost` refers to the container itself;
the OAuth issuer must be reachable from both the container and the MCP client,
and match the issuer published by tqx-oauth. A host-side issuer such as
`http://localhost:26823` needs an appropriate proxy or network setup before it
can be used from the container. The public resource URL and Host/Origin
allowlists still describe the client-facing endpoint, independently of the
container's bind address. The health check uses the resource URL's Host header.

Stop the Compose service from the same package directory:

```bash
docker compose -f docker/compose.yaml down
```

## Trading tools

Trading is enabled when all four values below are provided. Omit both Trading
variables to disable it; exchange credentials may still be used by Research.
Once either Trading variable is set, partial configuration fails startup.
The package's `.env.example` includes commented examples. These are runtime
settings, independent of SDK/CLI build variables and `TQX_BASE_URL`.

| Variable                         | Meaning                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `TQX_MCP_TRADING_BASE_URL`       | Trading gateway origin, without path/query/credentials; for example `https://www.tqx.trade`. Production requires HTTPS.             |
| `TQX_MCP_TRADING_RESOURCE`       | Exact AS-registered trading audience, for example `https://www.tqx.trade/openapi`. Separate from MCP audience.                      |
| `TQX_MCP_EXCHANGE_CLIENT_ID`     | Built-in confidential client ID; must match `tqx-oauth` exactly (default deployment value: `tqx_mcp_server`).                       |
| `TQX_MCP_EXCHANGE_CLIENT_SECRET` | The same deployment secret injected into `tqx-oauth` under this exact variable name. Never pass it as a tool argument or commit it. |

The exchange endpoint is `<trusted issuer>/oauth/token`. MCP calls it with HTTP
Basic client authentication and a URL-encoded RFC 8693 form. Downstream requests
use the exchanged token in `Authorization: Bearer`, never the incoming MCP token
or CLI credential store. Never add `X-API-Key`: the resource server rejects mixed credentials. The AS implementation must enforce session revocation,
agent binding and downscoping for exchange; gateway acceptance must be verified
in deployment integration.

The confidential client is built into `tqx-oauth`; it is not created through DCR.
Configure `TQX_MCP_EXCHANGE_CLIENT_ID` and `TQX_MCP_EXCHANGE_CLIENT_SECRET` in both
services with exactly the same values. The client ID is public configuration; the
secret remains deployment-only.

All tool names use the `tqx_` prefix, including the demonstration `tqx_ping`
tool. Clients using the previous unprefixed names must refresh `tools/list` and
update their tool references and allowlists; the old names are no longer registered.

| Tool                    | Request discriminator                             | Scope                                                     |
| ----------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `tqx_trading_snapshot`  | `sections`: account, positions (defaults to both) | `trade:read`                                              |
| `tqx_trading_activity`  | `type`: orders, trades, cash_flows                | `trade:read`                                              |
| `tqx_trading_lookup`    | `type`: order, signal; exact `id`                 | order: `trade:read`; signal: `order:write`                |
| `tqx_trading_order`     | `action`: place, modify, cancel                   | `order:write`                                             |
| `tqx_trading_control`   | `action`: hold                                    | `trade:read`                                              |
| `tqx_submit_bug_report` | `title`, `description`, optional `idempotencyKey` | authenticated MCP session; no user scope or Agent binding |

Trading and bug-report tools take a required `request` object. Use `tools/list` for the complete
current schema. Example `params` for a read:

```json
{
  "name": "tqx_trading_activity",
  "arguments": { "request": { "type": "orders", "limit": 20 } }
}
```

Prices, amounts and quantities remain strings. Lists default to 20 rows (maximum 100) and return an opaque `next_cursor`; the server does not fetch further pages.
Orders are current active orders, not an order history API. Snapshot sections
are concurrent, not atomic; partial failures preserve successful sections and
return `isError: true` with `meta.errors`. Business fields retain snake_case;
`meta.retrievedAt` is the retrieval time, not a guarantee of data freshness.
Results are provided in both `structuredContent` and JSON text content.

Order placement requires an explicit stable `idempotencyKey`. MARKET forbids
price, LIMIT requires price, and DAY is the supported validity. Signal ACCEPTED
and modify/cancel `accepted` are acknowledgements, not a final fill/cancellation.
Use `tqx_trading_lookup` to follow the exact signal/order ID; after modify, use `new_order_id` when supplied. Missing active order
results do not prove final status. Writes are never automatically replayed;
transport/protocol failures may include `outcomeUnknown: true`. Client hosts
must apply their authorization/confirmation policy; a boolean tool argument
cannot prove human confirmation. Hold marks agent activity and does not trade.

`tqx_submit_bug_report` writes `POST /openapi/v1/bug-reports` and returns the
upstream `bug_id` and `created_at`. It is marked as a destructive, idempotent
write and always performs a fresh scope-free Trading Resource token exchange.
It does not request a user Trading scope or Agent binding; the deployed
contract has no `bug:write`. Reuse `idempotencyKey` only for retrying the same report. The
`prepare_bug_report` prompt helps compose a reproducible report and never calls
the upstream API. It instructs the Agent to investigate ownership first, submit
only when the evidence points to a TQX issue, produce a short title and a
structured Markdown description, call `tqx_submit_bug_report` directly after the
evidence is organized, and report the send status while displaying the exact
submitted title and description. When the client/host supports rich UI, the
prompt asks the Agent to prefer an envelope-style card or panel; otherwise it
falls back to structured Markdown and does not invent an unsupported UI
protocol. User-facing output follows the user's current language and writing
system, including Traditional Chinese when appropriate; API field names,
identifiers, code, logs, and request/response values remain unchanged.

Rejected or timed-out placements remain tool errors (`isError: true`). When the
upstream error contains a valid public signal, `error.signal` retains the signal
ID, state, currency and cash/position diagnostics. Unknown fields and the raw
envelope message are excluded; invalid diagnostic payloads are omitted while
preserving the API error code and status. Numeric public codes such as `400` and
`500` are retained. Exchange HTTP 429 or `temporarily_unavailable` errors use
`kind: busy`, without automatic retries. Order symbols accept lowercase and
surrounding whitespace and are normalized before submission and audit.

Read-only API tokens use a process-local, bounded LRU cache (1000 entries),
keyed by the incoming token digest, verified identity, downstream resource and
exact requested scopes. Expiration is the earliest of five minutes, derived
token expiry and MCP token expiry, minus a 30-second margin; reads do not extend
it. Concurrent identical read misses share one exchange. Pending read exchanges
are limited to 100 and time out after five seconds. Writes, including hold,
always perform a fresh exchange and never populate or reuse the read cache. Signal lookup also bypasses caching because its downstream scope is `order:write`, while retaining read-only tool annotations and read retry behavior.
A rejected read token is evicted and refreshed at most once; writes are not
retried. No Redis, database or disk cache is used.

Gateway calls have a ten-second timeout and a global concurrency limit of 100,
with at most four active calls per user/agent/client tuple. All limits are per
process, not distributed quotas. Write audit events go to the injected sink
(default: structured server console) and omit tokens and free-form rationale.
They include `signalId` from validated rejection/timeout payloads and both
`orderId` and `newOrderId` when a modify operation creates a replacement order.
`createApp()` exposes `dispose()` to stop token reuse when an embedding host
shuts down; cache expiration uses lazy cleanup, without a background timer.

Embedding hosts may configure `createApp({ trading: ... })` with `maxEntries`
(default 1000), `maxPending` (100), `maxConcurrent` (100), and `maxPerPrincipal`
(4). `exchangeTimeoutMs` (5000) controls both the exchange HTTP request and the
provider wait, including injected exchanges. `gatewayTimeoutMs` (10000) controls
only trading HTTP requests; the two timeout budgets are independent.

When trading is enabled in production, the demonstration `tqx_ping` tool is disabled
by default, leaving six business tools. It remains available in development or
authentication-only mode. Health checks and the MCP protocol ping remain usable.
Research tools are enabled separately as described below.

## Research tools

Research implements the two-tool design in [the Research plan](docs/research-tools-plan.md),
including all 57 actions for factors, analyses, strategies, backtests, versions
and snapshots, plus factor and strategy parameter tuning. It excludes tqx_data, market/financial data, standalone symbol
klines, SSE subscriptions and trading accounts.

Qube backtest reports additionally expose `tqx_open_backtest_view`, a separate
tool rather than a new entry in the 57-action registry. App interactions reuse
the existing `tqx_research_call` tool.

Enable it with both runtime settings below plus the shared
`TQX_MCP_EXCHANGE_CLIENT_ID` / `TQX_MCP_EXCHANGE_CLIENT_SECRET`. Omit both Research
variables to disable it. A partial configuration stops startup. Research-only,
Trading-only and combined deployments are supported.

| Variable                    | Meaning                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TQX_MCP_RESEARCH_BASE_URL` | Research gateway URL ending in `/tqxApi` (optional trailing slash). Requests preserve that prefix before `qube/api/...`. Production requires HTTPS. |
| `TQX_MCP_RESEARCH_RESOURCE` | Exact AS-registered Research token audience. Configure independently from the gateway URL and Trading audience; there is no inferred default.       |

The AS must authorize exchange to this audience with `research:read`,
`research:run` and/or `research:write`, and the Research gateway must accept those
exchanged Bearer tokens. Research does not require a trading Agent binding. The
existing MCP login and HTTP Bearer authentication remain required for both tools.
Tests exercise injected gateways and exchanges; acceptance by a deployed AS and
Research gateway must be verified in that environment before enabling production.

| Tool                   | Input                                                  | Behavior                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tqx_research_explore` | `{ action?: string }`                                  | Omit action for all deployed names and descriptions; specify one for input/output JSON Schema, Markdown examples, related docs and composition guidance. No business scope or upstream call is required. |
| `tqx_research_call`    | `{ action: string, input: object, confirm?: boolean }` | Execute the action using its exact schema and scope. Deletion requires outer `confirm=true`.                                                                                                             |

Research arguments are at the tool root (there is no `request` wrapper):

```json
{
  "name": "tqx_research_call",
  "arguments": {
    "action": "strategy.get",
    "input": { "strategyId": "0123456789abcdef01234567" }
  }
}
```

Success returns the business object directly in `structuredContent` and the same
JSON in text `content`. There is no `ok/action/data/nextActions` envelope.
`call` has no combined public `outputSchema`; the handler validates the selected
action's output and `explore({ action })` returns its precise schema. Handler
errors return `isError: true` with `{ error: { code, message, requestId?, details? } }`.
SDK outer argument validation and protocol errors keep SDK semantics; missing
action permissions use the existing HTTP scope challenge.

### Qube Backtest App

After a user-requested strategy backtest reaches `status=succeeded`, the agent
should automatically call `tqx_open_backtest_view({type:"qube",runId})`, using the
submission's root `id` internally. Users need not supply or understand run IDs.
The tool also reopens existing runs. It reads data only and never starts a backtest.
Report failures retry the same run; failed/cancelled runs remain labelled accordingly.

The tool requires `research:read`. Its standard `_meta.ui.resourceUri` references
`ui://tqx/qube/backtest/report-v1.html` (`text/html;profile=mcp-app`). Model-visible
content is a bounded summary; chart data stays in `_meta["tqx.trade/backtest-view"]`.
The App queries through `tqx_research_call`, visible to both model and App. A
central UI adapter calls only `strategy.backtest.get`, `backtest.chart.get` and
`backtest.result.get`; no separate query tool is registered. Existing public
inputs, outputs, per-action scopes and authorization remain unchanged. Later
queries use public `structuredContent`, not the opener's private report metadata.
Explore and Trading tools remain model-only. Visibility is a host presentation
rule, not access control. Text-only hosts receive the opener's bounded summary.

The English dark glass report has sample-snapping equity/return inspection,
benchmark and trade-day controls, range queries, paginated tables, frozen settings,
metric explanations and host-controlled fullscreen. Reports follow the host's
standard `containerDimensions`: fixed axes fill the viewport; flexible axes grow
with content up to the supplied maximum. Constrained reports use one document
scrollbar. Narrow result tables become
labeled records without horizontal scrolling. Missing metrics remain unavailable;
engine risk metrics are never recomputed from sampled curves. Fonts and code are
bundled into one HTML file with no external network requirements or credentials.
Vue 3 owns component state; the existing SVG renderer and official MCP Apps adapter remain
independent. Vite 8 and vite-plugin-singlefile build the resource.

```bash
# From the workspace root; synthetic data, no account or UAT needed.
bun run --cwd packages/mcp-server dev:backtest-app
# Build the static resource used by the server and simulator.
bun run --cwd packages/mcp-server build:ui
```

The workbench at `http://127.0.0.1:53043/` offers `Production sandbox` (the built
single HTML) and `Vue HMR` (the same Vue source served by a second loopback port).
Both use standard MCP Apps messages. It offers fixed scenarios, widths,
delivery-order tests, query latency/failure/timeout simulation, host display-mode changes,
natural/maximum/fixed inline heights, same-view scenario changes, teardown and a
payload-free protocol trace. In HMR mode, CSS/template edits update without restarting the report; script edits
may remount components. Production mode rebuilds and reloads the HTML.
Only the development iframe permits local module/WebSocket access; production
CSP remains network-free. Use `?build=hmr` to select development mode.
`TQX_APP_DEV_PORT` overrides its loopback port. A manually sanitized projected
overview JSON (maximum 512 KiB) can be replayed in memory; unrecorded table pages
and new windows from sampled overview recordings fail explicitly. Automatic capture
and complete query replay are future work.

Production `build`, `start`, development server and Docker build prepare the HTML;
direct `src/index.ts` startup fails clearly if Research is enabled but it is missing.
Generated files stay in this package's ignored `dist/apps/`.
`bun run typecheck` also runs strict `vue-tsc` checks for SFC templates. This checker
uses a package-scoped `@typescript/typescript6` compatibility alias because Vue
language-tools still requires the JS compiler API; workspace/server checks stay on
native TS 7. UI build/test packages are development dependencies only.

The host adapter uses the official `@modelcontextprotocol/ext-apps` App and
PostMessageTransport APIs for initialization, routing, tool calls and teardown.
Sizing uses `App.sendSizeChanged` only for flexible axes, within host limits and
without duplicate size notifications. `App.getHostVersion()` exposes standard
`hostInfo` (name/version) to report state for diagnostics; capabilities and context
control behavior rather than the host's name or `userAgent`. Text analysis requires
`hostCapabilities.message.text`, and tool queries require `serverTools`.
First-party business schemas and TQX payload validation stay in Valibot. Zod is
installed only to satisfy the SDK's runtime peer requirement; third-party internal
use of Zod is allowed and is not grounds to reject a maintained library.
Local protocol and data tests
do not establish live ChatGPT/Claude compatibility, OAuth acceptance or publication
approval. Those checks still require a real authorized run and target host. Public
ChatGPT UI submission also requires a confirmed component origin (`_meta.ui.domain`);
no domain is invented or enabled by this implementation. See the
[design and acceptance boundaries](docs/backtest-mcp-app-design.md).

### Research resources and prompts

`resources/list` browses the current user's latest strategies followed by factors,
with up to 50 summaries per page. Summaries include a URI, stable name, title,
optional description/update time, icon and MIME type; they exclude source code.
Pass `nextCursor` unchanged as the next request's `cursor` until the server omits
it. Cursors are signed and bound to the user and OAuth client without embedding
their identifiers or a principal hash. Replicas with the same Research configuration
share a signing key derived from the exchange client secret; rotating the secret
invalidates existing cursors, so restart listing without a cursor. Listing forwards
backend pages without loading the full catalog. Accounts without `research:read` receive an empty
list; reading a resource requires that scope.

Read source on demand with these resource templates:

| URI template                                          | Content                                | MIME type                                                 |
| ----------------------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| `tqx://qube/strategies/{strategy}`                    | Latest strategy Python source          | `text/x-python`                                           |
| `tqx://qube/strategies/{strategy}/versions/{version}` | Frozen strategy Python source          | `text/x-python`                                           |
| `tqx://qube/factors/{factor}`                         | Latest factor Python source or formula | `text/x-python` or `text/plain`, according to `code_type` |

Resource reads return raw source rather than a JSON object containing `code`.
The factor template omits a fixed MIME type because each factor declares its own;
unknown or missing factor code types are rejected. Historical versions remain
available through the strategy version template and are not enumerated in the list.
The `inspect_strategy` prompt embeds the Python resource and separately includes
verified strategy metadata, parameters and factor binding. Use `strategy.get` or
`factor.get` for structured details outside the prompt.

Use `strategy.get` → `strategy.validate` → `strategy.backtest.submit` →
`strategy.backtest.get` → `backtest.result.get` / `backtest.chart.get`.
Pass source/config revisions from `strategy.get`, keep the submit response's
`id` as `runId`, and poll about every two seconds with rate-limit backoff. Backtest results and charts permit empty or partial reads while queued or running;
`partial`, `availableFrom` and `availableTotal` describe availability.
`LIVE_RESULT_UNAVAILABLE` is transient: retry the same read with backoff and retain
the run ID. Factor analysis results still require `succeeded`. `valid=false` and remote `status=failed` are
business results, not tool execution errors. Cancellation acknowledgements do
not imply the run is already cancelled. An Agent poll timeout does not cancel
the remote run.

Tool detail responses omit source by default; use `get_source` or `get({ includeSource: true })`.
Result rows retain engine field names and units. Cursor lists use the upstream
cursor. Factor analysis history and snapshots expose at most the upstream's
latest 200 entries, version lists at most 1000; MCP offset pagination slices only
that returned batch. `possiblyTruncated=true` signals a reached upstream cap;
`hasMore` only describes further rows within the batch. Use search actions for
complete analysis/version history; older snapshots have no further upstream
pagination. Recent backtests similarly expose `possiblyTruncated` at the requested
limit. Chart responses retain the optional benchmark curve and partial state.

`factor.tuning` and `strategy.tuning` each provide submit/list/search/get/cancel/rerun/apply.
Submit, cancel and rerun require `research:run`; apply requires `research:write`.
Read the selected trial/candidate ID from get, and use current resource revisions
when applying. Tuning lists are capped at 200 summaries; use search for history.
`cancelling` is pending and `no_valid_candidates` is terminal.

Factor analysis and tuning `stockPool` currently accept only `all` (full market).
Omitting it preserves saved configuration and server defaults; explicitly update historical
index pools to `all` before running. Backtest `standardSymbol` supports HK (`HSI.HK`,
`HSCE.HK`, `HSTECH.HK`) and US (`SPX`, `IXIC`, `NDX`, `DJI`) indices.
The backend validates benchmark market compatibility.

Read token exchanges use the existing process-local cache. Every execution or
write uses a fresh exchange and is never automatically replayed. Preserve
`requestId` for retries of the same intent; after timeouts or invalid responses,
verify remote state before retrying. Research uses a separate token provider and
audience from Trading, with no database or local task store.

Embedding hosts can set `createApp({ researchConfig, research: ... })` to inject
fetch, exchange and clocks, or set `researchConfig: null` to disable Research.
Limits default to 10 seconds per gateway request, 4 MiB per upstream JSON body,
1 MiB per business output, 100 concurrent requests and 4 per user/client. The
existing exchange cache/timeout options also apply. `maxResponseBytes`,
`maxOutputBytes`, `gatewayTimeoutMs`, `maxConcurrent` and `maxPerPrincipal` can be
configured through `research`. Oversized results fail explicitly instead of being
silently shortened; narrow the page or time range. Open engine JSON is bounded
to depth 24 and 100,000 values per checked value.

## Authorization Code login

The server publishes anonymous Protected Resource Metadata at
`/.well-known/oauth-protected-resource/mcp` for a canonical `/mcp` resource,
plus a root `/.well-known/oauth-protected-resource` alias. Other external resource
prefixes produce the corresponding path-aware well-known route. Anonymous MCP
requests receive HTTP 401 with a public `resource_metadata` challenge URL.

The MCP client follows that metadata to tqx-oauth, obtains its own client ID via
CIMD, pre-registration, or DCR, and completes **Authorization Code + PKCE S256**
in the browser. tqx-web provides login and consent. The client checks state and
issuer, receives its own callback, exchanges the code, and retains any refresh
token. It sends `Authorization: Bearer <access_token>` on every MCP request.
Discovery advertises all six TQX scopes, matching the API key permission groups:
`research:read`, `research:write`, `research:run`, `trade:read`, `order:write`, and
`ranking:read`. Clients that use the advertised list as their initial scope set
will request all six; clients can explicitly request a subset. Consent involving
`trade:read`, `order:write`, or `ranking:read` requires an Agent selection in tqx-web. Existing
transactions and tokens retain their scopes; start a new authorization to request
additional permissions. `tqx_ping` itself has no additional business scope requirement
beyond a valid MCP token. Business tools are enabled separately through the Research and Trading configurations above.

This package does not implement Device Flow, an OAuth callback, an authorization
server, or code/refresh-token storage. It does not call device authorization,
registration or consent endpoints. With trading enabled, it calls the trusted
AS token endpoint for downstream exchange, in addition to public discovery/JWKS.
The AS's global discovery may still advertise Device Flow.

JWT verification uses JOSE with RS256, trusted issuer, exact MCP audience, expiry,
optional `nbf`, and Valibot-validated identity claims. AS metadata must report the
configured issuer; JWKS must be on that issuer's origin. Discovery requests reject
redirects, omit credentials, time out after five seconds, and parse JSON using
`Response.json()`. JWKS documents accept at most 32 keys. Public metadata/keys
are cached in process for at most ten minutes; unknown-key refreshes and failed-fetch retries have a 30-second
cooldown. Publish old and new keys together during rotation. No database is used.

Invalid tokens receive 401. Per-operation scope challenges use the SDK's HTTP 403
response before tool execution. Upstream discovery failures return a safe HTTP
500; no unverified request is allowed through. Browser CORS exposes
`WWW-Authenticate` on authentication errors. Legal OPTIONS preflights remain
anonymous and never execute a tool.

**Revocation limitation:** local JWT verification does not detect revoked AS
sessions before token expiry. Read token caching can delay observing revocation
until cache expiry unless the downstream gateway also checks revocation. Writes
use fresh exchange and depend on the AS checking live session/JTI status.
Device-grant and code-grant tokens currently share the same claims; the resource
server cannot infer which login flow issued one.

Browser end-to-end login still requires the tqx-web consent page and a reachable,
compatible test AS/deployment. Workspace tests use test signing keys and injected
public discovery responses; they do not establish that those services are deployed.

## Call a tool and test

After the MCP client completes login, it can call `tqx_ping` with
`params.arguments: {"name":"world"}`. The result contains
`content: [{"type":"text","text":"pong, world"}]`. Use `tools/list` for its schema.
Missing or non-string names produce `isError: true`; unknown tools return JSON-RPC
error `-32602`, following the SDK's standard behavior.

`src/app.ts` provides an injectable Fetch app factory, `src/auth/` owns resource
metadata, JWT verification and token exchange/caching, `src/trading/` owns the
independent gateway contracts and transport, `src/tools/trading/` owns the five
trading tool handlers, `src/research/` owns the two Research tools, action contracts,
documentation and independent Research gateway, `src/tools/bug-report/` owns the bug-report tool and
prompt, `src/server.ts` registers tools and prompts, and `src/index.ts` is the
Bun entry. Reusable helpers live in `src/utils/`, with configuration parsing
helpers in `src/utils/config.ts`. Other runtimes can serve `createApp().fetch` through an HTTP
adapter. Tests run the core under Node/Vitest and exercise authentication under Bun.

Run the workspace checks from the workspace root:

```bash
bun run test:unit packages/mcp-server/test
bun run test
```
