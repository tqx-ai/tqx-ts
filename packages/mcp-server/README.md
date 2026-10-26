# TQX MCP Server

Node/Bun workspace resource server using the official MCP TypeScript SDK **1.32.1** and
JOSE **6.2.13**. It reuses tqx-oauth as the authorization server (AS); it does not issue tokens.
The default-off mode proves protocol connectivity and JWT validation with an empty tool list.
An optional trading integration enables seven read tools and, behind a second default-off gate,
four write tools through request-local token exchange and the workspace Bearer SDK.
Verification uses synthetic AS/Trading fixtures; it does not prove real account authorization.

This is the private `@tqx-ai/mcp-server` package in the tqx-ts workspace.
The current v2 tool and batch contract is documented in [V2_CONTRACT.md](V2_CONTRACT.md).
Historical v1 and migration results remain separate from current v2 acceptance.

For coordination, start with [HANDOFF.md](HANDOFF.md): review fixes, verification evidence,
current boundaries, and the remaining AS/Agent/Trading integration contracts.
The decisions and system boundaries are in [INTEGRATION_CONTRACT_DRAFT.md](INTEGRATION_CONTRACT_DRAFT.md).
It records which earlier proposals were adopted or deferred by the primary Owner.
The seven-tool READ acceptance runner and its current phase gates are documented in
[READ_ACCEPTANCE_PLAN.md](READ_ACCEPTANCE_PLAN.md). It defaults to plan-only; actual B runs require
a fresh isolated-primary permit, private source/manifest inputs and coordinated Trading readiness.
Its offline checks and synthetic history ledger are separate from desktop/provider acceptance.

## Run locally

Requires Node 22.18+ and Bun 1.4.2+. Install and build from the tqx-ts root,
then run the server from its package directory. The workspace lockfile manages
all dependencies; there is no package lockfile.

```sh
# From tqx-ts root:
bun install --frozen-lockfile
bun run build
cd packages/mcp-server
bun run dev
```

Defaults need no environment file. Copy `.env.example` (or `.env.local.example`) to ignored
`.env.local` to override them. TQX_ENV selects local/test/prod; missing or unknown selectors preserve
local behavior, dev/development remain local and pro/production select prod. Optional templates
`.env.test.example` and `.env.prod.example` document deployment overrides without guessing addresses.

Precedence is process environment, then optional `.env.<selected environment>`, then the original
`.env.local`, then the existing runtime defaults. Missing test/prod files do not prevent startup or
introduce new required settings. Selecting prod alone does not change an endpoint or enable tools;
startup displays the final environment and effective public resource/issuer/API/Trading URLs. Existing
URL, Host/Origin, TLS-pair and enabled-tool secret validation applies unchanged to all selections.
Credentials/key contents remain private and are not displayed.

Run from this package directory so paths stay package-local. Bun may populate process variables
through its own automatic env loading; `bun --no-env-file src/index.ts` uses this entry's file
selection directly. Node start uses the same optional file chain. After installation, build the workspace
SDK first from the tqx-ts root (`bun run --cwd packages/sdk build`), then from this package:

```sh
bun run build
bun run start
```

For example, set TQX_ENV=test (PowerShell: `$env:TQX_ENV='test'`) and run `node dist/index.mjs`.
Explicit MCP_* process values keep precedence over all files. This configuration change does not
rewrite a user's Codex authentication/profile, restart a service or contact a production endpoint.

The default endpoint is `http://127.0.0.1:3002/mcp`. Default issuer is
`http://127.0.0.1:26823`; default JWKS is its `/.well-known/jwks.json` endpoint. Health and metadata
work while the AS is unavailable. No listener, token, or fixture is started implicitly by the build.
Startup errors (including an occupied port) exit nonzero with sanitized diagnostics. SIGINT and
SIGTERM stop accepting requests, drain in-flight responses, and force-close after the configured
timeout. No MCP server/transport survives its response or an aborted connection.

## HTTP contract

| Method and path                                 | Behavior                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `GET /healthz`                                  | `200 {"status":"ok","checks":"process-only"}`; process liveness only |
| `GET /.well-known/oauth-protected-resource/mcp` | RFC 9728 metadata for the exact resource                             |
| `GET /.well-known/oauth-protected-resource`     | Same metadata as a discovery alias                                   |
| `POST /mcp`                                     | Authenticated stateless MCP, JSON responses, no session identifier   |
| `GET`, `DELETE`, other methods on `/mcp`        | Auth required, then `405`; no session/SSE operations                 |
| `OPTIONS`                                       | Exact-origin CORS preflight, no bearer requirement                   |

