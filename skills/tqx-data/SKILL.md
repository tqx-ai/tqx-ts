---
name: tqx-data
description: Use the local API-Key tqx_data package for Hong Kong and US stock data. Covers installation, API-key setup, daily bars, reference data, corporate events, company fundamentals, financial statements, trading utilities, and the TickStreamClient WebSocket stream. Use tqx-research for the separate tqx_data runtime inside Qube strategies, and tqx-trading for account-based trading.
---

# TQX Data

This Skill operates the **local PyPI package**. It is a different build from
the `tqx_data` module embedded in Qube. The local package documents 22 data
methods and the `TickStreamClient` stream. Only methods documented in the
package's `tqx_data.md` are supported. See [the API comparison](references/api-comparison.md)
for the documented signatures and the Qube-only surface.

## Authentication

The local package uses an API key in the `X-API-Key` header. Username/password
login is disabled. Initialize it explicitly or through environment variables:

```python
import tqx_data

tqx_data.init(
    api_key="sk-tqx-...",
    base_url="https://tqxdata.tqx.ai",
)
```

```bash
export TQX_API_KEY="sk-tqx-..."
export TQX_API_BASE_URL="https://tqxdata.tqx.ai"
```

`api_key` takes precedence over `TQX_API_KEY`. `base_url` is the service base
URL. Use the base URL supplied for your TQX environment.

Use the bundled helper when a task needs a persistent local setup. It stores the
key in the operating-system credential store when available and otherwise in a
0600 file. It never prints the key:

```bash
python3 "$AUTH" setup
python3 "$AUTH" status
python3 "$AUTH" login <<'EOF'
{"api_key":"<key>","base_url":"https://tqxdata.tqx.ai"}
EOF
python3 "$AUTH" run analysis.py
python3 "$AUTH" info
python3 "$AUTH" logout
```

Ask the user for the key only when `status` or `run` reports that no key is
stored. Never put a key in source code, command arguments, logs, generated
files, or replies. `TQX_API_KEY` is the only process-scoped fallback; do not
reuse the old email/password workflow.

## Package boundary

- The local package returns `pandas.DataFrame` for HTTP data methods.
- Hong Kong symbols use `.HK`, for example `0700.HK`.
- The local package's documentation uses bare US symbols such as `AAPL`.
  `TickStreamClient` also requires bare US symbols.
- For the local package's combined methods, use `market="hk"` for Hong Kong
  and `market="us"` for US data. `nb` is a legacy compatibility spelling in
  methods that still accept it; use `us` in new code. This includes
  `get_financial_statement`.
- The local package has no Qube-only `get_hk_min`, `get_us_min`,
  `get_min_data`, `get_tick_data`, `get_live_market_data`,
  `calculate_indicators`, `get_index_component`, or `get_filing_announcement`.
- Source-only readers that are absent from `tqx_data.md` are not part of the
  supported local contract and must not be suggested.
- Local minute/Tick streaming is provided by `TickStreamClient`, which shares
  the API key initialized by `tqx_data.init`.

## Query rules

Read the method section in the installed `tqx_data.md` before constructing a
request. Dates use `YYYYMMDD` unless a method documents another form. Request
only the symbols and fields needed. For a symbol-specific query, verify the
returned `symbol` and date columns before using the result.

`alt_close` is not an adjusted price in this package: it equals `close`. Apply
corporate events from `get_event_devidend` yourself when building an adjusted
or total-return series. Event visibility is point-in-time: use the event's
announcement field (`publish_date` or `info_date`) and keep only rows visible at
the decision time. Undated company and consensus methods return the latest
snapshot and must not be used as historical backtest inputs.

`get_stock_detail` may contain duplicate rows. Drop exact duplicates and verify
that the remaining rows agree on every field used by the caller. Financial
statement history must pass an announcement-date cutoff through `date` and use
`is_latest=False` when constructing multi-period panels.

## Errors

Catch the package's typed errors rather than raw transport exceptions:

- `ApiKeyInvalidError`: the key is invalid or no longer active.
- `InsufficientScopeError`: the key does not have data access permission.
- `RateLimitError`: the request rate is too high.
- `ServiceError`: another service or data-access error.

Explain these errors in user-facing terms. Do not expose implementation details
from the response body.

## Bug reports

For a reproducible data issue, record the method, complete non-secret
parameters, package version from `info`, a complete response sample, and the
expected result. Never include the API key or any auth material.

## Remote files

When this Skill is loaded remotely, fetch `scripts/tqx_data_auth.py`,
`references/qube-vs-local.md`, and `references/api-comparison.md` from the same
revision. The canonical helper URL is
`https://raw.githubusercontent.com/tqx-ai/tqx-ts/refs/heads/main/skills/tqx-data/scripts/tqx_data_auth.py`.
