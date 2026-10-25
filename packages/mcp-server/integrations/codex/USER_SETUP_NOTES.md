# 在 Codex 里连接 TQX

本机的服务名是 **tqx_local**，MCP 地址是 **http://127.0.0.1:3004/mcp**。
2026-10-25，Owner 已把它添加到 `C:\Users\13518\.codex\config.toml`，并用 CLI
核对配置可读。接下来需要你在网页确认授权，再让桌面重新加载配置。
这和此前验收器使用的私有 HOME 是两套配置；验收通过不会自动替你连接个人客户端。

## 现在怎么做

1. 等 Owner 启动这一条登录；同一个服务只保留一条进行中的登录：

   ```powershell
   codex mcp login tqx_local --scopes trade:read,order:write --oauth-client-registration auto
   ```

2. 在 Owner 打开的 TQX 授权网页中使用本轮隔离测试账号 `java-other-7648d1b4` 的
   登录状态，核对应用和请求权限，选择该账号自己的 **Java test bridge** Agent 后
   确认。不要选择其他用户的 Agent，也不要把 access token 或服务器 client secret
   填入 Codex。本次配置个人 Codex 客户端连接测试账号，不是连接生产资金账号。
3. 等终端显示登录成功。正常模式由 Codex 自动接收浏览器回调；不需要复制回调 URL，
   不需要手填 code、state 或 token。CLI 提供授权链接，本次由 Owner 打开；没有声称
   CLI 已自动打开系统浏览器。这里也不需要 `codex login` 重新登录 OpenAI。
4. 回到 Codex 的 **设置 → MCP servers（MCP 服务器）**，查看 `tqx_local`。
   配置在应用运行中加入时，先完成网页回调并新建本地聊天。当前服务由 Codex
   exec sessions 托管，不默认点击 **Restart** 或退出应用；若新聊天仍未接通，
   Owner 先安排 MCP 配置重载，或先把服务持久运行再重启。
5. 在新会话先发送这一句，只检查读取：

   > 使用 tqx_local 读取我授权的 Agent 的账户和持仓，显示账户模式及数据时间；不要下单、改单或撤单。

只有看到桌面里的实际工具调用结果，才说明这一个桌面会话已经接通。CLI 登录成功、
配置存在和此前 app-server 验收都不能单独代替这个确认。交易操作应另行明确提出。

## 配置是什么

当前已合并的是下列条目，其他 Codex 设置保留不变：

```toml
[mcp_servers.tqx_local]
url = "http://127.0.0.1:3004/mcp"
scopes = ["trade:read", "order:write"]
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 60
```

可复制文件：[tqx-local.config.toml](tqx-local.config.toml)。不要用这个片段覆盖整份
`config.toml`。同名表已经存在时合并字段，不再追加第二个同名表。
`scopes` 决定此次申请的权限；`order:write` 只让工具具备被授权调用的可能，不表示现在下单。
仅需读取时可改为 `scopes = ["trade:read"]` 并重新授权；这一轮实际配置申请了两种权限。

不要添加固定 `client_id`、`client_secret`、`Authorization`、`bearer_token_env_var`，
也不要抄私有测试目录里的票据。Codex 作为公开 OAuth 客户端自动注册并使用 PKCE，
服务器内部的交换凭据与个人客户端无关。保留现有凭据存储方式，不手改钥匙串或票据文件。

另一台本机首次安装可用 `codex mcp add tqx_local --url http://127.0.0.1:3004/mcp`，
但当前版本的 add 可能立即启动登录，因此应先确定显式 scopes；本机已经添加，**现在不再运行 add**。
最直接的方式是合并上面的 TOML，然后只执行一次明确 scopes 的 login。

## 桌面入口和可见性

官方路径是 **Settings → MCP servers**：新增时选 **Add server → Streamable HTTP**，
填写服务名及上述 URL；已有条目的 **Authenticate** 用于发起授权。
本机条目已经存在，优先使用 Owner 启动的登录，不在桌面重复点 Authenticate 生成第二条事务。

本机 `OpenAI.Codex 26.1021.2667.0` 安装包中已只读核对：

- `mcp-settings` 设置页面，标题为 `MCP servers`；
- 命令菜单的 `Configure MCP servers`；
- `Streamable HTTP`、`Add server`、`Restart` 和 `Authenticate` 的实际控件文案；
- Authenticate 调用实际的 `mcpServer/oauth/login` 并打开其授权 URL。

以上是已安装 UI 实现核对，不是桌面按钮实点或当前会话已连接的声明。
旧会话可能保留创建时的工具目录，应先新建本地会话检查，不能保证外部文件编辑已自动
热加载。本机 MCP 页面的 Restart 实际 dispatch `codex-app-server-restart`，主进程
调用 connection.restart，先 stopProcess 再 ensureReady，因此不是单纯列表刷新。
当前 exec-owned 服务存在时不要默认点击。官方和本机生成 schema 均支持
`config/mcpServer/reload`，它从磁盘重载 MCP 配置并给已有聊天排队刷新；这是 Owner
协调宿主连接的机制，不是让用户运行验收 RPC，也不是已执行重载的声明。
如果使用远程主机、WSL 或云会话，`127.0.0.1` 指向的是执行主机，不能假设能访问这台
Windows 的服务；当前条目适用于这台 Windows 的本地 Codex host。

## 有哪些工具

| 权限        | 工具                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| trade:read  | getAccount、listPositions、listOrders、getOrder、listTrades、listCashFlows、getSignal |
| order:write | placeOrder、modifyOrder、cancelOrder、placeOrders                                     |

两种权限都批准后，应有 11 个工具；只批准读取则是 7 个。
资金流水在当前测试后端会明确返回“不支持”；写入的 accepted 表示已受理，不能当作已成交。
本机当前服务仍是隔离 PAPER／假券商验收环境；个人 OAuth 绑定成功也不把它变成真实券商连接。

## 看不到或连不上时

- 只核对配置：`codex mcp get tqx_local` 或 `codex mcp list`。存在条目不等于已授权。
- CLI 交互界面可输入 `/mcp` 看当前连接；桌面先从设置中的 MCP 列表核对，再用新会话做上面的只读调用。
- 列表没有 `tqx_local`：确认使用本地 Windows host，让 Owner 检查配置重载和有效配置层，不默认重启当前服务宿主。
- 显示需要授权：完成当前进行中的网页确认，避免重复创建授权事务；若确已过期，再重新发起 login。
- 连接被拒绝：让 Owner 确认本地 MCP 3004、AS 26825、Web 3000 仍在运行；不要自行替换测试票或 client secret。
- 浏览器正常登录不等于已授予 MCP 权限：还需要选择本人 Agent，并看到该次 MCP 授权成功返回。

验收用 READY=false 只关闭自动测试启动窗口，不是个人客户端配置项，也不需要用户手改为 true。
不要运行 `v2-run.ts`、`prepare-client.ts` 或其他验收脚本来安装个人连接。

依据：官方 [MCP 配置及桌面入口](https://learn.chatgpt.com/docs/extend/mcp)、
[开发设置](https://learn.chatgpt.com/docs/developer-settings)，以及本机 CLI
`0.164.0-alpha.11.1` 的 `mcp add/login --help`。本批不修改全局配置、登录票或钥匙串；
实际配置合并与发起登录由 Owner 统一操作。