Metadata advertises `authorization_servers: [MCP_OAUTH_ISSUER]`,
`scopes_supported: ["trade:read"]`, and `bearer_methods_supported: ["header"]`.
An unauthenticated/invalid-token request gets HTTP 401 and:

```http
WWW-Authenticate: Bearer error="invalid_token", scope="trade:read", resource_metadata="http://127.0.0.1:3002/.well-known/oauth-protected-resource/mcp"
```

A valid JWT with absent, empty, or insufficient scope gets 403 `insufficient_scope` with the same
metadata pointer and required scope. Authentication errors are JSON OAuth errors; JSON parse errors
return a sanitized JSON-RPC 400. The SDK parser caps JSON at 100 KiB (413 when exceeded).
No raw token, request body, internal exception, or JOSE/network error is returned or logged.

## Access-token validation

- Accept exactly one `Authorization: Bearer <JWT>` header, on every protected HTTP request.
  Query parameters, Basic auth, extra credential segments, and duplicate Authorization fields do
  not authenticate. Stateless means tokens must be sent again for each request.
- Allow RS256 only; verify the signature against the **operator-configured JWKS URL**, never
  token `jku`, `x5u`, or another attacker-supplied key URL. JWKS redirects are not followed.
- Require exact issuer and full resource audience, including `/mcp`, port, and scheme. `aud` may
  be that string or a one-element array containing it; multi-audience and duplicate arrays fail.
- Require an unexpired integer `exp`, nonempty string `sub`, `client_id`, `sid`, and `jti`.
  JOSE also enforces `nbf` when present. There is zero expiration clock tolerance, and expiration
  is checked again after asynchronous request-body parsing, before protocol dispatch.
- Scope must be a valid space-separated OAuth scope string containing exact `trade:read`.
  A malformed non-string scope fails as an invalid token (401).
- Request-local SDK auth info carries validated subject/client/session/token identifiers. Default
  mode accepts the original skeleton claims. Tools-enabled mode additionally requires nonempty
  signed `agent_id` and `grant_id`; it never manufactures them from a client header or tool argument.

JWKS keys are cached and refreshed by JOSE with bounded timeout/cooldown. A key fetch/verification
failure fails closed as 401. Cached public keys can validate tokens during a temporary AS outage;
this does **not** check revocation or prove that the OAuth session remains active.
That statement describes local JWT verification. In tools-enabled mode every protected HTTP request
also exchanges its token before dispatch, providing an AS-enforced online session/grant activity gate.
Disconnected requests stop waiting for verification without cancelling the shared public-key
fetch needed by other clients. Service shutdown cancels outstanding JWKS fetches after draining
or on the force-close deadline, including authentication work before protocol construction.

## Runtime configuration

All values are read at process startup (no build-time endpoint embedding).

| Variable                                | Default / meaning                                                     |
| --------------------------------------- | --------------------------------------------------------------------- |
| `MCP_HOST`                              | `127.0.0.1`; bind IP or `localhost`                                   |
| `MCP_PORT`                              | `3002`; integer 1-65535                                               |
| `MCP_RESOURCE`                          | `http://<bind-host>:<port>/mcp`; canonical full `/mcp` URL            |
| `MCP_OAUTH_ISSUER`                      | `http://127.0.0.1:26823`; exact JWT issuer / AS metadata value        |
| `MCP_JWKS_URL`                          | `<issuer>/.well-known/jwks.json`; trusted fixed verification endpoint |
| `MCP_ALLOWED_HOSTS`                     | Resource authority; comma-separated exact Host values, with port      |
| `MCP_ALLOWED_ORIGINS`                   | Resource origin; comma-separated exact browser origins                |
| `MCP_TLS_CERT_FILE`, `MCP_TLS_KEY_FILE` | Unset; both PEM paths enable native HTTPS                             |
| `MCP_TLS_TERMINATED_BY_PROXY`           | `false`; explicitly allow an HTTP listener behind TLS ingress         |
| `MCP_JWKS_TIMEOUT_MS`                   | `5000`; key fetch timeout                                             |
| `MCP_JWKS_CACHE_MAX_AGE_MS`             | `600000`; public-key cache lifetime                                   |
| `MCP_JWKS_COOLDOWN_MS`                  | `30000`; minimum refetch interval on an unknown signing key           |
| `MCP_SHUTDOWN_TIMEOUT_MS`               | `5000`; drain timeout before forcing connection closure               |
| `MCP_REQUEST_TIMEOUT_MS`                | `30000`; Node timeout for receiving the complete HTTP request         |
| `MCP_HEADERS_TIMEOUT_MS`                | `10000`; request-header timeout, must not exceed request timeout      |
| `MCP_KEEP_ALIVE_TIMEOUT_MS`             | `5000`; idle HTTP keepalive timeout                                   |

