# 在 Codex 里连接 TQX

这份人工说明保留作历史参考：先前临时 OAuth 已超时，个人授权未完成，不再使用旧链接。
要交给 Codex 自动执行，请用独立的 [通用协议](CONNECT_WITH_CODEX.md) 或
[当前同机开发版](CONNECT_WITH_CODEX_LOCAL.md)；下面提及「当前登录」的步骤不代表仍有活动事务。

本机已经添加 **tqx_local**，地址为 **http://127.0.0.1:3004/mcp**。
配置文件是 `C:\Users\13518\.codex\config.toml`，不是验收器的私有目录。

## 现在只需要完成这三步

1. **在 Owner 已打开的 TQX 授权网页确认。** 本次使用隔离测试账号 `java-other-7648d1b4` 的登录状态，选择该账号自己的 **Java test bridge** Agent，再批准账户读取和交易权限。不要选择其他用户的 Agent；本次不连接生产资金账号。当前登录已经启动，不要再点 Authenticate 或重复运行 login 创建第二条授权。
2. **完成网页回调后，新建一个本地聊天。** 可在 **设置 → MCP servers（MCP 服务器）** 查看 `tqx_local`。本轮先不点 **Restart**、不退出整个 Codex，避免中断当前托管的本地服务；新聊天若仍看不到工具，由 Owner 安排配置重载或服务持久运行后再重启。
3. **在新会话先只读验证：**

   > 使用 tqx_local 读取我授权的 Agent 的账户和持仓，显示账户模式和数据时间；不要下单、改单或撤单。

看到这次桌面会话的实际工具调用结果，才算个人客户端接通。此前 app-server/CLI 验收通过不会自动替你完成个人授权。当前本地服务仍是隔离 **PAPER／假券商环境**，不能当作真实券商连接。

## 可复制的配置

Owner 已把下面条目合并进本机配置，原有其他设置保留不变；**现在不需要重复添加**：

```toml
[mcp_servers.tqx_local]
url = "http://127.0.0.1:3004/mcp"
scopes = ["trade:read", "order:write"]
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 60
```

[下载配置片段](tqx-local.config.toml)。在其他配置中使用时只合并这个表，不覆盖整份文件或重复同名表。不要填写服务器 client secret、Authorization header 或测试 access token；OAuth 由 Codex 自动注册并用 PKCE 完成。

两种权限都批准时提供 11 个工具；仅需读取可另配置 `trade:read`，对应 7 个工具。写权限不表示立即执行交易，首次验证仍只读取。

## 以后怎么登录或检查

确认没有正在进行的授权后，需要重新发起登录时再运行：

```powershell
codex mcp login tqx_local --scopes trade:read,order:write --oauth-client-registration auto
```

CLI 会提供授权链接；本次由 Owner 打开该链接让你确认。网页批准后 Codex 自动接收回调，不需要手工复制 code、state 或 token，也不需要重新 `codex login` 登录 OpenAI。

- 核对配置：`codex mcp get tqx_local`、`codex mcp list`。
- CLI 交互界面查看当前连接：`/mcp`。
- 桌面手动首次添加的入口：**Settings → MCP servers → Add server → Streamable HTTP**，填写名称和 URL；**Authenticate** 用于发起授权。本机已添加且正在授权，不重复操作。
- 配置存在但新聊天看不到：确认选的是本地 Windows host，让 Owner 检查配置重载及项目覆盖。本机页面的 Restart 会重启 app-server，当前不要自行点击。远程主机／WSL／云会话的 `127.0.0.1` 不一定是这台电脑。
- 网页没有该测试账号自己的 Agent 或无法连接：交给 Owner 检查账号、Agent 和本地服务，不要改用其他用户的 Agent 或手填票据。

官方 [MCP 设置说明](https://learn.chatgpt.com/docs/extend/mcp)；本机桌面入口与 CLI 版本的核验细节见 [接入说明补充](USER_SETUP_NOTES.md)。不需要运行验收脚本，也不需要更改测试 READY。
