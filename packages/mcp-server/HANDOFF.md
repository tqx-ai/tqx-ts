# MCP workspace package handoff

Current development directory: `tqx-ts/packages/mcp-server`, in the same Git repository
and feature branch as the SDK/CLI. This package remains `private: true`; SDK/CLI
publication commands do not publish it.

## Post-d6d604d source update: optional order filters and WRITE counterexamples

Root approved a compatible listOrders extension on the current provider active-order snapshot:
optional startDate/endDate/status/symbol alongside limit/cursor. MCP accepts the same date shape,
unrestricted string status and3..32-character symbol as the SDK contract and forwards through the
SDK. Trading owns HK submitted-date interpretation, normalized AND filters, stable filtered ordering,
cursor binding and ownership checks. This is Trading-service snapshot filtering, not a broker-history
query. Existing defaults, auth/scope/feature gates and no-filter behavior remain unchanged.

tests/trading-v2.test.ts now passed46/46 over guarded synthetic HTTP: original36 plus3 WRITE
counterexamples (lost commit followed by retry403/429 stays UNKNOWN, explicit signal snapshots do
not resubmit) and7 READ filter/input checks. tests/v2-fixture.ts adds only queued GET response data;
its Map/effect counter is synthetic. WRITE_ACCEPTANCE_HANDOFF.md records reusable entries and real
durable idempotency/shared-quota/lifecycle gaps. This is not a real quota or broker acceptance pass.
READ offline56/56, strict source/Codex types, scoped lint/format and diff checks passed. A separate
ignored tsdown build at work/verify-order-filters-20261025T070428154Z passed the clean Node baseline
health/metadata200, no bearer401, Origin403 and exit0, with tools disabled/no external AS or Trading.

No3004/8102 restart, READY update, old write/fixture mutation, auth/grant change, external production
request, Git stage/commit/push or integration-owner file edit occurred. Default live dist hash stayed
unchanged. The earlier114-case live B result below remains historical and does not prove this new
filter extension deployed. Its obsolete unsupported-symbol descriptor was replaced by a capability-
dependent positive plan entry; old private manifests block that new case rather than claim coverage.
Root retains final cross-package orchestration/commit/push ownership.

## Final READ B and compatible environment handoff (2026-10-25)

This final status supersedes preparation/freeze paragraphs below. READ B latest unique outcomes are
113 passed and1 provider capability unsupported out of114. Original matrix107/4/2/1 is retained;
only its six affected cases were repaired/retested and all six passed. Extra baseline preflight1 is
separate. Total actual MCP tool POSTs116 and Trading READ attempts89; all observed business-digest
changes, Trading write/effect deltas were0, with settled audits and closed clients. Actual transport
cancel/reconnect/parallel and six auth negatives passed. Root's desktop A31 calls remain independent.
See READ_ACCEPTANCE_RESULTS.md for precise evidence, controlled JWT labels and provider limits.

Root outputs contain mcp-read-b-20261025.json/.md. Temporary B auth resources were then retired
under a separate precise Root authorization: four new grants and their principal/client/session/JTI
receipts were completely checked against the explicit isolated Redis profile before any mutation;
the existing AS internal revokeGrant service function retired the three active grants, skipping the
already revoked one. All four were reread as revoked with other grant fields/expiry unchanged.
This is existing internal service cleanup, not public HTTP revocation acceptance. No ad-hoc HSET,
new endpoint, personal grant/cache change, data/audit deletion or Trading call was used. Public
cleanup evidence: mcp-read-b-grant-retirement-20261025.json in Root outputs. Bun exited0 after
success and emitted a nonfatal cross-repository tsconfig directory-mismatch diagnostic; the complete
private after-records and public result were retained rather than omitting the diagnostic.

Subsequent environment selection is deliberately compatible: process env > optional selected
.env.test/.env.prod > original .env.local > unchanged loadConfig defaults. Missing/unknown values
retain local behavior, dev/development remain local, pro/production select prod. Optional templates
contain no secret or invented production hostname. Startup shows the effective environment and
public URLs. No new nonlocal required fields, mandatory HTTPS beyond existing rules, absolute-key
paths, namespace/marker policies or rejection of legacy selectors was introduced. Existing config.ts
URL/Host/Origin/TLS-pair/feature-secret safety checks and all auth/scope rules remain unchanged.
Selecting prod alone does not change endpoints or enable tools; user authentication profiles stay put.