Every URL rejects credentials, query, and fragment. Resource path is fixed at `/mcp`. HTTP is
allowed only for the explicit loopback hosts `127.0.0.1`, `localhost`, or `::1`. Non-loopback
binding requires an HTTPS public resource plus native TLS or explicit proxy termination. The
`createMcpExpressApp` SDK hostname validation is supplemented with exact Host/port checks before
body parsing. Origin checks are also exact; `null`, wildcards, and URL suffixes are not accepted.
Native clients without Origin are allowed and still require bearer authentication.

For later K8s/ingress use, set the public resource/issuer/JWKS, bind `0.0.0.0` on the internal port,
and configure TLS. If TLS terminates at ingress, set `MCP_TLS_TERMINATED_BY_PROXY=true`, restrict
the HTTP listener to that proxy with network policy, and preserve an explicitly allowed Host.
Forwarded headers are not trusted or used to reconstruct URLs. Configure an exact probe Host
header (or add its authority to `MCP_ALLOWED_HOSTS`). `/healthz` does not test AS/JWKS, Redis,
Mongo, session state, Trading, or deployment readiness. No deployment is included in this version.

## Verification and boundaries

### Optional trading integration

Set `MCP_TRADING_TOOLS_ENABLED=true` and a private `MCP_EXCHANGE_CLIENT_SECRET` matching OAuth's
`OAUTH_MCP_EXCHANGE_CLIENT_SECRET`. No secret is shipped in `.env.example` or the binary. Missing
secret prevents enabled startup; false requires no service secret and preserves the empty tools.

| Variable                          | Default / meaning                                                         |
| --------------------------------- | ------------------------------------------------------------------------- |
| `MCP_TRADING_TOOLS_ENABLED`       | `false`; master gate for all tools                                        |
| `MCP_TRADING_WRITE_TOOLS_ENABLED` | `false`; enables writes only when the master gate is on                   |
| `MCP_API_RESOURCE`                | `http://127.0.0.1:8100/api`; exact API JWT audience and exchange resource |
| `MCP_TRADING_BASE_URL`            | `http://127.0.0.1:8100`; Trading origin, independently configured         |
| `MCP_EXCHANGE_CLIENT_SECRET`      | Unset; private Basic credential for fixed `tqx_mcp_server`                |
| `MCP_EXCHANGE_TIMEOUT_MS`         | `5000`; complete exchange and derived-token verification budget           |
| `MCP_TRADING_TIMEOUT_MS`          | `10000`; one SDK tool operation budget                                    |

After local JWT/body-expiry checks, **every protected HTTP request** exchanges M at the configured
issuer's `/oauth/token`, including initialize, listTools, notifications, and method probes. It uses
client_secret_basic and the RFC8693 form with the exact intersection of the source token's scopes
and enabled `trade:read`/`order:write` scopes. No introspection endpoint
or shared Redis/Mongo connection is introduced. The AS validates session, grant, source jti and scope;
Trading independently checks grant/session/source-and-derived jti and authoritative Agent ownership.
Web logout only revokes Web sessions; explicit external-authorization revocation targets the OAuth
grant. Refresh creates a new sid but inherits grant_id. These policies require corresponding backends.

MCP verifies the returned RS256 API token against fixed issuer/JWKS and exact single API audience,
sub/sid/grant_id/agent_id, `client_id=tqx_mcp_server`, source_client_id, act, fresh integer iat/exp,
and matching expires_in/scope. It enforces the 300-second maximum and source token expiry; AS enforces
the shorter session/grant expiry. account_id/parent_jti are not required. Same HTTP request reuses T;
there is no cross-request token cache, refresh, direct MCP-token forwarding, or API-key fallback.

| Scope                        | Tools                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `trade:read`                 | getAccount, listPositions, listOrders, getOrder, listTrades, listCashFlows, getSignal |
| `order:write` and both gates | placeOrder, modifyOrder, cancelOrder, placeOrders                                     |

Each request lists only tools allowed by its scopes. Write-only tokens cannot read; read-only tokens
cannot write. Tool arguments are strict and cannot override identity or account binding. Position
symbols accept 3..32 characters; optional cursors allow empty strings and are at most 512 characters.
Read outputs preserve SDK data. Writes require a stable 8..128 character idempotency key and return
explicit submission status; acceptance never means a fill or a completed cancellation.

