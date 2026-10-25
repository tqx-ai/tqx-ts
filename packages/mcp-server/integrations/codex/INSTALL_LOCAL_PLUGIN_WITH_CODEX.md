# 交给 Codex：按兼容配置连接 TQX local/test/prod

把本文件交给 Codex，说：**「请按我的现有配置和指定覆盖值连接TQX，保留已有认证；需要时自动生成/安装插件。网页登录、选择我的Agent和确认授权交给我，完成后用所选连接做只读验证。」**

本文供用户本地Codex host使用，自足包含完整Node selector和callback helper；不需要作者
仓库、Bun或附件。它不是云端Server URL/Tunnel/Create as plugin表单，不部署、不重启、
不开隧道，也不自动修改模型/OpenAI登录/凭据存储或搬迁已有票据。不要再问是否开始。

## 1. 读取原有公开配置，展示最终有效环境

**陌生机器从零接入：** 没有既有TQX连接、用户也未提供服务地址时，先只收集实际目标：
「请提供TQX MCP服务地址，或确认服务已经在当前执行host本地运行。」不要把作者的
127.0.0.1示例自动安装成外部用户的目标。已有正常配置继续沿用；这不是新增部署启动门槛，
selector原有本机默认链不变。收到地址后可按标准无票metadata发现issuer；品牌helper才
需要可信同意页Web origin，未知时向服务方核对，不猜公网地址、不冒充云端已接通，
也不因此取消原受支持客户端认证路径。缺的是实际服务部署/地址，不是再要求用户配中间件。

按原有优先级取值：**用户本次显式参数 > 已有公开连接配置 > 已知本机默认值**。
environment可选local/test/prod；未指定时保留已有环境标签，没有则默认local。
旧dev-pro等标签保留，不因不是三个新标签拒绝原配置。NODE_ENV不是部署环境选择器。

这里的客户端environment标签不设置服务端TQX_ENV。服务端已有local/test/prod配置选择时，
使用服务方确认的最终有效MCP URL；环境mode本身不自动换endpoint、开工具或改变账户模式。
客户端沿用正常认证行为，不自动改现有profile、搬票或增加迁移先决条件。

| 选择  | 未覆盖时的取值                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------- |
| local | 先用已有配置，否则MCP=http://127.0.0.1:3004/mcp、issuer=http://127.0.0.1:26825、Web=http://127.0.0.1:3000 |
| test  | 同样沿已有配置/默认链，实际测试地址由服务方按需覆盖                                                       |
| prod  | 同样沿已有配置/默认链，实际生产地址由服务方按需覆盖                                                       |

显示最终environment、MCP resource、issuer、Web origin、实际server/plugin来源，并说明
每项是显式、已有还是默认值。标签不是部署证明：选择prod但有效地址仍是本机时，明确
报告「prod标签，当前有效地址仍是本机」，不臆造远程地址或声称已连生产。其他电脑/
WSL/容器的localhost指的是执行host；若用户实际要另一部署而地址未知，可一次核对
覆盖值，不把未知部署信息变成原流程的新增启动/配置门槛。

先用支持的codex plugin list --json、codex plugin marketplace list --json、codex mcp
list/get读取正常公开连接状态/URL；不读取私有认证文件、token cache或keychain。
用户已提供MCP_URL就采用，否则优先既有连接。不要仅因新增环境标签就升级、重命名、
注销或重新登录原tqx-trading-local@tqx-local / tqx0.2.0、tqx_local或其它原有alias。
依客户端正常认证机制复用；不手工复制token到另一URL，不新定凭据迁移先决条件。
本文不自动改既有连接URL/认证槽；若确需影响面大的行为变更，先列原行为→拟变更及
影响交用户决定。这来自用户「不主动定影响面很大的规则」的要求。

客户端只用MCP resource、AS issuer和TQX同意页Web配置。不要求用户配后台中间件：
本机Trading SDK base是http://127.0.0.1:8102，OAuth API audience是8102/api，
Web generic API走Java18080；这些互不替代，也不传给helper或直接接收MCP bearer。
test/prod后台值不猜测。认证/TLS/resource/issuer/scope按原服务及原客户端正常校验。

如需生成source，先把第6节selector保存为tqx-environment-source.mjs并node --check。
--plan只展示有效配置/模板，不联网、不安装、不登录。可完全不传环境和地址，或只覆盖
需要的值。--config可读取代理根据原公开连接整理的JSON（environment/resource/issuer/
webOrigin/server/plugin/marketplace/version），不是任何私有凭据文件：

```text
node <SELECTOR_PATH>/tqx-environment-source.mjs --plan
node <SELECTOR_PATH>/tqx-environment-source.mjs --config <PUBLIC_CONNECTION_JSON> --environment test --mcp-url <OPTIONAL_OVERRIDE_MCP_URL> --plan
node <SELECTOR_PATH>/tqx-environment-source.mjs --environment prod --plan
```

不需要的覆盖参数整项省略，不把占位符作为真实URL。已有server/plugin/marketplace/version
可原样传入；没有时selector建议按环境和endpoint摘要生成独立source名，这只是新源的
默认命名，不是现有连接/认证迁槽要求。deployment-binding.json仅用于显示和比对，
缺少此新文件或有配置差异不拒绝旧连接，也不要求旧插件升到0.3.0。

## 2. 已有可用插件先复用；仅需要时生成并安装source

