# MCP / OAuth / Trading 最小对接契约 v0.2

迁址说明：本文件保留历史 v1 决策；当前目录为 `tqx-ts/packages/mcp-server`，
SDK 使用 `workspace:*`。指定 checkpoint 含未验证 v2 WIP；本次仅迁入，未重验或扩展该契约。

2026-10-23（Asia/Shanghai）。由主 Owner 的
外部《交易MCP跨服务契约-v1.md》（Owner 文档，未迁入本包）
收敛。本文替代本地 v0.1 草案的冲突建议；不是一套并行协议。
本轮仅修改独立 MCP 仓库，主 Owner 后续已授权本仓实际接入；无其他仓库修改、提交、推送、部署或真实交易。

## 决策：采纳与后置

| 主题       | Owner 已收敛的本批选择                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Agent      | AS 批准时读 Agent Redis owner，Trading 每请求查 MySQL；JWT 有 agent_id，不要求 account_id        |
| 授权链     | 首次 code/Device 创建 grant_id；refresh 换 sid 但继承 grant_id；M 与 T 都带 grant_id             |
| 撤销       | session、source jti、derived jti、grant 都检查；显式外部授权撤销针对 grant，覆盖刷新后的后继 sid |
| Web logout | 只撤销 Web session，不隐式级联既有 OAuth grant；影响后续同意，不宣称已有授权自动撤销             |
| 在线门     | 工具开启时每个受保护 HTTP 请求都 exchange，包括 initialize/listTools；不新增 introspection       |
| audience   | API resource=http://127.0.0.1:8100/api，Trading URL=http://127.0.0.1:8100，分别配置              |
| 服务身份   | 预置 tqx_mcp_server + client_secret_basic；私有运行时 secret，仅团队本地开发联调                 |
| TTL / 字段 | 最长300秒并受subject/session/grant期限限制；source_client_id/act，不增加parent_jti               |
| 缓存与范围 | 同 HTTP 请求复用 T，不跨请求缓存；默认关闭，启用只 getAccount/listPositions                      |

已撤回的本地初稿：新增 introspection、独立 Trading audience、client_secret_post、60 秒票、
account_id/parent_jti/origin_client_id claim。完整用户安装包的服务凭证发放、private_key_jwt、
写工具、固定账户同意语义、生产打包/TLS/部署后置；不把本机私有 secret 打进公开二进制。

## 最小身份与状态契约

M 必需 sub/client_id/sid/jti/scope/agent_id/grant_id/exp，固定 issuer/RS256/JWKS、完整单一 MCP aud。
字符串 ID 不转近似 Number。uid 来源须为 Java Web access JWT + web session，不能用 refresh、
无 sid 旧票或旧 token-hash 索引批准 OAuth。批准交易 scope 时 Agent 必填；Redis owner 缺失/冲突或
不属当前 uid 均不批准，不创建/激活 Agent。绑定进入 tx/code/session，code/Device/refresh/exchange 继承。

| AS 状态（均加配置prefix） | 关键约束                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| oauth:session:{sid}       | 既有uid/jti/client_id/resource/scope/status/expires_at/refresh_token_hash，新增agent_id/grant_id |
| oauth:grant:{grant_id}    | uid/client_id/resource/scope/agent_id/status/expires_at；保留原授权边界及绝对期限                |
| oauth:jti:{source_jti}    | 源token active marker；exchange与Trading都查                                                     |
| oauth:jti:{derived_jti}   | 新T active marker；TTL不超T剩余有效期，Trading每请求查                                           |

OAuth 写共享状态，Trading 读；MCP 不加 Redis/Mongo。expires_at 为 epoch 秒十进制字符串，TTL 不代替时间/状态校验。
AS 换票须比对源 M 与 session/grant 的用户、原客户端、Agent、resource、scope、grant及源 jti；
交易票 scope 不超三者。Trading 查 active session/grant、源及派生 jti，再查 MySQL `(agent_id,user_id)`
并补账户/券商绑定和业务状态。缺记录、状态冲突或存储故障 fail closed。

注意 session.jti 是源 M.jti，不能要求等于新 T.jti；session.client_id 是原客户端，要比对 T.source_client_id，
不能机械等于 T.client_id=tqx_mcp_server。Trading 也核对源 session resource=MCP resource及grant关联。
单独撤销源 jti 同样使已有 T 失效，无需 parent_jti，因为 Trading 直接查 session.jti 的 active marker。
refresh 原子旋转 sid/jti且撤销旧值，不撤销 grant；撤销 grant 覆盖旧/新 sid。外部管理撤销入口是否已发布由AS实际实现说明，
不能凭内部函数宣称用户已能在页面撤销。并发刷新/撤销/换票须CAS或原子保证，无半成品有效票。
已通过最终检查的在途读取可能完成，不承诺回滚；写操作的最终提交校验/幂等另定。

## 换票：现有 POST /oauth/token 的新 grant

