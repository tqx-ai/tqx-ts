# Factor Creation Guide

This document is the canonical entry point for creating TQX factors in this workspace.
Read it together with:

- [Commands Reference](./commands.md)
- [TQX data quick reference](./tqx_data_quick_reference.md)
- [TQX data market matrix](./tqx_data_market_matrix.md)
- [TQX data API](./tqx_data_usage.md)
- [Factor Operators](./factor-operators.md)

Use the data references to understand field meanings and shapes. A data API response field does not guarantee factor support: factor source only receives framework-provided series through `factors["field"]`. Confirm availability with server validation. Use [Factor Operators](./factor-operators.md) for platform operator signatures.

## Scope

- Factors are research signals only.
- A factor is either Formula or Python.
- Create one factor per source file when possible.
- Prefer UTF-8 `.py` files and `--file` for multiline Python source only.
- `--formula` is for single-expression factor formulas built from the market fields and operators listed in [Factor Operators](./factor-operators.md), such as `open`, `high`, `low`, `close`, `volume`, `amount`, `turnover`, and `market_cap`.
- Python supports multi-step calculations over framework-provided fields. Neither Python nor Formula mode may fetch additional data. Do not call `tqx_data` or import `panda_backtest` in factor source; the server rejects these imports.

## Market And Data Contract

- Confirm the market is `hk` or `us` before writing source.
- Use only fields that belong to the selected market contract.
- If you need to reason about bar or financial field names, verify them in the `tqx_data_*.md` docs first.
- Do not invent fields, helper functions, or gateway behavior.

## Formula Mode

- Write one complete expression per non-empty line.
- Use lowercase field names such as `close`, `high`, `low`, `open`, `volume`.
- Use uppercase operator names as documented in the operator reference.
- Do not use assignments, imports, control flow, attribute access, or Python-only syntax.
- `FUTURE_RETURNS` is forbidden.

Example:

```text
RANK(close / DELAY(close, 20) - 1)
```

## Python Mode

- Define exactly one class that inherits from `Factor`.
- Implement `calculate(self, factors)`.
- Return a `Series` that preserves the original `symbol`/`date` MultiIndex.
- Read source fields with direct string-literal access such as `factors["close"]` or `factors['close']`.
- Do not mutate `factors`.
- Do not use dynamic keys, such as `factors[field_name]`, for the field read that the quality gate must see.
- Do not write back into `factors`, for example `factors["typical_price"] = ...`.
- If you need derived values, compute them in local variables and return the final series.
- Prefer `transform`, rolling windows, `pct_change`, and other index-preserving operations.
- Avoid `groupby(...).apply(...)` when it changes the index shape.

Example:

```python
class MomentumFactor(Factor):
    def calculate(self, factors):
        close = factors["close"]
        return close.groupby(level="symbol").transform(lambda s: s / s.shift(20) - 1)
```

## Parameters And Platform Operators

For tunable Python factors, declare one module-level literal `FACTOR_PARAMS` dictionary before the
class. Use unique static string keys and read values with `FACTOR_PARAMS["key"]`. Do not reassign,
mutate, alias, or read the table with dynamic keys. Defaults are authoritative; only declared and
referenced integer or float parameters can be overridden through tuning `factorParameters`.
Booleans, strings, and string lists can remain fixed. Factors without a table can tune analysis
parameters only. A lookback window is independent of the analysis adjustment cycle.

`Factor` and platform operators are injected by the runtime; call them directly without imports.
Prefer platform operators and pass arguments positionally. Use `TS_MEAN(X, N)` or `MA(X, N)` for
per-symbol rolling means, `TS_MIN`/`TS_MAX` for rolling extremes, and `RANK(X)` for ranking symbols
on the same date. `MEAN(A, B)`, `MIN(A, B)`, and `MAX(A, B)` combine two values elementwise; their
second argument is not a window length.

```python
FACTOR_PARAMS = {"lookback": 5}

class RollingMeanClose(Factor):
    def calculate(self, factors):
        return TS_MEAN(factors["close"], FACTOR_PARAMS["lookback"])
```

When platform operators are insufficient, use supported public numeric APIs from NumPy, pandas,
or SciPy; the server remains the authority for each API. Do not use star or relative imports,
file/network/process access, dynamic execution, reflection, or private attributes. Additional
valuation fields such as `imed_pb_ttm` must be supplied and supported by the factor framework;
calling a data SDK inside `calculate` does not make them available.

## Create Workflow

1. Decide whether the signal is Formula or Python.
2. Check the market contract and supported fields.
3. For Python, keep one `Factor` subclass and one `calculate(self, factors)` entry point.
4. Save the Python source in a UTF-8 `.py` file when it spans multiple lines.
5. Create the factor with `tqx research factor create --market=<hk|us> --file <python-path> ...` or `--code` for short inline source; use `--formula` for Formula mode.
6. Keep the returned `factor_id` for later analysis or updates.

## Windows Notes

- Prefer `--file` for multiline Python source on Windows.
- If you use `--code`, make sure shell escaping preserves the inner double quotes in `factors["field"]`.

## Common Rejection Patterns

- Missing `Factor` subclass.
- More than one `Factor` subclass in the same source.
- Missing `calculate(self, factors)`.
- Python code that does not contain a direct `factors["field"]` or `factors['field']` read.
- Formula expressions that use unsupported operators.
- Field names that do not exist in the selected market contract.
- Any attempt to reference future data.

## Review Checklist

- Market is explicit.
- Source type is explicit.
- Fields are market-valid.
- Python code contains exactly one `Factor` subclass.
- `calculate(self, factors)` returns the final signal series.
- Derived values are local variables, not writes into `factors`.
- Formula operators are taken from the local operator reference.
