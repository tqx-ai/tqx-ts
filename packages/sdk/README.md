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
`TQX_BUILD_TRADING_BASE_URL`. The existing URL rules
remain unchanged: `TQX_BASE_URL` overrides trading/authentication/health, while an explicit SDK
`baseUrl` takes precedence over that variable for research and User API balance requests.

The User API provides `client.user.verify()`, `client.user.getStatus()`, and
`client.user.getBalance()`. Balance uses `baseUrl` and the `TQX_BUILD_BASE_URL` default.

The public request and response schemas are exported as Valibot schemas alongside their inferred
TypeScript types.

## Deployment environments

Use `TQX_ENV=local|test|prod` or `TqxClientOptions.environment` to select an optional set of
public endpoint defaults. An explicit SDK `environment` takes precedence over `TQX_ENV`.
`NODE_ENV`, including `NODE_ENV=production`, never selects a deployment. Unrecognized or legacy
values such as `dev`/`pro` keep the original configuration chain instead of adding a startup
rejection; the resolver reports both the requested value and the recognized selection, if any.

| Selection | Research/User balance default      | Trading/authentication/health default      |
| --------- | ---------------------------------- | ------------------------------------------ |
| `local`   | `TQX_LOCAL_BASE_URL` when supplied | `TQX_LOCAL_TRADING_BASE_URL` when supplied |
| `test`    | `TQX_TEST_BASE_URL` when supplied  | `TQX_TEST_TRADING_BASE_URL` when supplied  |
| `prod`    | `TQX_PROD_BASE_URL` when supplied  | `TQX_PROD_TRADING_BASE_URL` when supplied  |

The existing explicit/generic precedence remains: research/User balance uses explicit SDK
`baseUrl`, then `TQX_BASE_URL`, then the selected profile's base, then the build default.
Trading uses `TQX_BASE_URL`, then explicit SDK `tradingBaseUrl`, then the selected profile's
trading URL or profile base, then its existing build/default-base chain. Blank or omitted profile
fields retain previous defaults; selecting `test` or `prod` does not introduce new required
external fields. When no URL exists anywhere, or a chosen URL is invalid, the original SDK URL
configuration errors still apply. HTTP(S) validation, credential validation, and authentication
requirements remain unchanged; no new HTTPS/loopback deployment policy is added.

Credential-free public templates are in `packages/sdk/config/.env.local.example`,
`.env.test.example`, and `.env.prod.example`. Local's example explicitly sets the known Trading
gateway `http://127.0.0.1:8102`. Unknown test/production endpoints are blank with override notes,
not invented addresses or startup prerequisites. The SDK does not load dotenv files. The OAuth
resource `http://127.0.0.1:8102/api` is separate from the Trading gateway root; issuer, Web, and MCP
addresses belong to those modules and are not imported by this selection.

`resolveTqxEndpoints(options?, runtimeEnvironment?)` returns the effective public URLs,
`environment` (recognized selected profile, if any), and `requestedEnvironment` (when provided).
It has no network, file, or credential access. Inspect the result before connecting when changing
targets; a profile label does not prove which deployment owns an explicitly overridden endpoint.
`runtimeEnvironment` on `TqxClientOptions` injects public environment values without modifying
`process.env`; omitted values use the current process environment.

Environment selection does not read, migrate, copy, refresh, or exchange credentials. Existing
explicit `apiKey`/`bearerToken` constructor options continue to work with the selected URLs;
the caller supplies credentials appropriate for that backend and audience. No credential binding
slots, profile migration, or extra pairing prerequisites are introduced.

```ts
import { resolveTqxEndpoints, TqxClient } from '@tqx-ai/sdk'

const endpoints = resolveTqxEndpoints({ environment: 'test' }, process.env)
const client = new TqxClient({ ...endpoints, apiKey: suppliedApiKey })
```

## Bearer authentication

For a backend that supports OAuth API tokens, pass `bearerToken` instead of `apiKey`:

```ts
const client = new TqxClient({
  environment: 'local',
  baseUrl: 'http://127.0.0.1:8102',
  tradingBaseUrl: 'http://127.0.0.1:8102',
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
