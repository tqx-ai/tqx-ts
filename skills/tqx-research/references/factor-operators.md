# Platform operators

This reference covers 42 platform operators for Hong Kong and US equity factors. Python and formulas call operators by name with positional arguments. Python reads field series from `factors`, and formulas use uppercase field names.

Keep the `(date, symbol)` index on inputs and the final result. Time windows count observations per symbol. Use positive integers for window lengths. Rolling windows include the current observation. Grouped operations can reorder rows by symbol, so align series by index before combining them.

## Cross-sectional ranking

| Operator  | Calculation and edge behavior                                                                                                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RANK(X)` | Computes ascending percentile ranks across symbols on each date when the index has a `date` level. Ties receive average ranks, and missing ranks become `0`. Without a `date` level, ranks the whole input sequence. Use when cross-sectional ranking is part of the requested signal. |

## Lags and returns

| Operator                 | Calculation and edge behavior                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DELAY(X,N)`, `REF(X,N)` | Returns the value `N` observations earlier for the same symbol. Shifted missing values, including the initial history and missing source values, become `0`. The two operators currently behave alike. A positive `N` looks backward. |
| `RETURNS(X,N)`           | Computes `X / DELAY(X,N) - 1`. The result can be infinite or missing when history is unavailable or the delayed value is zero.                                                                                                        |
| `PCT_CHANGE(X,N)`        | Runs pandas `pct_change(N)` for each symbol and fills missing results with `0`. A zero denominator can still produce infinity.                                                                                                        |
| `DIFF(X,N=1)`            | Computes the current value minus the value `N` observations earlier for the same symbol. Missing history remains missing.                                                                                                             |

Use `RETURNS` only as a call in a TQX formula, for example `RETURNS(CLOSE, 5)`.

Use positive integer lags to look back. Negative lags in `DELAY` or `REF` access future observations. For positive closing prices, `RETURNS(CLOSE, 5)` divides by zero at the first five observations per symbol, while `PCT_CHANGE(CLOSE, 5)` fills those results with `0`. Handle missing history and zero denominators according to the signal definition.

## Rolling time-series operators

| Operator                           | Calculation and edge behavior                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MA(X,N)`, `TS_MEAN(X,N)`          | Computes the `N`-observation rolling mean for each symbol. Both use the same implementation. Incomplete windows and windows whose mean cannot be computed become `0`.                                                                                       |
| `SUM(X,N)`                         | Computes the `N`-observation rolling sum for each symbol. Incomplete windows and windows whose sum cannot be computed become `0`.                                                                                                                           |
| `TS_MIN(X,N)`, `TS_MAX(X,N)`       | Computes the rolling minimum or maximum for each symbol. An incomplete window returns missing.                                                                                                                                                              |
| `STD(X,N)`, `STDDEV(X,N)`          | Computes the rolling sample standard deviation with divisor `N-1`. Both operators use the same implementation. An incomplete window or `N=1` returns missing. A complete constant window of at least two observations returns `0`.                          |
| `VAR(X,N)`                         | Computes the rolling sample variance with divisor `N-1`. An incomplete window returns missing.                                                                                                                                                              |
| `TS_SKEW(X,N)`, `TS_KURT(X,N)`     | Computes rolling skewness and excess kurtosis for each symbol using pandas' rolling statistics. Skewness requires at least 3 valid observations and kurtosis at least 4. Incomplete windows return missing.                                                 |
| `TS_RANK(X,N)`                     | Returns the current value's ascending percentile rank within that symbol's last `N` observations. The window includes the current value, ties receive average ranks, and incomplete windows return missing.                                                 |
| `TS_ARGMAX(X,N)`, `TS_ARGMIN(X,N)` | Returns the position of the maximum or minimum within that symbol's last `N` observations. Positions run from `0` for the oldest observation to `N-1` for the current one. Ties use the last occurrence. Incomplete windows return missing.                 |
| `TS_ZSCORE(X,N)`                   | Computes `(X - TS_MEAN(X,N)) / STD(X,N)`. Incomplete windows yield `NaN`. A zero standard deviation can yield `NaN` or infinity.                                                                                                                            |
| `SLOPE(X,N)`                       | Returns the linear-regression slope of the `N` observations, using window positions `0` through `N-1` as the independent variable. Incomplete windows and windows with fewer than two observations yield `NaN`.                                             |
| `COUNT(X,N)`                       | Counts true values among the same symbol's last `N` observations using `SUM`. Incomplete windows return `0`.                                                                                                                                                |
| `EVERY(X,N)`                       | Returns true when every value in the same symbol's last `N` observations is true. Otherwise returns false. Incomplete windows return false.                                                                                                                 |
| `EXIST(X,N)`                       | Returns true when at least one value in the same symbol's last `N` observations is true. Otherwise returns false. Incomplete windows return false.                                                                                                          |
| `LAST(X,N,M)`                      | Checks whether every value from `N` observations ago through `M` observations ago is true, including both endpoints. Requires `N > M >= 0`. A symbol with fewer than `N` prior observations returns false. Keep the `symbol` level on the condition series. |
| `EMA(X,N)`                         | Computes an exponential moving average per symbol using pandas `ewm(span=N, adjust=False)`. Smoothing starts at the first valid observation.                                                                                                                |
| `SMA(X,N,M=1)`                     | Uses the recurrence `current × α + previous average × (1-α)`, where `α = M/N`. Choose values with `0 < M <= N` to keep `α` within `(0,1]`. Recursion starts at the first observation.                                                                       |
| `WMA(X,N)`                         | Computes a linear weighted average over the last `N` observations with weights `1, 2, …, N` from oldest to newest, divided by the sum of the weights. An incomplete or missing-value window returns missing.                                                |

### Spread between the 5-period and 20-period moving averages

A common mistake is `MEAN(CLOSE, 5) - MEAN(CLOSE, 20)`. The closing price cancels out, leaving `-7.5` for every valid price. This expression can pass static validation. Calculate the spread by subtracting the two rolling means.

```text
TS_MEAN(CLOSE, 5) - TS_MEAN(CLOSE, 20)
```

```python
FACTOR_PARAMS = {"short_window": 5, "long_window": 20}

