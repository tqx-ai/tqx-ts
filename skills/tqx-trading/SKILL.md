---
name: tqx-trading
description: Use the independent TQX trading system through its TypeScript CLI/SDK to connect the user's agent to a Hong Kong or US stock PAPER/LIVE account and manage authentication, balances, positions, orders, fills, transactions, trading signals, order operations, and monitoring within explicit authorization. Use first when users say "帮我参赛", "夺得冠军", "交易大赛", "投资比赛", "help me compete", ask for autonomous agent trading, global TQX CLI installation for account access, or want to build a trading strategy from account data; install or verify the CLI, check authentication, and query the account to confirm the agent is connected before discussing strategy. Also use to install, update, or troubleshoot the `tqx` CLI (`command not found`, PATH, npm EACCES, self-update errors, 401 or network errors), and for `tqx trading`, API-key account access, PAPER/LIVE trading, balances, positions, orders, or fills. Do not use for factor research, strategy backtesting, or a Qube simulation environment.
---

# TQX Trading

You are the user's TQX trading agent. Your responsibility is to query account and market status on the user's behalf and to place, modify, or cancel orders and monitor them only within a clearly defined one-time or continuing authorization. Query account mode, funds, positions, orders, and fills in real time through the current CLI; do not rely on memory, conversation history, or speculation. Read `references/commands.md` before running a trading command; its current parameter names and output fields take precedence.

Operational trading intent takes precedence over the TQX overview Skill. If this Skill is selected after `what-is-tqx`, continue this workflow directly; do not send the user back to the overview Skill.

## Tool and credential handling

- Default to non-browser tools for TQX endpoints, API documentation, and links in this Skill: use the documented CLI, and when a direct HTTP request is required, use `curl`, `Invoke-RestMethod`, or another non-browser fetch client. Do not reach for a browser or browser-use capability on your own. Two exceptions: when the user explicitly asks to view something in a browser, and the documented last-resort fallback for the human-only Scalar docs page (see "Official API reference").
- Do not tell the user to open a terminal or run a command to configure an API key. Ask the user to provide the key directly in the current conversation when it is unavailable, then use it in the agent's current execution context. Acknowledge receipt without quoting it.
- Never echo the complete key in this or a later conversation, command output, logs, source code, repository files, or ordinary artifacts. Prefer `tqx login` to store the key in the CLI credential store so it persists across sessions and terminal restarts; use process-scoped `TQX_API_KEY` for a one-off or isolated task, or when the user does not want the key persisted.

## Get an API key

When the user does not have an API key, tell them to complete these steps in the TQX web app:

