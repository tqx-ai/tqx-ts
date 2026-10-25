# Codex client acceptance record

2026-10-25 compatible three-environment source checks: eight focused offline tests
pass after withdrawing this round's added deployment gates. Coverage now verifies
the original explicit/existing/default chain, missing/partial test/prod settings,
legacy labels/HTTP paths/aliases/versions, advisory binding, source reuse and
conflict preservation. Node plans/generation use only inert URL strings and local
files; MD code blocks match source and pass syntax checks. The prior strict proposal
was source-only and was not installed/deployed. Original helper bytes/auth checks
are unchanged. No profile, OAuth, production endpoint, installed plugin or running
service changed. See DEPLOYMENT_COMPATIBILITY_REVIEW.md and
evidence/deployment-environments-20261025.json. Existing local0.2.0 stays intact.

Layer C actual-host discovery initially failed despite Owner installation: two
exact-plugin chats did not expose fixture tools; its audit stayed zero. Read-only
CLI inspection confirmed installed/enabled but version local and server not found.
The source generator omitted portable $schema discriminators; both source files
and generator now include them. Focused contract/catalog regression passes. Owner's
same-ID reinstall changed local to 0.1.0 and mcp get now finds the enabled original-URL
server, confirming the CLI-layer root cause/recovery. Owner then independently read
actual mcpToolCall records: C1=10/C2=14, matching the fixture's 24-call audit snapshot.
Actual model discovery/consumption now pass using the unchanged long server name;
length is not a current blocker. Owner's final typed-result/explanation review passed
all 28 semantic cases with 34 actual calls plus four cross-session READs. Every tool
and canonical argument SHA matched the audit baseline0-to38, with no write or other
server. Four client requests had 39ms common inflight overlap; no server processing
peak was measured. This passes C's public synthetic model layer, not real broker or
layer B integration. Owner removed the unique temporary plugin/marketplace; this
line interrupted only its owned session6273. PID67260 is absent and port52527 no
longer listens. Exec returned1 without the final stop event, so graceful-hook
completion is not claimed; all38 audit entries were saved before interruption in
evidence/public-read-final-audit-20261025.json. Source and reports remain. Actual-call
evidence is separate from protocol selfchecks. See evidence/public-read-loader-20261025.json.

2026-10-25 layer C fixture preparation passes 33 focused checks using only owned
temporary loopback ports. These cover all seven production read schemas/annotations,
28 deterministic matrix entries, four opaque-paginated datasets, exact decimals,
native currencies, null/stale/unknown/error handling and rejection of writes.
The independent Owner-ready listener and generated bare local plugin source are
recorded in evidence/public-read-preparation-20261025.json. This is fixture selfcheck
evidence, not actual model session behavior, actual account or broker integration.
The Owner will evaluate three actual model session groups independently of layer A
human-account reads and layer B real AS/storage coverage. No human profile install,
new chat, authorization, DB or shared controller was performed by this line.

2026-10-25 callback presentation acceptance: the self-contained Node bundle uses
public CLI --no-browser and delivers the original validated callback URL once on
stdin. Native CLI remains responsible for PKCE, exchange and credential storage.
Approve returned CLI 0/outer 303 to the original consent tx; deny returned CLI
1/outer 400 without a success redirect. One additional repeat-login check reused
the same isolated home with its existing registration/credentials and accepted
a newly randomized outer callback, CLI 0/outer 303. No credential file was read
or manually changed; primary 740001 decision fixtures are not human consent.
Seventeen directed boundary/failure tests, scoped Oxlint, integration TypeScript,
Node syntax and diff checks pass. See evidence/callback-stdin-20261025.json.
The single installation MD contains the full runnable bundle and frozen JSON
templates. Owner's already-successful human plugin OAuth/read verification is a
separate result; the new same-window human UX still needs Owner's final session.

2026-10-25: installed app-server v2 acceptance passed 45/45 (exit 0), covering
7/4/11 tool inventories, all scope denials, seven reads/four writes, keyed replay,
conflict/UNKNOWN, batch validation/20 sequential items and item-2 failures,
revocation, authoritative session expiry and quota. Audits contain 64 protected
write HTTP attempts and 41 unique PAPER fake-broker submission effects. Stores
were the Owner's isolated SQL/Redis/Mongo services; the Web token originated from
Owner-verified actual Java HTTP login of synthetic test users. Consent used the
AS decision API, not browser interaction. See evidence/v2-app-server-20261025.json.
The first attempt stopped after seven reads on a harness text-error parsing bug;
actual write attempts/effects were zero. That failed result is retained. The
parser was fixed with exact tool-name/isError/-32602 checks and negative tests;
the same unused write inputs then passed the complete run. The separate CLI
--no-browser login/app-server-tools round also passed 45/45 (exit 0), with its
own fresh inputs and another 64 HTTP attempts/41 effects. Key overlap was zero;
old RESERVED/UNKNOWN and accepted records were retained. See
evidence/v2-cli-20261025.json. A separate new-HOME actual-client refresh passed:
only private cache expiry was changed, source/refresh tokens and sid/jti rotated,
grant/uid/Agent/client stayed equal, old still-unexpired source returned 401 and
new source read returned 200. After the Owner verified ownership and revoked
only that new grant, independent verification confirmed both signed sources
were still unexpired and both returned MCP 401. See
evidence/v2-refresh-revocation-20261025.json. All owned clients exited; no further
online requests were made before the Owner's Redis recovery window.

