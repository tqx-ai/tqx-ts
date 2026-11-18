# US equity framework

## Market and references

TQX US equity strategies use market code `us`. Use the `.NB` suffix for US symbols, such as `AAPL.NB` and `NVDA.NB`. Do not write `.US` or `.NY` in strategy symbols. Product capability and server validation determine whether the market is available.

Read the [strategy quality gate](strategy-quality.md) before writing source. Use [common backtest parameters](backtest-parameters.md) for supported run settings. The same-edition [runtime data reference](tqx_data_usage.md) and its [US equity references](data/index.md) cover data methods, parameters, fields, and coverage.

## Engine APIs

- Common trading helpers and constants come from `panda_backtest.api.api`.
- US history helpers come from `panda_backtest.api.stock_us_api`. Strategy code may use `stock_api_quotation(symbol_list, start_date, end_date, fields=None, period=None)`. Pass a non-empty list of symbols and an explicit `period` of `"1d"` or `"1m"`. The history period is lowercase `"1m"` for a run configured with minute frequency `"1M"`.
- Import only the public modules allowed by the [quality gate](strategy-quality.md). Use the market-specific engine module in strategy source and consult the linked data references for the underlying SDK.

History queries return a DataFrame. Check for rows and the columns you need before using it. `stock_api_pre_close(df_stock_code, date)` reads the input's `symbol` column and selects `symbol` and `pre_close` from a daily query. When coverage is uncertain, use `stock_api_quotation` and check the returned columns before selecting them. For an unbound strategy, query and cache history before replay, then use the cache and completed Bars in callbacks. See [history preheating](strategy-quality.md#history-preheating).

## Lifecycle and replay time

| Callback                             | Use                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialize(context)`                | Runs once before the first Bar. Copy `STRATEGY_PARAMS`, initialize state, and directly call `init_preheating_data(context)` once if the strategy queries history. |
| `init_preheating_data(context)`      | Called by `initialize`. Query completed history before `context.run_info.start_date` with the US history API and cache the result on `context`.                   |
| `before_trading(context)`            | Runs before the session without a current Bar. Prepare session state and inspect the account.                                                                     |
| `handle_data(context, data)`         | Runs when each daily or minute Bar completes. Read that Bar and evaluate signals and risk rules.                                                                  |
| `after_trading(context)`             | Runs after the day's Bar callbacks. Summarize state; no new Bar is provided.                                                                                      |
| `on_stock_trade_rtn(context, trade)` | Receives each stock execution as a trade object.                                                                                                                  |
| `on_stock_order_rtn(context, order)` | Receives stock order status updates, including rejected orders.                                                                                                   |
| `stock_order_cancel(context, order)` | Receives cancel and other order-ending events.                                                                                                                    |

Daily `handle_data` runs at the session-ending clock, commonly `context.hms == "155900"`. The fixed `matching_type=1` uses the same symbol's next eligible Bar open as the reference price for orders submitted in `handle_data`. The engine confirms fills after that Bar completes, subject to slippage, order limits, and available volume.

`context.now` is the replay calendar date. `context.trade_date` is the strategy trade date. `context.hms` is the replay clock and is commonly `"000000"` during initialization and `"155900"` in a daily callback. `context.trade_date_list` contains the trade dates loaded for this run. The context date-shift methods only operate on this run's loaded trade-date and calendar-date axes. Passing a date outside an axis can raise `ValueError`; shifting past an axis boundary returns `"99990101"`. `context.is_stock_trade(symbol=None)` checks the current market session and ignores `symbol`. `context.is_trade_date_end()` reports the session's end. Use the runtime data reference for historical calendar and price data outside the replay window.

## Bars

Only `handle_data(context, data)` receives the current BarMap. Read a subscribed symbol with `bar = data[symbol]`. A Bar may be missing or have an invalid price. Check `bar is None` and the price fields used by the strategy before calculating signals or placing an order. The quality gate rejects dictionary-style membership checks such as `symbol in data`.

The engine provides daily `DailyQuotationData` and one-minute `BarQuotationData`. Fields are object attributes. Daily Bars commonly include `symbol`, `trade_date`, `open`, `high`, `low`, `close`, `volume`, `turnover`, `vwap`, and `preclose`. Use `preclose` for the previous close. A `pre_close` attribute may exist but can contain zero. Minute callbacks follow the US session, commonly around 09:31–15:59. A minute Bar with no quote may still be returned, so verify `close > 0` before using it. US minute Bars may have zero bid/ask prices and sizes because those fields are not loaded.

Use US symbols for subscriptions, Bar reads, and orders. Reading another market's symbol can raise, and a mismatched order returns an empty list.

## Accounts, positions, and orders

Get the selected account key from `context.run_info.stock_account` and resolve its `StockAccount` through `context.stock_account_dict`. Common account fields include `cash`, `total_value`, `market_value`, and `positions`. A position exposes `order_book_id`, `quantity`, `sellable`, `strategy_sellable`, `avg_price`, and `market_value`. For a symbol with no position, `positions[symbol]` returns a zero-quantity item. `keys()` and `in` include only symbols with `quantity > 0`.

US shares use the Workflow's T+1 settlement rule. Shares bought in the current session have zero sellable quantity until the next session. Use `sellable` to determine the amount eligible to sell. `strategy_sellable` is often zero in Bar backtests. US order quantities use a one-share minimum and are not rounded to round lots.

The common API provides `order_shares(account_id, id_or_ins, quantity, style=None, retry_num=0, risk_control_client=None, remark=None, margin_usage="CASH")`. Positive quantities buy and negative quantities sell. The return list may contain a rejected order. Check `status`, `message`, and callbacks. `order_values` takes a positive amount to buy or a negative amount to sell. It requires a valid quote during market hours. `target_stock_group_order(account, symbol_dict, price_type=0)` takes an account key string, such as `context.run_info.stock_account`, rather than the account object from `context.stock_account_dict`. It uses market orders, ignores `price_type`, and requests that holdings omitted from the target map be closed, subject to sellable quantity.

Use `MarketOrderStyle(time_condition=None, gtd_date=None)` for a market order and `LimitOrderStyle(limit_price, time_condition=None, gtd_date=None)` for a limit order. In a Bar backtest, an omitted `time_condition` defaults to GFD. Supported values are IOC (`1`), GFD (`3`), and GTC (`5`). GFS, GTD, GFA, and a non-empty `gtd_date` are rejected for US stock orders. The order callback receives an `Order` with fields such as `order_id`, `order_book_id`, `status`, `side`, `effect`, `price_type`, `quantity`, `filled_quantity`, `unfilled_quantity`, `avg_price`, and `message`.

`on_stock_trade_rtn(context, trade)` receives a `PandaBacktestTrade` for the individual execution. Read `order_book_id` (also `contract_code`), `quantity` (`volume`), `side` (`business`), `price`, `transaction_cost` (`cost`), `order_id`, `trade_id`, `status`, and `settlement`. Read `effect`, `price_type`, `filled_quantity`, and `unfilled_quantity` from the order callbacks. Compare `side` to `SIDE_BUY` (0) or `SIDE_SELL` (1).

## Minimal example

This example only reads the current Bar. For historical price queries and a rolling window, use the [daily dual moving average template](strategy-examples.md#us).

```python
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *

STRATEGY_PARAMS = {"symbol": "AAPL.NB"}


def initialize(context):
    context.params = dict(STRATEGY_PARAMS)


def handle_data(context, data):
    bar = data[context.params["symbol"]]
    if bar is None or bar.open is None or bar.open <= 0:
        return
    context.latest_open = bar.open
```
