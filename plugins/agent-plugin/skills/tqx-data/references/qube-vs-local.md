# Qube `tqx_data` vs local `tqx-data`

These packages share the import name `tqx_data` but are separate builds.
Use the Qube surface only in Qube strategy source, and the local surface only
through the local API-Key package. The complete signatures are in
[api-comparison.md](api-comparison.md).

| Need | Qube `tqx_data` | Local API-Key package |
|---|---|---|
| Initialization | Qube data methods need no user initialization | `tqx_data.init(api_key=..., base_url=...)`; `TQX_API_KEY` and `TQX_API_BASE_URL` are supported |
| Daily bars | `get_hk_daily`, `get_us_daily`; date bounds optional in the wheel | Same names; both dates are required and limited to five years |
| Historical minute bars | `get_hk_min`, `get_us_min` | Not available |
| Live minute bars and latest tick | `get_min_data`, `get_tick_data`, `get_live_market_data` | Not available as functions; use `TickStreamClient` for WebSocket ticks |
| Technical indicators | `calculate_indicators` | Not available |
| Stock details | `get_stock_detail(market="hk" or "us")` | `get_stock_detail(market="hk" or "us")` |
| Trading calendar | `get_trading_calendar(market="hk" or "us")` | `get_trading_calendar(market="hk" or "us")`; `nb` is a compatibility spelling where accepted |
| Events and company data | Shared `get_event_*`, `get_company_*`, and consensus methods | Same names; use `market="us"` for US data; `nb` is a compatibility spelling where accepted |
| Factors | `get_factor(type="hk"/"nb"/"ny")` | Not available |
| Filings | `get_filing_announcement(market="hk" or "nb")` | Not available |
| Index members | `get_index_component(market="hk" or "us")` | Not available |
| Financial statements | `get_financial_statement(..., market="hk" or "nb")`; market is required | `get_financial_statement(..., market="hk" or "us")` |
| Authentication errors | No API-key contract in the wheel | `ApiKeyInvalidError`, `InsufficientScopeError`, `RateLimitError`, and `ServiceError` |

Both surfaces return pandas data frames for tabular methods, but their parameter
validation, defaults, paths, and available fields are not interchangeable.

For the local package, use `market="us"` when a combined method selects the US
market, including `get_financial_statement`. The Qube wheel has its own split:
reference, event, company, consensus, stock-detail, and calendar methods use
`us`, while factors, filings, financial statements, and US minute methods use
`nb`.
