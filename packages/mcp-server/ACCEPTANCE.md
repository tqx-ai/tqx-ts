# MCP acceptance record

Post-d6d604d source-only update: listOrders optional startDate/endDate/status/symbol uses the agreed
SDK contract to filter the provider's current active snapshot at Trading. Date/normalized AND/cursor/
ownership semantics are backend duties; no historical-query, FX or cash-ledger result is invented.
The entire affected guarded HTTP file passed46/46 (original36 +3 lost-write/polling counterexamples
+7 filter/input checks); READ offline56/56, both strict typechecks and scoped format/lint/diff passed.
Separate ignored tsdown output passed the clean tool-disabled Node baseline200/200/401/403/exit0;
the live dist hash and3004/8102/READY/auth/old write data were untouched. These engineering results
are separate from the retained live B results below; Root owns final cross-package acceptance.

Final READ B results:114 unique cases,113 passed and1 provider501 capability unsupported. Retained
original107/4/2/1 plus targeted6/6 and separate preflight1; total actual tool POST116/Trading READ89.
All original/targeted before/after audits settled with0 write/effect/business-digest deltas. Actual
cancel/reconnect/parallel and auth negatives passed. READ_ACCEPTANCE_RESULTS.md preserves scope,
repairs and controlled-versus-normal JWT evidence; no desktop/real-broker acceptance is implied.

Compatible TQX_ENV selection now supports local/test/prod and legacy aliases with original process
precedence/default fallback, optional profile files and effective-public-config display. Existing
security validation is preserved and no stricter deployment policy added.190 guarded engineering
tests and56 READ offline tests passed, both strict typechecks and scoped format/lint/diff checks
passed. A separate ignored tsdown artifact passed local/test/prod built Node health/metadata200,
unauthenticated401, Origin403 and orderly exit0, with selected env files actually applied and no
external AS/Trading/production request. The live3004 dist hash/profile/process were not replaced.
Root's final full workspace orchestration is separate; no new default dist build or commit is claimed.

Root separately authorized retiring only the four new B grants: three active were precisely retired
through the existing AS internal revokeGrant function after full receipt/connection checks, one already
revoked was not repeated. All four reread revoked. This is not an HTTP revoke endpoint test; no new
endpoint/direct HSET, personal grant/cache change, business/audit deletion or Trading call was used.

Historical READ preparation and earlier executed baselines follow; the final status above supersedes
their pending-runtime and pending-retirement statements.

Current READ B preparation (2026-10-25): Root released B after31 actual desktop A calls and a clean
A-after audit. The official SDK READ driver, schema1 private manifest/oracles, isolated file RPC,
fresh-permit CLI and normal OAuth source-preparation entry are implemented.54 offline checks passed:
44 runner/classifier checks (including all34 production safe error codes) and10 SDK-class/synthetic-fetch/
contract checks. Cancellation, reconnect and two overlapping calls are observed through SDK transport
operations; these remain memory-double evidence. Strict source types, scoped Oxfmt/Oxlint and diff
checks passed. The frozen MCP3004 bundle was not rebuilt or restarted and no new built smoke is claimed.

Actual isolated OAuth preparation created four new740001 B grants, normally refreshed one and
precisely revoked a different new grant. Positive reads will use the new refreshed source and the
old-M role its predecessor. Private tokens are excluded from reports. This made zero Trading calls,
used no740002/plugin cache and is not actual desktop consent.114 planned READ descriptors are not
executed passes. Actual B protocol outcomes remain pending Trading manifest/runtime readiness;
see READ_ACCEPTANCE_PLAN.md and HANDOFF.md for remaining gates and provider501 limitations.

2026-10-25: user-authorized isolated local/test integration has resumed; the strict memory-only lane
is optional and remains unchanged. Current run results are separate from the historical records.
Use fresh explicit test config/namespaces, keep default flags off, and exclude production/live brokers,
deployment, destructive cleanup and .env.prod. Built baseline uses a clean cwd/env, not old .env.local.

