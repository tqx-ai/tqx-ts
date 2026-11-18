# Trading errors and API diagnostics

## API reference

- OpenAPI JSON (machine-readable spec): `https://www.tqx.trade/openapi/v1/openapi.json`
- OpenAPI Scalar (human-readable docs page): `https://www.tqx.trade/openapi/v1/scalar`

To verify HTTP endpoints, request/response fields, authentication methods, and error structures, read the machine-readable spec: fetch `openapi.json` with `curl`, `Invoke-RestMethod`, or another non-browser HTTP client and parse it. Do not fetch the Scalar URL with an HTTP client — it returns only an HTML shell, not the spec. The Scalar page is an interactive documentation page for humans; only if the `openapi.json` spec cannot be obtained by any non-browser means, and browsing is required, may you fall back to a browser-use capability to read Scalar. CLI parameters and command behavior take precedence over this Skill, `references/commands.md`, and `tqx --help`; do not bypass the CLI or user authorization simply because an endpoint exists in OpenAPI.

## Errors

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

## Product defects

When a reproducible TQX trading/API defect is found during a coding-agent task, use the bug-report interface to proactively send a complete diagnostic report when the user has asked to investigate, fix, or report the defect. If the task does not authorize an external report, prepare the report and ask for confirmation before submitting it. A trading error such as an expected broker rejection is not automatically a product bug.

```text
tqx bug report --title="Short title" --desc="Steps to reproduce, account mode, complete response, and request_id" --json
```

The command accepts a title and Markdown description. Do not add undocumented flags or fields.

Make the description as detailed as possible so developers can reproduce and fix the issue quickly. Include the complete input parameters and complete response result, preserving the original field names and values, along with the account mode, reproduction steps, and environment.