已存在的正常连接不因本文而重装。实际source生成用--output-dir <SOURCE>替代--plan；
可用相对或绝对路径，目录可已存在。匹配文件复用，冲突文件保留并在目录下生成独立
子source；以成功事件返回的实际source路径为准，不删除原物、不编辑cache。
--config及本次覆盖值与计划阶段一致：

```text
node <SELECTOR_PATH>/tqx-environment-source.mjs --output-dir <SOURCE>
node <SELECTOR_PATH>/tqx-environment-source.mjs --config <PUBLIC_CONNECTION_JSON> --environment test --output-dir <SOURCE>
```

tqx_environment_source_generated事件明确installed=false/loginStarted=false；仅是文件
生成，不是已安装/已授权。下面是默认local新源结构；实际按有效配置/原alias生成，
source版本0.3.0不表示原插件要升级、软件已发布或远程部署已验证：

<SOURCE>/.agents/plugins/marketplace.json：

```json
{
  "name": "tqx-local-9452162a76bd5e0ce5e9e2f0a6cf7c48-market",
  "interface": {
    "displayName": "TQX local Plugins"
  },
  "plugins": [
    {
      "name": "tqx-local-9452162a76bd5e0ce5e9e2f0a6cf7c48-plugin",
      "source": {
        "source": "local",
        "path": "./plugins/tqx-local-9452162a76bd5e0ce5e9e2f0a6cf7c48-plugin"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

<SOURCE>/plugins/<PLUGIN_NAME>/plugin.json：

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "tqx-local-9452162a76bd5e0ce5e9e2f0a6cf7c48-plugin",
  "version": "0.3.0",
  "description": "Connect the explicitly selected TQX local MCP environment using your own Agent consent.",
  "author": {
    "name": "TQX"
  },
  "extensions": {
    "com.openai": {
      "requires_local_executor": true,
      "interface": {
        "displayName": "TQX Trading local",
        "shortDescription": "TQX account and positions",
        "longDescription": "Selected local deployment only. Preserve actual PAPER/LIVE mode and freshness. Begin with account and positions; accepted writes are not fills.",
        "developerName": "TQX",
        "category": "Productivity",
        "capabilities": ["Read", "Write"],
        "defaultPrompt": "Read my authorized Agent account and positions in this selected environment. Do not place, modify or cancel orders. Do not use another connection."
      }
    }
  }
}
```

