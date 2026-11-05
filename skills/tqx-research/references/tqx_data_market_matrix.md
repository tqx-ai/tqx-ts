# Qube `tqx_data` HK/US Parameter Matrix

These values apply only to `tqx_data` in Qube strategy source and match the CLI
strategy validator. They do not describe the local PyPI `tqx-data` package,
which has a separate public contract; see [`tqx-data`](../../tqx-data/references/qube-vs-local.md).

| Data category | Hong Kong | United States | Note |
|---|---|---|---|
| Symbol | `0700.HK` | Depends on the method | Live minute and tick methods use `TSLA.NB`; check each method's symbol format |
| Daily bars | `get_hk_daily` | `get_us_daily` (`market="nb"` or `"ny"` when passed) | Unadjusted; `alt_close` equals `close` |
| Minute bars | `get_hk_min` | `get_us_min` | `frequency` is `1m`, `5m`, `10m`, or `60m`; verify timezone, DST, and sessions |
| Live minute bars and latest tick | `market="hk"` | `market="nb"` | `get_min_data` and `get_tick_data` select symbols by their suffix when symbols are provided; use `market` for a whole-market query |
| Filings | `market="hk"` | `market="nb"` | `get_filing_announcement` |
| Financial statements | `market="hk"` | `market="nb"` | `get_financial_statement`; filter by announcement time |
| Factors | `type="hk"` | `type="nb"` | Factor type must match symbols |
| Stock details, trading calendar, index members | `market="hk"` | `market="us"` | These three methods use `us`; do not assume calendar days are trading days; historical backtests need historical index membership |
| Events, company data, consensus | `market="hk"` | `market="us"` | `get_event_*`, `get_company_*`, `get_consensus_*`; undated company and consensus methods return the latest snapshot |

## Point-in-Time Constraints

```text
announcement_date <= rebalance_date
source_date <= decision_time
```
