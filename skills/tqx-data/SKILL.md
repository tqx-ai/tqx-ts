---
name: tqx-data
description: Use when the user needs Hong Kong or US market data through the local Python tqx-data package, including setup, daily prices, fundamentals, financial statements and tick streams. Qube research and trading accounts use their separate Skills.
---

# TQX Data

Use the local PyPI package `tqx-data`. Its supported contract differs from Qube's embedded module and from trading tools. Route Qube factors, strategy source and backtests to [tqx-research](../tqx-research/SKILL.md), and accounts or orders to [tqx-trading](../tqx-trading/SKILL.md).

## Load the contract needed for the request

- Setup, API key, environment, helper `setup`/`login`/`run`: [authentication](references/authentication.md). Resolve `scripts/tqx_data_auth.py` relative to this Skill's directory; use its absolute path when the working directory is elsewhere.
- A data request: read the matching [local API section](references/api-reference.md); check the installed `tqx_data.md` for version-specific fields and limits. Do not load unrelated method catalogs.
- Historical analysis, event adjustments or ambiguous snapshots: [data quality](references/data-quality.md).
- Confusion with Qube: [local versus Qube](references/qube-vs-local.md).

Confirm the requested market, symbols, period and fields from the task. Local methods normally use `market="hk"`/`"us"`, HK codes such as `0700.HK`, bare US codes such as `AAPL`, and `YYYYMMDD` dates. `TickStreamClient` uses uppercase `HK`/`US`. Do not import Qube-only methods or apply Qube engine symbol suffixes to local queries.

Use available credentials in the agent context; never expose keys in replies, logs, command arguments or source. Request a key only when none is configured. Prefer process-scoped credentials for one-off work; use the helper when persistent setup is requested.

## Query and report

Request only the needed symbols and fields. Tabular methods return `pandas.DataFrame`; check symbols, dates, coverage, ordering, duplicates and nulls before calculations. `alt_close` equals `close` in this package and is not an adjusted price. Use corporate events explicitly for adjusted returns. Historical fundamentals require announcement-time visibility; undated snapshots are not historical observations.

Handle `ApiKeyInvalidError`, `InsufficientScopeError`, `RateLimitError` and `ServiceError` as documented by the package. A missing method or unsupported market is not permission to switch interfaces. Report the method, non-secret parameters, package version, row count and limitations; preserve request IDs for failures without exposing raw authentication material.

For remote loading, fetch the helper and required references from the same revision. Source-only methods absent from `tqx_data.md` are outside the supported local contract.
