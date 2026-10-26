# 交给 Codex 执行：自动连接 TQX MCP

**适用面：本地 Codex host 的 MCP 配置。** 本文不等于「插件 → 添加自定义 MCP 服务器」
cloud／Tunnel 表单已创建插件，也不能证明该入口已接通。本地插件安装和云端私有 Tunnel
是不同路径；不要把写入 TOML 或 CLI 验证冒充应用插件调用成功。

用户用法：把本文件交给你的 Codex，说「请按本文自动配置并连接 TQX，必要时新建一个只读验证会话；网页账户选择和授权确认交给我。」
下面是给执行代理的操作协议。请实际完成配置和读取验证，不只复述步骤或要求用户手改文件。
用户明确要求执行本文件时，可进行必要的本地可逆配置；OAuth 账户选择和权限同意仍由真人完成。
不要再询问「是否开始」；遇到必须由用户完成的环节，只给一个当前需要的动作，其余独立步骤继续。

唯一必填参数（用户已在消息中提供时直接采用）：

```toml
MCP_URL = ""
```

## 1. 先确定服务地址和运行主机

根据 `MCP_URL` 确定同机或远程模式，不另要求用户填写技术参数。
默认申请权限固定为 `trade:read`、`order:write`。

- **其他电脑／对外分发：没有默认服务 URL。** 当前项目尚无公网生产部署。如果用户未提供地址，只问一次「请提供服务方的 HTTPS MCP 地址；若服务就在这台电脑，请明确说明」。不要把本文示例的 localhost 当作他人的服务，不自动部署、开隧道或创建公网地址。
- **当前开发机专用参数**，仅当用户／负责人明确确认与服务同机时使用：

  ```text
  MCP_URL=http://127.0.0.1:3004/mcp
  ```

  这是本地隔离 PAPER／假券商环境，不是生产资金服务。WSL、容器、远程主机和云端的 `127.0.0.1` 不自动视为这台 Windows。

- 远程地址要求有效 HTTPS；同机 local 才允许明确 loopback HTTP。拒绝 URL 内的用户名、密码、token 查询参数和不明重定向。

发现 `codex` 可执行文件（PATH；必要时查本机已安装 Codex 的 bundled CLI），读取 `--version`、`mcp login --help`；不要自动替换／升级客户端。定位实际用户 `CODEX_HOME`，未设置时用当前操作系统用户主目录下的 `.codex`，配置文件为其 `config.toml`。不要写进验收私有 HOME，也不硬编码文档作者的用户名。

对 `MCP_URL` 做一次无凭据的 MCP 发现，按 `WWW-Authenticate` 的 `resource_metadata` 或标准发现机制获取保护资源元数据，再读取其授权服务器元数据。确认 `resource` 与目标一致、所选 AS 与其 `issuer` 精确一致、端点可达并支持 OAuth/PKCE 及所需 scope；不改 issuer、TLS 或 callback 校验。失败就报告具体缺项，不通过填入旧 token 绕过。

## 2. 自动、幂等地合并配置

先用真实 TOML 解析器读取配置并检查项目覆盖／管理员限制；只捕获必要字段，不把整份配置、凭据或 Authorization 输出到聊天。缺少解析器时选现有可用运行时，例如 Python `tomllib` 或 Bun TOML；不要用正则盲目改写整份配置。

远程默认名称 `tqx`，同机默认 `tqx_local`。已有相同 URL 的条目优先复用；名称被其他地址占用时保留旧条目，使用基于目标 URL 的稳定唯一新名称并报告，不覆盖旧连接。

按实际参数生成并合并唯一条目：

```toml
[mcp_servers.SERVER_NAME]
url = "MCP_URL"
scopes = ["trade:read", "order:write"]
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 60
```

`SERVER_NAME` 是计算出的表名，`MCP_URL` 是用户提供的地址，写入前必须替换占位符。命令使用结构化参数或安全 shell 引用，不把输入拼成可执行脚本。已有字段正确则不写；需修改时使用 TOML 编辑器／精确表级编辑，保留其他字段、其他服务、注释、配置层和权限策略。不得重建整份文件、重复同名表或静默移除工具限制。冲突的静态认证头／bearer 配置不能盲目复用或删除；隔离为新条目或报告实际冲突。

写前建立仅当前用户可读的本地备份，保留文件权限；写前再次比对源文件未被别人修改，临时文件解析成功且无关配置语义完全一致后再原子替换。并发变化就重读合并。重复运行不能新增重复条目或无意义备份。不要修改既有 token、钥匙串、全局凭据存储方式或 OpenAI 登录。不得填写服务 confidential secret、手填 access token、设置固定 callback 或降低安全确认。`codex mcp add` 在部分版本会立即登录，不把它当作可无条件重试的配置写入命令。

在用户实际使用的工作目录运行`codex mcp get SERVER_NAME --json`核对**有效URL**，
不要只看刚写入的用户层配置；trusted项目的`.codex/config.toml`可能覆盖同名server及
工具allowlist。工具为零时先排查metadata连接/超时、旧项目URL和工具过滤，`o_auth`
不证明当前连接成功；不自动logout/reinstall或扩大scope。见[诊断指引](INTEGRATION_TROUBLESHOOTING.md)。

## 3. 复用有效授权；必要时仅发起一次真人 OAuth