Verification:190 guarded engineering tests/8 files and56 READ offline checks/2 files passed; both
strict source/Codex typechecks, scoped Oxfmt/Oxlint and diff checks passed. A separate ignored
tsdown build under work/verify-profiles-20261025T063139217Z passed three built Node smoke runs for
local/test/prod. Actual selected files overrode a different local issuer, process settings retained
precedence, and each run verified health/metadata200, unauthenticated401, bad Origin403 and exit0.
All were tool-disabled temporary loopback processes with no external AS/Trading/production access.
The live MCP3004 dist SHA256 stayed unchanged; no shared service/profile was restarted or replaced
by this line. Full root install/build/test orchestration and eventual commit/push remain Root-owned;
this line did not stage, commit or push. Missing real-provider cash ledger support remains visible.

## Historical READ B preparation (2026-10-25)

This status supersedes the historical A/AOF freeze paragraphs below. Root reported desktop A complete
with31 actual tool calls, unchanged A-after business digests and zero added protected Trading writes
or effects, then explicitly released B. Actual B READ execution still waits for Trading fixtures,
manifest and Root-coordinated8102 readiness. This MCP line has made zero B Trading calls so far.

The114-case plan, official SDK driver, schema1 manifest/rule evaluator, append-only file RPC and
opt-in CLI are implemented in tests/read-only-*.ts; see READ_ACCEPTANCE_PLAN.md for exact boundaries.
Cancel/reconnect/parallel-two require measured transport actions and a settled controller audit.
Manifest booleans cannot prove payload semantics. binding.uid is preserved through schema parse and
the serialized RPC request; its regression verifies the actual wire shape against Python's five-field
binding. The read classifier now shares all34 public production tool-error codes with src/trading.ts,
including trading_service_unavailable, rather than a partial copied list.

54 offline checks passed (44 runner/classifier plus10 official-SDK-class/synthetic-fetch/contract tests),
strict source TypeScript, scoped Oxfmt/Oxlint and diff checks passed. They are not live protocol or
desktop evidence. No shared bundle build/restart, SDK/CLI/root/lockfile edit or Git stage/commit occurred.

Root additionally authorized and this line completed normal DCR/PKCE/consent/token for four new
primary740001-only B grants using the existing synthetic Java WebJWT fixture. One normal refresh
produced the positive read source and its old-M negative; a different new grant was precisely revoked
using Root's existing control. No740002/plugin cache/Web-session changes or Trading calls occurred.
Tokens are private. The metadata receipt sources-bound.receipt.json and public-plan.json are in
Root's ignored private/read-b-236c22cc-495d-4c1f-9882-f50017bdcd4d directory and were handed directly
to Trading. The final sources-with-faults.json retains the actual refreshed positive source and
adds four separately Root-authorized controlled JWT faults (single exp/aud/scope change or corrupt
signature). The test profile key and current JWKS kid/n/e were checked; key is read-only, no shared
auth state changes, no JWT/key printed. These faults are explicitly not normal AS issuance. Earlier
receipt/source versions remain history. backend-manifest was explicitly bridged into client-manifest-v1,
with actual schema.parse/supportsCase114/114 and zero protocol/controller IO. Canonical BSON numeric
wrapper incompatibility was resolved without approximating decimal/ID strings. An initial premature
success message was corrected before any runtime action; it is not passed execution evidence.

Root requires one getAccount.baseline preflight after8102 ready before the full matrix. That extra
actual call is counted separately from unique case outcomes. The runner saves per-case private raw
observations/audits; public output omits payload/IDs/cursors/digests and includes measured transport
counts. Capability-gap errors with extra debug/content now fail the same public-error shape check.

Remaining: Trading seeds only the selected primary history, publishes backend-manifest.json and
proves its ASGI READ gate/counters; Root reloads8102 and announces ready; MCP then executes bounded
READ-only protocol cases and records passed/failed/blocked/unsupported separately. Real cash ledger
remains501 unsupported; the declared isolated history ledger cannot establish provider capability.

## MCP3004 process-loss recovery (2026-10-25)

The initial owned PID32228 and PTY exec52043 were found absent before desktop READ phase A.
The exec API returned Unknown process id and no exit code or stack was available. Root cause is
unknown; this is a service-lifecycle/observability gap, not evidence of an authentication failure.