Submission classification follows the invoked response family: placeOrder/placeOrders use signal
state; cancelOrder/modifyOrder use action accepted/status. Extra signal-shaped action metadata
cannot turn a rejected action into acceptance. A dispatched write returning
trading_service_unavailable remains unknown, including an HTTP-200 error envelope. Only safe
reconciliation identifiers cross the error boundary. Malformed final responses preserve a safe
protocol-error request ID; final network failures never reuse an earlier retry response's ID.

Order status_source/status_reason/is_stale and signal
monitor_status/monitor_stop_reason/order_status_source are optional and nullable SDK fields, passed
through unchanged. BUDGET_EXHAUSTED/monitor_budget describes monitoring only, never a new signal
failure or channel TIMEOUT. A channel DAY expiry can remain TIMEOUT with CHANNEL/DAY_EXPIRED
provenance. Missing sources stay missing/null; stale snapshots remain explicitly stale. GET errors
return an error without manufacturing order, signal or submission states. MCP does not keep an
observation cache, reconcile broker history, or wait for a fill; bounded observation belongs to
the caller, and authoritative late-fill recovery belongs to Trading.

tests/trading-journey.test.ts exercises the official MCP client against owned in-memory loopback
AS/Trading fixtures: cumulative partial fills 0/10 -> 4/6 -> 4/6 -> 10/0, exact decimal snapshots,
partial cancellation and in-flight fills, action acceptance, monitor provenance, stale data,
read failure/recovery, online revocation rejection and ambiguous submissions. These are synthetic
protocol checks, not actual model execution, real consent, durable backend recovery or broker fills.

2026-10-26 protocol review evidence: the initial 20 journey regressions produced 16 passes and four
failures (HTTP-200 service outage, rejected cancel/modify masked by extra state, final protocol
request ID). After the three narrow product fixes and five additional boundary cases, all 25
journey tests passed; the full guarded MCP suite passed 225 tests across nine files. Scoped
Oxfmt/Oxlint, strict package TypeScript, isolated tsdown build and built Node smoke also passed
(health/metadata 200, unauthenticated 401, forbidden Origin 403, shutdown 0). The build uses a
separate ignored work directory; running dist and shared services are untouched.

Case references describe protocol-layer coverage only: FILL-04/08, ACT-06, READ-03/08, MON-07/14/15,
AUTH-04 and IDEM-10. They do not close those cases at backend, actual Codex or channel layers.
Trading still owns authoritative detail-first recovery, cumulative fill/event deduplication,
monitor-budget persistence and trade-only capability limits. The integration owner still owns
bounded observation, interruption/resume budgets and actual thread/turn/MCP evidence. Root owns
SDK schema consolidation and cross-service acceptance. No real authorization or broker access
is established by this suite, and the new Trading fixture event protocol is not assumed frozen.

`placeOrders` accepts 1..20 instructions, validates and normalizes every item with the SDK before
any submission, rejects duplicate keys, and submits sequentially. It stops on the first failed or
unknown outcome and marks all later items not_submitted. See [V2_CONTRACT.md](V2_CONTRACT.md) for
exact input/result fields and reconciliation rules. Unsupported cash ledgers retain the explicit
`cash_flows_unsupported` error rather than returning an empty list.

Read annotations are readOnly=true/destructive=false; write annotations are readOnly=false/
destructive=true. All tools declare idempotent=true/openWorld=true; write idempotency depends on
preserving each intent's required key and the backend's durable idempotency contract.
SDK GET/keyed retries retain SDK policy; MCP adds no retry and creates no keys. Every attempt is
bounded by cancellation, the per-item deadline and derived-token expiry. Native fetch never follows
AS/Trading redirects. AS JSON is capped at 64 KiB and Trading bodies at 1 MiB. An ambient TQX_BASE_URL
pointing to another origin fails closed before a bearer is sent.

listOrders additionally accepts optional startDate/endDate (YYYY-MM-DD), status (any string) and
symbol (3..32 characters), alongside limit/cursor. Trading filters the provider's current active
snapshot with AND semantics; dates include both endpoints in Hong Kong time based on submitted_at.
Rows without a reliable submitted time do not match date filters. Status is trimmed/uppercased and
unknown values return no matches; Trading owns symbol normalization. Filtered pagination binds the
normalized filters and orders by submitted_at descending with a stable order_id tie. Omitted filters
preserve the existing listing/cursors. This adds current-snapshot filtering, not historical broker
queries. Native cash-ledger support remains provider-dependent; currency requests preserve actual
reported currency and do not imply a fabricated USD conversion.

WRITE_ACCEPTANCE_HANDOFF.md lists reusable isolated engineering tests and remaining durable
idempotency, real-quota and lifecycle-polling acceptance gaps. New source/filter tests do not alter
the earlier READ B result or imply that the shared running services have been updated.

