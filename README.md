# TQX Agent Toolkit

Connect AI agents to TQX for quantitative research and trading through the CLI, TypeScript SDK, and agent plugins.

## Installation

**Using an AI agent?** Give it this instruction:

> Read https://raw.githubusercontent.com/tqx-ai/tqx-ts/refs/heads/main/INSTALL.md and install the TQX CLI.

[INSTALL.md](./INSTALL.md) is the step-by-step install, update, and troubleshooting protocol written for agents.

The standalone CLI binary does not require Node.js. The npm distribution requires Node.js 22.18 or newer.

Install the CLI from the latest standalone release (recommended for agents and servers):

1. Download the asset for your operating system and CPU architecture from the
   [latest GitHub Release](https://github.com/tqx-ai/tqx-ts/releases/latest).
   Each binary also has a gzip-compressed `.gz` asset that is less than half the download size;
   decompress it (for example with `gunzip`) to get the same binary.
2. Put the binary on your `PATH` as `tqx` (`tqx.exe` on Windows).
3. Verify the installation:

```bash
tqx --version
```

If a standalone binary is not available for your platform, or Node.js is already part of your
environment, install the CLI globally with npm:

```bash
npm install --global @tqx-ai/cli
tqx --version
```

Install the SDK in a Node.js project:

```bash
npm install @tqx-ai/sdk
```

## CLI

After installing the CLI, verify and store an API key:

```bash
tqx login --api-key=sk-example-xxxxxxxxxxxxxxxx
```

Passing a secret on the command line can save it in shell history. `TQX_API_KEY` can instead
provide a process-scoped credential and always takes precedence over persistent storage.

Credential lookup order is:

1. `TQX_API_KEY`
2. Bun's system keychain through `Bun.secrets`
3. `$XDG_CONFIG_HOME/tqx/credentials.json` or `~/.config/tqx/credentials.json`

`tqx login` keeps a key in the keychain only if it can read it back. When the keychain is
unavailable or rejects the read, the key is stored in the credentials file and the CLI prints a
warning on stderr. The warning is omitted in `--json` mode.

User API commands:

```text
tqx login --api-key=<key>
tqx logout
tqx status
tqx balance
tqx self-update
tqx self-update --check --json
# Install a specific release (including rollback)
tqx self-update --version=<version>
```

`tqx self-update` checks GitHub Releases and upgrades the current standalone binary or global package
installation. Automatic update checks run at most once every 24 hours before business commands;
they never upgrade without an explicit `tqx self-update`. Use `--check` for an agent-friendly version
check. Standalone updates support Windows x64, macOS x64/arm64, and Linux x64/arm64.
Automatic checks are skipped for `--json` and CI environments. Set `TQX_UPDATE_CHECK=0` (also accepts `false` or `no`) to disable background checks. Custom
`TQX_UPDATE_RELEASES_URL` sources are trusted input and must provide authentic metadata and
checksums.

Trading commands:

```text
tqx trading account [--currency=HKD|USD]
tqx trading hold
tqx trading positions [--symbol=<symbol>] [--market=HK|US] [--limit=<n>] [--cursor=<cursor>]
tqx trading orders list [--limit=<n>] [--cursor=<cursor>]
tqx trading orders get <order-id>
tqx trading orders place --symbol=<symbol> --side=BUY|SELL --quantity=<quantity> --yes \
  [--orderType=MARKET|LIMIT] [--price=<price>] [--reason=<reason>] [--timeInForce=DAY] [--idempotencyKey=<key>]
tqx trading orders modify <order-id> --price=<price>
tqx trading orders cancel <order-id>
tqx trading trades [--market=HK|US] [--orderId=<id>] [--limit=<n>] [--cursor=<cursor>]
tqx trading cash-flows [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--currency=<code>] [--limit=<n>] [--cursor=<cursor>]
tqx trading signals get <signal-id>
```

`cash-flows` lists the broker's cash ledger in each row's native currency with a signed `amount` (positive is an inflow). Fields the broker does not provide are `null`, never `0`. Channels that cannot provide a complete ledger fail with the API error `cash_flows_unsupported` (HTTP 501); an empty `items` list only means the channel is supported and has no rows in the range.

Order submission returns a signal response. Its `state=ACCEPTED` means the signal was accepted, not that the linked order was submitted or filled. The linked order lifecycle is reported separately through `order_status` when available and through `orders get` / `trades --orderId=<id>`; `accepted=true` from modify/cancel acknowledges only the operation request.

Research commands are a separate top-level branch and share the same API key store as trading:

```text
tqx research factor create
tqx research factor info <factor-id>
tqx research factor update <factor-id>
tqx research factor run <factor-id>
tqx research factor stop <analysis-id>
tqx research factor result <analysis-id>
tqx research factor list
tqx research factor delete <factor-id>...
tqx research strategy create
tqx research strategy info <strategy-id>
tqx research strategy update <strategy-id>
tqx research strategy run <strategy-id>
tqx research strategy stop <run-id>
tqx research strategy result <run-id>
tqx research strategy list
tqx research strategy delete <strategy-id>...
tqx research backtest list
tqx research backtest result <backtest-id>
```

`tqx login --api-key=<key>` is the canonical login entry. Configure the Qube gateway with the
build-time `TQX_BUILD_BASE_URL` or the runtime `TQX_BASE_URL`; both must include the `/tqxApi`
gateway prefix for research commands.
`tqx balance` also uses this gateway, rather than `TQX_BUILD_TRADING_BASE_URL`.

Qube Next uses ObjectId resource IDs, cursor pagination, and separate source/config revisions.
See the [migration guide](QUBE_NEXT_MIGRATION.md) for breaking changes and the new commands.

Backtest cost parameters are passed through as backend inputs: `commissionRate` is the raw
commission parameter value used by the backend, and `slippage` is applied proportionally to the
simulated fill price. The CLI does not reinterpret `commissionRate` as percent or basis points.

Human-readable output is colored by default. Use `--plain` for text without ANSI sequences or
`--json` for machine-readable JSON. The output flag can appear anywhere in a command. Help and
version support `--help`, `-H`, `-h`, `--version`, `-V`, and `-v`.

## SDK

```ts
import { TqxClient } from '@tqx-ai/sdk'

const client = new TqxClient({
  apiKey: process.env.TQX_API_KEY!,
})

const positions = await client.trading.listPositions({ market: 'HK', limit: 20 })

const balance = await client.user.getBalance()

const signal = await client.trading.placeOrder({
  symbol: '00700.HK',
  side: 'BUY',
  orderType: 'LIMIT',
  quantity: '100',
  price: '350.00',
  idempotencyKey: 'strategy-run-0001',
})
```

All requests use the native Fetch API. Public request and response schemas are exported as
Valibot schemas alongside their inferred TypeScript types.

## Agent plugins (Beta)

The portable [TQX Agent Plugin](./plugins/agent-plugin/README.md) is the source for
the included skills, MCP connection, and plugin metadata.

In Claude's **Add marketplace** dialog, enter `tqx-ai/tqx-ts`, sync the
`tqx-plugins` marketplace, and install `tqx-agent-plugin`. In Claude Code:

```bash
claude plugin marketplace add tqx-ai/tqx-ts
claude plugin install tqx-agent-plugin@tqx-plugins
```

The repository's `.claude-plugin/marketplace.json` points to the portable plugin's
skills and declares the Claude HTTP MCP configuration inline. In Claude chat or
Cowork, open the installed plugin's **Connectors** tab. If TQX is **Not added**,
add it, then connect and complete the OAuth flow. In Claude Code, run `/mcp` to
authenticate. Once connected, run the `tqx-setup` skill. See Claude's
[bundled connector instructions](https://claude.com/docs/plugins/overview.md#bundled-connectors).

For MCP tools without the bundled skills, use Claude's **Add custom connector**
flow with the name `TQX` and server URL `https://www.tqx.ai/mcp`.
Keep the detected authentication settings, add the connector, and connect with
your TQX account. On Team and Enterprise plans, an organization Owner adds the
connector before members connect their own accounts. See
[adding a connector by URL](https://claude.com/docs/connectors/custom/add-unlisted.md#add-a-connector-by-url).

To build the standalone Claude or Antigravity native distributions for ZIP upload
or local loading:

```bash
bun run plugin:claude:build
bun run plugin:claude:check
bun run plugin:antigravity:build
bun run plugin:antigravity:check
```

Upload `dist/claude-plugin.zip` through Claude's plugin upload interface, or load
the generated directory in Claude Code:

```bash
claude --plugin-dir ./dist/claude-plugin
```

For Antigravity, load or validate the generated `dist/antigravity-plugin/`
directory (or distribute `dist/antigravity-plugin.zip`).

`bun run build` generates both distributions. Releases include the versioned
`tqx-agent-plugin-claude-v<version>.zip`. Generated files remain in `dist/`; edit
the portable source to update any distribution.

## License

Licensed under the [GNU General Public License v3.0](./LICENSE).

## Contributing

Repository setup, local development, builds, packaging, and release checks are documented in
[CONTRIBUTING.md](./CONTRIBUTING.md).
