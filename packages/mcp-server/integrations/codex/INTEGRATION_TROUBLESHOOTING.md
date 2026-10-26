# 工具缺失：保留原授权的诊断指引

本文是独立排查指引，不改变安装器、默认配置、插件manifest或服务端行为。工具为零
不是授权失效的充分证据；先读取初始化错误，再处理对应依赖，不先logout、重装或重做OAuth。

## 已确认原因与本机修复结果（2026-10-26）

本次确认两个独立原因：AS26825停机阻断OAuth metadata发现；旧项目配置以3002覆盖
正确的3004连接并保留过时两工具白名单。Owner恢复原AS并窄修项目配置后，同项目两个
独立fresh desktop会话、用户手工fresh及其fork、公开projectless fresh均已实际READ
成功，保留原授权、无新OAuth、写调用为零。本机重开验证已通过；这不保证其它客户端、
外部部署或依赖故障时也可用。

- 原插件`tqx-trading-local@tqx-local`已安装且enabled，server为`tqx`，原URL仍为
  `http://127.0.0.1:3004/mcp`；此前在`tqx-ts`工作目录的公开CLI检查未发现工具过滤。
  这不能推广为其它项目的effective配置也相同。
- native初始化明确报错：使用stored credentials前，连接
  `http://127.0.0.1:26825/.well-known/oauth-authorization-server`失败。
  Owner确认AS26825无监听、原进程已退出。这是本次初始化失败的直接原因。
- MCP health正常、Trading正常、`codex mcp list`显示`o_auth`，仍未阻止上述失败。
- Owner按原profile/key/namespace恢复AS后，用原config、原CODEX_HOME运行的一个
  全新native session已实际调用getAccount成功，返回PAPER账户数据；未重新登录。
  Owner核对原grant记录、key/config指纹和Codex配置指纹保持相同，支持原授权得以保留。
- Owner随后用同名、同URL的进程级direct配置且临时禁用插件，native实际READ通过；
  再仅持久新增`mcp_servers.tqx`的原URL和enabled=true、保留原插件后，另一个无override
  的全新native session实际READ成功。未迁移token、未重新OAuth，未改审批或等待窗口。
- 失败期间创建的desktop会话恢复后重试仍无TQX工具；恢复后新建desktop会话也为零。
  添加direct配置后的新desktop会话`01a175c5-4a3d-7362-aa18-4c0afdfa625d`仍为零。
  这些针对旧mcp-server项目的失败已发现同名3002项目覆盖，不能直接推广为
  所有公开create路径均失败；Owner已修复项目覆盖，同项目两个新会话均实际通过。
- native创建的会话`01a175c3-1ce7-7451-b1a8-65f01e5513e2`经公开desktop续聊，
  新产生`tqx.getAccount`成功调用，事件为`exec-d759f600-766a-402f-a983-39c1fe6f8009`。
  这是实际desktop续聊成功，不是借用CLI历史；仅证明这条会话续聊路径，不能替代app create
  新会话或第二次重开验证。用户的规范@只读消息位于运行中的Root主会话，目标desktop
  `01a175c5-4a3d-7362-aa18-4c0afdfa625d`最新记录尚无该用户消息；不能把Root的steering
  当成目标会话的插件选择验收，也不能由此断言用户未选。
- 第二个独立native saved chat`01a175c5-2408-7561-8f3e-1f2602d9ddf1`经公开续聊也
  新产生getAccount成功调用，事件为`exec-13b4e0c7-adc1-49b6-beab-bc2f3f251a2b`；
  该会话可见listOrders的limit/cursor/startDate/endDate/status/symbol六参数。两次
  native-origin续聊成功仍不能叫普通App fresh通过。
- 用户正常手工新建的projectless desktop会话`01a175c9-f995-7d12-bd7c-1ef6b0871826`，
  工作目录为`2026-10-26/new-chat`，已真实完成三READ：getAccount事件
  `exec-becb8f11-698f-433d-aca9-5d89df7e2dbb`、listOrders事件
  `exec-c4cfbe90-0ead-49a2-ae1a-eb1a49d83f9b`、listPositions事件
  `exec-7e3271a8-a5c2-4c98-a69c-83c69ab4c1b6`。保留原授权、无新OAuth，返回PAPER、
  空持仓和空订单；这证明本次正常手工new desktop成功。其manual fork
  `01a175cb-514e-71e2-aea8-3f7b0d59f834`也实际getAccount成功，事件为
  `exec-1171dfc1-bcc0-4696-880b-da69c7e3f953`，listOrders六optional齐全。