The original launcher/profile/key/port were restored without build or grant changes. The bundle
mtime remains 2026-10-25T02:36:28.547Z; SHA256 is
df27aa2d584d623a5e0d9274a966e5d17f537f78601bb2463e49c763cbd7310e.
Current owned Node PID54420 started 2026-10-25T13:39:50.9885799+08:00 as hidden background,
independent of a retained PTY session. Parent startup command exited and listener ownership was
then confirmed on 127.0.0.1:3004. No OS service or scheduled startup was installed.

Health200, exact metadata200 and no-token401 were checked; no authenticated tool/SDK/client request,
new authorization or grant mutation was performed by this recovery. Owner D01 must prove saved
desktop authorization/session use after the process loss; these liveness checks do not establish it.
Ignored original run-directory recovery-state.json records PID/start time/bundle hash and private
stdout/stderr log paths. Logs stay local; no secret value is published. Retired PID/session references
below describe historical startup only and must not be used for current shutdown. There is no current
PTY stdin control channel. Any stop must be Owner-coordinated after quiescing clients and rechecking
listener PID, Node executable and start time; do not kill AS/Trading or unrelated processes.

The recovery itself made no shared controller, fault, grant or trading-tool changes. Later READ B
authorization and preparation are described above; they do not alter the frozen recovery bundle.

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

## Local/test execution resumed (2026-10-25)

The user reauthorized necessary isolated local/test service, auth and persistence fixture writes.
Use fresh test endpoints/credentials/namespace; do not trust earlier READY or load .env.prod.
Production, real funds/brokers, deployment, destructive cleanup and unrelated fixture overwrite
remain forbidden. Default master/write gates remain false; test enablement is explicit.
The memory-only entry below remains strict when selected, with its historical evidence unchanged.
The initial baseline passed 182 tests/8 files. The source-expiry boundary fix now passes 185/8
(all 169 tool/protocol tests plus 16 guard/config), package/Codex strict no-emit types, Oxlint,
whole-package Oxfmt and tsdown. New
`tests/isolated-built.smoke.mjs` passed health/metadata 200, missing bearer 401, invalid Origin 403
and orderly shutdown exit 0, with both tool flags false. It creates a fresh empty ignored cwd and
whitelists child env, so the built entry cannot load this checkout's old .env.local. It contacts no
external AS/Trading or broker and removes only its own empty test directory.
Package Oxfmt initially reported concurrent Codex WIP; that owner finished its files and the full
package format check now passes, with no cross-directory formatting by this line.
The minimal runtime fix is in src/auth.ts ensureFresh catch: after preserving disconnected-client
handling, recheck source expiry before classifying a failed exchange. A source that expires during
AS/JWKS waits now receives refreshable 401; still-valid M with expired/malformed T remains 502.
The new HTTP test reproduced the previous 502 before the fix, then passed; two valid-source control
cases preserve 502. All fail before Trading dispatch. No expired token is accepted, no JWT verification
is weakened, and no SDK/tool registration/scope behavior changes. tests/trading.test.ts contains
three additional cases; the focused red/green run is separate from the final unfiltered 185-test pass.

Fresh test MCP3004 was started on 2026-10-25 after independently verifying AS metadata/JWKS 200
(public JWK only), Trading health ready=true with generation owner-20261025-7648d1b4 and namespace
tqx_v2_20261025_7648d1b4, a free 3004 port and the updated build. Held process: Node PID 32228,
exec session 52043; listener confirmed 127.0.0.1:3004 owned by that PID. These are run-specific
process references, not portable configuration or a durable readiness marker.

Startup uses a newly created ignored package work directory, explicit contract endpoints and a
minimal environment; the private Basic secret is read from this run's Owner file into memory only.
No old .env/.env.prod or READY is loaded. Both tool flags are explicitly true for this isolated test
instance; source defaults remain false. Health 200/process-only, protected-resource metadata 200
(exact resource3004/mcp, issuer26825, scopes trade:read and order:write) and unauthenticated MCP401
with metadata challenge passed. No authenticated tool/client call was made by this startup check.

The MCP owner holds the process running for the primary Owner's independent official SDK preflight
and schema2 READY signing. For graceful shutdown ask this line to send shutdown plus newline to
its exec session; the launcher emits the registered SIGTERM drain and closes stdin. If an external
coordinator cannot access this chat's session, request shutdown through this chat. Forced stop is
only a fallback after verifying the current listener/process is still the owned PID; never touch
AS/Trading or unrelated processes. Actual persisted joint/client acceptance remains separate.
No existing shared listener was restarted and no Git mutation was performed.

