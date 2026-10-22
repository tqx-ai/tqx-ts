# TQX Trading CLI Reference

This reference describes the current CLI command shape and is updated with the source. Current order parameters use
camelCase: `--orderType`, `--idempotencyKey`, and `--orderId`. When the installed CLI disagrees with
this file, `tqx <command> --help` wins.

## Table of contents

- [Install CLI](#install-cli)
- [Install SDK](#install-sdk)
- [Command Entry](#command-entry)
- [Environment and Authentication](#environment-and-authentication)
- [Global Output](#global-output)
- [Read-Only Transaction Commands](#read-only-transaction-commands)
- [Write Trading Commands](#write-trading-commands)
- [Diagnostic Help](#diagnostic-help)

## Install CLI

Install, update, verify, and troubleshoot the `tqx` command only with [`install.md`](install.md) in
this directory (the same protocol is published at
`https://raw.githubusercontent.com/tqx-ai/tqx-ts/refs/heads/main/INSTALL.md`). It covers the
standalone binary for every platform, the npm fallback, `tqx self-update`, authentication, and the
known error messages.

Both packages use the GNU General Public License v3.0 (`GPL-3.0-only`).

## Install SDK

Go to the actual TypeScript/JavaScript application directory and choose one based on the existing package manager for the project:

```powershell
npm install @tqx-ai/sdk@<version>
pnpm add @tqx-ai/sdk@<version>
bun add @tqx-ai/sdk@<version>
```

Resolve the version with `npm view @tqx-ai/sdk version` and pin it. If the registry returns 404,
check `npm config get registry` (expected `https://registry.npmjs.org/`) and do not guess a private
registry. Do not install `@tqx-ai/sdk` globally. Follow the project's lockfile when reproducible builds are
required; pin the resolved version in the project manifest or lockfile rather than in this Skill.

Minimum SDK access:

```typescript
import { TqxClient } from '@tqx-ai/sdk'

const client = new TqxClient({
  apiKey: process.env.TQX_API_KEY,
})

const account = await client.trading.getAccount()
```

Do not write the API key into the source code. If the release package does not have a built-in default API address, it must be provided through `baseUrl` or the build environment.
`TQX_DEFAULT_BASE_URL`.

## Command entry

Prefer installed commands:

```powershell
tqx --help
```

When developing or debugging in the `tqx-ts` source code repository:

```powershell
bun install --frozen-lockfile
bun run build
node packages/cli/dist/index.mjs --help
```

The following sections use `tqx` for brevity. When running from source, replace it with
`node packages/cli/dist/index.mjs`. When running temporarily, replace it with the selected `npx`, `pnpm dlx`, `pnpx`, or
`bunx` prefix.

## Environment and Authentication

If the user does not have an API key, direct them to the TQX web app to [create an account](https://www.tqx.ai/user-center?tab=accounts), then [create a competition instance](https://www.tqx.ai/user-center?tab=agents). After the instance is created, ask the user to provide the generated key directly in the current conversation. Do not ask them to paste it into source code, public logs, or a repository.

- `TQX_BASE_URL`: Runtime API address, which takes precedence over the build-time default address.
- `TQX_API_KEY`: process-level API key, takes precedence over persistent credentials.
- Persistent Credentials: Bun system keychain preferred; otherwise located in
  `$XDG_CONFIG_HOME/tqx/credentials.json` or `~/.config/tqx/credentials.json`.

Check service health and authentication:

```powershell
tqx status --json
```

A successful response contains `status`, `service`, `backend_version` and `authenticated`.

CLI login currently only accepts command line parameters and may enter shell history. Do not instruct the user to run it. When the user explicitly provides the API key in the current conversation, the agent can use it directly for login from its own execution context. Do not echo the complete key in this or a later reply, or write it to source code, the repository, or unnecessary logs. Prefer `tqx login` so the key is saved to the CLI credential store and stays usable across later sessions and terminal restarts:

```powershell
tqx login --api-key=<api-key>
```

Reach for the process-scoped `TQX_API_KEY` instead only for a one-off or isolated task, or when the user does not want the key persisted.

Delete persistent credentials:

```powershell
tqx logout --json
```

## Global output

`--json` and `--plain` can be used anywhere in the command, but not at the same time. Agent calls use `--json` uniformly:

```powershell
tqx trading positions --market=HK --limit=100 --json
```

The JSON shape of stderr on failure is:

```json
{
  "error": {
    "message": "insufficient funds or buying power",
    "code": "insufficient_funds",
    "status": 409,
    "request_id": "...",
    "data": {
      "signal_id": "...",
      "state": "REJECTED",
      "order_id": null,
      "order_status": "REJECTED",
      "error_code": "ORDER_INSERT_ERROR_20001",
      "broker_error_id": 20001
    }
  }
}
```

Among them, `code`, `status`, `request_id` and `data` may be missing. When `data` exists in the rejection response, it should be retained. The trading API uses this status/code contract:

| HTTP | `error.code` | Meaning |
| ---: | --- | --- |
| 400 | `invalid_request` | Request or order parameters are invalid |
| 403 | `market_not_permitted` | The account is not permitted to trade this market |
| 404 | `order_not_found` | The order cannot be resolved for this account |
| 404 | `signal_not_found` | The trading signal cannot be resolved for this account |
| 409 | `idempotency_conflict` | The key was reused for a different order request |
| 409 | `order_not_cancellable` | The order exists but its state cannot be cancelled |
| 409 | `order_not_modifiable` | The order exists but its state cannot be modified |
| 409 | `insufficient_funds` | Buying power or available funds are insufficient |
| 409 | `insufficient_position` | Available position is insufficient for the sell |
| 409 | `position_direction_conflict` | The request conflicts with the current position direction |
| 409 | `market_closed` | The market or trading session does not currently accept this operation |
| 409 | `account_locked` | The trading account is temporarily locked |
| 409 | `agent_cooldown` | The bound competition agent is in cooldown and cannot place orders |
| 409 | `invalid_trade_date` | The order belongs to a different trading day and can no longer be acted on |
| 422 | `invalid_lot_size` | Quantity does not satisfy the market lot rule |
| 422 | `invalid_order_price` | Price is invalid for the market or order rules |
| 422 | `invalid_symbol` | The symbol is unknown or not tradable |
| 422 | `risk_control_blocked` | A broker risk-control rule blocked the order |
| 422 | `order_rejected` | The broker rejected the order without a narrower code |
| 500 | `trading_data_mapping_error` | The upstream trading payload could not be interpreted safely |
| 502 | `upstream_rejected` | Legacy compatibility code; current unclassified order rejections use `422 order_rejected` |
| 503 | `trading_service_unavailable` | Trading channel unavailable, or no broker verdict could be obtained |
| 504 | `trading_timeout` | The trading operation timed out; query the original signal/order before retrying |

The status class tells you what to do next:

- **409** — the order conflicts with current state. The same order may succeed later once the state
  changes (market opens, funds settle, the lock or agent cooldown clears). Do not change the order to "work around" it.
- **422** — the order content itself is not acceptable. Resubmitting it unchanged will fail again;
  fix the quantity, price, or symbol first.
- **403 / 400** — the account or the request is not eligible at all; do not retry.
- **500 / 502 / 503 / 504** — the failure is on the service or broker side, not with your order.
  Before retrying, query the original `signal_id` or order to confirm whether it was actually placed.

For rejection responses, preserve and inspect the envelope `message`, `code`, `status`, `request_id`, and `data`. The `data` object may include `signal_id`, `state`, `order_id`, `order_status`, `message`, `rejection_reason`, `error_code`, and `broker_error_id`. `message` is the stable API explanation; `rejection_reason` is the original broker detail when available. Use the original `signal_id` to continue querying; do not treat the error response as unsubmitted and generate a new idempotent key.

## Read-only transaction commands

Account:

```powershell
tqx trading account --json
tqx trading account --currency=HKD --json
tqx trading account --currency=USD --json
```

Account contains `account_id`, `mode` (`LIVE` or `PAPER`), `base_currency`, asset and cash fields, `as_of`, `is_stale`.

Position:

```powershell
tqx trading positions --json
tqx trading positions --symbol=00700.HK --market=HK --limit=100 --json
tqx trading positions --cursor=<next-cursor> --limit=100 --json
```

`market` can only be `HK` or `US`; `limit` is from 1 to 100. The response contains `items` and a nullable `next_cursor`.

Order list vs. single order:

```powershell
tqx trading orders list --limit=100 --json
tqx trading orders list --cursor=<next-cursor> --limit=100 --json
tqx trading orders get <order-id> --json
```

The order status is `PENDING`, `SUBMITTED`, `PARTIAL_FILLED`, `MODIFYING`, `CANCELLING`, `FILLED`,
`CANCELLED`, `REJECTED`, `TIMEOUT` or `FAILED`.

Trades:

```powershell
tqx trading trades --json
tqx trading trades --market=US --limit=100 --json
tqx trading trades --orderId=<order-id> --json
tqx trading trades --cursor=<next-cursor> --limit=100 --json
```

Signal:

```powershell
tqx trading signals get <signal-id> --json
```

The signal status is `PENDING`, `ACCEPTED`, `UNKNOWN`, or `REJECTED`. This is the signal lifecycle, not the order lifecycle. `ACCEPTED` means the signal request was accepted; it does not mean that the linked order was submitted or filled. The response may include a separate nullable `order_status` snapshot. A signal is not a fill report; use its `order_id` with `orders get` and `trades --orderId=<id>` to determine the order result.

`orders list` and the current-order `orders get` endpoint may omit terminal orders. An `order_not_found` response therefore does not by itself prove that an order was filled, canceled, or rejected; cross-check the signal, trades, account/positions, and any historical-order endpoint available for the account.

## Write Trading Commands

Market order:

```powershell
tqx trading orders place --symbol=AAPL.US --side=BUY --quantity=1 --yes --json
```

Limit order:

```powershell
tqx trading orders place --symbol=00700.HK --side=BUY --quantity=100 --orderType=LIMIT --price=350.00 --timeInForce=DAY --reason=<reason> --yes --json
```

Constraints:

- `symbol` uses `<code>.<market>`, the CLI will remove leading and trailing spaces and convert to uppercase.
- `side` can only be `BUY` or `SELL`.
- `quantity` must be a positive integer string.
- When `orderType` is omitted, the CLI defaults to `MARKET`.
- `LIMIT` must contain a positive number `price`; `MARKET` must not contain `price`.
- US stocks (`.US`) trade in whole shares with no board lot. A US `price` must be a multiple of $0.01 at $1.00 or more and of $0.0001 below $1.00; neither the CLI nor the server rounds it. See "US stock quantity and price increments" in the Skill.
- `reason` can be up to 512 characters long.
- `timeInForce` currently supports `DAY` and defaults to `DAY`; the order expires at the current market session close.
- `--yes` confirms submitting the order.
- When `idempotencyKey` is omitted, the CLI generates a new key. When you need to safely retry the same intent, you must explicitly pass in and reuse the stable key; the key length is 8 to 128, the first character is a letter or number, and the rest only allows letters, numbers, `. _ : -`.

Change order:

```powershell
tqx trading orders modify <order-id> --price=<positive-price> --json
```

Cancellation:

```powershell
tqx trading orders cancel <order-id> --json
```

Successful order-modification and cancellation responses contain `order_id` and `accepted`. `accepted: true` means only that the operation request was accepted; it does not mean that the order reached its final state. Run `orders get` and query trades afterward.

## Diagnostic Help

Check the parameters recognized at runtime layer by layer:

```powershell
tqx --help
tqx trading --help
tqx trading positions --help
tqx trading orders --help
tqx trading orders place --help
tqx trading orders modify --help
tqx trading trades --help
```

Exit code convention: usage or input verification error is 2, API/network/protocol error is 1, success is 0.

## Bug report

For a reproducible TQX API/CLI product defect, submit a complete diagnostic report when the task authorizes reporting:

```text
tqx bug report --title="Short title" --desc="Steps to reproduce, PAPER/LIVE mode, complete response, and request_id" --json
```

Use only the documented title and description flags. Do not report ordinary broker rejections as product bugs. Make the description as detailed as possible: record the complete input parameters and complete response result with original field names and values, plus the account mode, reproduction steps, and environment. If reporting was not authorized, prepare the report and ask first. If `tqx bug report --help` is unavailable in the installed version, do not call an undocumented endpoint.
