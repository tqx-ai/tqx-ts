# Factor Creation Guide

This document is the canonical entry point for creating TQX factors in this workspace.
Read it together with:

- [Commands Reference](./commands.md)
- [Strategy Source Constraints](./strategy-source.md)
- [Strategy Templates](./strategy_templates.md)
- [TQX data quick reference](./tqx_data_quick_reference.md)
- [TQX data market matrix](./tqx_data_market_matrix.md)
- [TQX data API](./tqx_data_usage.md)
- [Factor Operators](./factor-operators.md)

When a factor needs field names, market-specific data shapes, or examples of supported inputs, use the `tqx_data_*.md` references above as the local source of truth. Use the local [Factor Operators](./factor-operators.md) reference as the authority for valid formula operators.

## Scope

- Factors are research signals only.
- A factor is either Formula or Python.
- Create one factor per source file when possible.
- Prefer UTF-8 `.py` files and `--file` for multiline Python source only.


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