<SOURCE>/plugins/<PLUGIN_NAME>/mcp.json：

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "tqx-local-9452162a76bd5e0ce5e9e2f0a6cf7c48": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:3004/mcp"
    }
  }
}
```

两个portable $schema和bare type+url来自本机loader的已验证包格式：缺schema曾显示
local版本且忽略MCP；当前0.164.0-alpha.11.1添加直接scopes/auth扩展也会被忽略。
这是客户端协议兼容要求，不是新部署政策。保留已有正常包/配置，不将新模板强加给它。

安装新源时只执行缺少步骤，使用实际事件中的SOURCE/PLUGIN_NAME/MARKETPLACE_NAME/
SERVER_NAME或已选原alias，不覆盖其它插件、配置或票据；当前命令是plugin add：

```text
codex plugin marketplace add <SOURCE> --json
codex plugin add <PLUGIN_NAME>@<MARKETPLACE_NAME> --json
codex plugin list --json
codex mcp get <SERVER_NAME> --json
codex mcp list --json
```

检查实际加载状态/目标URL，展示差异，按原流程处理；安装不等于已授权。先检查当前
认证，再决定是否需要本人OAuth。新增selector不校验/拒绝部署环境URL形状；认证时
仍由原客户端/服务校验。以下helper的安全检查来自此前已完成实现，保持不变。

## 3. 先检查当前认证；未登录先完成 OAuth，不能提前创建验证会话

安装核对后运行 `codex mcp list --json`，精确找到所选插件、selected binding/URL 匹配的 `SERVER_NAME`，
检查其 `auth_status`，不要混用其他服务的状态：

- `not_logged_in`：先进入下面的 OAuth 流程；此时**禁止先创建第 4 步验证会话**。
- 明确报告已登录的 OAuth 状态，且没有 scope 升级需求：跳过 login，到第 4 步
  优先验证复用；若客户端能自行刷新旧票，让正常客户端处理，不手改票据。
- `unknown`、`unsupported`、字段缺失或其他不能确认 OAuth 有效的状态：不能当作
  已登录，也不先建验证会话碰运气。核对当前 CLI 能力和服务发现，明确缺项；确认
  需要且支持 OAuth 后才发起登录，否则报告认证检查未完成。

工具未加载不直接等于认证失效；检查认证状态与检查会话加载是两个阶段。scope 升级
必须重新获得真人同意。对需要登录的服务，先检查是否已有仍运行的同一 OAuth
进程／事务：有则保留原进程并继续其真实入口，**不并发登录**。已超时退出、callback
已关闭的旧链接不能复用；确需重试时只发起一个新事务。

使用第1节实际选用的 `SERVER_NAME`，保留已有正常alias，不因环境标签换认证槽。确需新登录且用户准备好后，使用本文件第 5 节内嵌的完整
Node helper：在用户可写目录生成 `tqx-callback-login.mjs`；代码相同时复用，不依赖
作者仓库、Bun、npm 包或相邻文件。找到 Node 22.18+（可用已有受支持 bundled Node），
并用 `node --check` 检查生成文件。不要改已安装插件 manifest 或全局 callback 配置。

helper 的 `EXACT_ISSUER`/`VERIFIED_WEB_ORIGIN` 使用原正常连接或本次显式覆盖的有效值。
以下nonce/state/iss/单事务、PKCE和URL验证来自此前helper实现，不是新环境部署门槛；
不因此拒绝原应用启动或强制修改原配置。使用结构化参数：

```text
node <HELPER_PATH>/tqx-callback-login.mjs --server <SERVER_NAME> --mcp-url <MCP_URL> --issuer <EXACT_ISSUER> --web-origin <VERIFIED_WEB_ORIGIN> --timeout-seconds 300
```

helper 使用已验证的公开 `codex mcp login --no-browser` 及仅本 child 的 `-c` callback
覆盖，显式请求 `trade:read,order:write`，不让 CLI 自动打开原 authorize URL。它只
begin 一次并给出真正 TQX 同意页；不要另打开原 authorize URL 创建第二事务。
保留 helper 和其 CLI child；版本或既有URL不被helper支持时报告该helper能力限制，保留原受支持客户端认证路径；
不能据此拒绝原部署/要求搬票，也不声称原生回调已具备品牌完成页。

读取 helper 的 `awaiting_user_consent` 事件后，必须用允许
的浏览器能力**实际打开其 consentUrl 新授权页**并告知用户；无法打开时，在当前用户的私有聊天
提供明确可点击的当次入口，只请其完成该页面的选择与确认。不能只在后台等待，让
用户自行猜测要去哪里授权；进行中事务也按同样方式交付其仍有效的入口。

打开页面后确认实际可见的授权入口；无法观察页面时如实说明，并交付可点击链接。
随后**必须使用宿主当前可用的用户提问／交接能力**提出一个明确问题，例如：
「请在此页选择你的 Agent 并批准权限；完成后回复『已授权』。如果没有看到页面，
请选择『未看到入口』；不准备继续可选『暂不授权』。」至少提供这三个回答状态；
没有专用提问工具时，也要在对话中明确提出该问题并交接，不能只说正在等待后失联。
任务此时标为「待本人操作」，不给最终成功／失败报告，不提前创建验证会话，也不因
本轮交接而主动终止原 CLI。允许为等待用户而暂停本轮，但必须说明原登录进程有
超时限制：不承诺无限后台等待，也不承诺没有用户输入就会自动唤醒继续。

用户答复后先读取**原 helper／CLI**的真实状态：『已授权』只是继续检查的信号，
仍须 helper 的 `login_finished` 明确 `status=succeeded`、`cliExitCode=0` 且进程成功
结束才可验证；『未看到入口』则检查原事务是否仍有效，重新展示／打开该次入口，
不并发新登录；『暂不授权』则尊重取消，说明授权未完成，不自动重试。原进程真实
超时、取消或非零退出时如实告知，并给一个最小恢复动作（例如用户准备好后重新
发起一次登录并打开新链接），不能静默失联、复用失效链接或重复启动多个进程。

**只有真人选择其账户自己的 Agent 并批准权限；代理不代签、不自动批准、不用 fixture
身份替代。** 在明确隔离测试场景，用户可以选择其测试账号自己的 Agent，不选他人
Agent。不操作密码、认证弹窗或安全权限，不用 computer use 绕过当前技能的桌面 UI
限制。网页批准后 Codex 自动接回调；不交换／改写 code、state、iss，不读写私有票据
伪造联通，不复制其他连接的 token。授权入口仅交付当前用户，不写入公开日志，
不公开回调参数或秘密。

申请应精确包含 `trade:read`、`order:write`。当前 AS 还公布研究等其他 scope，不能以
默认 GUI 登录推断已正确限权；只记录观察到的非敏感 scope/resource/PKCE 字段，额外
scope 需先核对，不自动批准。等待真人时只给这一个待确认动作，其余独立工作继续。
保持原登录进程等待完成，不能因为页面已打开／已点击就报告登录成功。**首次登录
必须等到实际 CLI 退出码为 0、helper 明确成功后，才允许进入第 4 步并创建插件验证会话。**
仍在等待时报告「等待本人完成授权」，不创建验证会话；非零退出或超时则报告该次
OAuth 未完成，核对原因后再给最小下一步，不重复发起一批登录。

## 4. 在实际插件会话调用账户和持仓，完成后简短回报

进入条件：第 3 步已明确识别可复用的当前 OAuth 登录状态，或本次 OAuth CLI 已成功
退出 0。`not_logged_in`、认证未知或仍在等待同意时，不能执行本步骤。若此前已提前
创建过验证会话，把它标记为「认证前验证未完成」，回到第 3 步完成授权；不要把工具
缺失留给用户自行猜测，也不将那个会话计为验证成功。

精确插件引用使用第1节所选 `PLUGIN_REF=plugin://<PLUGIN_NAME>@<MARKETPLACE_NAME>`；
保留既有插件时使用其原引用，例如 `[TQX Trading Local](plugin://tqx-trading-local@tqx-local)`。
不因发现失败切到另一个环境、插件或直连。
优先通过当前公开支持的宿主能力重载；若暴露 `config/mcpServer/reload` 才可使用，
不探测私有 socket／隐藏 API。当前 MCP 页的 Restart 会 stop host，只有无活动任务且
服务已持久运行时由用户使用；不擅自重启桌面、中断服务或停止其他任务。

