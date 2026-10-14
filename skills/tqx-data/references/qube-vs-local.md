# Qube tqx_data vs local tqx-data

Qube strategy source and the local `tqx-data` package both expose a module named `tqx_data`, but they are different builds. Check this table before moving code or a method name from one side to the other.

- **Qube strategy runtime**: the methods that the `@tqx-ai/cli` strategy validator accepts. Its "not in the allowlist" error lists the current set. Fields and parameters are in tqx-research's `references/tqx_data_usage.md`.
- **Local tqx-data**: the PyPI package `tqx-data` 0.1.2, run through this Skill's helper. Fields and parameters are in the `tqx_data.md` shipped inside the installed package; `info` prints its path.

| Need | Qube strategy runtime | Local tqx-data 0.1.2 |
| --- | --- | --- |
| Login | None in source; the CLI uses the trading API key | Data account email and password through `scripts/tqx_data_auth.py` |
| Daily bars | `get_hk_daily`, `get_us_daily` | `get_hk_daily` (adds `frequency` `1D`/`1W`/`1M`), `get_us_daily` |
| Minute bars | `get_hk_min`, `get_us_min` (`1m`, `5m`, `10m`, `60m`) | Not available |
| Live minute bars, latest tick, live snapshot | `get_min_data`, `get_tick_data`, `get_live_market_data` | Not available; `TickStreamClient` streams ticks over WebSocket |
| Stock details | `get_stock_detail(market="hk" or "us")` | `get_stock_detail(market="hk" or "nb")`, `get_stock_detail_all` |
| Trading calendar | `get_trading_calendar(market="hk" or "us")` | `get_trading_calendar(exchange="HK" or "NB")`, `get_prev_trade_date`, `get_last_trade_date`, `get_trade_list` |
| FX | `get_currency` | `get_currency` |
| Factors | `get_factor(type="hk" or "nb")` | Not available |
| Financial statements | `get_financial_statement(market="hk" or "nb")` | `get_financial_statement(market="hk" or "nb")` |
| Filings | `get_filing_announcement(market="hk" or "nb")` | Not available |
| Index members | `get_index_component(market="hk" or "us")` | Not available |
| Dividends, stock dividends, splits | `get_event_devidend(market="hk" or "us")` | `get_event_devidend(market="hk" or "nb")` |
| Other corporate events | `get_event_capital_market`, `get_event_corporate_actions`, `get_event_fina_disclosure`, `get_event_investor_relation_activities` (`market="hk"` or `"us"`) | Same methods (`market="hk"` or `"nb"`) |
| Company fundamentals and holdings | `get_company_current`, `get_company_imed`, `get_company_price_vol`, `get_company_oper_metrics`, `get_company_concentration`, `get_company_top_concentration`, `get_company_investor`, `get_company_insider_transaction`, `get_company_shareholder_report` (`market="hk"` or `"us"`) | Same methods (`market="hk"` or `"nb"`) |
| Consensus | `get_consensus_nonperiod`, `get_consensus_recommend` (`market="hk"` or `"us"`) | Same methods (`market="hk"` or `"nb"`) |
| Technical indicators | Not available; the Qube server rejects `calculate_indicators` | Not available |
| US short interest | Not available | `get_us_short_interest` |

US symbols use the `.NB` suffix on both sides, for example `XPEV.NB`; the local `TickStreamClient` is the exception and takes bare `XPEV`.

The undated company and consensus methods return the latest snapshot on both sides, so they cannot reconstruct history. When a Qube strategy needs data from a local-only row, do not add the call to strategy source. Fetch the data locally, do the dependent calculation outside Qube, and record which side produced each input.