先检查是否已有该服务**仍在运行**的登录，有则继续原事务，不能并发发起；已超时退出、callback 已关闭的旧链接不可重用，需发起一次 fresh OAuth。已有连接先通过实际宿主的认证／工具能力及只读调用验证；凭据存在、`mcp get` 或工具清单本身不等于有效授权。可用且具备两种 scope 时跳过登录；正常客户端可自行刷新过期票，不手改缓存期限。scope 升级需真人新同意，不能只修改 scopes 就声称升级完成。

确需登录时，按当前 CLI 的 help 执行一次（将名称换成实际值）：

```text
codex mcp login SERVER_NAME --scopes trade:read,order:write --oauth-client-registration auto
```

客户端不支持可选 registration 参数时省略该参数，保持其默认流程。使用正常 browser route：保留这次 CLI 进程和真实动态 callback。CLI 可能只输出链接；可用合规浏览器工具打开，或把链接交给用户。**真人登录自己的账户、选择该账户自己的 Agent、确认权限；代理不得代签／自动批准，不使用 fixture 账号或票据替代。** 在已明确隔离测试的 local profile，可由用户选择其测试账号自己的 Agent，不得选其他用户 Agent。

不自动操作登录密码、认证弹窗或安全授权。不能违反当前 computer-use skill 的 Codex 桌面 UI 禁令；CLI 优先，允许的浏览器导航只用于把真人带到这次授权页。网页同意后由 Codex 自动接收回调，不自行交换 code、不修改 code/state/iss、不复用其他事务。等待明确成功或实际超时；真人尚未确认时报告「等待本人授权」，不能当作失败反复登录。授权链接和回调参数不写公开日志。

## 4. 在用户的真实会话加载并实际读取

只有当前公开工具或已授权会话接口明确暴露 `config/mcpServer/reload` 时，才用它重读配置并刷新连接；不要调用隐藏 API、探测私有 socket 或读写私有凭据来伪造联通，不另启动无关 app-server 假装刷新了桌面。需要新验证会话且有受支持创建能力时，按用户上述授权自动创建一个本地只读验证会话，仅派发本次 getAccount/listPositions 验证，不发其他消息；否则使用同一用户 profile 的受支持新 CLI 会话。CLI 成功要明确标为 CLI，不能冒称旧桌面已加载。确实只能由用户开新聊天时，只给「新建聊天并继续执行本文件」这个动作；保留配置／授权，不重复登录。

桌面入口是 **Settings → MCP servers**；按客户端实际能力检查条目／认证状态，不盲点按钮。当前开发机已核实该页 **Restart 会重启宿主 app-server**，可能影响它托管的服务，不能当作无害刷新；只有没有活动任务且服务已持久运行时，才由用户使用。无安全重载能力则报告待重载，不擅自关闭桌面或终止其他任务。

加载后，通过**这个用户实际要使用的 Codex 会话的 MCP 工具入口**调用 `getAccount` 和 `listPositions`，都只读取，保留实际模式、时间、decimal 字符串和 null。不调用任何下单、改单、撤单或批量写工具。若当前会话尚无法加载工具，如实停在「待新会话读取验证」，不能用原始 HTTP、另一个私有 app-server、`mcp get` 或 `tools/list` 冒充本会话已调用成功。

### 后续单次交易与有界跟踪

本文接入/只读验证不授权下单。用户后续明确交易时，一次提交保留稳定intent/key与原
order/signal引用，返回真实回执并及时结束，不因UNKNOWN或观察超时自动重下。用户另要求
跟踪时先定任务归属、间隔、start/deadlineUTC和总预算；只读同单，运行以monotonic计时，
只读跟踪有原orderId或signalId即可，不索要未知的下单key或写权限。
每轮检查剩余预算并串行GET。到点/处理停止指令后不发新GET，原在途可完成或取消；
晚结果另列，不改变原结束原因、不撤单。无法取消或只能排队时如实记录宿主限制。

GET错误/404/空活动列表不当终态，部分成交保留准确数量，signal/订单/monitor状态与
来源、staleness分别记录；monitor_budget不等于渠道到期，TIMEOUT须有CHANNEL/
DAY_EXPIRED证据。重开时重新GET原引用，不把历史当实时，不重置旧截止或生成替代key。
无持续执行器/通知渠道不承诺离线主动通知、不自行建任务。无需新全局skill，选用纯
计时checkpoint与实际marker收集时见[有界跟踪验收说明](OBSERVATION_ACCEPTANCE.md)；
helper不执行交易HTTP，实际工具调用始终由会话完成。

## 5. 完成条件和简短回执

配置唯一且正确、真人 OAuth 已成功、所需权限已确认、目标会话两个只读工具都成功后，才报告「配置并验证完成」。仅回报实际配置路径、服务名称／URL、授权状态、两项读取结果和是否尚需新会话；隐藏 token、code、state、秘密和不必要账户标识。没有 endpoint、等待真人同意、等待宿主重载、等待实际读取时，明确指出停在哪一步及最小下一步，不虚构完成。

官方依据：[MCP 配置／OAuth](https://learn.chatgpt.com/docs/extend/mcp)、[配置位置](https://learn.chatgpt.com/docs/config-file/config-basic)、[宿主 MCP 重载](https://learn.chatgpt.com/docs/app-server)。