2026-10-25 executed results: the initial 182-test baseline passed. After the source-expiry fix,
all 185 tests/8 files passed with the unfiltered guarded full HTTP/security entry;
package/Codex strict no-emit types, Oxlint and tsdown passed. The isolated built Node smoke passed
health/metadata 200, no bearer 401, invalid Origin 403 and shutdown exit 0, with flags off and no
external AS/Trading access. The full-package format check now passes after the Codex owner finished
its WIP; no other owner's files were reformatted by this line. Focused regression first reproduced
502 when M expired during T verification, then verified 401 after the minimal auth catch change;
valid M with malformed/expired T still returns 502. All three cases prohibit Trading dispatch.
Fresh MCP3004 startup was then authorized and performed after fresh AS/JWKS and Trading generation/
namespace readiness checks: owned PID32228/session52043, loopback3004, exact metadata200,
health200/process-only and no-bearer401 with challenge passed. It runs in a clean ignored cwd with
minimal explicit environment and both test flags true. The startup probe made no authenticated
Trading/tool/client calls and wrote no READY; independent persisted/actual-client acceptance remains
with the primary Owner. Runtime references and the controlled shutdown plan are in HANDOFF.md.

Current memory-only validation follows [MEMORY_ONLY.md](MEMORY_ONLY.md): exact audited test files,
Node runner, no dotenv/runtime credentials, no actual middleware, and test I/O/connector guards.
Earlier full-package/build/smoke results below predate that stricter boundary and remain historical.
The dedicated memory-only entry passed 182 tests in 8 files (166 original plus 16 guard/config),
without skipped cases; scoped formatting/lint, strict no-emit types and diff checks also passed.

Current v2 contract, test cases and remaining integration work are recorded in
[V2_CONTRACT.md](V2_CONTRACT.md). Current package check passed: format/lint, both strict typechecks,
166 tests in 7 files (130 original plus 36 v2), and build. Built Node default-off smoke passed on a
temporary loopback port: health/metadata 200, unauthenticated MCP 401 and clean shutdown.
These synthetic/unit/runtime checks are separate from historical results and actual v2 client,
authorization, broker or backend-persistence acceptance.
The Owner reported migration root tests/pack/frozen install passed at workspace checkpoint
48b36ba; this does not establish v2 backend/client/consent or real broker acceptance.

## Owner-reported actual client acceptance and AOF window (2026-10-25)

The primary Owner and Codex line reported two real installed-client runs passed: app-server
45/45 and CLI --no-browser login plus app-server tools 45/45. Each run recorded 64 protected write
HTTP attempts and 41 PAPER object-broker effects; request attempts and effects are separate counts.
These are reported execution results from those owners, not tests rerun by this MCP line.

A new isolated HOME actual-client refresh check also passed: only that HOME's cache expiry was
forced; the signed source was not yet expired. Old source returned 401 and refreshed source 200.
After the Owner precisely revoked that case's grant, both still-unexpired MCP tokens returned 401.
The Owner additionally reported real TQX CLI read/login/logout passed and all client children exited.
No global configuration, actual broker/funds or production acceptance is implied. The initial client
plain-text tool-not-found parsing failure was retained as failed evidence with zero write/effect;
the Codex owner fixed classification and passed its offline counterexamples before rerunning.

The Owner now exclusively controls a short native Redis16380 AOF recovery window for this run's
own process/directory, preserving keys/data and the original port/password. Completion and recovery
proof remain pending that owner's explicit report. This MCP line does not perform recovery, remove
keys/data, query live endpoints or restart any service during the window. The owned MCP3004 service
is left running as instructed; runtime source and tests are frozen. Only local documentation/static
work is performed, with no new HTTP/Redis/login/refresh/logout requests and no Git mutation.

## Historical independent v1 acceptance

The following results describe the original standalone v1 run, before v2 WIP.
They have not been rerun against this workspace package or root toolchain.

