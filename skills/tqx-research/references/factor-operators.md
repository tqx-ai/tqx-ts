# Factor Operators

This page is the local authority for factor formula operators in this workspace.
Use lowercase field names such as `close` and `volume`, and uppercase operator names.

<Warning>
`FUTURE_RETURNS(X, N)` is forbidden in factor formulas because it introduces look-ahead bias.
</Warning>

## Math operators

| Operator | Expression | Description |
|---|---|---|
| `ABS` | `ABS(X)` | Absolute value |
| `LOG` | `LOG(X)` | Natural logarithm |
| `EXP` | `EXP(X)` | Natural exponential |
| `LOGABS` | `LOGABS(X)` | Natural logarithm of `abs(X)` |
| `AS_FLOAT` | `AS_FLOAT(X)` | Convert a boolean series to `0.0` or `1.0` |
| `RD` | `RD(X, N)` | Round to `N` decimals |
| `SIGN` | `SIGN(X)` | Sign: `-1`, `0`, or `1` |
| `SIN` | `SIN(X)` | Sine |
| `COS` | `COS(X)` | Cosine |
| `TAN` | `TAN(X)` | Tangent |
| `ARCSIN` | `ARCSIN(X)` | Inverse sine |
| `ARCCOS` | `ARCCOS(X)` | Inverse cosine |
| `ARCTAN` | `ARCTAN(X)` | Inverse tangent |
| `POWER` | `POWER(X, N)` | Raise `X` to a power |
| `SIGNEDPOWER` | `SIGNEDPOWER(X, N)` | Signed power |

## Cross-sectional operators

| Operator | Expression | Description |
|---|---|---|
| `RANK` | `RANK(X)` | Cross-sectional percentile rank |
| `SCALE` | `SCALE(X)` | Scale a cross-section to `[-1, 1]` |
| `ZSCORE` | `ZSCORE(X)` | Cross-sectional z-score |

## Time-series operators

| Operator | Expression | Description |
|---|---|---|
| `CONST` | `CONST(X)` | Repeat the last value |
| `BARSLAST` | `BARSLAST(X)` | Bars since last true |
| `BARSLASTCOUNT` | `BARSLASTCOUNT(X)` | Consecutive true bars |
| `REF` | `REF(X, N)` | Value `N` periods ago |
| `DELAY` | `DELAY(X, N)` | Alias of `REF` |
| `DIFF` | `DIFF(X, N)` | Difference from `N` periods ago |
| `DELTA` | `DELTA(X, N)` | Alias of `DIFF` |
| `MA` | `MA(X, N)` | Simple moving average |
| `TS_MEAN` | `TS_MEAN(X, N)` | Alias of `MA` |
| `SUM` | `SUM(X, N)` | Rolling sum |
| `PRODUCT` | `PRODUCT(X, N)` | Rolling product |
| `ROC` | `ROC(X, N)` | Percentage change from `N` periods ago |
| `PCT_CHANGE` | `PCT_CHANGE(X, N)` | Alias of `ROC` |
| `STD` | `STD(X, N)` | Rolling standard deviation |
| `STDDEV` | `STDDEV(X, N)` | Alias of `STD` |
| `VAR` | `VAR(X, N)` | Rolling variance |
| `TS_MAX` | `TS_MAX(X, N)` | Rolling maximum |
| `TS_MIN` | `TS_MIN(X, N)` | Rolling minimum |
| `TS_MIDDLE` | `TS_MIDDLE(X, N)` | Midpoint of rolling max/min |
| `TS_MAD` | `TS_MAD(X, N)` | Rolling mean absolute deviation |
| `TS_RANK` | `TS_RANK(X, N)` | Percentile rank in window |
| `TS_ARGMAX` | `TS_ARGMAX(X, N)` | Position of rolling max |
| `TS_ARGMIN` | `TS_ARGMIN(X, N)` | Position of rolling min |
| `HHV` | `HHV(X, N)` | Alias of `TS_MAX` |
| `LLV` | `LLV(X, N)` | Alias of `TS_MIN` |
| `HHVBARS` | `HHVBARS(X, N)` | Bars since rolling max |
| `LLVBARS` | `LLVBARS(X, N)` | Bars since rolling min |
| `COUNT` | `COUNT(X, N)` | Count true values |
| `EVERY` | `EVERY(X, N)` | All values in window are true |
| `EXIST` | `EXIST(X, N)` | Any value in window is true |
| `BARSSINCEN` | `BARSSINCEN(X, N)` | Bars since first true in window |
| `SLOPE` | `SLOPE(X, N)` | Rolling regression slope |
| `ANGLE` | `ANGLE(X, N)` | Rolling regression angle |
| `INTERCEPT` | `INTERCEPT(X, N)` | Rolling regression intercept |
| `FORCAST` | `FORCAST(X, N)` | Rolling regression forecast |
| `DECAYLINEAR` | `DECAYLINEAR(X, N)` | Linearly weighted average |
| `TS_ZSCORE` | `TS_ZSCORE(X, N)` | Rolling z-score |
| `TS_SKEW` | `TS_SKEW(X, N)` | Rolling skewness |
| `TS_KURT` | `TS_KURT(X, N)` | Rolling kurtosis |
| `TS_MEDIAN` | `TS_MEDIAN(X, N)` | Rolling median |
| `AVEDEV` | `AVEDEV(X, N)` | Rolling mean absolute deviation |
| `EMA` | `EMA(X, N)` | Exponential moving average |
| `DMA` | `DMA(X, A)` | Dynamic moving average |
| `WMA` | `WMA(X, N)` | Weighted moving average |
| `RETURNS` | `RETURNS(X, N)` | Historical return from `N` periods ago |
| `SHARPE` | `SHARPE(X, N)` | Rolling mean divided by rolling std |
| `SUM_ABS_PRICE_CHANGE` | `SUM_ABS_PRICE_CHANGE(X, N)` | Rolling sum of absolute price changes |
| `MEAN_ABS_PRICE_CHANGE` | `MEAN_ABS_PRICE_CHANGE(X, N)` | Rolling mean of absolute price changes |
| `SMA` | `SMA(X, N, M)` | Chinese-style weighted moving average |

