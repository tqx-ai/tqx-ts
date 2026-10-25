# 真正干净客户端：安装、本人授权、READ及重开会话验收

本文是给Owner审核/选择运行方式的验收操作，不是已经完成的外部验收。共享HTTPS MCP
地址尚未由用户确定，当前状态为待真实服务地址、干净客户端和本人操作；不填作者的
127.0.0.1来冒充外部环境，不假造域名、隧道或云端已接通。这不改变既有默认配置链、
原认证校验，也不新增应用部署硬门槛。

用户的安装材料仍是自足的 INSTALL_LOCAL_PLUGIN_WITH_CODEX.md，或已交付kit中的
INSTALL_WITH_CODEX.md；不需要作者仓库、Bun或node_modules。本文/检查脚本只是独立
验收方案，不重写原默认值、不自动执行安装或授权，也不改变现有主用户profile。

## C0. 确定真正干净客户端与真实目标

Owner先决定实际客户端/host/surface。优先独立客户端或机器，记录它此前没有本次TQX
插件/授权上下文；不能通过删除主用户token、卸载原插件或复制OpenAI凭据来造“干净”。
若只是临时HOME但沿用已有keystore/授权，应准确标记复用，而非未经证明的全新授权。
Codex本身使用该客户端正常的OpenAI登录；不从作者profile拷贝任何认证文件。

用户/服务方提供实际可达MCP resource，按正常无票metadata取得并核对issuer。Web
consent origin来自服务方可信配置；品牌helper才需要它，未知时正常客户端认证路径
仍可保留。共享HTTPS服务的地址、可达性、证书/原服务校验和实际AS/Web是部署依赖，
不是本脚本创建出来的能力。用户不需要配置Trading内部base/audience或Java中间件。

记录实际target、客户端/OS/CLI版本和所选surface，不记录秘密。local/test/prod只是
配置标签；已有正常配置/默认链保留。没有目标时只收集服务地址或确认其自有同机服务，
停在“验收待目标”，不要执行默认3004源安装并把它算成外部服务。

## C1. 只凭单MD生成并安装，核对native配置可见性

在所选客户端用文档内完整selector/helper，按真实目标参数生成source；不要运行作者
的测试fixture或复用其临时HOME。source目录、插件名和server名取真实生成事件，正常
已有连接先复用，不因验收要求迁票或换slot。新安装使用客户端支持的公共命令：

```text
codex plugin marketplace add <ACTUAL_SOURCE> --json
codex plugin add <ACTUAL_PLUGIN>@<ACTUAL_MARKETPLACE> --json
codex plugin list --json
codex mcp get <ACTUAL_SERVER> --json
codex mcp list --json
```

记录installed/enabled/实际版本/source/server URL及公开auth_status。仅mcp get可见
只能证明配置被加载，不能证明native初始化、工具schema、本人授权或账户可读。当前
CLI没有mcp reload子命令；不使用私有app-server/socket、内部DB或重启整个Codex来造成功。

## C2. 正常native发现与本人网页授权

正常客户端先发现服务/标准OAuth metadata。保护服务在未登录时要求认证是预期流程，
不是“工具已可用”；只有配置状态也不能当作协议工具发现。若确实未登录，READ验收
可用正常客户端登录，例如先核实该版本help后：

```text
codex mcp login <ACTUAL_SERVER> --scopes trade:read --oauth-client-registration auto
```

这是待执行示例，不会由检查脚本发起。只请求服务公布且用户批准的权限，不自动追加
write scope。当前交付的品牌Node helper固定请求trade:read+order:write，不能把它的
批准记录写成“仅read授权”；本验收不改helper或既有grant策略。若使用该路径，先向
本人如实展示实际scope，记录其单独同意。正常native客户端路径的完成页与品牌UX分别验。

本人在真正TQX网页登录，选择自己账户的Agent并批准实际权限。代理必须交付一个
当次有效入口并明确等本人操作；不代签、不用fixture身份、不回放旧callback。CLI进程
需要保持，记录其真实完成/退出0；点击网页或AS issued不能代替client完成。公开状态
已登录也不能替代后续真实工具调用。已有效授权无需为了重开会话再登录。

## C3. 授权后的真实模型可见schema

在该客户端正常选择已安装插件。官方composer动作是输入@、从Plugins选择插件并
发送；规范链接示例为 `[@TQX](plugin://<PLUGIN>@<MARKETPLACE>)`。程序化send_message
只有prompt时不能预先当作structured plugin附件，普通Markdown链接也不能保证激活。

记录真实model-visible tools以及listOrders的limit/cursor/startDate/endDate/status/
symbol字段，保留实际native发现/工具事件。源码、粘贴schema、metadata或mcp get都
不能代替这一步。schema仍旧/工具为空时报告发现限制，不注销或重新OAuth修“schema”。

CLI可用正常codex exec --json在同一所选客户端/profile发起实际模型session，保留
默认model和正常keystore，不用新HOME/复制凭据/--ignore-user-config绕过原配置。
CLI成功只能记CLI surface，不假称桌面新会话已修复。执行由Owner在真实目标ready后决定。

## C4. 三类真实READ与新增筛选

