# @tqx-ai/sdk

TypeScript SDK for the TQX Open API. It supports Node.js 22.18 or newer and exposes both ESM and
CommonJS entry points with TypeScript declarations.

## Installation

```bash
npm install @tqx-ai/sdk@0.3.0
```

## Usage

```ts
import { TqxClient } from '@tqx-ai/sdk'

const client = new TqxClient({
  apiKey: process.env.TQX_API_KEY!,
})

const positions = await client.trading.listPositions({
  market: 'HK',
  limit: 20,
})
```

Pass `baseUrl` to `TqxClient` to configure the research and User API HTTP gateway. Authentication,
trading, and health requests use `tradingBaseUrl` or the build-time
`TQX_BUILD_TRADING_BASE_URL`. When set, `TQX_BASE_URL` remains the runtime global override for
every request group.

The User API provides `client.user.verify()`, `client.user.getStatus()`, and
`client.user.getBalance()`. Balance uses `baseUrl` and the `TQX_BUILD_BASE_URL` default.

The public request and response schemas are exported as Valibot schemas alongside their inferred
TypeScript types.

## License

GNU General Public License v3.0.