## Comparison and conditional operators

| Operator | Expression | Description |
|---|---|---|
| `MAX` | `MAX(A, B)` | Element-wise maximum |
| `MIN` | `MIN(A, B)` | Element-wise minimum |
| `MEAN` | `MEAN(A, B)` | Element-wise mean |
| `EQUAL` | `EQUAL(A, B)` | Element-wise equality |
| `VALUEWHEN` | `VALUEWHEN(A, B)` | Value of `B` when `A` is true |
| `CROSS` | `CROSS(X, Y)` | `X` crosses above `Y` |
| `LONGCROSS` | `LONGCROSS(A, B, N)` | Crosses above `B` after staying below |
| `LAST` | `LAST(X, N, M)` | `X` stays true from `N` through `M` |
| `IF` | `IF(X, A, B)` | Choose `A` or `B` by condition |

## Statistical and relationship operators

| Operator | Expression | Description |
|---|---|---|
| `CORR` | `CORR(A, B, N)` | Rolling correlation |
| `CORRELATION` | `CORRELATION(A, B, N)` | Alias of `CORR` |
| `COV` | `COV(A, B, N)` | Rolling covariance |
| `COVARIANCE` | `COVARIANCE(A, B, N)` | Alias of `COV` |
| `TS_REGRESSION` | `TS_REGRESSION(A, B, N)` | Rolling regression slope |
| `SUMIF` | `SUMIF(A, B, N)` | Rolling sum of `B` where `A` is true |

## Restricted operators

| Operator | Expression | Status |
|---|---|---|
| `FUTURE_RETURNS` | `FUTURE_RETURNS(X, N)` | Not allowed |

## Technical indicators


Technical indicator arguments use lowercase field names; operator names remain uppercase.

| Indicator | Expression |
|---|---|
| Average volume | `ADV(volume, N)` |
| MACD | `MACD_DIF(close, short, long, M)`, `MACD_DEA(close, short, long, M)`, `MACD(close, short, long, M)` |
| KDJ | `KDJ_K(close, high, low, N, M1, M2)`, `KDJ_D(close, high, low, N, M1, M2)`, `KDJ_J(close, high, low, N, M1, M2)` |
| RSI / Williams %R | `RSI(X, N)`, `WR(X, N)` |
| Bollinger bands | `BOLL_UPPER(close, N, P)`, `BOLL_MID(close, N, P)`, `BOLL_LOWER(close, N, P)`, `BOLL_WIDTH(X, N)` |
| Donchian channels | `TAQ_UPPER(high, low, N)`, `TAQ_MID(high, low, N)`, `TAQ_LOWER(high, low, N)` |
| Bias / PSY / CCI | `BIAS(close, N)`, `PSY(close, N)`, `PSYMA(close, N, M)`, `CCI(X, N)` |
| ATR | `ATR(X, N)` |
| BBI | `BBI(close, M1, M2, M3, M4)` |
| DMI | `DMI_PDI(close, high, low, M1, M2)`, `DMI_MDI(close, high, low, M1, M2)`, `DMI_ADX(close, high, low, M1, M2)`, `DMI_ADXR(close, high, low, M1, M2)` |
| Advanced moving averages | `DEMA(X, N)`, `TEMA(close, N)`, `KAMA(X, N)`, `T3(X, N)` |
| Oscillators | `PPO(A, B)`, `AROONOSC(X, N)`, `ADXR(X, N)`, `CMO(X, N)`, `STOCHASTIC(X, N)` |
| Volume indicators | `OBV(close, volume)`, `VR(close, volume, M1)`, `MFI(close, high, low, volume, N)` |
| EMV | `EMV(high, low, volume, N, M)`, `EMVMA(high, low, volume, N, M)` |
| TRIX | `TRIX(close, M1, M2)`, `TRIMA(close, M1, M2)` |
| DPO | `DPO(close, M1, M2, M3)`, `DPOMA(close, M1, M2, M3)` |
| BRAR | `BRAR(open, close, high, low, M1)`, `ARBR(open, close, high, low, M1)` |
| Momentum | `MTM(close, N, M)`, `MTMMA(close, N, M)`, `ROCMA(close, N, M)` |
| MASS | `MASS(high, low, N1, N2, M)`, `MASSMA(high, low, N1, N2, M)` |
| EXPMA | `EXPMA(close, N1, N2)`, `EXPMA2(close, N1, N2)` |
| ASI | `ASI(open, close, high, low, M1, M2)`, `ASIT(open, close, high, low, M1, M2)` |
| DIF | `DIF(close, N1, N2, M)`, `DFMA(close, N1, N2, M)` |
| Bollinger difference | `BOLLINGERDIFF(A, B)` |

## Market compatibility

The operator set is shared across markets, but the available fields depend on the market contract.

| Market | Common fields |
|---|---|
| Hong Kong | `open`, `close`, `high`, `low`, `volume`, `amount`, `turnover`, `market_cap` |
| US | `open`, `close`, `high`, `low`, `volume`, `amount`, `turnover`, `market_cap` |

## Examples

```text
RANK(close / DELAY(close, 20) - 1)
```

```text
CORR(close, volume, 10)
```