Local verification date: 2026-10-23 (Asia/Shanghai).

Coordination handoff: [HANDOFF.md](HANDOFF.md). It consolidates the review fixes and outstanding
cross-repository contracts without changing the acceptance scope below.
The [integration contract](INTEGRATION_CONTRACT_DRAFT.md) now records the primary Owner's resolved
v1 decisions. MCP's default-off integration is implemented and tested against synthetic AS/Trading;
real backend interoperability, consent, shared-state revocation and broker connectivity remain unverified.

## Implemented

- Standalone Git repository on `dev`; independent package, dependency installation, Bun lockfile,
  strict TypeScript, Biome, Vitest, tsdown, and Node runtime. No workspace link to tqx-ts.
- Official MCP SDK 1.32.1 stateless Streamable HTTP `/mcp`, one server/transport per request,
  default-empty tools, optional two-tool read-only integration, and no shared MCP session state.
- Public protected-resource discovery (path-specific and root alias), fixed AS/JWKS configuration,
  sanitized 401 Bearer metadata challenges, and 403 insufficient-scope challenges.
- RS256 signature, exact issuer, exact single full audience, expiration, necessary identity claims,
  and exact `trade:read` checks. No token-selected key endpoint is trusted.
- Host authority/port validation plus SDK hostname validation; exact Origin/CORS handling;
  native clients without Origin; HTTPS configuration required outside loopback.
- Process-only `/healthz`; bounded JSON parser, sanitized errors, occupied-port handling,
  SIGINT/SIGTERM draining, abort cleanup, and forced shutdown timeout.
- Runtime environment example and local-secret ignores. Native TLS and explicit ingress
  termination configuration are available for future deployment; nothing was deployed.

## Performed checks

Environment: Windows, Node v24.13.0, Bun 1.4.2. Current results include the optional integration;
the original 81 skeleton/review cases are retained (with six additional config cases).

| Check                                            | Result                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Independent dependency install / frozen lockfile | Passed                                                                                                |
| `bun run check`                                  | Biome, typecheck, 130 Vitest tests in 6 files, build passed                                           |
| Official SDK Client                              | initialize, server capabilities, repeated empty listTools passed                                      |
| Synthetic signature/JWT failures                 | Wrong key/algorithm/issuer/audience, expired/nbf, missing identity claims, malformed scope rejected   |
| Scope failures                                   | Absent, empty, or insufficient required scope returned 403                                            |
| Discovery and transport defenses                 | 401 metadata, Host/Origin/preflight rejection, malformed/oversized JSON passed                        |
| Identity isolation                               | Concurrent different subjects/clients/sid/jti with colliding request IDs passed                       |
| Request lifecycle                                | Response completion, client abort, forced drain, and idempotent shutdown passed                       |
| AS unavailability                                | JWKS failure rejected protected access; process health stayed 200                                     |
| Port conflict                                    | Second listener rejected; first listener remained usable                                              |
| `bun run smoke`                                  | Built Node entry on 127.0.0.1:3002: health 200, metadata 200, MCP without token 401                   |
| Signal handling                                  | Both registered Node signal handlers tested; built Node SIGTERM event exited 0                        |
| `bun run dev`                                    | Actual Bun listener: health 200, metadata 200, MCP without token 401; Ctrl-C reached shutdown handler |
| Git / secret hygiene                             | No remote, commit, or push; env files/private keys/build/dependencies ignored                         |

All signed test tokens and keys are **synthetic**, generated in memory against isolated local
JWKS servers. They are not credentials for an actual user, account, Agent, AS consent flow, or
Trading service. The local Node/Bun smoke used no access token and did not need a running AS.
Smoke listeners were stopped after verification. The Bun command runner reported exit code 1
on terminal Ctrl-C; Node's portable SIGTERM-event smoke exited 0. Linux OS-delivered signals,
native TLS certificates, ingress/K8s, and real OAuth integration have not been deployment-tested.

