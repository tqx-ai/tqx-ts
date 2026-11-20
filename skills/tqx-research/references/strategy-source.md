# Qube Strategy Source Constraints

The TypeScript CLI uploads Python source as opaque text. The server validates source against the Qube runtime: read `strategy_templates.md` and the market-specific API reference before generating source, and read the native data references for field and symbol conventions. Direct `tqx_data` imports are rejected by current Qube strategy validation; use market engine APIs.

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
- The SDK exposes explicit `validateFactor` and `validateStrategy` API calls for authoritative
  server-side validation.

Client input checks validate IDs, dates, revisions, and request structure. Server source validation
is not evidence of point-in-time correctness, data quality, or successful backtest execution.

Read tunable defaults through `context.params["key"]` or `context.params.get("key")`. Direct reads from `STRATEGY_PARAMS` are not counted as parameter references by server tuning. Keep the source table and copied parameters read-only.