- 只读检查另发现旧`work/repos/mcp-server/.codex/config.toml`将同名`tqx`指向
  `http://127.0.0.1:3002/mcp`，并设置`enabled_tools=["getAccount","listPositions"]`。
  Owner已确认项目层覆盖全局同名3004。该文件仅含url/scopes/两工具allowlist和超时，
  没有bearer环境变量、静态/环境HTTP headers、headers helper或OAuth子配置；它是旧repo
  tracked文件，来源为旧checkpoint的项目测试接入，非被ignore的私有凭据文件。本线只读，
  修复由Owner处理；手工成功会话的projectless目录未发现project配置。
- 公开create的projectless会话`01a175cb-1967-77c1-9de2-565b93a4814f`已真实完成
  getAccount，事件为`exec-ce6914b5-9179-44c5-95b0-d152e8e9ce2e`，并可见listOrders
  六参数。公开API本身已有fresh成功证据，无需将此前项目特定失败归为整体host/API bug。
- Owner已窄修旧tracked项目配置：URL从3002改为3004，保留`scopes=["trade:read"]`与
  startup/tool timeout 20/30秒，将旧两READ allowlist补为getAccount、listPositions、
  listOrders、getOrder、listTrades、listCashFlows、getSignal七READ。未加入write工具、
  新scope或新OAuth，不能描述为grant权限或写功能自动拓宽。本线未编辑旧repo。
  Owner在旧cwd用公开`mcp get`确认effective URL3004及七READ；同项目fresh会话
  `01a175cd-1c4f-79b2-9d7c-1e2823434f0a`与`01a175cd-2246-7a12-a26a-0f174926dd5e`
  中，首个会话已实际getAccount成功，事件为`exec-1359c362-9306-4879-8f02-93a600d71b44`，
  七READ与listOrders六optional参数实际可见。第二个独立fresh也实际getAccount与
  listPositions各调用一次成功，七READ可见，turn为
  `01a175cd-247d-7b62-907e-a2cc22107b19`。这构成同项目两次fresh的实际调用证据，
  不是仅凭配置断言或借用旧会话结果。
- 昨日fresh/fork零工具不能追溯认定为同一原因，也尚不能认定为插件附件或startup grace问题。
- Owner最终snapshot确认七条原人类grant记录、六份原key/profile/contract文件与修复前
  完全相同；配置变化仅为新增全局同名`tqx`的3004直连条目，以及修正旧项目URL和
  七READ allowlist。没有迁移凭据或扩大grant；这些是本机明确配置变化，不要求所有用户照搬。

以上是Owner协调的本机恢复证据，不是共享HTTPS或外部干净客户端验收。

## 先区分配置、初始化、授权与实际调用

使用当前CLI支持的公开命令，插件/server名称取实际安装结果。必须在失败会话相同cwd
复核并记录项目trust/配置来源；trusted项目的`.codex/config.toml`可覆盖用户层配置，
另一个目录中的成功结果不能代替目标项目检查：

```text
codex plugin list --marketplace <ACTUAL_MARKETPLACE> --json
codex mcp get <ACTUAL_SERVER> --json
codex mcp list --json
```

installed/enabled和mcp get只证明配置可见。`o_auth`不证明当前metadata可达、refresh
成功、初始化成功或账户可读。MCP health只证明进程存活，不证明AS/JWKS/token端点正常。
记录所选surface、CLI版本、实际server/URL和脱敏错误；不要保存token、cookie、callback
或凭据文件。原始工具事件的server/tool/arguments/result才是实际调用证据。

| 实际现象                                  | 下一步                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| metadata连接失败、connection refused      | 由服务Owner恢复原issuer服务及网络可达性，保留原key/namespace和授权记录。                     |
| 初始化timeout                             | 检查实际服务连通性和初始化耗时，再评估等待窗口；不要只因超时重做OAuth。                      |
| metadata issuer/格式错误                  | 核对服务公布的issuer与原配置，按实际错误修复；不猜域名或迁移授权。                           |
| 明确OAuth refresh/grant/client错误        | 交认证Owner按脱敏错误与审计定位；`invalid_grant`等错误不能用空数据掩盖，不自动注销或新授权。 |
| native初始化成功且能READ，desktop仍零工具 | 独立检查desktop会话加载、插件选择和catalog；不把它描述为已证明丢授权。                       |
| schema存在但调用失败                      | 保留实际工具错误，区分MCP认证、在线token exchange与Trading响应。                             |

本服务在initialize/tools/list之前也执行JWT校验和在线AS token exchange；因此AS故障
可以导致整组工具缺失。HTTP 401/403、503及具体OAuth错误应按实际证据区分，不能仅凭
“工具为零”推断其中某一个。不要为诊断直接读取或复制OAuth/OpenAI credentialstore。

## 依赖恢复后的原票复测