标准形态参考 [RFC8693](https://www.rfc-editor.org/rfc/rfc8693.html#section-2)；业务状态/撤销不是RFC自动提供。
Basic 头由私有 tqx_mcp_server id/secret 按标准编码；只发到配置issuer的/oauth/token，禁重定向。
Form字段为 grant_type=token-exchange URN、subject_token_type=access_token URN、subject_token=M、
resource=精确API resource、scope=trade:read、requested_token_type=access_token URN。
AS允许省略/缩小scope，但MCP首批总显式trade:read。不支持actor_token、audience、多resource、
身份覆盖字段、重复/混合客户端认证；DCR/CIMD不能冒名获得受控grant。源M不当成AS服务认证Bearer。

T 为RS256，保持sub/sid/grant_id/agent_id；aud=API resource，client_id=tqx_mcp_server，
source_client_id=原client，act={sub:tqx_mcp_server}，新jti，整数iat/exp，scope为获批子集。
TTL=min300秒及subject/session/grant剩余时间；无有效窗口不签发，无refresh_token。
响应为access_token、issued_token_type=access_token URN、token_type=Bearer、实际expires_in、scope。
OAuth共享原子source sid限流120/min。重复换票不自动消耗M，但每次有新jti并受撤销/限流约束。

MCP本地验证M及body解析后exp，开启时再换票，验证T签名/issuer/API单一aud/sub/sid/grant_id/agent_id/
client_id/source_client_id/act/iat/exp/scope及expires_in一致。MCP可验证不超source期限，session/grant期限由AS/Trading校验。
API票仅存当前HTTP请求，不回传客户端、不持久化。M只进OAuth，不进Trading，无API-key兜底。
此边界符合[MCP不透传原票的要求](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices#token-passthrough)。

## 各仓改动与验收

| 系统    | 本批改动                                                                                                 | 通过条件                                                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP     | 默认关闭工具门；Agent/grant必需；每受保护请求换票；核T；SDK账户/持仓；脱敏错误与取消                     | 无配置启用失败；关闭仍空工具；撤销在initialize/listTools前拒绝；M不进Trading；同请求复用/跨请求不串票；Client initialize/list/call；原81回归保持 |
| OAuth   | Web access+Redis；批准Agent；grant链；Basic服务ACL；exchange/schema/metadata；原子撤销/刷新/限流         | 缺/错owner、改Agent/扩scope、错误或混合认证拒绝；grant跨refresh撤销与source jti撤销闭环；TTL正确；故障不签有效票                                 |
| Trading | 默认关闭Bearer门；严格T；session/grant/两类jti；MySQL owner/绑定；逐路由只读scope；API-key兼容与共享配额 | 仅account/positions；M和错aud/撤销T拒绝；verify/orders不开放；API-key不回退/不退化；同Agent原子配额不双计；存储故障拒绝                          |

Trading principal显式区分api_key/bearer，api_key_id=None而非0/-1；不信任客户端uid或X-TQX-*覆盖身份。
Agent额度沿Owner v1：同属有效Key最小正有限额度，有Key但无限沿原语义，无Key默认60/min。
账户由Trading动态解析；不把Agent授权说成固定account_id claim，也不把PAPER/LIVE变更自动当写授权。

## 错误与资源生命周期

协议接管前：本地坏票/缺绑定、AS invalid_grant为401并带metadata challenge；invalid_scope为403；
服务凭证/target配置、AS限流或不可用为503；畸形或身份矛盾成功响应为502。
tool callback内Trading 401/403/429或协议/依赖错误返回脱敏isError工具结果，不在SDK接管后硬改HTTP。
不泄露AS错误文本、token、secret、完整body或内部异常，不把服务错误误报成用户未登录/空账户。
AS/Trading fetch禁重定向，有超时、响应体限制、客户端断开与服务关闭取消；SDK只读重试保持策略，
每次尝试仍受deadline和票过期限制。一客户端取消不影响另一身份。/healthz仍只探活进程。

## 当前交付和剩余验收

MCP代码已按以上门实现；130项测试（含原81）、类型/格式/build通过。新增AS/Trading场景全部为synthetic，
证明参数、票据边界、SDK数据、取消和错误分支，**不是实际跨服务联通**。
真实OAuth/Web同意、活的Redis/MySQL/Agent绑定、grant撤销/并发、共享配额、真实测试账户/券商以及Linux/TLS部署由Owner联合验收。
AS/Trading负责人分别报告后端在开发/隔离回归中，不据此在MCP报告真实账号已通。

当前运行与 workspace SDK 安装说明见 README。原本地冻结包指纹仅作历史证据保留于 HANDOFF/ACCEPTANCE；不再是安装依赖。
不需要再次确认已收敛的grant_id或在线范围；若后续契约变更，先由主Owner统一更新，不并行发明接口。

当前包目录：`tqx-ts/packages/mcp-server`；原独立仓和 checkpoint 原样保留。
未提交、推送、部署或操作真实交易；未修改其他仓库。

## Owner 报告的隔离联合 HTTP 验收（本聊天未重跑）

2026-10-23，主 Owner 在工作消息中报告：实际 dist/index.mjs + 官方 MCP Client 经过实际 OAuth
exchange 和 Trading HTTP，initialize/listTools/getAccount/listPositions 全部通过。refresh 后旧 MCP/API
票 401，新 sid 同 grant 继续正常；删除派生 jti 后 Trading 401，删除源 jti 后 MCP/Trading 401，
grant.status=revoked 后两者 401。使用真实隔离 Redis/Mongo、SQLite 权威归属 fixture、显式 fake broker。
无真实 Java 登录、浏览器同意、真实账户或券商验收。本聊天记录该报告，不把它算作自己重新执行的测试。
Owner 的 check-mcp.mjs 已在 finally SIGTERM 清理 MCP；本聊天遵照要求不再重跑或占用 3002。