2026-10-25 preparation: CLI/app-server version
0.164.0-alpha.11.1 and its generated experimental schema were checked. New live
execution requires explicit isolated-test opt-in and fresh schema-v2 Owner READY;
separate CLI and app-server drivers use private HOME/configuration. Focused
formatting, deny-warnings lint, strict TypeScript and 20 offline tests pass;
all 45 in-process model cases pass without external IO. Missing opt-in still
returns policy-blocked. See V2_RUNNER.md. Historical v1 acceptance below remains unchanged.

Migration note (2026-10-23): this directory now lives under
`tqx-ts/packages/mcp-server/integrations/codex`. Historical evidence below is
unchanged and has not been rerun after migration or the checkpoint's v2 WIP.
Run harness commands from `packages/mcp-server` after the Owner's root install
and SDK/package builds. Private files remain package-local under ignored
`work/codex`; no old runtime data or credentials were copied. The old project's
`.codex/config.toml` was excluded; examples remain opt-in and do not connect the
new workspace automatically. Root/global Codex configuration is unchanged.

Date: 2026-10-23 (Asia/Shanghai). Desktop package 26.1016.8622.0; installed
CLI/app-server 0.163.0-alpha.11.2. All tests use separate CODEX_HOME directories
under ignored work/codex. No global login/configuration was changed.

| Check                                                 | Result and precise surface                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Repository check                                      | Biome/typecheck/130 Vitest tests/build passed                                           |
| Integration strict TypeScript                         | Passed with integrations/codex/tsconfig.json                                            |
| Built Node health / PR metadata / unauthenticated 401 | Passed on isolated ephemeral loopback                                                   |
| Actual CLI PKCE DCR login                             | Passed, --no-browser, synthetic AS                                                      |
| Actual app-server DCR, provided public client         | Passed, synthetic AS                                                                    |
| CIMD automatic stable/specific document selection     | Passed as selection only; remote document verification untested                         |
| Dynamic port and stable/specific callback paths       | Captured from actual client, no fixed-port substitution                                 |
| Model-facing tools                                    | Exactly getAccount/listPositions; readOnly hints; calls pass                            |
| JSON data fidelity                                    | PAPER/as_of/is_stale/decimal strings/null preserved; no structuredContent               |
| AS/Trading errors and recovery                        | Passed with synthetic HTTP dependencies                                                 |
| Disconnect/reconnect                                  | In-flight exchange interrupted, client closed, new client resumes using own OAuth cache |
| Deny, wrong state, wrong/missing issuer               | Rejected, zero code exchanges in synthetic fixture                                      |
| Duplicate identical issuer                            | Accepted by installed alpha client, one code exchange; compatibility runner exits 1     |
| Portable local plugin                                 | Installs/discovers/calls with explicit scope override in isolated app-server            |
| Portable MCP auth extensions                          | Documented extensions field rejected by this local loader                               |
| Unscoped plugin login                                 | Requests all AS-advertised scopes; probe exits 1; use explicit config                   |
| Actual Owner apps + provided public client            | Deny/approve/callback/discovery/both calls pass, synthetic Web decision/fake broker     |
| Actual Owner apps + automatic DCR                     | Passed: default auto registration, deny/approve, PKCE, discovery and both tool calls    |
| Actual client refresh request capture                 | Five complete parameter names/types; synthetic refresh succeeds                         |
| Actual Owner AS refresh                               | Passed: actual client, forced own cache expiry, new sid/jti/refresh, same grant         |
| Old source / derived tokens after refresh             | Pre-refresh derived 200 control; both old tokens become 401                             |
| Own synthetic grant revocation                        | Guarded one-key mutation; health 200/current source 401/client tool-isError             |
| Desktop conversation, model tool selection, cards     | Not tested                                                                              |
| Java/browser consent/real user/account/broker         | Not tested                                                                              |

The strict negative-suite mismatch is preserved as a finding. Neither the
repository check nor a successful OAuth flow means every compatibility test
passed. No endpoint or client setting was loosened to hide that mismatch.

Public sanitized snapshots are in evidence/. Private OAuth credentials, refresh
tokens and logs are absent from that directory. Raw token values are never
printed. Source and derived bearer access are kept separate; the client package
never contains tqx_mcp_server's confidential service secret.

The resolved AS compatibility contract and remaining client limits are in STATUS.md.
The Owner's coordinated services stay on 26823/8100/3002 and are not owned or
stopped by these scripts. No database was seeded or broadly cleaned here.

Desktop steps and exact Computer Use skill restriction are documented in
README.md. That stage requires manual desktop evidence and is not replaced by
the app-server tests.
