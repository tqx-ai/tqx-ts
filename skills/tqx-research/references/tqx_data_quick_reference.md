# TQX Data Quick Reference

This reference covers `tqx_data` inside Qube strategy source. For the `tqx-data` package on the user's own computer, use [`tqx-data`](../../tqx-data/SKILL.md).

## Qube Strategy Availability

Qube strategies can call every method documented in `tqx_data_usage.md` except `calculate_indicators`; the Qube server rejects `tqx_data` calls whose names do not start with `get_`. The CLI strategy validator enforces the same set, and its "not in the allowlist" error lists it.

Before calling a method, read its full section in `tqx_data_usage.md` and verify parameters, fields, dates, and market limits.

If saving a strategy fails with `quality_gate_failed` for `get_event_devidend`, or for `market="nb"` in `get_tick_data` or `get_filing_announcement`, the Qube server has not received its registry fix yet. Until it does, fetch dividend events locally with tqx-data and keep the dependent calculation outside Qube.

## Route by Research Task

| Research need | Qube strategy source | Local tqx-data |
|---|---|---|
| HK/US daily bars | `get_hk_daily` / `get_us_daily` | Same methods |
| HK/US minute bars | `get_hk_min` / `get_us_min` | Not available |
| Live minute, latest tick, live snapshot | `get_min_data` / `get_tick_data` / `get_live_market_data` | `TickStreamClient` stream |
| Stock details, calendars | `get_stock_detail` / `get_trading_calendar` | Same names, different market parameters |
| Index members | `get_index_component` | Not available |
| Factors, filings | `get_factor` / `get_filing_announcement` | Not available |
| Financial statements | `get_financial_statement` | `get_financial_statement` |
| Dividends, splits, other corporate events | `get_event_*` | `get_event_*` |
| Company fundamentals, holdings, consensus | `get_company_*` / `get_consensus_*` | Same methods |
| FX | `get_currency` | `get_currency` |
| Technical indicators | Compute in strategy code | Not available |

## Point-in-Time Use

- Events carry an announcement date (`publish_date` or `info_date`). Keep only events announced on or before each rebalance date.
- `get_company_concentration`, `get_company_top_concentration`, `get_company_investor`, `get_company_current`, `get_company_imed`, `get_company_price_vol`, `get_consensus_nonperiod`, and `get_consensus_recommend` take no dates and return the latest snapshot. Using them for historical signals leaks future information into a backtest; use them only to screen the current state.
- Dated company data (`get_company_insider_transaction`, `get_company_shareholder_report`, `get_company_oper_metrics`) must also be filtered by the date it became public.

## Known Data Issues

- `alt_close` equals `close` and is not adjusted for dividends or splits. Do not use it as an adjusted or total-return price; apply `get_event_devidend` events yourself.
- `get_stock_detail` can return many duplicate rows. Drop exact duplicates and confirm that the remaining rows agree on every field you use before relying on it.

## Minimum Return Validation

Check that the result is non-empty, required fields exist, dates are sorted and not duplicated, numeric values contain no unhandled NaN/Inf, prices and volumes are positive, and financial/event data satisfies `source_date <= rebalance_date`.