class MovingAverageSpread(Factor):
    def calculate(self, factors):
        close = factors["close"]
        short_ma = TS_MEAN(close, FACTOR_PARAMS["short_window"])
        long_ma = TS_MEAN(close, FACTOR_PARAMS["long_window"])
        return short_ma - long_ma
```

Each moving average fills incomplete windows with `0`. If the signal requires both windows to be complete, mask incomplete results per symbol.

## Two-series and conditional operators

| Operator                            | Calculation and edge behavior                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CORR(A,B,N)`, `CORRELATION(A,B,N)` | Computes the rolling Pearson correlation over `N` observations for the same symbol. Both operators use the same calculation. Results are missing before a full window and when either input is constant within the window.                                                                                                                                                  |
| `COVARIANCE(A,B,N)`                 | Computes the rolling sample covariance over `N` observations for the same symbol. Results are missing before a full window.                                                                                                                                                                                                                                                 |
| `CROSS(X,Y)`                        | Returns true when the current `X > Y` and the previous `X <= Y`. Supports a constant on either side. Previous values use `REF` and are grouped by symbol, with initial missing history set to `0`. The first observation for a symbol can therefore be marked as a cross. If the signal requires an observed crossover, exclude positions without valid prior observations. |
| `IF(X,A,B)`                         | Selects `A` where condition `X` is true, and `B` otherwise. Either branch can be a constant. Align series branches to the index and order of `X` before calling. The operator selects by position and keeps `X`'s index.                                                                                                                                                    |

`CORR`, `CORRELATION`, and `COVARIANCE` take two series with the same `(date, symbol)` index. For a single symbol, the current implementation can return a one-row DataFrame. Check the shape before returning a factor, which requires a one-dimensional result.

## Element-wise operators

| Operator                                | Calculation and edge behavior                                                                                                                                                                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ABS(X)`, `SIGN(X)`, `EXP(X)`, `LOG(X)` | Computes absolute value, sign, natural exponential, or natural logarithm element by element. `LOG` requires positive values. Zero and negative inputs produce infinity or missing results.                                                                                                   |
| `POWER(X,N)`                            | Computes `X` raised to power `N` element by element.                                                                                                                                                                                                                                         |
| `MIN(A,B)`, `MAX(A,B)`                  | Returns the element-wise minimum or maximum. Either argument can be a constant. For example, `MAX(CLOSE, 20)` sets a floor of 20 on each closing price. Use `TS_MAX(CLOSE, 20)` for a 20-period rolling maximum. A missing value in either input produces a missing result at that position. |
| `MEAN(A,B)`                             | Computes `(A+B)/2` element by element. `MEAN(CLOSE, 5)` computes `(CLOSE+5)/2` for each observation. Use `TS_MEAN(CLOSE, 5)` or `MA(CLOSE, 5)` for a 5-period rolling mean.                                                                                                                  |
| `EQUAL(A,B)`                            | Compares values element by element and returns a Boolean sequence.                                                                                                                                                                                                                           |

## Names without a runtime operator

These are examples of names accepted by static validation without a matching runtime function. Choose a supported call or field below.

| Name               | Available callable or field                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `DECAY_LINEAR`     | Use `WMA(X,N)` for a linear weighted mean with increasing weights from oldest to newest.                   |
| `SMA_CN`, `EMA_CN` | Choose `SMA(X,N,M=1)` or `EMA(X,N)` according to the required smoothing weight.                            |
| `RET`              | Use `RETURNS(X,N)` or `PCT_CHANGE(X,N)` and account for their different missing-value behavior.            |
| `FMIN`, `FMAX`     | `MIN(A,B)` and `MAX(A,B)` compute element-wise extrema and propagate missing inputs.                       |
| `VWAP(...)`        | When the selected market supplies VWAP, read `factors["vwap"]` in Python or the field `VWAP` in a formula. |