当前聊天没加载插件时，按开场授权，用受支持能力创建**一个新的本地只读验证会话**，
选择上述插件并发出：「读取我授权 Agent 的账户和持仓，显示实际模式和数据时间；
不要下单、改单或撤单；插件工具缺失时报告缺失，不使用其他连接替代。」仅为此验证
创建会话，不发其他任务或消息。无该能力时可用受支持、同用户 profile 的新 CLI
会话实调并明确验证的是 CLI；若目标桌面仍待新会话，不能声称桌面已加载。只能由
用户开新聊天时，只给这一项清晰操作，不再次要求配置／登录。

通过该插件实际调用 `getAccount` 和 `listPositions`，保留真实模式、时间、decimal
字符串、null 和空持仓。不调用任何写工具。核对调用归属为所选插件的 `SERVER_NAME` 及所选resource；`tqx_local`
直连、无关私有 app-server、原始 HTTP、工具清单或 `mcp get` 均不能代替此验证。

只有**安装正确、本人 OAuth 有效、实际插件只读调用成功**才报告完成，附插件 ID、
目标 URL、实际验证的会话／surface 及两项结果；不公开秘密或不必要账户标识。
缺 endpoint、待本人同意、待新会话／重载或工具尚未实际调用时，准确报告当前阶段
及唯一需要的下一步。始终区分本地 host 插件成功和云端 URL／Tunnel 表单成功。

