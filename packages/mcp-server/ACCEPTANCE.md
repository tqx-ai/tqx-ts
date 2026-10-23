# MCP acceptance record

Migration status (2026-10-23): imported from MCP checkpoint
`8a16a14eee5cbd1146033ae973c4dd1e99d0f4d1` into `tqx-ts/packages/mcp-server`.
This package remains `private: true`. The checkpoint contains unverified v2 WIP
in four runtime files and client harness scaffolding. The v1 results below predate
that WIP and this migration. The root Owner has completed dependency installation
and connected package checks; migration verification is still pending with that
Owner. No package test/build/smoke result is claimed here for the migrated files.

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
