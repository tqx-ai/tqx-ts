# TQX Data HK/US Parameter Matrix

These values apply to `tqx_data` in Qube strategy source and match the CLI strategy validator. The local `tqx-data` package uses different market parameters; see [`tqx-data`](../../tqx-data/references/qube-vs-local.md).

| Data category | Hong Kong | United States | Note |
|---|---|---|---|
| Symbol | `0700.HK` | `TSLA.NB` | Suffix must match the interface |
| Daily bars | `get_hk_daily` | `get_us_daily` (`market="nb"` or `"ny"` when passed) | Unadjusted; `alt_close` equals `close` |
| Minute bars | `get_hk_min` | `get_us_min` | `frequency` is `1m`, `5m`, `10m`, or `60m`; verify timezone, DST, and sessions |
| Live minute bars and latest tick | `market="hk"` | `market="nb"` | `get_min_data` and `get_tick_data`; `get_min_data` also accepts `us` for existing sources |
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