## Historical/optional memory-only validation lane (2026-10-23)

Follow [MEMORY_ONLY.md](MEMORY_ONLY.md) for the exact safe entry, 166-test audit, guards and
application/exchange configuration injection. Today's boundary excludes all actual database/
middleware/credential mutation, login/refresh/revoke and subprocess/runtime smoke. Earlier full
package/check/smoke evidence below is historical and is not a command to repeat those operations.
The new entry keeps all seven original test files, adds guard/config tests and uses only process
memory keys/objects/Map with owned temporary loopback HTTP. No skipped tests stand in for coverage.
The dedicated entry passed 182 tests/8 files (original 166 + 16 guard/config cases), scoped format/lint,
strict no-emit types and diff checks. No runtime smoke/build or actual middleware/client was run in
this lane. Exported setup/guards were shared with Owner's separate SDK-only memory configuration.

## Current v2 implementation (2026-10-23)

Current contract and exact acceptance matrix: [V2_CONTRACT.md](V2_CONTRACT.md).
The package now implements seven read tools plus four gated write tools, per-tool scope isolation,
SDK whole-batch validation and sequential accepted/failed/unknown/not_submitted results.
Both gates remain default-off. No SDK/CLI, root config/lockfile, old repository or Codex harness files
were changed by this implementation. No Git staging, commit, push or service operation was performed.
Actual v2 backend/client readiness remains with the Owner; existing ports 26823/3002/8100 were untouched.
Current package check passed: Oxfmt/Oxlint, both strict type configurations, 166 tests (130 original +
36 v2) and build. Built Node smoke passed on temporary loopback (health/metadata 200, no bearer 401,
SIGTERM-handler exit 0). Remaining work is real isolated v2 HTTP/client integration, durable backend
replay/revocation/ownership/quota checks and separate consent/UI/account/deployment acceptance.
Changed runtime files: src/protocol.ts and src/trading.ts. Tests: trading-fixture.ts, trading.test.ts,
new trading-v2.test.ts and v2-fixture.ts. Package documentation records the new contract and checks.

## Migration checkpoint (2026-10-23)

- Imported the reviewed public MCP source and Codex integration harness from checkpoint
  `8a16a14eee5cbd1146033ae973c4dd1e99d0f4d1`. Only committed public files were used;
  runtime credentials, fixtures, caches, generated output and tarballs were excluded.
- The package has 60 files. The automatic project connection, standalone lockfile and Biome
  configuration were excluded. Dependencies use the root Bun lockfile and `@tqx-ai/sdk=workspace:*`.
- Type checking and Vitest resolve SDK source, with type declarations and test values for its
  build constants. Runtime builds consume the workspace SDK. Package checks use distinct
  `typecheck:mcp` and `test:mcp` names to avoid root script recursion.
- Root Oxfmt/Oxlint cover the package. Scoped lint exceptions preserve ordered stream reads,
  polling, fixture steps, Express 5 async handlers and existing helper/identifier conventions.
- All eight historical client evidence JSON documents retain the same values; formatting changed.
  Client connection files are examples and are not automatically enabled.
- Migration verification passed: frozen-lockfile install, root `bun run test` (format/lint,
  SDK/CLI and MCP/Codex strict types, 245 SDK/CLI plus 130 MCP tests, all three package builds,
  seven SDK/CLI runtime checks and built Node MCP smoke), plus `bun run pack:check`.
- MCP smoke uses a free loopback port, or `MCP_SMOKE_PORT`, and explicitly disables both
  Trading tool flags. It checks health, metadata, unauthenticated 401 and clean shutdown.
- At migration time, v2 scope groundwork and client harness scaffolding were retained but the
  tools/batch were unfinished. Current implementation is described above; migration's 130 tests
  did not establish v2 capability. Actual Java/Web consent, desktop UI,
  real accounts/brokers, Linux/TLS and deployment were not verified by this migration.

## 历史交接记录（原独立仓 v1；下文不是迁入后的当前状态）

# 独立 MCP 服务交接：骨架、审查与只读接入

2026-10-23（Asia/Shanghai）。供主 Owner 直接读取。主聊天已核实用户“各项目直接协同推进”的最新授权；
本聊天按其后续实施任务接入只读能力，不再停留于未收敛的草案。决策见同目录 INTEGRATION_CONTRACT_DRAFT.md v0.2。

## 当前交付

