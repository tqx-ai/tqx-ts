# @tqx-ai/sdk

TypeScript SDK for the TQX Open API. It supports Node.js 22.18 or newer and exposes both ESM and
CommonJS entry points with TypeScript declarations.

## Installation

```bash
npm install @tqx-ai/sdk@0.5.4
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

## Bearer authentication

For a backend that supports OAuth API tokens, pass `bearerToken` instead of `apiKey`:

```ts
const client = new TqxClient({
  baseUrl: 'http://127.0.0.1:8000',
  tradingBaseUrl: 'http://127.0.0.1:8000',
  bearerToken: apiAccessToken,
})
const account = await client.trading.getAccount()
```

This example supplies both gateway URLs so it also works with builds that have no embedded default
URLs. Configure a separate `baseUrl` for research and User API balance requests when needed.

The two options are mutually exclusive. Both trim surrounding whitespace and reject explicit empty
or invalid values with `TqxConfigurationError`. API keys must contain printable ASCII; Bearer tokens
must be raw HTTP Bearer credentials without the `Bearer ` prefix. Authenticated requests send only
the corresponding `X-API-Key` or `Authorization: Bearer` header. A client without either credential
can call `health()` or `user.getStatus()`; protected requests throw `TqxConfigurationError` before
fetching. Public health requests send neither credential, even on a configured client.

The caller owns token acquisition, exchange, and renewal; an MCP token cannot be sent directly to
Trading and must first be exchanged for an API access token with the Trading API audience. The SDK
does not exchange or refresh tokens. This transport support requires a backend that accepts Bearer.
For research endpoints that require API keys, use a separate client configured with `apiKey`.
CLI login continues to use API keys.

## Trading write idempotency

`placeOrder` requires `idempotencyKey`. `modifyOrder` accepts an optional `idempotencyKey` in its
input, and `cancelOrder(orderId, options?)` accepts `options.idempotencyKey`:

```ts
await client.trading.modifyOrder({
  orderId: 'order-123',
  price: '185.50',
  idempotencyKey: 'modify-order-123-v1',
})
await client.trading.cancelOrder('order-123', { idempotencyKey: 'cancel-order-123-v1' })
```

All three use the same rule: 8 to 128 characters, starting with a letter or number, with only
letters, numbers, periods, underscores, colons, or hyphens. The SDK sends the key as
`Idempotency-Key`, never in the JSON body. Reuse the same key for retries of the same intent;
different operations need different keys. The backend enforces replay and conflict semantics.

The existing `modifyOrder({ orderId, price })` and `cancelOrder(orderId)` calls remain valid and
send no idempotency header. GET requests and writes with a key retain the existing retry policy;
writes without a key are not retried. These rules apply to both API-key and Bearer clients.
`placeOrder` returns a signal; modify/cancel acknowledgements do not confirm the final order state.

## CLI trading mapping

These are the existing CLI mappings; optional SDK keys do not add CLI flags or change CLI behavior.

| CLI command                       | `client.trading` method | Input mapping                                                                                                                                                         |
| --------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trading account`                 | `getAccount`            | `currency`                                                                                                                                                            |
| `trading positions`               | `listPositions`         | `symbol`, `market`, `limit`, `cursor`                                                                                                                                 |
| `trading orders list`             | `listOrders`            | `limit`, `cursor`                                                                                                                                                     |
| `trading orders get <orderId>`    | `getOrder`              | positional order ID                                                                                                                                                   |
| `trading orders place`            | `placeOrder`            | `symbol`, `side`, `orderType` (default MARKET), `quantity`, `price`, `reason`, `timeInForce` (default DAY), `idempotencyKey` (generated if omitted); requires `--yes` |
| `trading orders modify <orderId>` | `modifyOrder`           | positional order ID, `price`; no CLI idempotency key                                                                                                                  |
| `trading orders cancel <orderId>` | `cancelOrder`           | positional order ID; no CLI idempotency key                                                                                                                           |
| `trading trades`                  | `listTrades`            | `market`, `orderId`, `limit`, `cursor`                                                                                                                                |
| `trading cash-flows`              | `listCashFlows`         | `start`/`end` become `startDate`/`endDate`; `currency` is trimmed and uppercased; `limit`, `cursor`                                                                   |
| `trading signals get <signalId>`  | `getSignal`             | positional signal ID                                                                                                                                                  |

All ten `TradingApi` methods have a CLI mapping. Batch submission is not an SDK/CLI method; an MCP
batch tool must validate all inputs and call `placeOrder` sequentially under its own contract.
CLI authentication remains API-key based.

## License

GNU General Public License v3.0.
