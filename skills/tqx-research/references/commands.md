# TQX Research CLI Command Reference

Use `tqx` from `@tqx-ai/cli`. Install and update it with [the install protocol](install.md).
Research requests use an API key and a gateway base ending in `/tqxApi`.
`TQX_API_KEY` overrides persisted credentials. Never print a key or write it into source files.

Use `--json` for JSON stdout and JSON errors on stderr, or `--plain` for uncolored text.
Exit codes are 2 for invalid input and 1 for API, network, protocol, failed run, cancellation,
or local polling timeout. All resource, run, version, and tuning IDs are lowercase 24-character ObjectIds.

## Factor definitions and analyses

```text
tqx research factor create --market=hk|us (--formula=<formula> | --code=<python> | --file=<path>) [--title=<title>] [--description=<text>]
tqx research factor info <factor-id>
tqx research factor source <factor-id>
tqx research factor save <factor-id> --baseSourceRevision=<revision> (--formula=<formula> | --code=<python> | --file=<path>)
tqx research factor update <factor-id> --baseConfigRevision=<revision> [--title=<title>] [--description=<text>] [analysis-options]
tqx research factor run <factor-id> --expectedSourceRevision=<revision> --expectedConfigRevision=<revision> [analysis-options] [wait-options]
tqx research factor stop <analysis-id>
tqx research factor result <analysis-id>
tqx research factor analyses <factor-id> [--includeDeleted] [--status=<status>]
tqx research factor list [list-options]
tqx research factor delete <factor-id>... --yes
```

`analysis-options`: `--startDate`, `--endDate`, `--adjustmentCycle=1|3|5|10|20|30`,
`--groupNumber=3|5|10|20`, `--factorDirection=Positive|Negative|1|-1`,
`--stockPool=all|HSI.HK|HSCE.HK|HSTECH.HK|SPX|IXIC|NDX|DJI`.
Use a pool in the factor's market.
Omitted analysis options reuse the factor's saved parameters. Dates accept `YYYYMMDD` or `YYYY-MM-DD`.
The analysis interval must increase and not exceed five calendar years (the exact five-year boundary is included).

Create requires exactly one source input; `--file` supplies Python code. A formula uses `code_type=formula`.
Source saves retain the existing code type. The server validates source code; the client validates request shape.

## Strategy definitions and backtests

```text
tqx research strategy create --market=hk|us (--code=<python> | --file=<path>) [--title=<title>] [--description=<text>] [backtest-options]
tqx research strategy info <strategy-id>
tqx research strategy source <strategy-id>
tqx research strategy save <strategy-id> --baseSourceRevision=<revision> (--code=<python> | --file=<path>)
tqx research strategy update <strategy-id> --baseConfigRevision=<revision> [--title=<title>] [--description=<text>] [backtest-options]
tqx research strategy run <strategy-id> --expectedSourceRevision=<revision> --expectedConfigRevision=<revision> [backtest-options] [wait-options] [--download=<path>]
tqx research strategy stop <run-id>
tqx research strategy result <run-id> [--download=<path>]
tqx research strategy backtests <strategy-id> [--limit=1..200]
tqx research strategy list [list-options]
tqx research strategy delete <strategy-id>... --yes
tqx research backtest list [list-options]
tqx research backtest result <run-id> --field=equity|trades|logs|symbol_performance|account_summary [--offset=<non-negative-integer>] [--limit=1..500] [--keyword=<text>] [--symbol=<symbol>]
```

`backtest-options`: `--startDate`, `--endDate`, `--startCapital`, `--commissionRate`, `--slippage`,
`--frequency=1d|1M`, `--standardSymbol=HSI.HK|HSCE.HK|HSTECH.HK|SPX|IXIC|NDX|DJI`.
Use a benchmark in the strategy's market. When no backtest options are supplied during strategy creation, the server applies
its market-specific defaults. Explicit options are passed through as overrides.
The commission value passes through unchanged; slippage is proportional. Update persists specified fields merged with saved configuration. For an ordinary run, update first, verify the returned saved settings and validation, and run without backtest flags. Run flags are for explicitly temporary overrides and do not persist. Daily intervals allow up to ten
years and minute intervals up to one year. Single-day backtests are allowed; the end date must not precede the start date.
The result page's symbol filter applies only to trades.

