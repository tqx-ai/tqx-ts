# Factor source requirements

Generate Python factors by default. Read field codes and meanings from the shared [Hong Kong](data/index.md) or [US](data/index.md) catalog. Factor code receives framework-provided series through `calculate(self, factors)` and uses static access such as `factors["close"]`. A field's presence in a market catalog does not guarantee factor support. Use factor validation and server responses to confirm it. Do not call `tqx_data` from factor source or infer factor availability from an SDK method.

## Choose operators by calculation scope

Read the [platform operator reference](factor-operators.md) before writing or editing a factor. Check signatures, grouping, window lengths, and missing values. Call operators directly with positional arguments and align inputs by `(date, symbol)` before combining them.

- Use `TS_MEAN(X,N)` or `MA(X,N)` for a rolling mean per symbol. `MEAN(A,B)` averages two inputs element by element. The second argument is a value in that average.
- Use `TS_MIN(X,N)` or `TS_MAX(X,N)` for rolling extremes. `MIN(A,B)` and `MAX(A,B)` compare two inputs element by element. Use `SUM(X,N)` for rolling sums and `STD(X,N)` for rolling standard deviation.
- Use `RANK(X)` to rank symbols on the same date. Use `TS_RANK(X,N)` to rank the current value within the same symbol's last `N` observations. Apply ranking only when the requested signal calls for it.

## Source comments

Place each Python `#` comment immediately above the code it explains, at the same indentation as the first line and with no blank line between them. Cover each major step in a new factor and update affected comments when editing one.

- Keep the opening overview short. Put the meaning and unit of each window, threshold, or multiplier above `FACTOR_PARAMS` or the corresponding key.
- Inside `calculate`, explain fields, operators, and intermediate values above their steps. State the window boundaries above the rolling calculation and explain the comparison group above the ranking calculation.
- Put short-history, missing-value, and zero-denominator explanations above the code that handles them. Explain how to read the value, its units, and its `(date, symbol)` alignment above the result.

Before saving, check that every comment sits directly above the lines it describes. Use one comment above a group of consecutive statements that do the same job.

For a formula factor, explain fields, windows, and result interpretation in the factor description and keep the source a single expression.

## Python

A Python factor defines exactly one class inheriting from `Factor`, implements `calculate(self, factors)`, and returns a sequence aligned to the input `(date, symbol)` index. Read fields with static `factors["field_code"]` access. Do not depend on another registered factor or override `Factor` or injected operator names.

Prefer supported fields and platform operators, including reasonable compositions. Use NumPy, pandas, or SciPy's public numeric APIs only when platform capabilities are insufficient. Ordinary import aliases and imports from supported public submodules are allowed. Do not import other libraries, relative modules, or use star imports. Do not use dynamic execution, reflection, private attributes, file, network, process, or native-code APIs as non-computational entry points.

Declare a literal `FACTOR_PARAMS` dictionary at the top of new Python source when numeric constants affect the signal and are useful for tuning. Declare it exactly once, use fixed string keys, and do not reassign or mutate it. Keep source defaults authoritative and include only parameters that change factor logic. Integer and float values can be tuned. Other valid literals may remain fixed. A factor lookback is independent of the analysis adjustment cycle. Factors without `FACTOR_PARAMS` can tune run parameters only.

```python
# Smooth the closing price in its original price units.

# Number of observations in the average.
FACTOR_PARAMS = {"lookback": 5}

class RollingMeanClose(Factor):
    def calculate(self, factors):
        # Average each symbol's closes through the current observation.
        # TS_MEAN preserves the input index and fills the initial incomplete window with zero.
        return TS_MEAN(factors["close"], FACTOR_PARAMS["lookback"])
```

## Formula

A formula is one expression without assignments or imports. `TS_MEAN(CLOSE, 5)` matches the Python example. Both calculate a rolling mean per symbol and fill the first four observations of each symbol with `0`.

## Calculation behavior

Static validation checks the factor API but does not import NumPy, pandas, or SciPy or execute source. Numeric calculations run in the existing consumer. Prefer vectorized calculations, reuse intermediate values, and avoid unnecessary copies. Preserve index alignment and handle missing values according to the signal definition. Static validation does not prove a successful analysis. Run an analysis only when it is within the user's requested scope.

Never include credentials in source, parameters, or responses.

## Resource workflow

Use the selected transport's resource interface to create a Python or formula factor; see [research workflow](workflow.md). Read [the main Skill](../SKILL.md) for the selected transport and its request reference. Preserve the create receipt and validation diagnostics. Saving source and submitting analysis are separate operations. An ordinary analysis uses the verified saved parameters; explicit temporary overrides do not change those parameters.