官方依据：[插件包／本地市场](https://developers.openai.com/plugins/build/plugins)、
[CLI](https://learn.chatgpt.com/docs/cli/reference)、
[MCP 重载](https://learn.chatgpt.com/docs/app-server)。

## 5. 完整自足 helper（保存为 tqx-callback-login.mjs）

以下 JavaScript 与本次实际 Node 探针通过的 helper 一致，只导入 Node 内置模块。
源码路径注释不是文件依赖；不要另下载未发布源码，不读写 Codex 私有票据或调用隐藏 API。
它只监听 127.0.0.1 随机端口，注册 /tqx/codex/callback/<32位随机hex>；路径只是展示
协商，不是信任证据。回调按 Host/Origin/nonce/state/iss/单参数检查，只投递一次原 URL
给自有 CLI 的公开 stdin。原生 CLI 自己验证、PKCE 换票和保存；确实 exit 0 后才 303
回真正 AS 302 所绑定的同一次 TQX consent tx。拒绝／失败／未知／超时没有成功跳转，
错误页用 TQX 黑黄样式且不回显 code/state/秘密。一次投递之后结果不确定时不自动重试。

helper 默认最多等待 300 秒（CLI 可更早结束），不会无限常驻。只在必要的新授权中运行；
已有有效授权先复用，不为了体验测试而替换现有 grant。Web 页面恢复的 AS issued、CLI
exit 0 和第 4 步插件实际读取是三项独立证据，不能相互冒充。

```javascript
// packages/mcp-server/integrations/codex/callback-login.ts
import assert3 from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// packages/mcp-server/integrations/codex/callback-proxy.ts
import assert from 'node:assert/strict'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
function trustedServiceUrl(value, path) {
  assert(value && !/[\s\\]/.test(value), 'Invalid service URL')
  const url = new URL(value)
  assert.equal(
    value.split('://')[1]?.split('/')[0],
    url.host,
    'Service authority must be canonical',
  )
  assert(
    !url.username && !url.password && !url.search && !url.hash,
    'Service URL must not contain secrets or extra components',
  )
  assert(
    url.protocol === 'https:' ||
      (url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port),
    'Use HTTPS or explicit 127.0.0.1 loopback HTTP',
  )
  if (path !== undefined) assert.equal(url.pathname, path)
  return url
}
function equalSecret(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
function validateConsentLocation(raw, webOrigin) {
  const url = new URL(raw)
  assert.equal(url.origin, webOrigin, 'Unexpected consent origin')
  assert.equal(url.pathname, '/oauth/consent', 'Unexpected consent path')
  assert(!url.username && !url.password && !url.hash)
  assert.deepEqual(
    [...url.searchParams.keys()],
    ['tx'],
    'Consent return URL must contain only its transaction',
  )
  assert(
    /^[A-Za-z0-9._-]{1,256}$/.test(url.searchParams.get('tx') ?? ''),
    'Invalid consent transaction',
  )
  return raw
}
function validateAuthorizationUrl(raw, options) {
  const url = new URL(raw)
  assert.equal(url.origin, new URL(options.issuer).origin)
  assert.equal(url.pathname, '/oauth/authorize')
  assert(!url.username && !url.password && !url.hash)
  for (const key of [
    'redirect_uri',
    'resource',
    'scope',
    'state',
    'code_challenge',
    'code_challenge_method',
  ])
    assert.equal(url.searchParams.getAll(key).length, 1, 'Ambiguous authorization parameters')
  assert.deepEqual(
    url.searchParams.getAll('redirect_uri'),
    [options.redirectUri],
    'CLI did not preserve the proxy callback',
  )
  assert.deepEqual(url.searchParams.getAll('resource'), [options.resource])
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert(url.searchParams.get('code_challenge'))
  assert.deepEqual(
    (url.searchParams.get('scope') ?? '').split(' ').sort(),
    [...options.scopes].sort(),
  )
  const state = url.searchParams.get('state')
  assert(state.length > 0 && state.length <= 1024, 'Invalid authorization state')
  return state
}
function validateCallback(request, options) {
  assert.equal(request.method, 'GET')
  assert.equal(request.hostCount, 1)
  assert.equal(request.host, new URL(options.outerOrigin).host)
  assert(request.originCount <= 1)
  if (request.origin !== undefined)
    assert(
      [options.webOrigin, new URL(options.issuer).origin].includes(request.origin),
      'Unexpected callback Origin',
    )
  assert(
    request.target.startsWith('/') &&
      !request.target.startsWith('//') &&
      request.target.length <= 8192,
  )
  const url = new URL(request.target, options.outerOrigin)
  assert.equal(url.origin, options.outerOrigin)
  assert.equal(url.pathname, options.path)
  assert(!url.hash)
  const keys = [...url.searchParams.keys()]
  assert.equal(new Set(keys).size, keys.length, 'Duplicate callback parameters')
  assert(
    keys.every((key) =>
      ['code', 'state', 'iss', 'error', 'error_description', 'error_uri'].includes(key),
    ),
  )
  assert.deepEqual(url.searchParams.getAll('iss'), [options.issuer], 'Issuer mismatch')
  const state = url.searchParams.get('state')
  assert(state !== null && equalSecret(state, options.state), 'State mismatch')
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  assert(
    (Boolean(code) && error === null) || (Boolean(error) && code === null),
    'Callback needs exactly one code or error',
  )
  if (code !== null)
    assert(!url.searchParams.has('error_description') && !url.searchParams.has('error_uri'))
  return { denied: error === 'access_denied', error: error !== null }
}
function headers(response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Connection', 'close')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  )
}
function failurePage(response, status) {
  if (response.destroyed || response.writableEnded) return
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TQX</title><style>body{background:#0a0a0a;color:#f5f5f5;font:16px system-ui;padding:8vh 8vw}main{max-width:36rem;margin:auto;border:1px solid #303030;border-radius:16px;padding:2rem}h1{color:#f5c542;letter-spacing:.12em}p{color:#b8b8b8;line-height:1.7}</style><main><h1>TQX</h1><p>&#36830;&#25509;&#32467;&#26524;&#26410;&#30830;&#35748;&#12290;</p><p>&#35831;&#36820;&#22238;&#21407; TQX &#39029;&#38754;&#26680;&#23545;&#65292;&#19981;&#35201;&#37325;&#22797;&#21457;&#36215;&#30331;&#24405;&#12290;</p></main></html>',
  )
}
async function createCallbackProxy(options) {
  assert(options.timeoutMs >= 1000 && options.timeoutMs <= 600000)
  trustedServiceUrl(options.issuer, '/')
  assert.equal(trustedServiceUrl(options.webOrigin, '/').origin, options.webOrigin)
  const path = `/tqx/codex/callback/${randomBytes(16).toString('hex')}`
  let outerOrigin = ''
  let state
  let consentUrl
  let forwarded = false
  let outcome
  let activeResponse
  let resolveCompletion
  const completion = new Promise((resolve) => {
    resolveCompletion = resolve
  })
  const lifetime = new AbortController()
  const finish = (status, cliExitCode) => {
    if (outcome) return
    outcome = {
      status,
      cliExitCode,
      forwarded,
    }
    resolveCompletion(outcome)
  }
  const timer = setTimeout(() => {
    lifetime.abort()
    if (activeResponse) failurePage(activeResponse, 504)
    finish(forwarded ? 'unknown' : 'timed_out', null)
  }, options.timeoutMs)
  const handle = async (request, response) => {
    headers(response)
    if (outcome || forwarded) {
      failurePage(response, 409)
      return
    }
    if (!state || !consentUrl) {
      failurePage(response, 503)
      return
    }
    let denied
    let errorCallback
    try {
      const result = validateCallback(
        {
          method: request.method,
          target: request.url ?? '',
          host: request.headers.host,
          hostCount: request.rawHeaders.filter(
            (_, index) => index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === 'host',
          ).length,
          origin: request.headers.origin,
          originCount: request.rawHeaders.filter(
            (_, index) => index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === 'origin',
          ).length,
        },
        { outerOrigin, path, state, issuer: options.issuer, webOrigin: options.webOrigin },
      )
      denied = result.denied
      errorCallback = result.error
    } catch {
      failurePage(response, 400)
      return
    }
    forwarded = true
    activeResponse = response
    try {
      await options.deliverCallback(`${outerOrigin}${request.url}`)
      if (errorCallback) {
        const code = await options.waitForCliExit()
        if (outcome) return
        failurePage(response, denied ? 400 : 502)
        finish(denied ? 'denied' : code === null ? 'unknown' : 'failed', code)
        return
      }
      const code = await options.waitForCliExit()
      if (outcome) return
      if (!denied && code === 0) {
        response.writeHead(303, { Location: consentUrl })
        response.end()
        finish('succeeded', code)
      } else {
        failurePage(response, denied ? 400 : 502)
        finish(denied ? 'denied' : code === null ? 'unknown' : 'failed', code)
      }
    } catch {
      failurePage(response, 502)
      finish('unknown', null)
    } finally {
      activeResponse = undefined
    }
  }
  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      failurePage(response, 502)
      finish('unknown', null)
    })
  })
  server.headersTimeout = 5000
  server.requestTimeout = 1e4
  server.keepAliveTimeout = 1000
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    assert(address && typeof address === 'object')
    outerOrigin = `http://127.0.0.1:${address.port}`
  } catch (error) {
    clearTimeout(timer)
    throw error
  }
  let closed = false
  return {
    redirectUri: `${outerOrigin}${path}`,
    completion,
    bind(expectedState, originalConsentUrl) {
      assert(!state && !outcome && expectedState.length > 0 && expectedState.length <= 1024)
      consentUrl = validateConsentLocation(originalConsentUrl, options.webOrigin)
      state = expectedState
    },
    cliExited(code) {
      if (!forwarded) finish('failed', code)
    },
    cancel() {
      lifetime.abort()
      if (activeResponse) failurePage(activeResponse, 503)
      finish(forwarded ? 'unknown' : 'cancelled', null)
    },
    async close() {
      if (closed) return
      closed = true
      clearTimeout(timer)
      lifetime.abort()
      state = undefined
      consentUrl = undefined
      await new Promise((resolve) => {
        const force = setTimeout(() => {
          server.closeAllConnections()
        }, 1000)
        server.close(() => {
          clearTimeout(force)
          resolve()
        })
        server.closeIdleConnections()
      })
    },
  }
}

// packages/mcp-server/integrations/codex/owned-process.ts
import assert2 from 'node:assert/strict'
function exited(child) {
  return !child.pid || child.exitCode !== null || child.signalCode !== null
}
async function waitForExit(child, milliseconds) {
  const deadline = Date.now() + milliseconds
  while (!exited(child) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 25))
}
async function closeOwnedProcess(child) {
  if (!exited(child)) {
    child.stdin.end()
    await waitForExit(child, 1500)
  }
  if (!exited(child)) {
    child.kill()
    await waitForExit(child, 1500)
  }
  assert2(exited(child), 'Owned client process did not exit; stop acceptance and inspect its PID')
  child.stdin.destroy()
  child.stdout.destroy()
  child.stderr.destroy()
  child.unref()
}