`wait-options`: `--pollInterval=<seconds>`, `--timeout=<seconds>`, `--noWait`.
Default polling is every 2 seconds for up to 600 seconds. A timeout stops local waiting and leaves the
remote task running. The response includes a stop command. `stop` returns the current cancellation
state; a request accepted by the server may still be running.

`list-options`: `--market=all|hk|us|stock|future`, `--cursor=<next_cursor>`, `--limit=<integer>`,
`--keyword=<text>`, `--includeContent`. Library limits are 1-100; backtest summary limits are 1-10.
Outputs contain `has_more` and `next_cursor`, plus market `counts` for libraries. Source is omitted
by default; `--includeContent` fetches each resource's source or run detail.

## Named versions and restoration

Replace `<kind>` with `factor` or `strategy`:

```text
tqx research <kind> versions <resource-id>
tqx research <kind> version <version-id>
tqx research <kind> version-create <resource-id> <successful-run-id> --name=<name> [--description=<text>]
tqx research <kind> version-restore <resource-id> <version-id> --expectedSourceRevision=<revision> --expectedConfigRevision=<revision>
tqx research factor analysis-restore <factor-id> <analysis-id> --expectedSourceRevision=<revision> --expectedConfigRevision=<revision>
tqx research strategy backtest-restore <strategy-id> <run-id> --expectedSourceRevision=<revision> --expectedConfigRevision=<revision>
```

Read current revisions with `info` before saving, configuring, running, restoring, or applying tuning.
Source and configuration revisions advance independently. On `SOURCE_CONFLICT`, `CONFIG_CONFLICT`,
or a restore/apply conflict, read current state and reconcile the intended changes before retrying.
The CLI generates request IDs for individual mutations. Tuning JSON supplies an explicit `requestId`
so the same request can be safely resubmitted.

## Parameter tuning

```text
tqx research <kind> tuning list <resource-id>
tqx research <kind> tuning get <tuning-id>
tqx research <kind> tuning create <resource-id> --file=<request.json>
tqx research <kind> tuning cancel <tuning-id>
tqx research <kind> tuning rerun <tuning-id>
tqx research factor tuning apply <tuning-id> --trialId=<trial-id> --expectedSourceRevision=<revision> --expectedConfigRevision=<revision>
tqx research strategy tuning apply <tuning-id> <candidate-id> --expectedSourceRevision=<revision> --expectedConfigRevision=<revision>
```

The JSON file uses SDK camelCase input fields and is validated by the SDK. Factor example:

```json
{
  "requestId": "factor-tuning-1",
  "expectedSourceRevision": 2,
  "expectedConfigRevision": 3,
  "candidates": [{ "baseline": true }, { "factorParameters": { "window": 20 } }],
  "researchPeriod": { "periodStart": "2026-01-01", "periodEnd": "2026-06-30" },
  "warmupTradingDays": 20
}
```

Factor tuning requires exactly one baseline with no overrides, at most 32 candidates, a full research
period, and warmup days (0-5000). Objective is `rank_ic_mean`; holdout is disabled. Candidate overrides
are `parameters` (analysis dimensions excluding dates) and `factorParameters` (finite numeric values).

Strategy tuning uses `candidates: [{"strategyParameters":{"window":20}}]` and a sorted, unique
`tradingDates` array of 2-4000 ISO dates. Objective is `total_return` (default), `sharpe`, or
`max_drawdown`. `validationEnabled` defaults to true. The server adds and deduplicates the baseline.

Server run states are `preparing`, `queued`, `running`, `succeeded`, `failed`, and `cancelled`.
CLI execution output maps `succeeded` to `SUCCESS`. `SUBMITTED`, `PENDING`, `RUNNING`, `FAILED`,
`CANCELLED`, and `TIMEOUT` do not mean a successful completed analysis/backtest.

## Saved settings and result availability

Follow [the resource workflow](workflow.md): verify saved parameters, matching valid source/configuration validation, and no `parameters_draft`. Read `info` when receipts omit needed fields. Submit ordinary runs with those revisions and no run overrides. For example, after a requested factor-pool change, use `factor update` with `--stockPool` and then `factor run` with the returned revisions and no `--stockPool`. Do not guess new revisions.

Backtest pages and charts may be empty or partial while running. Preserve `partial`, `available_from`, `available_total`, `complete` and benchmark information from JSON. A successful HTTP read is not completed execution. Poll the same run; never resubmit because a partial result is empty. Tuning additionally has terminal `no_valid_candidates` and nonterminal `cancelling`.
