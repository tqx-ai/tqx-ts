---
name: tqx-research
description: Use when the user wants HK/US Qube factors, analyses, Python strategy source, backtests, versions, or parameter tuning through the TQX CLI/SDK. Local Python market data belongs to tqx-data; PAPER/LIVE accounts and orders belong to tqx-trading.
---

# TQX Research

Use `tqx research` or `TqxClient.research` for Qube resources. API-key requests use a gateway ending in `/tqxApi`. Python source runs inside Qube using the selected market's `panda_backtest` APIs. Native data references describe underlying fields; current strategy validation rejects direct `tqx_data` imports. Qube simulation is research, separate from PAPER/LIVE trading accounts.

## Read by task

Start with the matching task. Read additional references only when its task requires them; do not preload the reference directory or both market frameworks.

- Install, update, or repair the CLI: [Install protocol](references/install.md).
- API key or first connection: [Authentication](references/authentication.md).
- List, read, edit, run, or restore through the CLI: Relevant section of [commands](references/commands.md); [workflow](references/workflow.md) for mutations or runs.
- TypeScript integration: [SDK](references/sdk.md); workflow for mutations or runs.
- Generate a factor: [Factor creation](references/factor-creation.md), then only needed [operators](references/factor-operators.md) and field definitions.
- Generate a strategy: [Template guide](references/strategy_templates.md), [quality](references/strategy-quality.md), and either [HK](references/stock_hk_api.md) or [US](references/stock_us_api.md).
- Change engine settings or bind a factor: [Backtest parameters](references/backtest-parameters.md) or [factor timing](references/factor-driven.md).
- Add time-series or cross-sectional logic: [Time-series](references/time_series_strategies.md) or [cross-sectional](references/cross_sectional_strategies.md).
- Resolve a data field, symbol or coverage question: [Data index](references/tqx_data_usage.md), then the exact method section.

The template guide links complete source examples when needed. Read [source constraints and server validation](references/strategy-source.md) before generating or uploading source. For local Python queries outside Qube, use [tqx-data](../tqx-data/SKILL.md); trading operations use [tqx-trading](../tqx-trading/SKILL.md).

## Work and verify

Infer `hk` or `us` from the request, asking only if unresolved. Source/design-only requests need no credentials or remote resources. Perform mutations only within the requested task; deletion requires `--yes`. Prefer CLI/SDK and non-browser HTTP clients. Use available credentials without exposing them in replies, logs, source or ordinary files; read authentication guidance when setup is needed.

For ordinary analyses/backtests, save requested settings first, verify saved values, matching valid source/configuration validation and no `parameters_draft`, then submit with the returned revisions and no run overrides. Explicit temporary overrides do not persist. Follow the workflow for conflicts, retries, versions and tuning.

Keep returned IDs, revisions and request receipts. Poll the same run to a terminal state; timeout, empty partial results or a missing benchmark do not justify a fresh submission or a zero-return claim. CLI `SUCCESS` corresponds to server `succeeded`; other states are not successful completion. Use `--json`, including JSON errors on stderr.

Report the highest evidence reached: source supplied, resource saved, run submitted, completed, or results reviewed. For findings, inspect actual parameters, dates, source snapshots, costs and data coverage. Validation does not prove execution or freedom from look-ahead bias. Do not claim a Qube workbench opened.

When loaded remotely, resolve referenced files from the same revision. If a required contract is unavailable, explain the missing dependency before dependent generation or execution.
