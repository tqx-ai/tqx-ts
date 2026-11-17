# `tqx_data` API comparison

This table records the supported public surfaces of the two environments. Only
documented methods are listed.

## Public method sets

| Surface | Public methods |
|---|---|
| Qube `tqx_data` | `get_live_market_data`, `calculate_indicators`, `get_stock_detail`, `get_factor`, `get_hk_daily`, `get_hk_min`, `get_currency`, `get_us_daily`, `get_us_min`, `get_trading_calendar`, `get_min_data`, `get_tick_data`, `get_financial_statement`, `get_filing_announcement`, `get_event_devidend`, `get_event_fina_disclosure`, `get_event_capital_market`, `get_event_corporate_actions`, `get_event_investor_relation_activities`, `get_company_shareholder_report`, `get_company_investor`, `get_company_concentration`, `get_company_insider_transaction`, `get_company_top_concentration`, `get_index_component`, `get_company_oper_metrics`, `get_consensus_nonperiod`, `get_consensus_recommend`, `get_company_price_vol`, `get_company_current`, `get_company_imed` |
| Local API-Key package | `get_trading_calendar`, `get_currency`, `get_stock_detail`, `get_event_devidend`, `get_event_capital_market`, `get_event_corporate_actions`, `get_event_fina_disclosure`, `get_event_investor_relation_activities`, `get_company_concentration`, `get_company_top_concentration`, `get_company_investor`, `get_company_insider_transaction`, `get_company_shareholder_report`, `get_company_imed`, `get_company_price_vol`, `get_consensus_nonperiod`, `get_consensus_recommend`, `get_company_oper_metrics`, `get_company_current`, `get_financial_statement`, `get_hk_daily`, `get_us_daily`, and `TickStreamClient` |

The shared method names have different implementation contracts. The following
are the public signatures from the source files.

## Qube wheel signatures

```text
get_live_market_data(symbols: List[str], count: int = 500) -> Dict[str, List[Dict]]
calculate_indicators(market_data: Dict[str, List[Dict]], indicator_params: Dict[str, Dict]) -> Dict[str, Dict[str, List]]
get_stock_detail(symbol=None, market="hk", status=None, fields=None) -> DataFrame
get_factor(symbol=None, start_date="", end_date="", type="hk", factors=None) -> DataFrame
get_hk_daily(symbol=None, start_date=None, end_date=None, fields=None) -> DataFrame
get_hk_min(symbol=None, start_date="", end_date="", fields=None, time_zone=None, frequency="1m") -> DataFrame
get_currency(start_date=None, end_date=None, fields=None) -> DataFrame
get_us_daily(symbol=None, start_date=None, end_date=None, fields=None, market="nb") -> DataFrame
get_us_min(symbol=None, start_date="", end_date="", fields=None, time_zone=None, frequency="1m", market="nb") -> DataFrame
get_trading_calendar(start_date=None, end_date=None, market="hk", is_trading_day=None, fields=None) -> DataFrame
get_min_data(symbol=None, count=500, market="hk", max_workers=20, frequency="1m") -> DataFrame
get_tick_data(symbol=None, market="hk") -> DataFrame
get_financial_statement(start_quarter, end_quarter, symbol=None, fields=None, market=None, date=None, is_latest=True, interim_type="cumulative") -> DataFrame
get_filing_announcement(symbol=None, start_date=None, end_date=None, fields=None, market="hk") -> DataFrame
get_event_devidend(symbol=None, market="hk", fields=None, start_date=None, end_date=None) -> DataFrame
get_event_capital_market(symbol=None, market="hk", fields=None, start_date=None, end_date=None) -> DataFrame
get_event_corporate_actions(symbol=None, market="hk", fields=None, start_date=None, end_date=None) -> DataFrame
get_event_fina_disclosure(symbol=None, market="hk", fields=None, start_date=None, end_date=None) -> DataFrame
get_event_investor_relation_activities(symbol=None, market="hk", fields=None, start_date=None, end_date=None) -> DataFrame
get_company_concentration(symbol=None, market="hk", fields=None) -> DataFrame
get_company_top_concentration(symbol=None, market="hk", fields=None) -> DataFrame
get_company_investor(symbol=None, market="hk", fields=None, max_rank=None) -> DataFrame
get_company_insider_transaction(symbol=None, market="hk", fields=None, start_date=None, end_date=None) -> DataFrame
get_company_shareholder_report(symbol=None, market="hk", fields=None, start_date=None, end_date=None) -> DataFrame
get_index_component(index_symbol=None, stock_symbol=None, market="hk") -> DataFrame
get_company_oper_metrics(symbol=None, market="hk", fields=None, start_year=None, end_year=None) -> DataFrame
get_consensus_nonperiod(symbol=None, market="hk", fields=None) -> DataFrame
get_consensus_recommend(symbol=None, market="hk", fields=None) -> DataFrame
get_company_price_vol(symbol=None, market="hk", fields=None) -> DataFrame
get_company_current(symbol=None, market="hk", fields=None) -> DataFrame
get_company_imed(symbol=None, market="hk", fields=None) -> DataFrame
```