- 独立仓库/dev，默认 MCP_TRADING_TOOLS_ENABLED=false：保留已验收空工具面与离线 JWT 骨架。
- 开启时：M token 必须有 agent_id/grant_id；每个受保护 HTTP 请求在 body/exp 校验后向 OAuth 换票，
  包含 initialize/listTools、notifications 和 SDK GET probe。在线失败不构造协议 server。
- Basic 预置 tqx_mcp_server；M->API audience，T 完整验签并核对身份/来源/actor/期限。每请求只换一次，
  HTTP batch 内复用，无跨请求缓存。无 introspection，无 Redis/Mongo，无 account_id/parent_jti 要求。
- 仅 getAccount/listPositions 两个 readOnly 工具，通过本地冻结 @tqx-ai/sdk Bearer transport 调用。
  金额/数量字符串、null、mode、as_of/is_stale和分页保持SDK语义；无模型指定uid/Agent替换身份。
- M 只发配置 issuer 的 /oauth/token，绝不发 Trading；无 auth.verify、写工具、UI、API-key兜底。
- 130项测试（6文件）、格式/类型/build通过，原81项保留；工具与AS/Trading测试均为synthetic。
  真实OAuth同意、账户、券商、共享状态联调和部署尚未验收，不声称真实账号已通。

## 仓库与依赖

仓库：C:/Users/13518/Documents/Codex/2026-10-23/https-www-biji-com-note-share-3/work/repos/mcp-server。
没有首次提交，文件仍全部未跟踪/未暂存；仅git diff会遗漏，需结合git status和直接源码审阅。
没有remote，没有commit/push/deploy。其他仓库只读；未创建tqx-ts workspace。

SDK冻结包为邻仓 .cache/sdk-local/tqx-ai-sdk-0.5.4-bearer-c6fd4faf3c79.tgz，已核对SHA256：
c6fd4faf3c7992e40d622a25d1408426a7bba4dd886a3a03c4ec2fb9126337ba。
package.json/bun.lock是本机绝对tarball依赖；不等同npm同版本，不可宣称另一台机器/K8s可直接构建。
迁移必须传同包并验hash，或由SDK项目重建新指纹后显式更新本仓依赖；完整命令见README。

## 精确运行时配置

| 变量                       | 默认 / 开启要求                                                            |
| -------------------------- | -------------------------------------------------------------------------- |
| MCP_HOST / MCP_PORT        | 127.0.0.1 / 3002                                                           |
| MCP_RESOURCE               | http://127.0.0.1:3002/mcp                                                  |
| MCP_OAUTH_ISSUER           | http://127.0.0.1:26823                                                     |
| MCP_JWKS_URL               | issuer/.well-known/jwks.json，固定配置，不信token URL                      |
| MCP_TRADING_TOOLS_ENABLED  | false；true时缺secret启动失败                                              |
| MCP_API_RESOURCE           | http://127.0.0.1:8100/api                                                  |
| MCP_TRADING_BASE_URL       | http://127.0.0.1:8100，与audience分开                                      |
| MCP_EXCHANGE_CLIENT_SECRET | 私有注入，与AS OAUTH_MCP_EXCHANGE_CLIENT_SECRET一致；不写进公开配置/二进制 |
| MCP_EXCHANGE_TIMEOUT_MS    | 5000，完整换票及T验签预算                                                  |
| MCP_TRADING_TIMEOUT_MS     | 10000，SDK工具操作预算                                                     |

Host/Origin、TLS/JWKS/HTTP/关闭超时等原有变量见.env.example和README。
非loopback要求HTTPS；Web origin不自动放行MCP Origin。/healthz仅探活，不证明AS、Redis、MySQL或Trading就绪。

## 共同状态与撤销边界

主Owner v1已新增oauth:grant:{grant_id}。refresh新建sid但继承grant_id；显式外部授权撤销grant，
覆盖新旧sid。Web logout只撤销Web session，不隐式级联OAuth grant。此项已收敛，不再列为MCP待选方案。
AS换票在线查源session/jti/grant；Trading每请求查session/grant、派生jti与session.jti源marker，
再查MySQL权威Agent->账户/券商绑定。MCP只核已签身份与AS换票结果，不加共享存储客户端。