If the source token expires while waiting for exchange or derived-token verification, MCP returns
401 invalid_token with the normal metadata challenge so the client can refresh. An unexpired source
with a malformed/expired derived token remains 502 upstream_protocol_error. No expiry tolerance,
authorization bypass or MCP-managed token refresh is introduced.

Before SDK dispatch, invalid_grant maps to HTTP 401 with metadata challenge; invalid_scope to 403;
service credential/target configuration, rate limit or AS unavailability to 503; malformed/contradictory
success responses to 502. After protocol dispatch, Trading failures return sanitized isError tool
results (authorization_required, permission_denied, rate_limit_exceeded, invalid_arguments,
trading_request_rejected, upstream_protocol_error or dependency_unavailable). No late HTTP mutation,
raw upstream text, token or secret is exposed. Client disconnect/shutdown cancels AS/Trading waits.

### Workspace SDK dependency

`@tqx-ai/sdk` is `workspace:*`; runtime builds consume the sibling SDK package.
Package TypeScript and Vitest configuration resolve the SDK source for checks,
following the root workspace convention. Oxfmt, Oxlint, TypeScript, Vitest and
tsdown come from the root workspace; the only package-specific development
dependency is `@types/express`. Existing runtime dependency versions are retained.
The original absolute tarball dependency and independent Bun lockfile were not
carried into the package. Its old SHA256 is preserved in the historical handoff
and acceptance records, not used as an installation requirement.

The package is private; source availability does not authorize npm publication.
No standalone deployment or clean-clone build has been verified after migration.

### Checks

Local/test persistence and service validation are explicitly authorized as of 2026-10-25, using fresh
isolated test configuration/fixtures only. Default gates remain off; production, real funds/brokers,
deployment and destructive cleanup remain excluded. Ignore stale READY and never load .env.prod.

The optional memory-only validation lane uses [MEMORY_ONLY.md](MEMORY_ONLY.md) and its explicit
Node/Vitest entry, which installs guards and loads no runtime .env file. The normal commands below
are outside that lane and must not be run under its no-persistence/no-subprocess boundary.
For the built Node baseline without loading a checkout's .env.local, build from this package and run
`node tests/isolated-built.smoke.mjs`. It uses a fresh empty ignored directory, a minimal synthetic
child environment, disabled tool flags and a temporary port, then closes the child and removes only
its own empty directory. This does not start the Owner's MCP3004 or contact real AS/Trading services.

From this package directory after installing and building the workspace:

```sh
bun run check
bun run smoke
```

`check` runs root Oxfmt/Oxlint, both strict TypeScript configurations, package
Vitest and tsdown directly, without nested root `test`/`typecheck` scripts.
Focused scripts are `test:mcp` and `typecheck:mcp`. Root `typecheck`,
`test:unit` and `test:smoke` delegate to this package; root formatting and
linting cover all packages. Package tests preserve their own `tests/` include.

Vitest runs under Node, generates isolated in-memory synthetic RS256 keys/JWKS, exercises HTTP
discovery and validation failures, and connects the official SDK Client for initialize/listTools.
Concurrency tests use test-only ping metadata to prove identity isolation; this ping metadata is
not part of the production server. Abort, drain timeout, port conflicts, and both Node signal
handlers are covered. Windows tests emit Node signal events because Windows cannot deliver POSIX
signals in the same way as Linux. See `ACCEPTANCE.md` for the performed smoke checks and limits.
`smoke` launches the built Node entry on a temporary loopback port, performs real local fetches,
then stops its child through the registered SIGTERM handler. Set `MCP_SMOKE_PORT` to use a
specific free port. Both Trading tool flags are forced off; an occupied port fails startup
before any HTTP probes, so this check cannot silently target another running service.

Implemented on the MCP side: two default-off gates, Agent/grant claims, request-local online exchange,
seven read tools, four write tools and sequential batch outcomes. Full v2 cross-service and actual
client acceptance remain pending, as do real consent, accounts/brokers and Linux/TLS deployment.
AS/Trading own live revocation, binding, quotas and durable idempotency. Synthetic fixtures exercise
the MCP contract and cannot establish those backends' production behavior.

Protocol references: [official v1 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x),
[MCP 2025-11-25 authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
and [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728.html). This repository intentionally uses the
pinned v1 SDK API rather than migrating to the separate v2 package layout.

The primary Owner subsequently reported an isolated joint HTTP pass using the actual built MCP,
AS and Trading processes, real isolated Redis/Mongo, SQLite ownership fixtures and a fake broker.
This chat did not rerun that check. See ACCEPTANCE.md for the exact reported cases and limits.
