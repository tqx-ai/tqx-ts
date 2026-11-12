# Qube `tqx_data` HK/US Parameter Matrix

These values apply only to `tqx_data` in Qube strategy source and match the CLI
strategy validator. They do not describe the local PyPI `tqx-data` package,
which has a separate public contract; see [`tqx-data`](../../tqx-data/references/qube-vs-local.md).

| Data category | Hong Kong | United States | Note |
|---|---|---|---|
| Symbol | `0700.HK` | Depends on the method | Live minute and tick methods use `TSLA.NB`; check each method's symbol format |
| Daily bars | `get_hk_daily` | `get_us_daily` (symbols may be `AAPL` or `AAPL.NB`) | `alt_close` is corporate-action adjusted; the US result symbol has no suffix |
| Minute bars | `get_hk_min` | `get_us_min` | `frequency` is `1m`, `5m`, `10m`, or `60m`; verify timezone, DST, and sessions |
| Live minute bars and latest tick | `market="hk"` | `market="us"` or `"nb"` | `get_min_data` and `get_tick_data` require `.NB` when symbols are supplied; whole-market queries use `market` |
| Filings | `market="hk"` | `market="us"` or `"nb"` | `get_filing_announcement` |
| Financial statements | `market="hk"` | `market="us"` or `"nb"` (required) | `get_financial_statement`; filter by announcement time |
| Factors | `type="hk"` | `type="us"` or `"nb"` | Factor type must match symbols |
| Stock details, trading calendar, index members | `market="hk"` | `market="us"` or `"nb"` | These methods accept both US aliases; do not assume calendar days are trading days; historical backtests need historical index membership |
| Events, company data, consensus | `market="hk"` | `market="us"` or `"nb"` | `get_event_*`, `get_company_*`, `get_consensus_*`; undated company and consensus methods return the latest snapshot |

## Point-in-Time Constraints

```text
announcement_date <= rebalance_date
source_date <= decision_time
```
