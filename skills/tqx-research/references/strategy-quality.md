# Strategy source quality

Read the [Hong Kong framework](stock_hk_api.md) or [US framework](stock_us_api.md). Create/save receipts and explicit server validation report diagnostics for the saved source. Use diagnostic codes, messages, lines and columns for that exact revision. The optional local TypeScript validator is a static aid; the server remains authoritative.

## Source comments

Place each Python `#` comment immediately above the code it explains, at the same indentation as the first line and with no blank line between them. Explain key decisions within the function body and update affected comments when editing a strategy.

- Keep the opening overview short. Explain what each `STRATEGY_PARAMS` setting controls and give its unit above the parameter dictionary or the relevant key.
- Explain fields and the history cutoff directly above the query and filter that use them. Above each window, explain whether it includes the current Bar. Explain a skipped or delayed decision above the relevant guard.
- Put signal, position sizing, entry, exit, and risk explanations directly above their calculations and branches. Explain order or fill tracking above the code that updates that state. For a bound factor, describe its decision-time cutoff above the filter.

Before validation, check that every comment sits directly above the lines it describes. Use one comment above a group of consecutive statements that do the same job.

## Common source rules

| Check                             | Diagnostic                                                                             | Fix                                                                                                                                                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python syntax and size            | `EMPTY_CODE`, `SYNTAX_ERROR`, `INVALID_CODE`, `SOURCE_TOO_LARGE`, `SOURCE_TOO_COMPLEX` | Supply nonempty Python source that parses and compiles. The UTF-8 source limit is 1 MiB and the syntax tree limit is 20,000 nodes.                                                                                                                                                                 |
| Initialization                    | `MISSING_INITIALIZE`, `INVALID_INITIALIZE`                                             | Define a top-level synchronous `initialize` whose first argument is `context`.                                                                                                                                                                                                                     |
| Strategy parameters               | `INVALID_STRATEGY_PARAMS`                                                              | Declare one literal, module-level `STRATEGY_PARAMS` dictionary before the lifecycle functions. Copy it once in `initialize` with `context.params = dict(STRATEGY_PARAMS)`. Read declared parameters with literal string keys and treat them as read-only.                                          |
| Imports and restricted operations | `UNSAFE_IMPORT`, `UNSAFE_CALL`, `UNSAFE_DATA_IO`, `PRIVATE_ACCESS`, `DUNDER_ACCESS`    | Use approved public modules and platform APIs. Remove relative imports, internal modules, private attributes, reflection, dynamic execution, and direct file or database access.                                                                                                                   |
| BarMap                            | `UNSUPPORTED_DATA_MEMBERSHIP`                                                          | Read the bar with `bar = data[symbol]` and check `bar is None`. The validator rejects `symbol in data` and `symbol not in data`.                                                                                                                                                                   |
| Time offsets                      | `FORWARD_LOOKING_SHIFT`                                                                | Remove negative literal offsets in `shift`, `diff`, and `pct_change`. Use data available at the signal time.                                                                                                                                                                                       |
| Factor timing                     | `INITIALIZE_FACTOR_LOOKAHEAD`, `UNFILTERED_FACTOR_LOOKAHEAD`                           | Filter `context.df_factor` by the current time inside callbacks before taking values. The validator flags access in `initialize` and common reads of unfiltered data, such as `.tail()`, `.last()`, `.max()`, and `.iloc[-1]`. See [factor-driven strategies](factor-driven.md) for the time rule. |

`STRATEGY_PARAMS` supports up to 256 parameters with identifier-shaped keys. Values may be finite numbers, booleans, strings, or lists of nonempty strings. Integer bit length is limited to 1,024 bits, string values to 4,096 characters, and lists to 1 through 50 items. Saved backtest settings live in `parameters.backtest`. See [backtest parameters](backtest-parameters.md).

Approved general module roots include `numpy`, `pandas`, `scipy`, `math`, `statistics`, `datetime`, `collections`, `itertools`, `functools`, `decimal`, `typing`, `enum`, `dataclasses`, and `talib`. Use public `panda_backtest.api` interfaces subject to the market restrictions below.

## Market API checks

| Strategy market | Imports for that market                                        |
| --------------- | -------------------------------------------------------------- |
| Hong Kong `hk`  | `panda_backtest.api.api` and `panda_backtest.api.stock_hk_api` |
| US `us`         | `panda_backtest.api.api` and `panda_backtest.api.stock_us_api` |

Use wildcard imports only with the listed modules for the selected market. The validator reports `MARKET_API_MISMATCH` for `panda_data`, mainland stock or futures APIs, or the other market's stock API. Use the selected market's engine API in strategy source. See the same-edition [runtime data reference](tqx_data_usage.md) for data contracts and [Backtest parameters](backtest-parameters.md) for supported settings.

## History preheating

Prefer this authoring convention when writing or editing an unbound strategy with a historical price window. A batched query keeps history reads out of the Bar loop.

1. Define one top-level synchronous `init_preheating_data(context)`. After copying `STRATEGY_PARAMS` and setting up state, call `init_preheating_data(context)` directly once in `initialize(context)`.
2. Call the selected market's history API directly inside the preheating function. Use `context.run_info.start_date` to bound the initial history to completed data before the run starts. Batch the query, check the returned fields and coverage, and cache cleaned data on `context`.
3. In `handle_data`, use the cache and completed Bars for signals and risk controls. Check data availability at the signal time. Report insufficient history and wait for a complete window before calculating a signal. Surface query errors.

Strategies that only use the current Bar or the current trading session's completed minute Bars may omit the function. Keep an intraday window scoped to its trading session. Factor-driven strategies read `context.df_factor` at the point in time allowed by each callback. See [factor timing](factor-driven.md) and [backtest parameters](backtest-parameters.md).

## Submission and runtime evidence

Follow [the research workflow](workflow.md). Static parsing and compilation cannot prove runtime return types, coverage, point-in-time correctness, fills or strategy profitability. Inspect the status and pinned source/parameter snapshots of an explicitly requested run.