## Local API-Key signatures

```text
init(*, api_key=None, base_url=None) -> client
get_hk_daily(symbol=None, start_date=None, end_date=None, fields=None, **kwargs) -> DataFrame
get_us_daily(symbol=None, start_date=None, end_date=None, fields=None, **kwargs) -> DataFrame
get_stock_detail(symbol=None, market="hk", status=None, fields=None, **kwargs) -> DataFrame
get_trading_calendar(start_date=None, end_date=None, market="hk", is_trading_day=None, fields=None, **kwargs) -> DataFrame
get_currency(start_date=None, end_date=None, fields=None, **kwargs) -> DataFrame
get_event_devidend(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs) -> DataFrame
get_event_capital_market(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs) -> DataFrame
get_event_corporate_actions(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs) -> DataFrame
get_event_fina_disclosure(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs) -> DataFrame
get_event_investor_relation_activities(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs) -> DataFrame
get_company_concentration(symbol=None, market="hk", fields=None, **kwargs) -> DataFrame
get_company_top_concentration(symbol=None, market="hk", fields=None, **kwargs) -> DataFrame
get_company_investor(symbol=None, market="hk", fields=None, max_rank=None, **kwargs) -> DataFrame
get_company_insider_transaction(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs) -> DataFrame
get_company_shareholder_report(symbol=None, market="hk", fields=None, start_date=None, end_date=None, **kwargs) -> DataFrame
get_company_oper_metrics(symbol=None, market="hk", fields=None, start_year=None, end_year=None, **kwargs) -> DataFrame
get_company_imed(symbol=None, market="hk", fields=None, **kwargs) -> DataFrame
get_company_current(symbol=None, market="hk", fields=None, **kwargs) -> DataFrame
get_company_price_vol(symbol=None, market="hk", fields=None, **kwargs) -> DataFrame
get_consensus_nonperiod(symbol=None, market="hk", fields=None, **kwargs) -> DataFrame
get_consensus_recommend(symbol=None, market="hk", fields=None, **kwargs) -> DataFrame
get_financial_statement(start_quarter, end_quarter, symbol=None, fields=None, market=None, date=None, is_latest=True, interim_type="cumulative", **kwargs) -> DataFrame
```

`TickStreamClient` is a local-only class. Its constructor requires an explicit
`market="HK"` or `market="US"`; it supports `subscribe_tick`,
`unsubscribe_tick`, `listen`, `close`, `subscribed_symbols`, `is_running`, and
`get_stats`.

## Market conventions

- In the local package, use `market="us"` for US data in combined methods,
  including `get_financial_statement`. Some older method versions also accept
  `nb` as a compatibility alias.
- In the Qube wheel, use `us` for stock details, trading calendars, events,
  company data, consensus, and index-related methods. Use `nb` for factors,
  filings, financial statements, and US minute-data methods.
- `.NB` is a symbol suffix used by Qube interfaces that require suffixed US
  symbols. The local package's documented US examples and `TickStreamClient`
  use bare symbols such as `AAPL`.
