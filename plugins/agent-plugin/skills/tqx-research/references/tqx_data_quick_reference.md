# Runtime data quick reference

Read [calling conventions](data/index.md) first, then the exact market/method page linked from [the API index](tqx_data_usage.md). Copy only documented signatures and fields and check the returned DataFrame before selecting columns.

- HK source/engine symbols: four digits plus `.HK`, for example `0700.HK`.
- US engine symbols: `.NB`, for example `AAPL.NB`; native data queries generally use bare NASDAQ BASIC codes (`AAPL`), with `.NB` compatibility where documented. Normalize only at the documented boundary.
- [HK](data/index.md) and [US](data/index.md) historical daily, adjusted daily, minute and index interfaces are market-specific.
- [Shared data](data/index.md) includes calendars, reference data, financial statements, events, currency and `get_factor`. `get_financial_statement` requires explicit `market`; `get_factor` uses `type`, with US `nb`/`us` equivalence as documented.
- `get_index_component` is undated. Use documented dated market-specific constituents only when validation and runtime coverage support them.

Direct `tqx_data` imports are rejected by current Qube strategy validation; use the selected market engine API in source. A native export is not a strategy allow-list. Verify source diagnostics and actual service responses, including field availability and announcement-time cutoffs. Factor source uses injected `factors` and operators, not direct `tqx_data`. See [factor creation](factor-creation.md). Never put runtime credentials or infrastructure access into generated source.
