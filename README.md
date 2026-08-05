# TQX TypeScript SDK and CLI

This Bun workspace contains the Node.js-compatible `@tqx-ai/sdk` and the Citty-based `@tqx-ai/cli`.

## Requirements

- Bun 1.3.14 or newer for development
- Node.js 22.18 or newer for published packages

Install dependencies and run the complete check suite:

```bash
bun install
bun run test
```

`bun run test` checks formatting, lint, TypeScript types, Vitest tests, production builds, and
Node/Bun smoke tests.

## Installation

Install the CLI globally with npm:

```bash
npm install --global @tqx-ai/cli@0.1.10
tqx --version
```

Install the SDK in a Node.js project:

```bash
npm install @tqx-ai/sdk@0.1.10
```

## CLI

### Environment

Create the shared and environment-specific files as needed:

```dotenv
# .env: loaded during development and production builds; values are embedded in the artifact.
TQX_BUILD_BASE_URL=https://www.tqx.trade/pandaApi
# Trading, authentication, and health gateway
TQX_BUILD_TRADING_BASE_URL=https://www.tqx.trade
TQX_BUILD_GET_API_KEY_URL=https://www.tqx.trade/hk/competition-manage?catalog=2

# .env.dev and .env.prod can override these public defaults for local development
# and production builds.
# Node.js does not load these files when executing the built CLI. Set TQX_BASE_URL in the
# process environment to override every gateway at runtime.
```

`.env`, `.env.dev`, and `.env.prod` are ignored by Git; `.env.example` is the tracked template.
`TQX_BUILD_BASE_URL` and `TQX_BUILD_TRADING_BASE_URL` are embedded in the CLI and SDK, while
`TQX_BUILD_GET_API_KEY_URL` is embedded in the CLI's login guidance. All values are public.
`TQX_BUILD_BASE_URL` is the research and User API HTTP gateway, and
`TQX_BUILD_TRADING_BASE_URL` is used for authentication, trading, and health. CLI and SDK users
can override every gateway at runtime with `TQX_BASE_URL`.

### Development

```bash
bun install
bun run dev
```

`bun run dev` loads `.env`, then `.env.dev`, and watches both packages for changes.

### Build and package

```bash
bun run build
bun run pack:check
```

`bun run build` loads `.env`, then `.env.prod`, and creates production artifacts in `dist`.
Use Bun to pack and publish this workspace: it replaces local `workspace:*` dependencies with the
published package version. An npm-created CLI tarball retains `workspace:*` and cannot be installed
from the registry.

Run the complete release gate with `bun run release:check`. See [RELEASING.md](./RELEASING.md) for
the versioning, publishing, verification, and Git tag procedure.

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

User API commands:

```text
tqx login --api-key=<key>
tqx logout
tqx status
tqx balance
```

Trading commands:

```text
tqx trading account [--currency=HKD|USD]
tqx trading positions [--symbol=<symbol>] [--market=HK|US] [--limit=<n>] [--cursor=<cursor>]
tqx trading orders list [--limit=<n>] [--cursor=<cursor>]
tqx trading orders get <order-id>
tqx trading orders place --symbol=<symbol> --side=BUY|SELL --quantity=<quantity> --yes \
  [--orderType=MARKET|LIMIT] [--price=<price>] [--reason=<reason>] [--idempotencyKey=<key>]
tqx trading orders modify <order-id> --price=<price>
tqx trading orders cancel <order-id>
tqx trading trades [--market=HK|US] [--orderId=<id>] [--limit=<n>] [--cursor=<cursor>]
tqx trading signals get <signal-id>
```

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
build-time `TQX_BUILD_BASE_URL` or the runtime `TQX_BASE_URL`; both must include the `/pandaApi`
gateway prefix for research commands.
`tqx balance` also uses this gateway, rather than `TQX_BUILD_TRADING_BASE_URL`.

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

## License

Licensed under the [GNU General Public License v3.0](./LICENSE).
