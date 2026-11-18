# Factor-driven strategies

Bind a factor only when the user asks to use it in the strategy. A factor mentioned for context does not request binding. Choose an authorized immutable code-factor version in the same market, inspect its frozen source and parameter snapshot, and use its returned factor ID and version ID together. Never bind HEAD, a title, a run ID, or a version number. Python and formula code factors are supported; do not treat ML or missing-kind factors as executable code versions.

The SDK and MCP use `factorBinding: { factorId, factorVersionId }` in strategy create/update. The server stores `factor_binding` at the top level. Explicit `null` unbinds. Binding increments the configuration revision; restoring a strategy version restores its binding. The CLI does not expose binding flags: use the SDK or the plugin's discovered MCP action for that operation.

For ordinary backtests and tuning, the consumer uses frozen source and parameters to calculate factor values for the whole backtest range in an isolated, metered subprocess. It passes `df_factor` with `date`, `symbol`, and `factor_value` through the existing engine entry point. The framework uses `MacroFactor` and `calculate(self, factors)` to compute factors and provide prefetched fields. This full-range sequence has no as-of barrier. On every callback, filter to completed trading days using `context.now` and match the current bar's `date` and `symbol`. Never read future rows in `initialize` or rerun factor analysis.

Factor output uses the same `period_start` and `period_end` as the backtest. Keep the calculator's internal history handling and do not move the backtest start earlier.

This project does not modify `panda_backtest`, `backtest_common`, the engine dependency, or data APIs. Do not monkeypatch the framework or add internal-network, Mongo, or NAS operations to strategy source.