T.client_id=tqx_mcp_server，source_client_id=原client，act.sub=tqx_mcp_server；sid/grant/Agent/sub继承M，
jti新生成，API aud单一，scope显式trade:read，TTL<=300且受源票期限；更短session/grant窗由AS执行。
MCP核exp-iat与expires_in一致、iat新鲜；已只读核对当前AS返回exp-now与签发iat一致。
已过最终授权检查的在途读取可能完成，不宣称撤销回滚；写操作另定最终提交/幂等。

## 错误与清理

协议前AS invalid_grant -> 401+metadata challenge，invalid_scope ->403；服务凭证、target配置、AS限流/
不可用 ->503；畸形响应或T身份/签名不符 ->502。tool callback内Trading失败返回脱敏isError，不晚改HTTP。
SDK只读请求可能重试，仍受超时、取消和每次发送前票过期检查。AS/Trading都禁重定向，响应体分别64KiB/1MiB。
TQX_BASE_URL若把SDK目的地改到别的origin，本仓transport在发Bearer前拒绝。原票/secret/内部异常不输出。

本轮之前的三项审查修复保持：解析请求体后复查exp；关闭时取消待完成JWKS，单客户端取消不破坏共享取钥；
启动时拒绝通配符URL主机。LF/CRLF scope原本拒绝，没有把未复现问题算修复。新的AS/Trading等待也纳入取消/关闭。

## 验证证据

Windows Node v24.13.0 / Bun1.4.2。最低Node22.18未另跑矩阵。

- bun run check：130项（6文件）+Biome+typecheck+build通过，旧81覆盖保留。
- 新增synthetic：官方Client initialize/list/call、同HTTP复用/跨请求隔离、参数/数据保真、Grant拒绝前置、
  坏签名/issuer/aud/sub/sid/grant/Agent/actor/source_client/exp/scope/expires_in、错误JSON/content-type、
  AS/Trading重定向、AS/Trading超时/取消、过期上传、服务关闭、SDK全局URL干扰及脱敏错误。
- bun run smoke：构建Node入口、本地health200/metadata200/无票MCP401、SIGTERM事件exit0；明确强制关工具门。
- 之前Bun dev实际200/200/401、Ctrl-C命中关闭；命令运行器exit1，未包装成0。
- 本轮frozen-lockfile安装、逐文件whitespace及无剩余3002监听器已核对通过；端口留给Owner联调。

所有票/密钥/存储/账户/券商数据均为synthetic或fake，没有真实登录或交易。Linux OS信号、TLS/ingress未部署验证。

## 接手与剩余跨项目事项

1. Owner按真实AS/Trading本地环境联调；本仓不因peer隔离测试通过就声称端到端。
2. OAuth：Basic配置、Web身份/Agent同意、grant/refresh/撤销/源jti/派生jti的权威状态、原子并发与120/min限流。
3. Trading：默认门、API audience、session/grant/两类jti、MySQL owner/绑定、只开放account/positions、API-key回归与Agent共享配额。
4. Web/Java：登录/同意与实际失效入口、用户可操作的外部授权撤销入口另验收；Web logout不隐式杀grant。
5. SDK：本机tarball交付可消费；跨机器正式依赖/发布策略及最低runtime矩阵后续明确。
6. 本聊天无写工具/生产账户/提交/远端/部署授权；不要把只读测试解释成未来下单授权。

建议读序：本文 -> INTEGRATION_CONTRACT_DRAFT -> README/ACCEPTANCE/AGENTS -> src/auth/exchange/trading/protocol/app/runtime/config -> tests/trading.test.ts。
在本仓运行 bun install --frozen-lockfile、bun run check、bun run smoke；Bun不在PATH可用C:/Users/13518/.bun/bin/bun.exe。

## Owner 报告的隔离联合 HTTP 验收（本聊天未重跑）

2026-10-23，主 Owner 在工作消息中报告：实际 dist/index.mjs + 官方 MCP Client 经过实际 OAuth
exchange 和 Trading HTTP，initialize/listTools/getAccount/listPositions 全部通过。refresh 后旧 MCP/API
票 401，新 sid 同 grant 继续正常；删除派生 jti 后 Trading 401，删除源 jti 后 MCP/Trading 401，
grant.status=revoked 后两者 401。使用真实隔离 Redis/Mongo、SQLite 权威归属 fixture、显式 fake broker。
无真实 Java 登录、浏览器同意、真实账户或券商验收。本聊天记录该报告，不把它算作自己重新执行的测试。
Owner 的 check-mcp.mjs 已在 finally SIGTERM 清理 MCP；本聊天遵照要求不再重跑或占用 3002。
