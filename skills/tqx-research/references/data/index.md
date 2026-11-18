# Qube native data contracts

Aligned with Qube source `38ac48d7` on 2026-11-18. This is a focused reference for the native `tqx_data` 0.1.0 contract underlying Qube research. It does not expose additional client capabilities.

Current Qube strategy validation rejects direct `tqx_data` imports, including aliases, submodules and from-imports. Strategy source uses public `panda_backtest.api` and the matching HK/US engine module; see the [HK](../stock_hk_api.md) and [US](../stock_us_api.md) frameworks. Factor source receives framework-injected fields and operators. Neither Research MCP nor the TypeScript resource client provides standalone native data queries. Local market-data work belongs to the separate `tqx-data` Skill and its own contract.

## Symbols and markets

| Boundary                    | Hong Kong                              | US                                                                              |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| Strategy engine and orders  | Four digits plus `.HK`, e.g. `0700.HK` | `.NB`, e.g. `AAPL.NB`                                                           |
| Native quote/reference data | `0700.HK`                              | Bare NASDAQ BASIC code, e.g. `AAPL`; `.NB` input is compatible where documented |
| Shared `market` argument    | `hk`                                   | `us`, with `nb` compatibility                                                   |
| Factor `type` argument      | `hk`                                   | `nb`; `us` is equivalent                                                        |

Do not send engine `.NB` symbols to native methods without checking their documented boundary. The old factor `type="ny"` is unsupported. A general shared `market` default of `hk` does not apply to `get_financial_statement`, which requires an explicit market.

## Factor fields

The native factor signature is:

```text
get_factor(symbol=None, start_date='', end_date='', type='hk', factors=None) -> DataFrame
```

Supply start/end dates and the requested factors; a symbol can be one code or a list. These basic fields are documented for both markets:

| Field                          | Meaning            |
| ------------------------------ | ------------------ |
| `date`                         | Observation date   |
| `symbol`                       | Native stock code  |
| `open`, `high`, `low`, `close` | Price observations |
| `volume`                       | Traded volume      |
| `amount`                       | Traded value       |
| `pre_close`                    | Previous close     |

The HK base factor data additionally provides `turnover`; the US base data provides `market_cap`. Actual rows, units and coverage must be checked in the service result. The available reference does not enumerate additional technical, alpha or style-risk names or formulas. Do not invent them from familiar indicator names.

A native field's existence does not guarantee that the factor consumer supports it. Confirm source validation and actual analysis responses. Python factors use static access such as `factors["close"]`; formulas use a single expression with uppercase fields, such as `TS_MEAN(CLOSE, 5)`. Read [factor creation](../factor-creation.md) and [runtime operators](../factor-operators.md).

## Historical quotes and indices

The native SDK exposes the following signatures for each market. Replace `<market>` with `hk` or `us`; this is signature notation, not executable source. Market-specific methods do not take a separate `market` argument.

```text
get_<market>_daily_pre(symbol=None, start_date=None, end_date=None, fields=None)
get_<market>_daily_post(symbol=None, start_date=None, end_date=None, fields=None)
get_<market>_index_detail(symbol=None, fields=None, date=None)
get_<market>_index_daily(start_date='', end_date='', symbol=None, fields=None)
get_<market>_index_constituents(start_date='', end_date='', index_symbol=None, stock_symbol=None, fields=None)
```

Pre/post methods describe adjusted daily data. Historical daily and minute data are Parquet-backed; this Skill does not recommend real-time or Tick data as backtest history. Native export is distinct from permitted strategy imports, actual environment coverage and successful execution.

Dated market-specific index constituents can represent a requested historical membership interval when coverage is present. The shared `get_index_component` is undated and cannot establish point-in-time historical membership. Do not use today's members across an earlier backtest. A configured benchmark or pool identifier does not by itself establish the symbol format accepted by a native index query.

In generated strategies, query historical prices through the selected market's `stock_api_quotation(symbol_list, start_date, end_date, fields=None, period=None)`. Specify `period="1d"` or `"1m"`; minute backtest frequency is separately `"1M"`. For unbound historical windows, batch and cache completed observations before the run starts in `init_preheating_data(context)`. Validate returned columns and coverage before use.

## Financial statements and visibility

Native `get_financial_statement` accepts `start_quarter`, `end_quarter`, `symbol`, `date`, `is_latest`, `market`, `interim_type` and `fields`. Start/end quarters and explicit market are required at runtime. Quarter format is `YYYYqN`; the start/end years span at most five calendar years. `date` is an upper bound in `YYYYMMDD` or `YYYY-MM-DD` format. `is_latest` defaults to true. `interim_type` is `cumulative` (default) or `single`; signature support does not guarantee single-quarter data coverage.

Use only field identifiers supplied by an authoritative current field contract or an actual authorized response. This Skill does not bundle the full financial-statement field dictionary. If the requested field's meaning, units or disclosure date cannot be verified, explain the missing contract instead of inventing a field or substituting another measure.

A report quarter is not its public availability date. Historical signals must use information disclosed by the decision time, including the effect of revisions and `is_latest`. Bind each observation to an as-of date before joining it to a price panel. Data returned for a whole range is not automatically filtered to each callback's decision time.

## Coverage and interpretation

Check nonempty rows, required columns, date range, unique `(date, symbol)` keys, positive prices, units, adjustment convention and missing values. Do not silently use zero or today's data to fill missing history. Distinguish an unsupported method, unavailable table, empty interval and invalid request. A parsed source, a native export or a successful HTTP response cannot establish backtest tradability or profitability.

Use [cross-sectional guidance](../cross_sectional_strategies.md) for dynamic universes and [factor timing](../factor-driven.md) for bound factor snapshots. Read only the documented public interface for the selected transport; do not query private storage or change runtime dependencies to bypass a missing capability.
