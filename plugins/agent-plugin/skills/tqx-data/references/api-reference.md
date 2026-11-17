# Local `tqx-data` API Reference

This reference covers the API-key Python package installed from PyPI. It does
not describe Qube's separate `tqx_data` runtime or the TypeScript TQX CLI.
Return types for tabular methods are `pandas.DataFrame`.

## Initialization

```text
init(*, api_key=None, base_url=None) -> client
```

`api_key` takes precedence over `TQX_API_KEY`. `base_url` takes precedence over
`TQX_API_BASE_URL` when both are supplied.

## Daily and Reference Data

```text
get_hk_daily(symbol=None, start_date=None, end_date=None, fields=None, **kwargs)
get_us_daily(symbol=None, start_date=None, end_date=None, fields=None, **kwargs)
get_stock_detail(symbol=None, market="hk", status=None, fields=None, **kwargs)
get_trading_calendar(start_date=None, end_date=None, market="hk", is_trading_day=None, fields=None, **kwargs)
get_currency(start_date=None, end_date=None, fields=None, **kwargs)
```

Daily data requests require both date bounds in the local package and are limited
to the package's documented maximum range. Confirm the installed `tqx_data.md`
before requesting a range near the limit.

## Corporate Events

```text
get_event_devidend(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs)
get_event_capital_market(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs)
get_event_corporate_actions(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs)
get_event_fina_disclosure(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs)
get_event_investor_relation_activities(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs)
```

Keep the public method spelling `get_event_devidend` exactly as published, even
though the spelling is unconventional.

## Company and Consensus Data

```text
get_company_concentration(symbol=None, market="hk", fields=None, **kwargs)
get_company_top_concentration(symbol=None, market="hk", fields=None, **kwargs)
get_company_investor(symbol=None, market="hk", fields=None, max_rank=None, **kwargs)
get_company_insider_transaction(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs)
get_company_shareholder_report(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs)
get_company_oper_metrics(symbol=None, market="hk", fields=None, start_year=None, end_year=None, **kwargs)
get_company_imed(symbol=None, market="hk", fields=None, **kwargs)
get_company_price_vol(symbol=None, market="hk", fields=None, **kwargs)
get_company_current(symbol=None, market="hk", fields=None, **kwargs)
get_consensus_nonperiod(symbol=None, market="hk", fields=None, **kwargs)
get_consensus_recommend(symbol=None, market="hk", fields=None, **kwargs)
```

Methods without date parameters return the latest available snapshot. Do not
present them as historical observations.

## Financial Statements

```text
get_financial_statement(
    start_quarter,
    end_quarter,
    symbol=None,
    fields=None,
    market=None,
    date=None,
    is_latest=True,
    interim_type="cumulative",
    **kwargs,
) -> DataFrame
```

For the local package, use `market="hk"` or `market="us"`. Use an announcement
date cutoff when constructing a historical panel, and set `is_latest=False` when
the task requires multiple reporting versions.

## TickStreamClient

`TickStreamClient` is local-only and uses the initialized API key.

```text
TickStreamClient(..., market="HK" | "US")
subscribe_tick(symbols)
unsubscribe_tick(symbols)
listen(...)
close()
subscribed_symbols
is_running
get_stats()
```

Use bare US symbols and pass an explicit uppercase market. Do not describe this
stream as an MCP tool or as an account trading feed.

## Unsupported Local Methods

The following methods belong to other surfaces and must not be suggested for the
PyPI package:

```text
get_hk_min
get_us_min
get_min_data
get_tick_data
get_live_market_data
calculate_indicators
get_index_component
get_filing_announcement
get_factor
```
