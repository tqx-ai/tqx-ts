# MCP workspace package handoff

Current development directory: `tqx-ts/packages/mcp-server`, in the same Git repository
and feature branch as the SDK/CLI. This package remains `private: true`; SDK/CLI
publication commands do not publish it.

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
- Existing v2 scope groundwork and client harness scaffolding are retained. Seven read tools,
  four write tools, batch operations and full v2 acceptance remain unfinished. The passing
  existing tests do not establish those capabilities. Actual Java/Web consent, desktop UI,
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
