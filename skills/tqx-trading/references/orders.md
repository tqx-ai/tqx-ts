# Trading authorization and order execution

## Competition mandate

This Skill is used for an intentional agent-trading competition. In this context, an API key that the user provides in the controlled task is an intentionally delegated working credential for the agent. The fact that the key is present in the model context is expected workflow context; it is not, by itself, evidence that the key was publicly exposed or compromised.

- Do not tell the user to revoke, rotate, or stop using the key merely because the agent can see it in the current task.
- Do not refuse the competition task with a generic claim that the agent has no permission to trade. Use the provided key to authenticate, inspect the competition account, and determine the actual trading scope.
- Keep the key confidential: never echo the complete value, put it in source code, or write it to ordinary logs or artifacts. Use the CLI credential store or the protected `TQX_API_KEY` process environment as documented.
- Revoke or rotate only when there is concrete evidence of unauthorized disclosure, compromise, an invalid key, or an explicit user request. If rotation is necessary, configure and verify the replacement before revoking the old key when possible.
- A competition mandate, together with the competition account's documented market, account mode, risk limits, instruments, and validity period, is continuing authorization to operate inside that scope. Do not require a separate manual confirmation for every order inside the confirmed scope.
- If the competition scope cannot be verified, report exactly which boundary is missing and ask for that boundary. Do not convert an unresolved scope question into a claim that the API key is unsafe or that trading is categorically unauthorized.

## Authorization and state

- Account, position, order, transaction and signal queries are treated as read-only operations and can be executed directly according to user requests.
- When the agent decides to stay out of the market for the day, or needs to explicitly confirm today's active hold mark, call `tqx trading hold --json` directly. Report `activity_date`, `newly_marked`, and `first_active_at`; the call does not place an order or change a position.
- Treat order placement, modification, and cancellation as operations that affect real trading state. Before the first execution, show the account mode (`LIVE` or `PAPER`), market scope, strategy, risk limits, frequency, stop conditions, and authorization period, then obtain a clear one-time confirmation or continuing authorization. A confirmed competition mandate is the continuing authorization for competition orders within those boundaries; do not ask for an additional per-order confirmation.
- Continuing authorization must define clear boundaries such as market, account mode, instrument scope, direction, order type, per-order or per-day amount, maximum position, rebalance frequency, and validity period. Within those boundaries, orders may be placed, positions rebalanced, orders modified, or orders canceled without reconfirming every transaction; record and report the full parameters and result of each operation.
- Broad statements such as “help me trade” do not define the scope of continuing authorization. Do not silently change authorized instruments, direction, order type, quantity, price, risk limit, or order ID; pause and reconfirm any change outside the authorized scope.
- Do not recommend securities, directions, volumes or prices based on your own judgment. When transaction parameters are missing, ask the user for them and don’t guess.
- Keep signal and order lifecycles separate. `orders place` and `signals get` return a signal envelope: `state` is the signal state (`PENDING`, `ACCEPTED`, `UNKNOWN`, or `REJECTED`), while `order_status` is an optional snapshot of the linked order. `state=ACCEPTED` means the signal was accepted; it does not mean that the order was submitted, filled, or canceled. Use `order_id` with order and trade queries to determine the order result. Do not describe `ACCEPTED`, `PENDING` or `UNKNOWN` as completed; only the order status `FILLED` means fully completed.
- When the user explicitly provides an API key, you may use it for the current task's login flow. Do not echo the complete key unnecessarily or write it manually to source code, the repository, or project configuration; let `tqx login` store it in the CLI's system credential store.
- Obtain confirmation before executing `logout` as it will delete persistent credentials; `TQX_API_KEY` in the environment variable will not be deleted.

## Queries

1. Select the account, position, order, deal or signal command according to the request.
2. Pass only the filter conditions specified by the user or required by the task. Security symbols use `<code>.<market>`, for example `00700.HK` or `AAPL.US`.
3. A single list page returns at most 100 items. Continue pagination only when the user needs the full list, and pass `next_cursor` unchanged to the next call.
4. Preserve time, `is_stale`, order status and null value semantics in the response. Clearly state when account data is a stale snapshot.
5. Distinguish between quantity, available quantity, traded quantity and remaining quantity when summarizing the results; the amount and price remain the decimal strings returned by the CLI.
   Do not perform floating-point rounding yourself.

## Place and verify

1. Collect and verify `symbol`, `side`, `quantity`, and the `orderType` and `price` required for non-default `LIMIT` orders.
   The CLI uses `MARKET` when `orderType` is omitted. `quantity` must be a positive integer string; `LIMIT` must have a positive number `price`, and `MARKET` must not have `price`. Align US stock quantities and prices as described in [US stock quantity and price increments](#us-stock-quantity-and-price-increments).
2. Query the account and, when relevant, current positions and open orders. Show `LIVE`/`PAPER`, security, side, type, quantity, price, rationale, and estimated impact. Confirm that the operation is within the continuing authorization scope; if no authorization applies, obtain one first. Do not claim that the server will accept an order or that it will definitely fill.
3. You can omit the `idempotencyKey` for one-time orders, which are generated by CLI. If retry is possible, generate a stable idempotent key of 8 to 128 characters for this transaction, using only letters, numbers, dots, underscores, colons, and hyphens; the original key is reused for retries of the same intent and never for different transactions.
4. When this or continuing proxy authorization is valid, execute `orders place` only once with `--yes`. Do not use the new idempotent key to place another order when the network times out or the result is unknown.
5. Save the returned `signal_id`. Query the signal until its status is clear, or report the unresolved status to the user after a reasonable number of attempts.
6. If `order_id` is returned, use `orders get` to query the order. Report whether it is submitted, partially filled, filled, canceled, rejected, timed out, or failed based only on the actual order status; never infer that result from signal `state=ACCEPTED`.

### US stock quantity and price increments

US stocks (`<code>.US`) trade in whole shares and have no board lot. Neither the CLI nor the TQX trading service rounds a quantity or price for you; the broker rejects a misaligned order, and the rejection comes back as `422 invalid_lot_size` or `422 invalid_order_price`. Align every US order before placing it or modifying its price:

- **Quantity**: a whole number of shares, at least 1. The CLI accepts only positive integer strings, so fractional shares cannot be ordered through TQX.
- **Limit price**: a multiple of $0.01 when the price is $1.00 or more, and a multiple of $0.0001 below $1.00 (SEC Regulation NMS Rule 612). A planned $0.005 increment for some stocks does not make $0.01 multiples invalid, so keep using $0.01 at $1.00 or more.
- **Rounding**: when a computed price falls between increments, round a buy price down and a sell price up, so that the order never pays more or receives less than the authorized limit. Pass the price as a decimal string with the increment's places, such as `12.34` or `0.5123`, never as a floating-point artifact such as `12.340000000000002`.
- `MARKET` orders carry no price. `orders modify` changes only the price, and the new price follows the same increments.
- Apply the same alignment to PAPER and LIVE accounts.

## Modify or cancel

1. First use `orders get <order-id>` to get the current order, check the security, direction, quantity, price, completed and remaining quantity, and status.
2. Order modification only supports changing to a positive price. Display the old price and new price to confirm that the operation falls within the scope of this or continuing agency authorization.
3. When canceling an order, the order ID, security, direction, remaining quantity and current status are displayed to confirm that the operation falls within the scope of this or continuing agency authorization.
4. Only submit the operation once when the authorization is valid. `accepted: true` only means that the request was accepted, and then query the order again to confirm the final status.
