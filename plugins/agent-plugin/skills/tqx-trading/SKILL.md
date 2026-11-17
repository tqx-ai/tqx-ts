---
name: tqx-trading
description: Use when the user asks to inspect or operate a TQX trading account, including account snapshots, positions, active orders, trades, cash flows, order lookup, order placement, order modification, cancellation, or the daily activity control. Do not use this Skill for tqx-data, investment research, backtesting, CLI workflows, or SDK development.
---

# TQX Trading

## System Boundary

This Skill documents the account-based trading MCP server only. It is separate
from the local Python `tqx-data` Skill and from Qube research. It must not invent
market-data, research, factor, strategy, or backtest tools.

Trading actions require explicit user intent. Read the account state first when
the account mode, market, position, or order context is unknown. Never infer a
LIVE account from authentication alone; read the account snapshot and report its
`mode` (`LIVE` or `PAPER`) before a write action.

All MCP calls use the tool's `request` argument wrapper:

```json
{
  "request": {}
}
```

Use only the tool names and request fields documented below. Preserve returned
IDs and opaque cursors exactly.

## Authorization Scopes

- `trade:read`: account, positions, active orders, trades, cash flows, order
  lookup, and the activity control.
- `order:write`: place, modify, or cancel orders, and signal lookup.
- An authenticated session is required for every trading tool.
- `tqx_submit_bug_report` is outside the Trading permission boundary; use
  `tqx-setup` for that workflow.

If a tool returns a scope challenge, do not retry with the same token. Explain
the required scope and send the user back through the client's authorization flow.

## Read Tools

### `tqx_trading_snapshot`

Read account data, positions, or both. The default sections are `account` and
`positions`.

Supported request fields:

- `sections`: one or both of `account`, `positions`;
- `currency`: `HKD` or `USD`, for account data;
- `symbol`: position filter;
- `market`: `HK` or `US`, for positions;
- `limit`: integer from 1 to 100, default 20;
- `cursor`: opaque pagination cursor.

Filters must match their section. The response is not an atomic snapshot when
both sections are requested. Preserve each section's `as_of` and `is_stale`, and
report partial section errors instead of presenting a fabricated combined state.

### `tqx_trading_activity`

Read one page of activity. Set `type` to one of:

- `orders`: active orders with pagination;
- `trades`: recent trades, optionally filtered by `market` or exact `orderId`;
- `cash_flows`: cash flows with optional `startDate`, `endDate`, and ISO currency.

Dates use `YYYY-MM-DD`. `limit` defaults to 20 and cannot exceed 100. Reuse
`next_cursor` unchanged. An unsupported cash-flow request is an error, not an
empty ledger.

### `tqx_trading_lookup`

Look up one exact opaque identifier:

- `type: "order"`, `id`: an order ID;
- `type: "signal"`, `id`: a signal ID.

Never reconstruct, normalize, or guess an ID. A signal state is not an order
lifecycle. `ACCEPTED` means the request was accepted, not that the order filled.
Use an order lookup to inspect the actual order status.

### `tqx_trading_control`

Use `{ "action": "hold" }` only when the user explicitly asks to mark the
authorized Agent active for the current server activity date. This does not place
or confirm an order. It changes activity state and uses `trade:read`.

## Write Tools

### `tqx_trading_order`

Use `action` to select exactly one operation:

- `place`;
- `modify`;
- `cancel`.

Before `place`, confirm all of the following with the user when any value is
missing or ambiguous:

- `symbol`: normalized as `<code>.HK` or `<code>.US`;
- `side`: `BUY` or `SELL`;
- `quantity`: positive integer string;
- `orderType`: `MARKET` or `LIMIT`;
- `price`: required for `LIMIT`, forbidden for `MARKET`, and a positive decimal
  string;
- `timeInForce`: `DAY` only;
- `idempotencyKey`: stable for retries of the same intent and new for a new intent;
- optional `reason`.

For `modify`, pass the exact `orderId` and the new positive `price`. For `cancel`,
pass the exact `orderId` and no replacement parameters.

The result of `place` is a trading signal or request acceptance, not a fill. Do
not tell the user that an order was filled, cancelled, or rejected until an order
lookup or activity result proves that state. If a write response is unknown,
do not blindly retry. Reuse the same `idempotencyKey` only when retrying the same
place intent.

Every write operation must be treated as consequential. Restate the final action,
symbol, side, quantity, order type, price, and account mode before calling the
tool when the user has not already made those values unambiguous.

## Result Handling

Trading results contain a `kind`, `data`, and `meta.retrievedAt`; some responses
also include errors. Preserve `request_id`, order IDs, signal IDs, timestamps,
status fields, `as_of`, `is_stale`, and pagination cursors.

Do not collapse these states:

- signal accepted vs order submitted;
- order submitted vs partially filled;
- order cancelled vs cancellation requested;
- unknown vs failed;
- stale account or position data vs current data.

When a read request returns partial data, state which section succeeded and which
section failed. When a write request fails after an ambiguous network outcome,
look up the relevant signal or order before taking another action.

## Routing

- Setup or OAuth problems: use `tqx-setup`.
- Historical/reference data: use `tqx-data`.
- Investment research, factor analysis, strategy creation, or backtesting: not
  provided by this plugin's current MCP surface.
- Account, position, order, trade, cash-flow, and activity operations: use this
  Skill.
