# `tqx-data` Data Quality Rules

## Point-in-Time Visibility

Use the date on which information became public when evaluating a historical
decision. For event data, filter by the announcement or information date, such as
`publish_date` or `info_date`, instead of only the event's effective date.

Undated company and consensus methods return the latest snapshot. They are valid
for current-state screening but must not be used as historical backtest inputs.

## Corporate Events and Adjustments

`alt_close` in the local package equals `close`; it is not an adjusted price.
When constructing an adjusted or total-return series, retrieve and apply the
relevant dividend and corporate-action events explicitly.

Do not mix event records from different markets or use an event before its
publication date. Keep the original event rows and the transformation logic
auditable.

## Duplicate and Missing Data

`get_stock_detail` may contain duplicate rows. Drop exact duplicates only after
recording that they were duplicates, then verify that remaining rows agree on
every field used by the caller.

For every symbol-specific request:

1. verify the requested symbol in the returned rows;
2. verify the date range and ordering;
3. check required fields for nulls;
4. report empty, duplicate, stale, or conflicting rows explicitly.

Do not replace missing values with zero, forward-fill across an unknown market
closure, or silently discard rows that affect the requested calculation.

## Financial Statements

Financial statement history must use an announcement-date cutoff through `date`.
Use `is_latest=False` when constructing a multi-period panel that must preserve
historical report versions. Distinguish interim cumulative values from standalone
period values using the documented `interim_type` contract.

## Reproducibility

When a result supports an analysis, record:

- package version;
- method and complete non-secret parameters;
- market and symbol normalization;
- requested date range;
- returned row count and relevant columns;
- announcement-date filters;
- event-adjustment steps;
- missing, duplicate, stale, or conflicting data.

Do not turn a data response into a trading action without the user explicitly
switching to the trading workflow and satisfying the trading Skill's account and
authorization requirements.
