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

Client input checks validate IDs, dates, revisions, and request structure. Server source validation
is not evidence of point-in-time correctness, data quality, or successful backtest execution.
