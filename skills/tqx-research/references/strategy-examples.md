# Complete strategy source examples

Read [the template guide](strategy_templates.md), [source quality](strategy-quality.md) and the selected market framework before adapting source. These examples have passed static validation; that does not establish a successful runtime backtest.

## HK

Complete daily dual-moving-average example for `hk`. Symbols, quantities and windows are replaceable source examples, not user choices or engine defaults.

```python
import math
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from panda_backtest.api.api import MarketOrderStyle, order_shares
from panda_backtest.api.stock_hk_api import stock_api_quotation


# This daily trend-following example buys when a short moving average crosses above a long
# moving average and sells on the reverse cross. The example starts with a 5-session and
# 20-session pair.
# symbol selects the Hong Kong listing. short_window and long_window count completed daily
# closes per average, with the short window required to be smaller. buy_shares is the fixed
# number of shares requested on a bullish cross.
STRATEGY_PARAMS = {
    "symbol": "0700.HK",
    "short_window": 5,
    "long_window": 20,
    "buy_shares": 100,
}


def _date_key(value):
    date_text = str(value).strip()[:10].replace("-", "").replace("/", "")[:8]
    if len(date_text) != 8 or not date_text.isdigit():
        return None
    try:
        return datetime.strptime(date_text, "%Y%m%d").strftime("%Y%m%d")
    except ValueError:
        return None


def _positive_close(value):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) and number > 0 else None


def init_preheating_data(context):
    symbol = context.params["symbol"]
    long_window = int(context.params["long_window"])
    start_key = _date_key(context.run_info.start_date)
    if start_key is None:
        raise ValueError("HK strategy run_info.start_date must be a calendar date")

    run_start = datetime.strptime(start_key, "%Y%m%d").date()
    # Exclude the run start date from preheated history so it can only enter through its own
    # callback.
    query_end = run_start - timedelta(days=1)
    lookback_days = max(90, 3 * (long_window + 1))
    query_start = query_end - timedelta(days=lookback_days - 1)
    query_start_key = query_start.strftime("%Y%m%d")
    query_end_key = query_end.strftime("%Y%m%d")
    # Fetch daily closes for the selected symbol to seed both moving-average windows.
    try:
        history = stock_api_quotation(
            [symbol],
            start_date=query_start_key,
            end_date=query_end_key,
            fields=["date", "close"],
            period="1d",
        )
    except Exception as exc:
        raise RuntimeError(
            f"HK preheating query failed for {symbol} "
            f"from {query_start_key} through {query_end_key}"
        ) from exc

    # Keep valid positive closes inside the requested dates and sort them before seeding the
    # rolling window.
    if history is None or history.empty:
        cleaned = pd.DataFrame(columns=["date", "close"])
        reason = "query returned no rows"
    else:
        missing = {"date", "close"} - set(history.columns)
        if missing:
            raise ValueError(
                f"HK preheating query for {symbol} is missing required columns: "
                f"{', '.join(sorted(missing))}"
            )

        dates = history["date"].map(_date_key)
        closes = pd.to_numeric(history["close"], errors="coerce")
        valid = (
            dates.notna()
            & dates.between(query_start_key, query_end_key)
            & np.isfinite(closes)
            & (closes > 0)
        )
        cleaned = (
            pd.DataFrame({"date": dates, "close": closes})
            .loc[valid]
            .drop_duplicates(subset=["date"], keep="last")
            .sort_values("date", kind="stable")
        )
        reason = "waiting for later Bars" if len(cleaned) < long_window else ""

    context.close_window = [
        (row.date, float(row.close))
        for row in cleaned.tail(long_window + 1).itertuples(index=False)
    ]
    last_date = cleaned["date"].iloc[-1] if not cleaned.empty else "none"
    status = f". {reason}" if reason else ""
    print(
        f"[HK] {symbol} preheating: {len(cleaned)} valid daily samples, "
        f"query {query_start_key} to {query_end_key}, last {last_date}{status}"
    )


def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
    if context.run_info.frequency != "1d":
        raise ValueError("This template requires daily frequency (1d)")
    if not 0 < int(context.params["short_window"]) < int(context.params["long_window"]):
        raise ValueError("The short window must be positive and shorter than the long window")
    context.account_id = context.run_info.stock_account
    init_preheating_data(context)


def _mean(values):
    return sum(values) / len(values)


def handle_data(context, data):
    symbol = context.params["symbol"]
    bar = data[symbol]
    if bar is None:
        return

    # Process only valid dates newer than the preheated window.
    trade_date = _date_key(context.trade_date)
    window = context.close_window
    if trade_date is None or (window and trade_date <= window[-1][0]):
        return

    bar_close = _positive_close(bar.close)
    if bar_close is None:
        return

    # Compare the averages before and after adding today’s completed close to detect a true
    # crossover.
    prior_closes = [close for _, close in window]
    short_window = int(context.params["short_window"])
    long_window = int(context.params["long_window"])
    crossed_up = False
    crossed_down = False
    if len(prior_closes) >= long_window:
        current_closes = prior_closes[-(long_window - 1):] + [bar_close]
        previous_short = _mean(prior_closes[-short_window:])
        previous_long = _mean(prior_closes[-long_window:])
        current_short = _mean(current_closes[-short_window:])
        current_long = _mean(current_closes)
        crossed_up = previous_short <= previous_long and current_short > current_long
        crossed_down = previous_short >= previous_long and current_short < current_long

    # Save this close once and keep one extra row for the next crossover comparison.
    window.append((trade_date, bar_close))
    context.close_window = window[-(long_window + 1):]

    # Trade only when the relative ordering of the two averages changes.
    if not crossed_up and not crossed_down:
        return
    account = context.stock_account_dict.get(context.account_id)
    if account is None:
        return
    position = account.positions[symbol]
    # Buy the configured shares on an upward cross while the position is flat.
    if crossed_up and position.quantity <= 0:
        order_shares(
            context.account_id,
            symbol,
            context.params["buy_shares"],
            style=MarketOrderStyle(),
        )
    # Sell all currently sellable shares on a downward cross.
    elif crossed_down and position.sellable > 0:
        order_shares(
            context.account_id,
            symbol,
            -position.sellable,
            style=MarketOrderStyle(),
        )
```

