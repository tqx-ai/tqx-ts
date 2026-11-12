# Qube Strategy Source Constraints

The TypeScript CLI uploads Python source as opaque text. The server validates source against the Qube runtime: read `strategy_templates.md` and the market-specific API reference before generating source, and read the `tqx_data` references before using data APIs.

## Confirm before generation

Before writing source that will be uploaded or run, read the task-routed Qube reference and obtain any missing contract from the user or an authoritative runtime document:

- a known-good Qube strategy or factor;
- the required market API and field definitions;
- the source API contract for the requested strategy type.

Without that material, draft a research specification or explain the missing contract instead of fabricating executable Python.

## Validation boundary

- Factor definitions accept a formula or Python source. Python factor source must define exactly one subclass of `Factor`, implement `calculate(self, factors)`, and reference at least one `factors["field"]` or `factors['field']` expression inside that class.
- Strategy definitions accept only Python source.
- Hong Kong and US strategies must use the corresponding market API described in the runtime references.
- Create and save upload source to the server. Read the returned validation diagnostics before running it.
- The SDK also exposes explicit `validateFactor` and `validateStrategy` API calls. The optional local
  `validateStrategyCode` utility is a static check and is not automatically applied to source uploads.

The local strategy check accepts named imports and safe `try/except`. It checks one literal
`STRATEGY_PARAMS` table before lifecycle functions, exactly one copy to `context.params` in
`initialize`, and reads through declared literal string keys. It also checks parameter mutations,
HK/US historical preheating through `init_preheating_data(context)`, and known `tqx_data` call
signatures. Refreshes reachable only from `before_trading(context)` do not require a preheater.
It does not execute Python or replace server validation.

Client input checks validate IDs, dates, revisions, and request structure. Server source validation
is not evidence of point-in-time correctness, data quality, or successful backtest execution.

Read tunable defaults through `context.params["key"]` or `context.params.get("key")`. Direct reads from `STRATEGY_PARAMS` are not counted as parameter references by server tuning. Keep the source table and copied parameters read-only.