## Second code review

Reviewed JWT validation, exact Host/Origin checks, authentication waits, and request cleanup.
Three regression tests reproduced incorrect behavior before the fixes:

- A token accepted at the authentication boundary could expire during a slow body upload and
  still reach protocol dispatch. Expiration is now checked again after body parsing; the
  regression verifies HTTP 401 and that no MCP server is constructed.
- A forced shutdown could close the inbound HTTP request while leaving the shared JWKS fetch
  alive until its longer timeout. Service-owned cancellation now aborts that fetch on shutdown,
  and disconnected requests independently stop waiting. A concurrent-client test confirms one
  client's disconnect does not interrupt another identity's authentication using the shared fetch.
- Origin configuration accepted a literal wildcard hostname, contradicting the documented
  configuration rules. Wildcard URL hostnames now fail validation. Runtime matching was already
  exact; this was a configuration-contract problem, not an Origin wildcard matching bypass.

Additional regression coverage rejects duplicate Host fields and scope LF/CRLF suffixes, and
confirms cleanup after protocol connect failure. Scope suffix tests passed before changes; no
scope-parser defect was confirmed. No issuer, audience, signature, or exact Host/Origin matching
bypass was found in this review. The full check and built Node smoke were rerun after the fixes.
The working tree remains uncommitted; no remote or adjacent repository was changed.

## Optional integration acceptance

Default-off skeleton cases remain. Enabled mode adds nonempty signed Agent/grant checks and an
online exchange before every protected HTTP request, including initialize/listTools. Two read-only
SDK tools are registered; API tokens are verified and scoped to one HTTP request. The local SDK
artifact SHA256 is c6fd4faf3c7992e40d622a25d1408426a7bba4dd886a3a03c4ec2fb9126337ba.

Synthetic tests cover SDK Client initialize/list/call, batch reuse, concurrent identities, strict
arguments, exact monetary/quantity strings and nulls, AS errors and derived-token contradictions,
redirect refusal, body limits, timeout/abort/shutdown, expired uploads and SDK ambient URL interference.
AS source-code response fields were read-only cross-checked; no actual service/real account was called.

## Remaining work

1. Verify actual AS/Trading interoperability with the Owner's local infrastructure and approved test
   account. AS/Trading own authoritative Agent/session/grant and both jti checks; fixtures cannot prove them.
2. Verify real Java/Web login and consent, user-visible grant revocation, refresh concurrency and shared
   Trading quotas. Web logout revokes Web sessions only; it does not implicitly revoke OAuth grants.
3. Resolve portable SDK artifact delivery/release, minimum Node runtime matrix and Linux/TLS/ingress.
   The historical package used an absolute tarball. The migrated package uses workspace:*;
   root installation, SDK build and migrated checks are pending Owner coordination.
4. No write/order tools, real trading, deployment, remote creation, commit or push. Other repositories
   remain unchanged by this chat. See HANDOFF.md and the Owner-resolved integration contract for handoff.

## Owner 报告的隔离联合 HTTP 验收（本聊天未重跑）

2026-10-23，主 Owner 在工作消息中报告：实际 dist/index.mjs + 官方 MCP Client 经过实际 OAuth
exchange 和 Trading HTTP，initialize/listTools/getAccount/listPositions 全部通过。refresh 后旧 MCP/API
票 401，新 sid 同 grant 继续正常；删除派生 jti 后 Trading 401，删除源 jti 后 MCP/Trading 401，
grant.status=revoked 后两者 401。使用真实隔离 Redis/Mongo、SQLite 权威归属 fixture、显式 fake broker。
无真实 Java 登录、浏览器同意、真实账户或券商验收。本聊天记录该报告，不把它算作自己重新执行的测试。
Owner 的 check-mcp.mjs 已在 finally SIGTERM 清理 MCP；本聊天遵照要求不再重跑或占用 3002。