## US

Complete daily dual-moving-average example for `us`. Symbols, quantities and windows are replaceable source examples, not user choices or engine defaults.

```python
import math
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from panda_backtest.api.api import MarketOrderStyle, order_shares
from panda_backtest.api.stock_us_api import stock_api_quotation

# Trade daily crossovers between short and long US stock moving averages.
# symbol uses a .NB ticker, both windows count sessions, and buy_shares sets the requested entry size.
STRATEGY_PARAMS = {
    "symbol": "AAPL.NB",
    "short_window": 5,
    "long_window": 20,
    "buy_shares": 1,
}

def _date_key(value):
    date_text = str(value).strip()[:10].replace("-", "").replace("/", "")[:8]
    if len(date_text) != 8 or not date_text.isdigit():
        return None
    try:
        return datetime.strptime(date_text, "%Y%m%d").strftime("%Y%m%d")
    except ValueError:
        return None

def _positive_close(value):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) and number > 0 else None

def init_preheating_data(context):
    symbol = context.params["symbol"]
    long_window = int(context.params["long_window"])
    start_key = _date_key(context.run_info.start_date)
    if start_key is None:
        raise ValueError("US strategy run_info.start_date must be a calendar date")

    run_start = datetime.strptime(start_key, "%Y%m%d").date()
    # Use completed closes dated before replay begins to seed the first long window.
    query_end = run_start - timedelta(days=1)
    lookback_days = max(90, 3 * (long_window + 1))
    query_start = query_end - timedelta(days=lookback_days - 1)
    query_start_key = query_start.strftime("%Y%m%d")
    query_end_key = query_end.strftime("%Y%m%d")
    try:
        # Fetch prior daily closes for the configured long moving average.
        history = stock_api_quotation(
            [symbol],
            start_date=query_start_key,
            end_date=query_end_key,
            fields=["date", "close"],
            period="1d",
        )
    except Exception as exc:
        raise RuntimeError(
            f"US preheating query failed for {symbol} "
            f"from {query_start_key} through {query_end_key}"
        ) from exc

    if history is None or history.empty:
        cleaned = pd.DataFrame(columns=["date", "close"])
        reason = "query returned no rows"
    else:
        missing = {"date", "close"} - set(history.columns)
        if missing:
            raise ValueError(
                f"US preheating query for {symbol} is missing required columns: "
                f"{', '.join(sorted(missing))}"
            )

        dates = history["date"].map(_date_key)
        closes = pd.to_numeric(history["close"], errors="coerce")
        # Keep dates inside the pre-start range and closes that are finite and positive.
        valid = (
            dates.notna()
            & dates.between(query_start_key, query_end_key)
            & np.isfinite(closes)
            & (closes > 0)
        )
        cleaned = (
            pd.DataFrame({"date": dates, "close": closes})
            .loc[valid]
            .drop_duplicates(subset=["date"], keep="last")
            .sort_values("date", kind="stable")
        )
        reason = "waiting for later Bars" if len(cleaned) < long_window else ""

    # Retain the prior closes needed to compare the previous and current averages.
    context.close_window = [
        (row.date, float(row.close))
        for row in cleaned.tail(long_window + 1).itertuples(index=False)
    ]
    last_date = cleaned["date"].iloc[-1] if not cleaned.empty else "none"
    status = f". {reason}" if reason else ""
    print(
        f"[US] {symbol} preheating: {len(cleaned)} valid daily samples, "
        f"query {query_start_key} to {query_end_key}, last {last_date}{status}"
    )

def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
    if context.run_info.frequency != "1d":
        raise ValueError("This template requires daily frequency (1d)")
    if not 0 < int(context.params["short_window"]) < int(context.params["long_window"]):
        raise ValueError("The short window must be positive and shorter than the long window")
    context.account_id = context.run_info.stock_account
    init_preheating_data(context)

def _mean(values):
    return sum(values) / len(values)

def handle_data(context, data):
    symbol = context.params["symbol"]
    # Read the current completed daily Bar for this stock.
    bar = data[symbol]
    if bar is None:
        return

    trade_date = _date_key(context.trade_date)
    window = context.close_window
    # Ignore invalid and repeated dates before calculating a crossover.
    if trade_date is None or (window and trade_date <= window[-1][0]):
        return

    bar_close = _positive_close(bar.close)
    if bar_close is None:
        return

    prior_closes = [close for _, close in window]
    short_window = int(context.params["short_window"])
    long_window = int(context.params["long_window"])
    crossed_up = False
    crossed_down = False
    # Wait for a full long window, then compare averages before and after today’s close.
    if len(prior_closes) >= long_window:
        previous = prior_closes[-long_window:]
        latest = previous[1:] + [bar_close]
        previous_short = _mean(previous[-short_window:])
        previous_long = _mean(previous)
        latest_short = _mean(latest[-short_window:])
        latest_long = _mean(latest)
        crossed_up = previous_short <= previous_long and latest_short > latest_long
        crossed_down = previous_short >= previous_long and latest_short < latest_long

    # Add today only after testing the signal so the next callback sees it as prior history.
    window.append((trade_date, bar_close))
    context.close_window = window[-(long_window + 1):]

    if not crossed_up and not crossed_down:
        return
    account = context.stock_account_dict.get(context.account_id)
    if account is None:
        return
    position = account.positions[symbol]
    # Buy on an upward crossover only while flat.
    if crossed_up and position.quantity <= 0:
        order_shares(
            context.account_id,
            symbol,
            context.params["buy_shares"],
            style=MarketOrderStyle(),
        )
    # Sell on a downward crossover only when shares are currently sellable.
    elif crossed_down and position.sellable > 0:
        order_shares(
            context.account_id,
            symbol,
            -position.sellable,
            style=MarketOrderStyle(),
        )
```
