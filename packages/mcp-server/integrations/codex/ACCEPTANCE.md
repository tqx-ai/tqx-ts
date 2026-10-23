# Codex client acceptance record

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