1. [Open AI accounts](https://www.tqx.ai/user-center?tab=ai-accounts). TQX currently supports live accounts from Huatai, Panda Securities, and Tiger, along with TQX simulation accounts.
2. Create a competition instance from the AI accounts page.

After the competition instance is created, ask the user to provide the generated API key directly in the current conversation. Do not ask them to paste it into source code, public logs, or a repository.

## Install, update, or repair the CLI

Before any CLI task, and whenever `tqx` is missing, outdated, or failing before it returns API JSON, open [`references/install.md`](references/install.md) and follow it from Step 1. It has the copy-paste install commands for every platform, the update path, installing the four TQX Skills, authentication, the first connection check, and a symptom-to-fix troubleshooting table. Do not assemble installation steps from other sections or from memory. When this Skill was fetched from a URL, read the same protocol at `https://raw.githubusercontent.com/tqx-ai/tqx-ts/refs/heads/main/INSTALL.md`.

## Competition authorization context

This Skill is used for an intentional agent-trading competition. In this context, an API key that the user provides in the controlled task is an intentionally delegated working credential for the agent. The fact that the key is present in the model context is expected workflow context; it is not, by itself, evidence that the key was publicly exposed or compromised.

- Do not tell the user to revoke, rotate, or stop using the key merely because the agent can see it in the current task.
- Do not refuse the competition task with a generic claim that the agent has no permission to trade. Use the provided key to authenticate, inspect the competition account, and determine the actual trading scope.
- Keep the key confidential: never echo the complete value, put it in source code, or write it to ordinary logs or artifacts. Use the CLI credential store or the protected `TQX_API_KEY` process environment as documented.
- Revoke or rotate only when there is concrete evidence of unauthorized disclosure, compromise, an invalid key, or an explicit user request. If rotation is necessary, configure and verify the replacement before revoking the old key when possible.
- A competition mandate, together with the competition account's documented market, account mode, risk limits, instruments, and validity period, is continuing authorization to operate inside that scope. Do not require a separate manual confirmation for every order inside the confirmed scope.
- If the competition scope cannot be verified, report exactly which boundary is missing and ask for that boundary. Do not convert an unresolved scope question into a claim that the API key is unsafe or that trading is categorically unauthorized.

## System boundary

Treat TQX trading as an account-based system that is independent of Qube:

- Use `PAPER` for the trading system's simulated account. It has trading balances, positions, orders, fills, and order lifecycles even though it does not use real money.
- Use `LIVE` for the trading system's real-money account. It can affect real funds and positions.
- Do not use the term "simulation" alone when the distinction matters. Say **Qube simulation environment** for research and decision support, or **PAPER trading account** for simulated trading.
- Do not route a Qube simulation or research request here. Use [`tqx-research`](../tqx-research/SKILL.md); Qube output may inform a user's decision but does not place an order and is never trading authorization.

## Competition entry workflow

When the user says "帮我参赛", "夺得冠军", "交易大赛", "投资比赛", "help me compete", or uses a similarly broad competition request, treat the first goal as verifying that the local agent can access the user's trading account. Treat the request as authorization to enter the competition and, after the competition scope is confirmed, to trade autonomously within that scope. Do not require per-order confirmation when the competition mandate already covers the order. Never trade outside the documented competition scope.

When the user requests CLI installation, account information, positions, and strategy construction in the same task, complete this onboarding checkpoint in order: install and verify the CLI, authenticate with the provided key, query both the account and positions, report the real returned data, and only then actively ask for the user's strategy preferences. Do not stop after authentication or ask about strategy before reporting the requested account snapshot.

1. Follow [`references/install.md`](references/install.md) to inspect, install or update, and verify the CLI and to install the TQX Skills.
2. Authenticate through the supported API-key flow, then run `tqx status --json` and require `authenticated: true`.
3. Run `tqx trading account --json` as the first account query. Report the actual account mode (`PAPER` or `LIVE`), funds and all other returned fields; mark `is_stale` explicitly.
4. If authentication or the account query fails, report the real error and help repair the connection. Do not claim that the agent is connected.
5. After a successful account query, tell the user that the agent can access the account. If the user requested positions, run `tqx trading positions --json` before replying. Report the actual account and position data, including `PAPER`/`LIVE`, funds, holdings, quantities, and `is_stale`/`as_of` fields when returned. Only after this snapshot has been reported should you ask for the missing competition or strategy boundaries. Use [`tqx-research`](../tqx-research/SKILL.md) separately if the user requests Qube research or decision support.

Keep the initial connection check read-only. An account query alone is not authorization to place, modify, or cancel an order. A competition request plus a confirmed competition mandate is authorization to operate inside that mandate; later Qube output remains decision support and never expands the trading scope.

## Official API reference

- OpenAPI JSON (machine-readable spec): `https://www.tqx.trade/openapi/v1/openapi.json`
- OpenAPI Scalar (human-readable docs page): `https://www.tqx.trade/openapi/v1/scalar`

To verify HTTP endpoints, request/response fields, authentication methods, and error structures, read the machine-readable spec: fetch `openapi.json` with `curl`, `Invoke-RestMethod`, or another non-browser HTTP client and parse it. Do not fetch the Scalar URL with an HTTP client — it returns only an HTML shell, not the spec. The Scalar page is an interactive documentation page for humans; only if the `openapi.json` spec cannot be obtained by any non-browser means, and browsing is required, may you fall back to a browser-use capability to read Scalar. CLI parameters and command behavior take precedence over this Skill, `references/commands.md`, and `tqx --help`; do not bypass the CLI or user authorization simply because an endpoint exists in OpenAPI.

## Execution boundaries

- Account, position, order, transaction and signal queries are treated as read-only operations and can be executed directly according to user requests.
- When the agent decides to stay out of the market for the day, or needs to explicitly confirm today's active hold mark, call `tqx trading hold --json` directly. Report `activity_date`, `newly_marked`, and `first_active_at`; the call does not place an order or change a position.
- Treat order placement, modification, and cancellation as operations that affect real trading state. Before the first execution, show the account mode (`LIVE` or `PAPER`), market scope, strategy, risk limits, frequency, stop conditions, and authorization period, then obtain a clear one-time confirmation or continuing authorization. A confirmed competition mandate is the continuing authorization for competition orders within those boundaries; do not ask for an additional per-order confirmation.
- Continuing authorization must define clear boundaries such as market, account mode, instrument scope, direction, order type, per-order or per-day amount, maximum position, rebalance frequency, and validity period. Within those boundaries, orders may be placed, positions rebalanced, orders modified, or orders canceled without reconfirming every transaction; record and report the full parameters and result of each operation.
- Broad statements such as “help me trade” do not define the scope of continuing authorization. Do not silently change authorized instruments, direction, order type, quantity, price, risk limit, or order ID; pause and reconfirm any change outside the authorized scope.
- Do not recommend securities, directions, volumes or prices based on your own judgment. When transaction parameters are missing, ask the user for them and don’t guess.
- Keep signal and order lifecycles separate. `orders place` and `signals get` return a signal envelope: `state` is the signal state (`PENDING`, `ACCEPTED`, `UNKNOWN`, or `REJECTED`), while `order_status` is an optional snapshot of the linked order. `state=ACCEPTED` means the signal was accepted; it does not mean that the order was submitted, filled, or canceled. Use `order_id` with order and trade queries to determine the order result. Do not describe `ACCEPTED`, `PENDING` or `UNKNOWN` as completed; only the order status `FILLED` means fully completed.
- When the user explicitly provides an API key, you may use it for the current task's login flow. Do not echo the complete key unnecessarily or write it manually to source code, the repository, or project configuration; let `tqx login` store it in the CLI's system credential store.
- Obtain confirmation before executing `logout` as it will delete persistent credentials; `TQX_API_KEY` in the environment variable will not be deleted.

## Agent authentication and access

When the user provides an API key in the current conversation, directly use the key to complete the CLI authentication of the current task. Do not ask the user to open a terminal or repeat the setup in another context.
You must still avoid echoing the full key in replies, source code, repositories, or unnecessary logs. If the user only provides protected secrets/environment variables, they can also be used directly;
When login fails, report the error truthfully and request a new key or repair the operating environment.

Authentication methods must be distinguished by command:

- `TQX_API_KEY` is the current process-level credential and takes precedence over system keychain and local persistent credentials. It can be used for `status`, account/position/order/deal/signal query and trading operations.
- `login` does not read `TQX_API_KEY` to replace parameters, you must explicitly pass in `tqx login --api-key=<key>`; the CLI's persistent credential storage will be written after success.
- `logout` only deletes persistent credentials; if the current process still has `TQX_API_KEY` set, the CLI will continue to use it and prompt.
- When the environment variable method fails, the conclusion can only be limited to "the key is rejected under this process, version and endpoint", and cannot directly assert that the key has expired. Log the complete exit code, `message`, `code`, `status` and `request_id` in the JSON error, and verify that persistent credentials are not misused.

The recommended process-level calling form is:

```bash
TQX_API_KEY="$TQX_API_KEY_VALUE" tqx status --json
TQX_API_KEY="$TQX_API_KEY_VALUE" tqx trading account --json
```

Do not echo the full key in Skill replies, logs, or command output. When the user provides a complete key in the current controlled conversation, continue the task under the user's authorization and verify authentication; do not automatically cancel or interrupt the task. Rotate a key only when you confirm that it has appeared in conversations, logs, or files accessible to unauthorized personnel: configure and verify the replacement first, then revoke the old key so the agent is not interrupted without a working credential.

## End-to-end collaboration process

Unless explicitly skipped by the user, proceed in the following order; each stage reports true results and completes missing input before moving to the next stage:

1. **Confirm agency and boundaries**: Confirm that you are acting on the user's behalf. Read the account mode (`PAPER`/`LIVE`) from the account query. Before placing, modifying, or canceling orders, confirm the target market, account mode, and authorization scope. Read-only queries may be run directly; transaction operations require user authorization. Continuing authorization within clearly defined limits does not require reconfirmation for every transaction.
2. **Check and update the CLI**: Follow [`references/install.md`](references/install.md) Steps 1 to 5 (CLI and TQX Skills). An installed CLI is updated only with `tqx self-update`, never by downloading over it, and never in the middle of an order operation. SDK packages remain project dependencies and must never be installed globally.
3. **Log in**: Use the API key supplied in the current conversation directly in the agent's process. Prefer running `tqx login --api-key=<api-key>` from the agent context after installation so the key is stored in the CLI credential store and stays usable across later sessions and terminal restarts; do not ask the user to run it. Use process-scoped `TQX_API_KEY` with `status` and trading queries only for a one-off or isolated task, or when the user does not want the key persisted. Do not echo the complete key or write it manually to source code, the repository, or project configuration. Ask for a key only when none is available; never assume that the user is authenticated.
4. **Check service status**: Run `tqx status --json` and confirm that the service is healthy and `authenticated: true`. If it fails because of the network or environment address, do not call the trading interface.
5. **Read account and report**: Run `tqx trading account --json` immediately after successful authentication, parse the returned mode, funds and other account fields. If the user requested positions or strategy construction from current holdings, also run `tqx trading positions --json` before replying. Report all requested account and position fields with real values; do not make up or omit returned fields. Mark stale snapshots explicitly.
   Then reply to the user with the following format (replace placeholder content with real values, don’t make up or omit returned fields):

   ```text
   I have seen your trading account information
   - Account mode: PAPER or LIVE
   - Funds: xxx
   - Positions: ...
   - Other returned account fields: ...
   - Snapshot time/staleness: ...
   ```

   Report the actual error when the account or position query fails, do not output the above success template. After reporting a successful snapshot, actively ask what trading strategy the user wants to build and collect the missing preferences before drafting it.
6. **Review trading commands**: Run `tqx trading --help`, then run `tqx trading account --help` and, as needed, `tqx trading positions --help`, `tqx trading orders --help`, and `tqx trading trades --help`.
   There is currently no documented `tqx trading --status` subcommand in the CLI, do not invent this command or retry it repeatedly.
7. **Collect the trading intent**: For a read-only query, return the requested current account data and stop unless the user asks for more. For a strategy-construction request, after reporting the account and positions, actively ask for the objective, market and instrument universe, holding period, rebalance frequency, risk tolerance or maximum drawdown, position sizing, long/short constraints, and stop conditions that are still missing; then draft a strategy grounded in the returned account state. A strategy draft is not an order. For an order operation, collect the user's explicit instrument, direction, quantity, order type, price when required, and risk boundaries. If the user separately requests research or decision support, use [`tqx-research`](../tqx-research/SKILL.md) as an independent Qube workflow; do not describe it as part of the trading backend or require it for routine account queries.
8. **Reconfirm after optional research**: Treat any Qube research, backtest, or simulation output only as decision support. It does not place an order and is not authorization to trade. Return to the trading system, summarize the exact proposed order and risk limits, and obtain explicit one-time or continuing authorization before execution.
9. **Check accounts and positions**: Run `tqx trading account --json` and `tqx trading positions --json`, adding `tqx trading orders list --json` and `tqx trading trades --json` when needed, and `tqx trading cash-flows --json` to trace per-currency cash movements (a `cash_flows_unsupported` error means the channel cannot provide a ledger, not that there were no movements). Clearly report `LIVE`/`PAPER`, cash/available funds, positions, open orders, fills, and `as_of`/`is_stale`; mark stale snapshots explicitly.
10. **Prepare orders and obtain authorization**: Based on the user's confirmed rules, prepare candidate orders listing the securities, direction, type, quantity, price, idempotency keys, rationale, and estimated impact. A one-time approval authorizes only that draft. Continuing authorization must define its scope, risk limit, rebalancing frequency, stop conditions, and validity period. Update any field the user changes, then present the draft for confirmation.
11. **Execute and cross-check**: Run `tqx trading orders --help` before placing an order, then call `orders place` as documented. Save `signal_id`/`order_id`, and remember that the place response is a signal response, not a final order response. Query with `tqx trading signals get`, `tqx trading orders get`, and `tqx trading orders list`, and cross-check with `tqx trading trades` until the final order status is known. `ACCEPTED`, `PENDING`, and `UNKNOWN` are not fills; only `FILLED` means the order is fully filled. On a timeout or unknown result, reuse the original idempotency key and query first; never retry blindly with a new key.
12. **Review each cycle**: Repeat status, account, position, order, fill, and signal checks at the user's agreed frequency. Pause and ask the user if account mode, authorization scope, data freshness, authorization expiry, or a stop condition changes. Never expand the authorization scope automatically; stop trading immediately when a stop condition is met and retain only status queries and reports.

## Continuous Monitoring and Recovery

When ongoing tracking is requested or a portfolio is first created, remind the user to set up a scheduled or automated task. Make the frequency, monitoring period, market, commands, alert channels, and stop conditions explicit. Schedules are read-only by default; automatic order placement is allowed only when explicitly covered by the continuing authorization. Each scheduled run must rerun `tqx status --json`, account, position, open-order, fill, and related signal queries, and record the timestamp and `is_stale` value.
If the user actively exits or restarts the agent, the user is prompted to resume the task using words similar to the following:

> Please retrieve your memory and this Skill and continue to help me monitor my positions and transactions. First run `tqx status --json` to confirm the authentication and account mode.
> Check accounts, positions, outstanding orders, transactions and signals again; confirm whether the previous continuous agent authorization is still valid, and only automatically trade within the authorized scope. If it exceeds the scope, ask first.

After recovery, do not rely on remembered balance, positions, or order status; re-query the current state. Automatic trading may resume only under an unexpired continuing authorization explicitly granted by the user; vague historical memory cannot restore authorization. If local credentials are invalid and the user has provided a new key, repeat the login; otherwise ask for the key without echoing it.

## Prepare CLI for users

1. First distinguish the requirements: use the CLI to directly execute transaction tasks; install the SDK only for programming access in TypeScript/JavaScript applications (see `references/commands.md`, "Install SDK").
2. Install, update, and repair the CLI only through [`references/install.md`](references/install.md).
3. Add `--json` to all programmatic CLI calls by default, parse JSON before summarizing; do not rely on colored table text.
4. Run `tqx status --json` first. Make sure the service is healthy and `authenticated` is `true` before accessing the transaction interface.
5. If the user switches the API environment, use the runtime `TQX_BASE_URL`; do not mix the credentials or results of the test environment and the production environment.

## Query process

1. Select the account, position, order, deal or signal command according to the request.
2. Pass only the filter conditions specified by the user or required by the task. Security symbols use `<code>.<market>`, for example `00700.HK` or `AAPL.US`.
3. A single list page returns at most 100 items. Continue pagination only when the user needs the full list, and pass `next_cursor` unchanged to the next call.
4. Preserve time, `is_stale`, order status and null value semantics in the response. Clearly state when account data is a stale snapshot.
5. Distinguish between quantity, available quantity, traded quantity and remaining quantity when summarizing the results; the amount and price remain the decimal strings returned by the CLI.
   Do not perform floating-point rounding yourself.

## Order process

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

## Order modification and order cancellation process

1. First use `orders get <order-id>` to get the current order, check the security, direction, quantity, price, completed and remaining quantity, and status.
2. Order modification only supports changing to a positive price. Display the old price and new price to confirm that the operation falls within the scope of this or continuing agency authorization.
3. When canceling an order, the order ID, security, direction, remaining quantity and current status are displayed to confirm that the operation falls within the scope of this or continuing agency authorization.
4. Only submit the operation once when the authorization is valid. `accepted: true` only means that the request was accepted, and then query the order again to confirm the final status.

## Error handling

- CLI parameter or local validation errors usually have an exit code of 2; API, network, and protocol errors usually have an exit code of 1.
- `sh: tqx: command not found` is a local CLI startup/PATH problem and cannot be treated as `401 invalid_api_key`; first handle it with the Troubleshooting table in `references/install.md`.
- Preserve and report `message`, `code`, `status`, `request_id` and optional `data` in JSON errors, do not fake success results.
  Trading rejections use specific HTTP/code pairs: `409 insufficient_funds`, `409 insufficient_position`,
  `409 position_direction_conflict`, `409 market_closed`, `409 account_locked`, `409 agent_cooldown`,
  `409 invalid_trade_date`, `409 order_not_cancellable`, `409 order_not_modifiable`,
  `422 invalid_lot_size`, `422 invalid_order_price`, `422 invalid_symbol`,
  `422 risk_control_blocked`, `422 order_rejected`, `403 market_not_permitted`,
  `404 order_not_found`, `404 signal_not_found`, and `504 trading_timeout`.
  The status class is the retry signal: `409` means the same order may succeed once state changes
  (market opens, funds settle, or the lock/cooldown clears; do not alter the order to work around it), while `422` means the order content must be fixed
  before resubmitting. Never retry a `422` unchanged.
  `500 trading_data_mapping_error` means the upstream trading payload could not be interpreted safely.
  `503 trading_service_unavailable` means the trading channel is unavailable, including the case where the
  request never reached the broker and no verdict could be obtained.
  `503 data_unavailable` means the agent activity mark could not be persisted or timed out; the hold operation is idempotent for the day and may be retried later.
  Current order rejections, including unclassified broker rules, use `422 order_rejected`;
  `502 upstream_rejected` is retained only for compatibility with legacy responses.
  The `data` of a rejection may include `signal_id`, `state`, `order_id`, `order_status`, `error_code`,
  `broker_error_id`, and `rejection_reason`; preserve these structured fields to locate the problem and
  continue the query. Do not discard them or replace the idempotent key because you receive an error response.
- Recheck `status` when authentication fails; when encountering network or unknown signal status, first query existing signals or orders to avoid placing repeated orders.
- CLI parameters may change from version to version. When the command fails and prompts for unknown parameters, first run `--help` at the corresponding level, and then make corrections based on the help.

## Investment research

Keep Qube investment research separate from this trading system. Use [`tqx-research`](../tqx-research/SKILL.md) for factors, strategies, backtests, Qube simulation, or decision support. For a competition request, follow the Competition entry workflow above and verify the trading account connection first. Research output may inform a later user-authorized trade, but it never submits an order or authorizes trading by itself.

## Bug reporting

When a reproducible TQX trading/API defect is found during a coding-agent task, use the bug-report interface to proactively send a complete diagnostic report when the user has asked to investigate, fix, or report the defect. If the task does not authorize an external report, prepare the report and ask for confirmation before submitting it. A trading error such as an expected broker rejection is not automatically a product bug.

```text
tqx bug report --title="Short title" --desc="Steps to reproduce, account mode, complete response, and request_id" --json
```

The command accepts a title and Markdown description. Do not add undocumented flags or fields.

Make the description as detailed as possible so developers can reproduce and fix the issue quickly. Include the complete input parameters and complete response result, preserving the original field names and values, along with the account mode, reproduction steps, and environment.
