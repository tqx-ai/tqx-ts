from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *


def init_market_data(context):
    context.account = "15032863"
    context.stock_universe = ["TSLA.NB"]

    context.fast_window = 4
    context.slow_window = 12
    context.max_position_ratio = 0.9

    context.today_trades = []
    context.close_history = {symbol: [] for symbol in context.stock_universe}


def initialize(context):
    init_market_data(context)


def before_trading(context):
    context.today_trades = []
    account = context.stock_account_dict.get(context.account)
    if account is not None:
        print(
            f"[US before_trading] date={context.now}, "
            f"total_value={account.total_value:.2f}, cash={account.cash:.2f}"
        )


def _compute_ma(series, window):
    if series is None or len(series) < window:
        return None
    window_vals = [
        value for value in series[-window:]
        if value is not None and value > 0
    ]
    if len(window_vals) < window:
        return None
    return sum(window_vals) / float(window)


def _trim_history(history, window):
    max_len = window * 5
    if len(history) > max_len:
        history[:] = history[-max_len:]


def handle_data(context, data):
    account = context.stock_account_dict.get(context.account)
    if account is None:
        return

    for symbol in context.stock_universe:
        if symbol not in data:
            continue

        bar = data[symbol]
        if bar is None:
            continue

        close_val = getattr(bar, "close", None)
        if close_val is None:
            continue
        close_price = float(close_val)
        if close_price <= 0:
            continue

        history = context.close_history.setdefault(symbol, [])
        history.append(close_price)
        _trim_history(history, max(context.fast_window, context.slow_window))
        if len(history) < context.slow_window:
            continue

        curr_fast = _compute_ma(history, context.fast_window)
        curr_slow = _compute_ma(history, context.slow_window)
        if curr_fast is None or curr_slow is None:
            continue

        position = account.positions.get(symbol)
        quantity = 0 if position is None else position.quantity
        sellable = 0 if position is None else position.sellable

        should_buy = curr_fast > curr_slow and quantity == 0
        should_sell = curr_fast < curr_slow and quantity > 0 and sellable > 0

        if should_buy:
            cash = account.cash
            if cash <= 0:
                continue
            max_invest_cash = cash * context.max_position_ratio
            buy_qty = int(max_invest_cash // close_price)
            if buy_qty <= 0:
                continue

            order_shares(
                context.account,
                symbol,
                buy_qty,
                style=MarketOrderStyle,
            )
            context.today_trades.append(
                {
                    "symbol": symbol,
                    "side": "BUY",
                    "qty": buy_qty,
                    "price": close_price,
                    "fast_ma": curr_fast,
                    "slow_ma": curr_slow,
                }
            )
        elif should_sell:
            order_shares(
                context.account,
                symbol,
                -sellable,
                style=MarketOrderStyle,
            )
            context.today_trades.append(
                {
                    "symbol": symbol,
                    "side": "SELL",
                    "qty": sellable,
                    "price": close_price,
                    "fast_ma": curr_fast,
                    "slow_ma": curr_slow,
                }
            )


def after_trading(context):
    account = context.stock_account_dict.get(context.account)
    if account is None:
        return

    print(
        f"[US after_trading] date={context.now}, "
        f"total_value={account.total_value:.2f}, cash={account.cash:.2f}"
    )
    if context.today_trades:
        print("Today's MA order submissions:")
        for trade in context.today_trades:
            print(
                f"  {trade['symbol']} {trade['side']} "
                f"{trade['qty']} @ {trade['price']:.2f} "
                f"(fast={trade['fast_ma']:.2f}, "
                f"slow={trade['slow_ma']:.2f})"
            )
    else:
        print("No orders submitted today.")
