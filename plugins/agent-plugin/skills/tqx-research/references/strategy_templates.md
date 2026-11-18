# Strategy source templates

Use the complete daily dual-moving-average example for [Hong Kong](strategy-examples.md#hk) or the [US](strategy-examples.md#us), then adapt the requested signal. The examples are embedded in Markdown; this Skill ships no executable template scripts.

The market frameworks document lifecycle, history, orders and settlement for other strategies. For RSI, MACD, momentum rotation, breakouts or other requested logic, derive the signal from documented public APIs and explicit source parameters rather than implying an unbundled template exists.

Read the corresponding [Hong Kong](stock_hk_api.md) or [US](stock_us_api.md) framework and [source quality checks](strategy-quality.md) before editing. For calculation operators inside factors, use [the factor operator reference](factor-operators.md), not strategy indicator assumptions.

## Adapting a template

The sample symbols, quantities, lookbacks, thresholds, and schedules demonstrate one strategy; they are not user instructions or platform defaults. Preserve the user's market, dates, signal and risk intent. Let the server supply market defaults for unspecified backtest settings. Do not invent a quarter, capital, benchmark or date range. Ask only for choices necessary to implement the requested logic.

Declare one literal `STRATEGY_PARAMS` table and copy it once with `context.params = dict(STRATEGY_PARAMS)` in `initialize`. Read declared keys through `context.params`; do not mutate the table or copied calculation parameters. Backtest settings live separately in `parameters.backtest` and are described in [backtest parameters](backtest-parameters.md).

Resolve the account from `context.run_info.stock_account`. For historical windows, initialize state and call `init_preheating_data(context)` directly once, batch completed history before `context.run_info.start_date`, then use cached data and completed Bars. Check coverage, positive prices, signal-time visibility, and market-specific sizing and settlement rules. Never hardcode an account identifier.

Read `bar = data[symbol]`, then check `bar is None`; BarMap is not a dictionary for membership checks. Orders created on a completed Bar use the next eligible same-symbol Bar open as the reference fill price. Do not report same-close fills or execution before callbacks confirm them.

Source generation is complete when the requested source and its assumptions are supplied. Create, save, validate or run remote resources only within the user's task. Follow the [saved-parameter workflow](workflow.md); do not invoke sandbox-only draft/checkout commands. A source template or static pass alone is not a successful backtest.
