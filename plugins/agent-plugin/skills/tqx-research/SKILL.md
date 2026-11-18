---
name: tqx-research
description: Use when the user wants HK/US Qube factors, analyses, strategy source, backtests, versions or tuning through Research MCP. Trading accounts use tqx-trading; local Python data uses tqx-data. CLI/SDK work is outside this plugin Skill.
---

# TQX Research

Use `tqx_research_explore` and `tqx_research_call` through the configured MCP server and client-managed OAuth. Research needs no trading Agent binding; Qube simulations and backtests are separate from PAPER/LIVE trading accounts. Missing tools or OAuth failures belong to [tqx-setup](../tqx-setup/SKILL.md), not CLI installation. Do not request API keys, bearer tokens or private headers in chat.

## Load by task

Read only the matching references and selected market; do not preload the directory.

- Resource calls: [MCP actions](references/mcp.md). Inspect the deployed catalog or an action's exact schema with `tqx_research_explore`; unavailable actions cannot be called. Discovery alone does not verify business authorization.
- Edit, run, restore, version or tune: relevant section of [workflow](references/workflow.md).
- Factor source: [creation](references/factor-creation.md), then only needed [operators](references/factor-operators.md) and fields.
- Strategy source: [templates](references/strategy_templates.md), [quality](references/strategy-quality.md), and either [HK](references/stock_hk_api.md) or [US](references/stock_us_api.md).
- Engine settings or bound factors: [parameters](references/backtest-parameters.md) or [factor timing](references/factor-driven.md).
- Time-series or cross-sectional logic: [time-series](references/time_series_strategies.md) or [cross-sectional](references/cross_sectional_strategies.md).
- Exact fields or coverage: [data index](references/tqx_data_usage.md), then the method section. Native data pages describe fields; current strategy validation rejects direct `tqx_data` imports. Use engine history APIs.

## Execute and verify

Infer `hk` or `us` from the task, asking only if unresolved. Source/design-only requests need no credentials or remote resources. Mutations must fit the user's requested scope; deletion requires `confirm: true`. Do not reconfirm an already authorized operation. Read/write/run operations require `research:read`/`research:write`/`research:run` respectively.

Ordinary analyses/backtests first save requested settings with resource update. Check saved values, valid `parameterValidation` matching `configRevision`, current valid source and no `parametersDraft`. Submit the saved revisions without `parameters`/`backtest`; explicit temporary overrides do not persist. Use the workflow for conflicts and tuning apply.

Keep IDs, revisions and request receipts. Poll the same run to a terminal state; timeout, partial results or missing benchmarks are not success or a reason to resubmit. Inspect actual parameters, dates, source snapshots, coverage and costs before interpreting results. Static validity does not establish runtime success or absence of look-ahead bias.

Report what changed, the highest evidence reached and the actual run status, with useful IDs and limitations. Keep credentials and private diagnostics out of replies. The public tools do not open workbenches, run harness chats or query standalone market data. If a required reference or action is missing, explain the unavailable contract before dependent work.