// packages/mcp-server/integrations/codex/callback-login.ts
function boundedExit(exit, milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), milliseconds)
    exit.then((code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}
async function startCallbackLogin(options) {
  assert3(/^[A-Za-z0-9_-]{1,64}$/.test(options.server), 'Invalid server name')
  trustedServiceUrl(options.resource, '/mcp')
  trustedServiceUrl(options.issuer, '/')
  assert3.equal(trustedServiceUrl(options.webOrigin, '/').origin, options.webOrigin)
  const timeoutMs = options.timeoutMs ?? 300000
  assert3(timeoutMs >= 1e4 && timeoutMs <= 600000, 'Timeout must be 10 to 600 seconds')
  const metadataResponse = await fetch(
    new URL('/.well-known/oauth-authorization-server', options.issuer),
    { redirect: 'manual', signal: AbortSignal.timeout(5000) },
  )
  assert3.equal(metadataResponse.status, 200, 'Authorization metadata unavailable')
  const metadata = await metadataResponse.json()
  assert3.equal(metadata.issuer, options.issuer, 'Metadata issuer mismatch')
  assert3.equal(
    metadata.authorization_response_iss_parameter_supported,
    true,
    'Issuer-bound callbacks are required',
  )
  assert3.equal(metadata.authorization_endpoint, new URL('/oauth/authorize', options.issuer).href)
  let resolveExit
  const exit = new Promise((ok) => {
    resolveExit = ok
  })
  const proxy = await createCallbackProxy({
    issuer: options.issuer,
    webOrigin: options.webOrigin,
    timeoutMs,
    waitForCliExit: () => boundedExit(exit, 15000),
    deliverCallback: (originalCallbackUrl) =>
      new Promise((ok, fail) => {
        child.stdin.write(
          `${originalCallbackUrl}
`,
          (error) => (error ? fail(new Error('CLI callback input failed')) : ok()),
        )
      }),
  })
  let output = ''
  let exited = false
  const child = spawn(
    options.codexBinary ?? 'codex',
    [
      '-c',
      `mcp_oauth_callback_url=${JSON.stringify(proxy.redirectUri)}`,
      'mcp',
      'login',
      options.server,
      '--scopes',
      'trade:read,order:write',
      '--oauth-client-registration',
      'auto',
      '--no-browser',
    ],
    {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: 'pipe',
      windowsHide: true,
    },
  )
  const onExit = (code) => {
    if (exited) return
    exited = true
    resolveExit(code)
    proxy.cliExited(code)
  }
  child.once('exit', onExit)
  child.once('error', () => onExit(null))
  child.stdin.on('error', () => onExit(null))
  const collect = (chunk) => {
    output = (output + chunk.toString()).slice(-262144)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  let cleanupTask
  const cleanup = () => {
    cleanupTask ??= (async () => {
      output = ''
      child.stdout.off('data', collect)
      child.stderr.off('data', collect)
      child.stdout.resume()
      child.stderr.resume()
      try {
        await closeOwnedProcess(child)
      } finally {
        await proxy.close()
      }
    })()
    return cleanupTask
  }
  try {
    let authorization
    const deadline = Date.now() + Math.min(timeoutMs, 25000)
    while (Date.now() < deadline) {
      if (exited) break
      for (const candidate of output.match(/https?:\/\/[^\s<>"]+/g) ?? []) {
        try {
          const url = new URL(candidate)
          if (
            url.origin === new URL(options.issuer).origin &&
            url.pathname === '/oauth/authorize'
          ) {
            authorization = url
            break
          }
        } catch {}
      }
      if (authorization) break
      await new Promise((ok) => setTimeout(ok, 25))
    }
    assert3(authorization, 'CLI authorization URL unavailable')
    const state = validateAuthorizationUrl(authorization.href, {
      issuer: options.issuer,
      resource: options.resource,
      redirectUri: proxy.redirectUri,
      scopes: ['trade:read', 'order:write'],
    })
    const begin = await fetch(authorization, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    assert3.equal(begin.status, 302, 'Authorization begin did not return consent')
    const location = begin.headers.get('location')
    await begin.body?.cancel()
    assert3(location)
    const consentUrl = validateConsentLocation(location, options.webOrigin)
    assert3(!exited, 'CLI exited before the consent handoff')
    proxy.bind(state, consentUrl)
    output = ''
    const completion = (async () => {
      try {
        return await proxy.completion
      } finally {
        await cleanup()
      }
    })()
    return {
      consentUrl,
      maximumWaitSeconds: Math.floor(timeoutMs / 1000),
      completion,
      async cancel() {
        proxy.cancel()
        return completion
      },
    }
  } catch {
    proxy.cancel()
    await cleanup()
    throw new Error(
      'TQX callback login could not start; no credential or callback details are logged',
    )
  }
}
async function main() {
  const values = new Map()
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    assert3(
      [
        '--server',
        '--mcp-url',
        '--issuer',
        '--web-origin',
        '--timeout-seconds',
        '--codex-bin',
      ].includes(key) &&
        !values.has(key) &&
        args[index + 1],
      'Invalid helper arguments',
    )
    values.set(key, args[index + 1])
  }
  const get = (key) => {
    const value = values.get(key)
    assert3(value, `Missing ${key}`)
    return value
  }
  const timeoutMs = Number(values.get('--timeout-seconds') ?? '300') * 1000
  const login = await startCallbackLogin({
    server: get('--server'),
    resource: get('--mcp-url'),
    issuer: get('--issuer'),
    webOrigin: get('--web-origin'),
    timeoutMs,
    ...(values.has('--codex-bin') ? { codexBinary: values.get('--codex-bin') } : {}),
  })
  const interrupt = () => {
    login.cancel()
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    console.log(
      JSON.stringify({
        event: 'awaiting_user_consent',
        consentUrl: login.consentUrl,
        maximumWaitSeconds: login.maximumWaitSeconds,
      }),
    )
    const result = await login.completion
    console.log(JSON.stringify({ event: 'login_finished', ...result, pluginReadVerified: false }))
    if (result.status !== 'succeeded') process.exitCode = 1
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
  }
}
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main().catch(() => {
    console.error(
      'TQX login helper failed; connection is not confirmed. No automatic retry was started.',
    )
    process.exitCode = 1
  })
}
export { startCallbackLogin }
```

## 6. 完整自足兼容selector（保存为tqx-environment-source.mjs）

只合并显式/已有/默认公开配置并生成source，不联网、不操作认证profile。原helper代码
在第5节逐字保留；selector不代替原客户端/服务认证校验，也不引入部署环境启动政策。

```javascript
// packages/mcp-server/integrations/codex/deployment-environment.ts
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
var LOCAL_DEPLOYMENT = {
  resource: 'http://127.0.0.1:3004/mcp',
  issuer: 'http://127.0.0.1:26825',
  webOrigin: 'http://127.0.0.1:3000',
}
function resolveDeployment(input = {}, current = {}) {
  const environment = input.environment?.trim() || current.environment?.trim() || 'local'
  const tuple = {
    environment,
    resource: input.resource || current.resource || LOCAL_DEPLOYMENT.resource,
    issuer: input.issuer || current.issuer || LOCAL_DEPLOYMENT.issuer,
    webOrigin: input.webOrigin || current.webOrigin || LOCAL_DEPLOYMENT.webOrigin,
  }
  const endpointId = createHash('sha256').update(JSON.stringify(tuple)).digest('hex').slice(0, 32)
  const label =
    environment
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 8) || 'local'
  const suggested = `tqx-${label}-${endpointId}`
  const server = input.server || current.server || suggested
  return {
    schemaVersion: 1,
    ...tuple,
    endpointId,
    server,
    plugin: input.plugin || current.plugin || `${suggested}-plugin`,
    marketplace: input.marketplace || current.marketplace || `${suggested}-market`,
    version: input.version || current.version || '0.3.0',
    valueSources: Object.fromEntries(
      ['environment', 'resource', 'issuer', 'webOrigin'].map((key) => [
        key,
        input[key] ? 'explicit' : current[key] ? 'existing-public-config' : 'local-default',
      ]),
    ),
  }
}
function compareDeploymentBinding(selected, existing) {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing))
    return { bindingAvailable: false, differences: [] }
  const binding = existing
  const differences = []
  for (const key of [
    'environment',
    'resource',
    'issuer',
    'webOrigin',
    'server',
    'plugin',
    'marketplace',
    'version',
  ])
    if (binding[key] !== undefined && binding[key] !== selected[key]) differences.push(key)
  return { bindingAvailable: true, differences }
}
function deploymentFiles(binding) {
  const { plugin, marketplace, server, resource, environment, version } = binding
  return {
    marketplace: {
      name: marketplace,
      interface: { displayName: `TQX ${environment} Plugins` },
      plugins: [
        {
          name: plugin,
          source: { source: 'local', path: `./plugins/${plugin}` },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
      ],
    },
    plugin: {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: plugin,
      version,
      description: `Connect the explicitly selected TQX ${environment} MCP environment using your own Agent consent.`,
      author: { name: 'TQX' },
      extensions: {
        'com.openai': {
          requires_local_executor: true,
          interface: {
            displayName: `TQX Trading ${environment}`,
            shortDescription: 'TQX account and positions',
            longDescription: `Selected ${environment} deployment only. Preserve actual PAPER/LIVE mode and freshness. Begin with account and positions; accepted writes are not fills.`,
            developerName: 'TQX',
            category: 'Productivity',
            capabilities: ['Read', 'Write'],
            defaultPrompt:
              'Read my authorized Agent account and positions in this selected environment. Do not place, modify or cancel orders. Do not use another connection.',
          },
        },
      },
    },
    mcp: {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { [server]: { type: 'streamable-http', url: resource } },
    },
  }
}
async function writeDeploymentSource(directory, binding) {
  let source = resolve(directory)
  const files = deploymentFiles(binding)
  const relativeFiles = [
    ['.agents/plugins/marketplace.json', files.marketplace],
    [`plugins/${binding.plugin}/plugin.json`, files.plugin],
    [`plugins/${binding.plugin}/mcp.json`, files.mcp],
    ['deployment-binding.json', binding],
  ]
  await mkdir(source, { recursive: true })
  for (const [name, value] of relativeFiles) {
    try {
      const previous = JSON.parse(await readFile(resolve(source, name), 'utf8'))
      const actual = { ...previous }
      const expected = { ...value }
      if (name === 'deployment-binding.json') {
        delete actual.valueSources
        delete expected.valueSources
      }
      if (!isDeepStrictEqual(actual, expected)) {
        source = await mkdtemp(resolve(source, 'tqx-source-'))
        break
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        source = await mkdtemp(resolve(source, 'tqx-source-'))
        break
      }
    }
  }
  const pluginDirectory = resolve(source, 'plugins', binding.plugin)
  await mkdir(resolve(source, '.agents', 'plugins'), { recursive: true })
  await mkdir(pluginDirectory, { recursive: true })
  const save = async (path, value) => {
    try {
      await writeFile(
        path,
        `${JSON.stringify(value, null, 2)}
`,
        { flag: 'wx' },
      )
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
  await save(resolve(source, '.agents', 'plugins', 'marketplace.json'), files.marketplace)
  await save(resolve(pluginDirectory, 'plugin.json'), files.plugin)
  await save(resolve(pluginDirectory, 'mcp.json'), files.mcp)
  await save(resolve(source, 'deployment-binding.json'), binding)
  return source
}
async function main() {
  const values = new Map()
  let plan = false
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index++) {
    const key = args[index]
    if (key === '--plan') {
      assert(!plan)
      plan = true
      continue
    }
    assert(
      [
        '--environment',
        '--mcp-url',
        '--issuer',
        '--web-origin',
        '--server',
        '--plugin',
        '--marketplace',
        '--version',
        '--config',
        '--output-dir',
      ].includes(key) &&
        !values.has(key) &&
        args[index + 1],
      'Invalid deployment arguments',
    )
    values.set(key, args[++index])
  }
  const current = values.has('--config')
    ? JSON.parse(await readFile(values.get('--config'), 'utf8'))
    : {}
  const binding = resolveDeployment(
    {
      environment: values.get('--environment'),
      ...(values.has('--mcp-url') ? { resource: values.get('--mcp-url') } : {}),
      ...(values.has('--issuer') ? { issuer: values.get('--issuer') } : {}),
      ...(values.has('--web-origin') ? { webOrigin: values.get('--web-origin') } : {}),
      ...(values.has('--server') ? { server: values.get('--server') } : {}),
      ...(values.has('--plugin') ? { plugin: values.get('--plugin') } : {}),
      ...(values.has('--marketplace') ? { marketplace: values.get('--marketplace') } : {}),
      ...(values.has('--version') ? { version: values.get('--version') } : {}),
    },
    current,
  )
  if (plan || !values.has('--output-dir')) {
    console.log(
      JSON.stringify({
        event: 'tqx_environment_plan',
        binding,
        files: deploymentFiles(binding),
        installed: false,
      }),
    )
    return
  }
  const output = values.get('--output-dir')
  const source = await writeDeploymentSource(output, binding)
  console.log(
    JSON.stringify({
      event: 'tqx_environment_source_generated',
      source,
      binding,
      pluginRef: `plugin://${binding.plugin}@${binding.marketplace}`,
      installed: false,
      loginStarted: false,
    }),
  )
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error(
      'TQX source generation could not complete; check command syntax and source files. Existing connections were not changed.',
    )
    process.exitCode = 1
  })
export {
  LOCAL_DEPLOYMENT,
  compareDeploymentBinding,
  deploymentFiles,
  resolveDeployment,
  writeDeploymentSource,
}
```