仅所选插件/server依次实际调用getAccount({})、listPositions({limit:1})及listOrders
筛选。筛选值取本次真实账户/服务方确定的日期、status、symbol，不硬编码作者的账户或
测试记录；调用前C3必须确认当前descriptor认识这些字段。选择一个已知匹配样本有利于
证明筛选语义；账户本来为空也如实保留，不造持仓、订单或成交。

保存每条实际MCP工具事件的server/tool/arguments/result/error，保留mode、as_of、
is_stale、decimal字符串、null和空数组。若有服务方授权审计，再对齐Trading真实GET
start_date/end_date/status/symbol，避免参数被桥丢掉仍因空结果假绿。单纯items=[]
不证明AND/date/status/symbol筛选正确；缺审计/匹配样本时明确语义证明范围。

不用原始HTTP、SDK直调、另一个私有app-server、旧对话或mock成功替代实际模型工具。
不下单/改单/撤单，不以ACCEPTED/UNKNOWN冒充成交。错误分支保留错误，不把认证/发现
失败改写成“空数据”。可记录三个基础READ通过，但额外筛选/发现未证实仍需单列。

## C5. 重开正常会话再次发现，保留原授权

关闭/离开该会话后，在同一客户端正常开新会话并从@菜单选择同一已安装插件；不重装、
不logout、不清token、不新OAuth。先取得新会话真实schema，再实际getAccount一次，
记录同server/实际调用/结果。普通create_thread/fork的成功返回不保证插件附件保留。

只有这一步实际成功，才说“重开可发现”。首个会话READ成功而新会话无工具时，分别
报告前者通过、后者未通过。不能用原会话再调用一次代替新会话，或将CLI重开通过写成
桌面重开通过。需要用户正常选插件的动作要注明，不能描述为全自动注入已验证。

## 当前已知限制与不能借用的证明

- 原已授权桌面A仍能读账户，且兼容桥能真实传新增filter，但descriptor仍旧；这不证明fresh schema。
- 新create_thread `01a171ff-9f60-70c1-929e-f3ee79e4f6b7` 和公开fork `01a17200-7b94-7880-b1f2-77ea44f00179` 都0个tqx工具，无调用/无401；不是已证实丢授权。
- 只写pluginRef或fork不能保证附件注入，当前没有公开per-thread attach/reload工具。
- 先前9项mock冷启动、4步隔离native安装及READ/WRITE本地验收不是此次真实外部clean-client认证、fresh/reopen证明。
- 原主用户授权、token和主插件不能被清除或迁移来“修复”上述限制。

## 证据字段、只读检查与待Owner决定

每阶段记录status（pending/failed/passed）、以下字段及原始证据的可审阅位置。失败时另记
实际error和原因；缺失或失败不得写passed。证据应脱敏，不保存token、cookie、callback、
OpenAI凭据或完整个人账户资料。ordersArguments记录实际公开JSON参数，不能填预计值。

| 阶段 | 必需字段（值为非空文字或脱敏证据引用）                                                |
| ---- | ------------------------------------------------------------------------------------- |
| C0   | clientProvenance、surface（desktop/cli）、clientVersion、target、issuer               |
| C1   | source、plugin、version、server、configurationEvidence                                |
| C2   | ownConsentEvidence、nativeCompletionEvidence                                          |
| C3   | session、selectedPlugin、schemaEvidence                                               |
| C4   | accountEvidence、positionsEvidence、ordersArguments、ordersEvidence、filterProofScope |
| C5   | newSession、sameAuthEvidence、schemaEvidence、accountEvidence                         |

JSON形状为`{"stages":{"C0":{"status":"pending"},"C1":{"status":"pending"},"C2":{"status":"pending"},"C3":{"status":"pending"},"C4":{"status":"pending"},"C5":{"status":"pending"}}}`；
填入上表实际证据字段。C5.newSession必须与C3.session不同。filterProofScope明确有无
真实匹配样本/服务端参数审计；为空结果时不能声称筛选语义已充分证明。

check-clean-client-evidence.mjs只读公开JSON、检查必需字段，不spawn CLI、联网、认证或
写文件。无需作者仓库或node_modules：

```text
node check-clean-client-evidence.mjs
node check-clean-client-evidence.mjs PUBLIC_EVIDENCE.json
```

无输入或缺项退出2；无效输入退出1；齐全退出0但只标complete-needs-human-review。
externalAcceptance始终not-verified-by-this-script：它不读取证据引用、不核实真实性，
不识别所有占位符，不能把字段齐全当成真实验收通过。实际结果由Owner按原始证据审核。

仍缺：真实共享服务地址与AS/Web部署、干净客户端/host/surface、本人的正常网页授权、
真实native工具schema/三READ筛选、新会话再次发现及其原始工具证据。当前没有新增
OAuth、聊天、账户调用或对主profile的任何改变；已有安装包/代码保持原版本字节。

官方参考：[CLI](https://learn.chatgpt.com/docs/cli/reference)、
[插件选择](https://learn.chatgpt.com/docs/build-plugins)、
[真实CLI模型session输出](https://learn.chatgpt.com/docs/non-interactive-mode)。