1. 保留原CODEX_HOME、正常配置、插件/server名称、精确URL及正常keystore；已确认的
   项目覆盖错误按授权窄修并记录差异。不复制凭据、
   不清token、不logout/reinstall、不发新OAuth。由Owner核对恢复依赖与原授权关联保持。
2. 新建正常native session，保留默认model/配置，记录实际可见schema，再仅调用
   getAccount一次。无工具或错误要保留，不能用HTTP/SDK直调代替。
3. 再开第二个独立native session重复，记录不同session ID和实际工具事件。
4. 在desktop另建正常新会话验证同一server的schema和getAccount，再开另一个新会话
   重复。失败时已存在的会话再调用一次，不能代替重开验证。正常插件选择动作应如实记录；
   程序化create/fork或提示词链接成功不证明结构化插件附件已加载。
5. native与desktop分开判定；仅native通过不能写成desktop新会话已修复。按原始记录核对
   实际结果；字段齐全或命令exit0本身都不能代替实际READ成功。本次两种surface已有
   前述实际调用证据，结论限于服务在线且本机有效配置正确的范围。

## 同名direct配置与desktop续聊的证明范围

当前CLI用进程级direct URL覆盖、保持原插件enabled时，公开`mcp get tqx`返回direct
URL，证明该版本的配置解析中direct同名server优先。该只读检查不初始化或连接覆盖地址。
Owner另用同名、同精确URL实际READ证明本机原授权可复用；不能推广成改别名/URL后也
保证复用。原插件无需卸载，manifest展示信息或可选skills也不能代替实际工具初始化。

Owner保留持久direct作为本机有效已验配置；正常手工desktop新会话也已实际通过。
旧项目已完成项目配置修复和两次fresh对照，不能只凭先后顺序宣称direct单独修复了所有
加载路径。它不是新安装硬要求，也不要求所有安装同时双配。不要
盲跑`mcp add`当作无认证副作用的诊断：当前CLI help提到immediate login，须先评估。

CLI生成的saved chat可用公开工具只读定位；能定位后由Owner用公开续聊尝试同一ID，
重新记录工具schema与getAccount事件。若不能定位，可由用户正常`codex resume <ID>`
后用`/app`打开同一saved chat。官方支持同chat续聊，不代表MCP连接/catalog保证继承。
CLI历史中成功的工具调用不能当成desktop续聊成功；打开线程也不是刷新工具的命令。
本日上述native会话的公开desktop续聊已实际READ成功，见前述新工具事件；这是一个
已通过的具体路径，应与项目修复前的失败、修复后的fresh成功分别记录，不推断任意
会话都会继承。

若需区分插件选择边界，用户可在真实desktop composer的@菜单选择Plugins下的TQX后
发送一次只读请求并记录选择动作；当前工具不提供结构化插件附件/刷新host接口，不能
靠纯prompt链接证明已选中。不要用私有app-server/socket/DB绕过，也不为本次诊断
自动重启整个desktop。若实际需要用户UI操作或安全时机重启，应交Owner明确安排，
不能把“每次手选”描述为已完成的稳定加载修复。

运行中steering与新turn应分别记录。官方`turn/steer`只向当前in-flight turn追加输入，
不产生新的`turn/started`；文档未承诺此时重建MCP catalog。当前desktop包的公开发送
路径也分steer/start，纯prompt续聊在没有attachment context时只构造text输入。
这说明需要记录实际目标thread、turn及选择上下文，不足以推断一次@消息会刷新工具。
静态检查发现的desktop `enabled_tools`覆盖仅针对`codex_app`服务，不是所有MCP的
allowlist；不能据`dynamicTools=[]`就认定用户的TQX被全局禁用。

## 等待窗口不是metadata连接修复

官方配置中，`startup_timeout_sec`是单个server的初始化超时，默认10秒；
`mcp_optional_startup_grace_ms`是构建初始工具catalog时对optional servers的共享等待，
默认1000毫秒，0表示等待各server自身超时。`required=true`会在该enabled server
初始化失败时令startup/resume失败。这些设置不能修复AS connection refused。

本次通过恢复依赖及修正实际项目覆盖完成验证，未持久修改全局grace、添加required或修改
manifest的capabilities/defaultPrompt。若其它问题仍需时序诊断，
由Owner选择单次进程级对照，保持原授权并记录差异；未经实测不宣告时序或附件为根因。

官方依据：[MCP连接及排查](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、
[等待窗口与server配置](https://learn.chatgpt.com/docs/config-file/config-reference)、
[插件安装与组件](https://developers.openai.com/plugins/build/plugins)、
[同一saved chat的/app续聊](https://learn.chatgpt.com/docs/developer-commands)、
[steering与thread工具生命周期](https://learn.chatgpt.com/docs/app-server)。
