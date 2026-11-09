# TQX MCP Server

Stateless Streamable HTTP resource server using MCP SDK v2, Hono, and Valibot.
Every MCP request requires a TQX MCP Bearer token. Trading tools use independently implemented gateway clients; this package does not import the TQX CLI or SDK.
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

Trading is enabled when all four values below are provided. Omit all four to
retain the authentication-only deployment; partial configuration fails startup.
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

| Tool                | Request discriminator                             | Scope                                                                  |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `trading_snapshot`  | `sections`: account, positions (defaults to both) | `trade:read`                                                           |
| `trading_activity`  | `type`: orders, trades, cash_flows                | `trade:read`                                                           |
| `trading_lookup`    | `type`: order, signal; exact `id`                 | order: `trade:read`; signal: `order:write`                             |
| `trading_order`     | `action`: place, modify, cancel                   | `order:write`                                                          |
| `trading_control`   | `action`: hold                                    | `trade:read`                                                           |
| `submit_bug_report` | `title`, `description`, optional `idempotencyKey` | existing Trading scope: `ranking:read`, `trade:read`, or `order:write` |

Every tool takes a required `request` object. Use `tools/list` for the complete
current schema. Example `params` for a read:

```json
{
  "name": "trading_activity",
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
Use `trading_lookup` to follow the exact signal/order ID; after modify, use `new_order_id` when supplied. Missing active order
results do not prove final status. Writes are never automatically replayed;
transport/protocol failures may include `outcomeUnknown: true`. Client hosts
must apply their authorization/confirmation policy; a boolean tool argument
cannot prove human confirmation. Hold marks agent activity and does not trade.

`submit_bug_report` writes `POST /openapi/v1/bug-reports` and returns the
upstream `bug_id` and `created_at`. It is marked as a destructive, idempotent
write and always performs a fresh token exchange. It dynamically uses an
existing Trading Resource scope from the MCP token, preferring `ranking:read`
(which does not require an Agent), then `trade:read` or `order:write` when an
Agent binding is present. If no usable Trading scope is present, the MCP server
returns a scope challenge for `ranking:read` so the client can perform step-up
authorization. The deployed contract has no `bug:write`. Reuse `idempotencyKey` only for retrying the same report. The
`prepare_bug_report` prompt helps compose a reproducible report and never calls
the upstream API. It instructs the Agent to investigate ownership first, submit
only when the evidence points to a TQX issue, produce a short title and a
structured Markdown description, call `submit_bug_report` directly after the
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

When trading is enabled in production, the demonstration `ping` tool is disabled
by default, leaving six business tools. It remains available in development or
authentication-only mode. Health checks and the MCP protocol ping remain usable.
Research APIs are reserved for a later phase.

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
`trade:read` or `order:write` requires an Agent selection in tqx-web. Existing
transactions and tokens retain their scopes; start a new authorization to request
additional permissions. `ping` itself has no additional business scope requirement
beyond a valid MCP token. Business tools are enabled separately through the trading configuration above.

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
See the [implementation plan](docs/oauth-authorization-code-plan.md) for ownership,
contracts, and the remaining integration checklist.

## Call a tool and test

After the MCP client completes login, it can call `ping` with
`params.arguments: {"name":"world"}`. The result contains
`content: [{"type":"text","text":"pong, world"}]`. Use `tools/list` for its schema.
Missing or non-string names produce `isError: true`; unknown tools return JSON-RPC
error `-32602`, following the SDK's standard behavior.

`src/app.ts` provides an injectable Fetch app factory, `src/auth/` owns resource
metadata, JWT verification and token exchange/caching, `src/trading/` owns the
independent gateway contracts and transport, `src/tools/trading/` owns the five
trading tool handlers, `src/tools/bug-report/` owns the bug-report tool and
prompt, `src/server.ts` registers tools and prompts, and `src/index.ts` is the
Bun entry. Reusable helpers live in `src/utils/`, with configuration parsing
helpers in `src/utils/config.ts`. Other runtimes can serve `createApp().fetch` through an HTTP
adapter. Tests run the core under Node/Vitest and exercise authentication under Bun.

Run the workspace checks from the workspace root:

```bash
bun run test:unit packages/mcp-server/test
bun run test
```
