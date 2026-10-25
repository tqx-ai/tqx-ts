# 当前桌面的 TQX 本地插件

新增三环境接入使用 [INSTALL_LOCAL_PLUGIN_WITH_CODEX.md](INSTALL_LOCAL_PLUGIN_WITH_CODEX.md)
及 [DEPLOYMENT_ENVIRONMENTS.md](DEPLOYMENT_ENVIRONMENTS.md)：保留已有配置/默认值，
local/test/prod可选；新源可用摘要建议名，既有alias/版本无需迁移。本页以下0.2.0是已授权的
既有local连接，保留原ID/票据，不因新0.3.0配置模板自动升级、重装或切环境。
未知test/prod部署不臆造地址，显示沿用的有效配置/默认值；本轮只有离线生成证据。

这条路径安装**本地 marketplace 插件**，保留现有 MCP3004／AS26825／Web3000，不部署服务，
不需要新建公网入口或 Tunnel。只适用于能访问这台机器服务的本地 Codex host；它不是
截图中 cloud「添加自定义 MCP → Server URL／Tunnel → Create as plugin」已创建成功的证明。

## 交给 Owner 安装到用户 profile

从本目录执行，或把 distribution-v2 换成其绝对路径。Owner 统一执行，不并发安装／登录：

```powershell
codex plugin marketplace add ./distribution-v2 --json
codex plugin add tqx-trading-local@tqx-local --json
codex plugin list --json
codex mcp get tqx --json
codex mcp login tqx --scopes trade:read,order:write --oauth-client-registration auto
```

必须确认 marketplace=`tqx-local`、pluginId=`tqx-trading-local@tqx-local`、enabled=true，
以及来自插件的 server=`tqx`、URL=`http://127.0.0.1:3004/mcp`。先检查名称冲突；不覆盖
同名其他服务，不改原来的 `tqx_local` 个人配置，不复制它的私有票据。已有本插件的
有效授权先读取验证，不重复登录。CLI 接受的是 `plugin add`，不是 `plugin install`。

真人在该次登录链接选择自己账号的 Agent 并确认两项权限。CLI／桌面默认授权可能从
元数据选择 scope；本批采用显式 `--scopes trade:read,order:write`。当前 MCP 元数据仅
公布这两项，但 AS 元数据有六项 scope，不能凭安装成功推断默认 GUI 已正确限权。
Owner 可按 `plugin-scope-observation.example.json` 记录真实授权请求的 scope、resource、
PKCE 和 callback host/path；模板中的 null 表示未观察，不能替换为通过。不要保存完整
授权／回调 URL、state、code、verifier 或任何票据。若 scope 包含额外 research/ranking，
停止这次同意并核对客户端请求，不自动批准。

在应用的插件列表找到 **TQX Trading Local** 并在新的本地聊天选择它；可使用引用
`[TQX Trading Local](plugin://tqx-trading-local@tqx-local)`。首次只调用账户和持仓，
不要下单、改单或撤单。安装列表、MCP 配置／工具清单可见，只说明安装／发现状态；
真实用户授权与当前应用插件聊天实际只读调用都成功后才能报告接通。不能用另一个
私有 app-server 的成功替代此验证。旧聊天未加载时由 Owner 协调新会话／支持的重载，
不要直接点击会 stop host 的 Restart 中断服务。

给新本地聊天的完整提示可以是：

> 使用 [TQX Trading Local](plugin://tqx-trading-local@tqx-local) 读取我刚授权的 Agent 的账户和持仓，显示实际模式和数据时间；不要下单、改单或撤单。若工具没有加载，请报告缺失，不使用其他 MCP 连接替代。

选择插件后才检查该插件提供的 `getAccount`、`listPositions` 调用记录。原 `tqx_local`
直连与本插件是不同连接；它成功不能算本插件成功。插件导入／启用不保证当前旧聊天
会自动获得新工具；必须保留「已安装」「已授权」「该应用新聊天已实际读取」三个状态。

## 为什么包里没有写 scopes 扩展

安装客户端 `0.164.0-alpha.11.1` 的独立临时 profile 实测：

| mcp.json 的 server 字段                                        | plugin add/list | 实际 mcp list             |
| -------------------------------------------------------------- | --------------- | ------------------------- |
| type + url + extensions.com.openai.auth（官方 portable OAuth） | 安装／启用成功  | 服务器被跳过，空列表      |
| type + url + 直接 scopes                                       | 安装／启用成功  | 服务器被跳过，空列表      |
| 仅 type + url                                                  | 安装／启用成功  | tqx 已加载、not_logged_in |

因此当前兼容包只保留 transport+URL，不放不被此 loader 读取的 scope 配置；scope 在真实
登录中显式提供。以上仅验证本地安装／解析，没有启动 OAuth，也没有修改用户 profile。
当前插件包不是旧 `tqx-readonly` 的原地改名；旧历史包和证据保持不变。

## 截图的 Server URL／Tunnel 是另一条入口

Cloud 不能把服务器上的 `127.0.0.1` 当作这台电脑。官方 Secure MCP Tunnel 可以连接
私有本地 MCP，不要求公网入站；但需要真实 tunnel 资源、运行凭据、组织／workspace
关联和存活的 tunnel-client。OAuth 授权服务器自身不会自动被 MCP Tunnel 代理。
没有这些资源不能宣称截图入口通过，也不在包中编造 tunnelId／平台密钥或改成公共部署。
本地插件存在不等于云端／手机／远程 host 都能使用。

依据：[插件包及本地市场](https://developers.openai.com/plugins/build/plugins)、
[当前 CLI 命令](https://learn.chatgpt.com/docs/cli/reference)、
[桌面插件范围](https://developers.openai.com/plugins/deploy/desktop-only)、
[Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。
