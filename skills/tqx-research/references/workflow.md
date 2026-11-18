# Research resource and execution workflow

This workflow applies to the TypeScript CLI/SDK and the plugin's MCP research actions. Use the interface documented by the selected Skill; sandbox-only `qube-*` commands, browser workbenches, harness/chat endpoints and private storage are not public client interfaces.

## Create and edit

Use only returned resource, version, run and tuning identifiers. Source and configuration revisions advance independently. Preserve machine receipts and validation diagnostics. Human replies should state what was created or changed and the next requested step without dumping source, internal paths, or a long receipt. A successful create/save does not mean analysis/backtesting ran. There is no client workbench-open action.

When writing code only, provide source and assumptions without requiring credentials or creating remote resources. Remote mutations must fit the user's requested scope. Resolve revision conflicts by reading current state and reconciling changes; do not silently overwrite concurrent edits.

## Ordinary analysis or backtest

1. Read current source/configuration when needed. If the user requests settings for this run, persist those settings with resource update first. Unspecified fields retain the current saved values or, on creation, same-market server defaults.
2. Inspect the saved configuration/receipt: verify actual parameter values, `parameter_validation.status=valid`, validation `config_revision` equals the saved revision, and no `parameters_draft`. MCP projects these as `parameterValidation`, `configRevision` and `parametersDraft`. A nonempty draft is not an applied setting. If the receipt omits the necessary evidence, read the resource. Fix invalid/pending configuration before submitting.
3. Verify saved source validation is valid and matches its revision and digest. Use explicit resource validation when missing or stale. Inspect any same-market immutable factor binding.
4. Submit using the verified source/configuration revisions and an intent-specific `requestId`, omitting `parameters` (factor) or `backtest` (strategy). On the server wire these both map to a `parameters` envelope. Only an explicitly temporary experiment sends overrides; state that they do not update saved settings.
5. Preserve the returned analysis/run ID and compare the pinned parameter/source snapshot with the intended settings. Poll that ID, normally every two seconds with bounded waiting and backoff. Timeout or interrupted waiting leaves the remote job running; reconnect to the existing ID.

Do not auto-update saved configuration inside a submit method: temporary overrides and ordinary saved runs are distinct operations. Network timeouts or invalid responses cannot prove a write failed; reconcile the original `requestId` before retrying, and do not create a new run automatically.

## States and results

Run states `preparing`, `queued`, `running` are in progress; `succeeded`, `failed`, `cancelled` are terminal. A cancellation request can leave the task running. CLI `SUCCESS` maps to server `succeeded`; `SUBMITTED`, `PENDING`, `RUNNING`, `FAILED`, `CANCELLED`, `TIMEOUT` are not successful completion.

Backtest pages/charts can be empty or partial while running. Preserve `partial`, `available_from`, `available_total`, `complete` and benchmark information (MCP uses camelCase availability fields). Honor pagination and time bounds. `LIVE_RESULT_UNAVAILABLE` calls for backing off and reading the same run, not resubmission. An empty page, a partial curve, or a missing benchmark is not a final zero result. Factor results require the status documented by the selected endpoint.

Only report findings after checking actual status, inputs, source/parameter snapshots, dates, coverage, costs and artifacts. Distinguish static validity, accepted submission, terminal completion and reviewed results. Keep IDs available for follow-up without exposing credentials or private diagnostics.

## Tuning and versions

Tuning is an explicit research task. Factor tuning has one non-overriding baseline, at most 32 candidates, a research period and warmup days; objective is `rank_ic_mean` and holdout is disabled. Strategy tuning uses sorted unique trading dates, numeric source-parameter candidates and an objective (`total_return`, `sharpe`, `max_drawdown`); the service adds/deduplicates the baseline. Consult the selected interface's schema for bounds.

Tuning `cancelling` is in progress; `succeeded`, `failed`, `cancelled`, `no_valid_candidates` are terminal. Read candidate/trial status before applying. Apply uses current resource revisions and changes saved source/configuration; get those receipts before a subsequent run. Rerun returns a new tuning ID and requires its own request ID. Limited resource-local lists can be truncated; use summary search for full history.

Named versions reference a successful run and freeze its source/parameters. Restore uses current expected revisions. Bind an explicitly selected immutable code-factor version only in the matching market; see [factor-driven strategies](factor-driven.md).
