# Backtest configuration

Saved engine settings live in `parameters.backtest`, independently of `STRATEGY_PARAMS`. The TypeScript SDK and MCP accept camelCase `backtest` fields and map them to the server's snake_case settings:

| Public field               | Saved field                  | Meaning                                          |
| -------------------------- | ---------------------------- | ------------------------------------------------ |
| `periodStart`, `periodEnd` | `period_start`, `period_end` | ISO dates; end on or after start                 |
| `frequency`                | `frequency`                  | `1d` daily or `1M` minute                        |
| `initBalance`              | `init_balance`               | Positive starting capital                        |
| `commissionRate`           | `commission_rate`            | Nonnegative commission, passed through unchanged |
| `slippage`                 | `slippage`                   | Nonnegative proportional slippage; zero is valid |
| `standardSymbol`           | `standard_symbol`            | Same-market benchmark                            |

Hong Kong benchmarks are `HSI.HK` (default), `HSCE.HK`, `HSTECH.HK`; US benchmarks are `SPX` (default), `IXIC`, `NDX`, `DJI`. Leave `marginRate` out of HK/US requests. Daily intervals support at most ten years; minute intervals at most one year. Do not silently truncate requested dates. Use market defaults for a new resource's unspecified settings and current saved settings for an existing resource.

For an ordinary run, save requested settings first and inspect the receipt: `parameters.backtest`, valid parameter validation for that configuration revision, and no parameter draft. Then submit with those revisions and omit `backtest`. Only an explicitly temporary run sends overrides; they do not persist. See [the workflow](workflow.md).

History preheating belongs in source and uses completed data before the run start. Do not extend the requested run period to manufacture warmup. Bound factor output uses the same period as the backtest; see [factor timing](factor-driven.md). Benchmark metrics require available index data; missing benchmark output is not a zero return.
