---
name: tqx-data
description: Use the TQX Python tqx-data package from PyPI for Hong Kong and US stock data. Covers Dev Settings API-key onboarding, package installation, complete local API contracts, typed errors, corporate events, company data, financial statements, daily bars, and TickStreamClient. Do not use the TypeScript TQX CLI, Qube's tqx_data runtime, trading MCP tools, or undocumented methods.
---

# TQX Data

## Scope

This Skill uses the local Python package named `tqx-data` from PyPI. It is a
Python SDK with an optional command-line setup helper, not the TypeScript
`@tqx-ai/cli` and not the `tqx_data` runtime embedded in Qube.

Use this Skill for:

- Hong Kong and US daily data;
- stock reference data and trading calendars;
- corporate events and company data;
- consensus and financial statements;
- local `TickStreamClient` WebSocket ticks.

Do not use this Skill for account balances, positions, orders, fills, or trading
controls. Route those requests to `tqx-trading`. Do not use it for Qube strategy
source, factors, strategy definitions, or backtests. The current Agent Plugin
does not provide an investment-research MCP capability.

## Onboarding

The user must create an API key with the `data` permission in TQX Dev Settings:

`https://www.tqx.ai/user-center?tab=dev-settings`

Install the Python package in the user's Python environment:

```bash
python3 -m pip install --upgrade tqx-data
```

Initialize it explicitly or through environment variables. Use the base URL
provided for the user's TQX environment.

```python
import tqx_data

tqx_data.init(
    api_key="<api-key>",
    base_url="https://tqxdata.tqx.ai",
)
```

```bash
export TQX_API_KEY="<api-key>"
export TQX_API_BASE_URL="https://tqxdata.tqx.ai"
```

Never print, echo, commit, or include an API key in source code, command output,
logs, generated files, or ordinary responses. Ask for the key only when the
package reports that no key is configured, and use it only in the current agent
execution context.

For persistent local setup, use the bundled `scripts/tqx_data_auth.py` helper.
It creates an isolated virtual environment, installs `tqx-data`, and stores the
credential in the operating-system keychain when available or a 0600 file
otherwise. The helper never prints the API key.

```bash
python3 scripts/tqx_data_auth.py setup
python3 scripts/tqx_data_auth.py status
python3 scripts/tqx_data_auth.py login <<'EOF'
{"api_key":"<api-key>","base_url":"https://tqxdata.tqx.ai"}
EOF
python3 scripts/tqx_data_auth.py run analysis.py
python3 scripts/tqx_data_auth.py info
python3 scripts/tqx_data_auth.py logout
```

## Contract Authority

Read the installed package's `tqx_data.md` before constructing a request. This
Skill's [API reference](references/api-reference.md) and the complete
[local-versus-Qube comparison](references/qube-vs-local.md) are the local package
method index and boundary contract. The [API comparison](references/api-comparison.md)
preserves the published signatures for both environments so that similarly named
methods are not mixed. If a method, field, default, or response shape is absent
from those references and the installed `tqx_data.md`, do not invent it.

All tabular methods return `pandas.DataFrame`. Preserve the returned column names
and dtypes until the user asks for a presentation-only transformation.

## API Surface

The local package supports:

- daily bars: `get_hk_daily`, `get_us_daily`;
- reference data: `get_stock_detail`, `get_trading_calendar`, `get_currency`;
- corporate events: `get_event_devidend`, `get_event_capital_market`,
  `get_event_corporate_actions`, `get_event_fina_disclosure`,
  `get_event_investor_relation_activities`;
- company data: `get_company_concentration`, `get_company_top_concentration`,
  `get_company_investor`, `get_company_insider_transaction`,
  `get_company_shareholder_report`, `get_company_oper_metrics`,
  `get_company_imed`, `get_company_price_vol`, `get_company_current`;
- consensus data: `get_consensus_nonperiod`, `get_consensus_recommend`;
- financial statements: `get_financial_statement`;
- local streaming: `TickStreamClient`.

The local package does not support Qube-only `get_hk_min`, `get_us_min`,
`get_min_data`, `get_tick_data`, `get_live_market_data`, `calculate_indicators`,
`get_index_component`, `get_filing_announcement`, or `get_factor`.

## Market and Symbol Rules

- Use `market="hk"` or `market="us"` for local combined methods.
- Hong Kong symbols use the `.HK` suffix, such as `0700.HK`.
- Local package US examples use bare symbols, such as `AAPL`.
- `nb` is a legacy compatibility spelling accepted by some older methods; use
  `us` in new requests.
- `TickStreamClient` requires an explicit uppercase `market="HK"` or
  `market="US"` and uses bare US symbols.
- Do not apply Qube's `.NB` symbol convention to local package requests.

## Query Workflow

Before a request, confirm the market, symbols, date range, fields, and whether the
user needs current-state or historical data. Use the narrowest method and field
set that answers the question. Dates use `YYYYMMDD` unless the installed method
documentation states otherwise.

After a request:

1. verify that returned symbols and date columns match the request;
2. check for empty results, duplicate rows, missing values, and stale snapshots;
3. apply the rules in [data quality](references/data-quality.md);
4. report the method, parameters, package version, and any limitations when the
   result is used for analysis.

## Errors

Catch and route the package's typed errors according to
[errors](references/errors.md). Do not expose raw response bodies, API keys, or
internal stack traces.

For reproducible data defects, record the method, complete non-secret parameters,
package version from `info`, a complete bounded response sample, and the expected
result. Use the same language as the user for prose, while preserving API field
names, identifiers, code, logs, and response values exactly.

## Remote Package Files

When this Skill is loaded remotely, fetch the helper, API references, comparison
files, and assets from the same plugin revision. Do not substitute files from a
different branch or from the Qube-only research references.

## Routing

- MCP connection or OAuth: `tqx-setup`.
- Account, position, order, fill, cash-flow, or trading control: `tqx-trading`.
- Qube factors, strategies, backtests, or Qube Python runtime: outside this
  plugin's `tqx-data` Skill.
- Unsupported or undocumented local methods: report that the package contract
  does not include them instead of falling back to another TQX surface.
