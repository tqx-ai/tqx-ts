# Qube Research MCP interface

Use these Research tools, checking the deployed catalog for availability:

```text
tqx_research_explore({action?})
tqx_research_call({action, input, confirm?})
tqx_open_backtest_view({type:"qube", runId})
```

`explore` without an action returns the catalog. With an action it returns exact `inputSchema`, `outputSchema`, documentation and examples. `call` success returns the business object directly in `structuredContent` with matching JSON text in `content`; there is no additional `data` wrapper. Errors set `isError` and include an `error` object. Never use the trading `request` wrapper for research.

`tqx_open_backtest_view` is a separate read-only tool, not a Research action. After a requested strategy backtest succeeds, call it automatically with `type:"qube"` and the submission's root `id` as `runId`, unless the user requested text only. Most users never supply a run ID. It renders the native report in MCP Apps hosts and returns a bounded summary elsewhere. The App reuses `tqx_research_call` with fixed read actions for refresh, chart windows and result pages; agents use `tqx_open_backtest_view` to present the report. Rendering or refresh failures do not justify starting a new backtest.

## Action families

The current source defines 57 actions; the deployed catalog may differ. Use discovery to confirm availability and schemas:

| Family                                 | Actions                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `factor`, `strategy`                   | `list`, `get`, `get_source`, `validate`, `create`, `update`, `save_source`, `delete` |
| `factor.analysis`, `strategy.backtest` | `submit`, `get`, `list`, `search`, `cancel`, `restore`                               |
| `factor.analysis.result`               | `get`                                                                                |
| `backtest`                             | `result.get`, `chart.get`                                                            |
| `factor.version`, `strategy.version`   | `list`, `get`, `search`, `create`, `restore`                                         |
| `factor.snapshot`                      | `list`, `create`                                                                     |
| `factor.tuning`, `strategy.tuning`     | `submit`, `list`, `search`, `get`, `cancel`, `rerun`, `apply`                        |

Use returned lowercase 24-character ObjectIds. IDs are distinct: resource `id` becomes `factorId`/`strategyId`; submitted run `id` becomes `analysisId`/`runId`; version `id` becomes `versionId`, and version `resourceId` identifies its owner. A tuning response's `id` becomes `tuningId` in subsequent get/cancel/rerun/apply inputs; it is distinct from a run ID. Factor apply selects `trialId`; strategy apply selects `candidateId`. Never derive identifiers from titles.

## Minimal calls

```json
{ "action": "strategy.list", "input": { "market": "us", "limit": 20 } }
```

```json
{ "action": "strategy.get", "input": { "strategyId": "0123456789abcdef01234567" } }
```

The IDs/revisions below are illustrative: substitute verified receipts. To persist an explicitly requested benchmark:

```json
{
  "action": "strategy.update",
  "input": {
    "strategyId": "0123456789abcdef01234567",
    "baseConfigRevision": 2,
    "backtest": { "standardSymbol": "NDX" }
  }
}
```

Inspect the update receipt's `parameters.backtest`, `parameterValidation.status`, nested `parameterValidation.config_revision`, and `parametersDraft`. Validation/parameter records retain their server field names inside the camelCase top-level projection. If saving returned source revision 3 and configuration revision 3, an ordinary backtest call is:

```json
{
  "action": "strategy.backtest.submit",
  "input": {
    "strategyId": "0123456789abcdef01234567",
    "requestId": "user-backtest-intent-1",
    "expectedSourceRevision": 3,
    "expectedConfigRevision": 3
  }
}
```

The tool does not auto-save or auto-validate before submitting. Read and reconcile any missing/stale evidence. Submission returns a direct run object whose `id` is used by `strategy.backtest.get` and `backtest.result.get`. Explicit temporary `backtest` overrides are supported but do not persist. Factors follow the same sequence with `factor.update`, `parameters`, `factor.analysis.submit` and `factor.analysis.get`.

Source create/save and validation are separate from execution. Read action schemas for required title, market, code type, resource IDs, and revision fields. Do not submit placeholder source from examples. Source generation uses the bundled [source examples](strategy_templates.md) or [factor guide](factor-creation.md).

## Execution and failures

See [the research workflow](workflow.md) for saved configurations, state meanings, snapshot comparison, partial data, tuning and versions. Reads use `research:read`, configuration/source changes use `research:write`, and submit/cancel/rerun use `research:run`. Tuning apply uses `research:write` and current expected revisions. Client-managed reauthorization handles missing scopes; research does not require a trading account selection.

List/search outputs expose `items`, `hasMore`, `nextCursor` or `nextOffset` as documented. Resource-local lists and tuning lists can carry `possiblyTruncated`; use search for complete history. Result pages expose `partial`, `availableFrom`, `availableTotal`; charts preserve `benchmark` and `complete`. Preserve these distinctions in conclusions.

On `SOURCE_CONFLICT` or `CONFIG_CONFLICT`, reread state and reconcile changes. On `INVALID_INPUT`, fix the request. On `INVALID_PARAMETERS`, inspect saved validation and drafts. On `RUN_NOT_READY`, inspect status; on `LIVE_RESULT_UNAVAILABLE`, back off and read the same run. A network timeout or response validation failure cannot establish that a mutation did not happen. Preserve `requestId` and reconcile before retrying. Delete requires user intent and `confirm: true`; other actions do not gain authorization from that flag.

This interface has no standalone market data, account trading, chat/harness execution, workbench opening, Python package installation or private filesystem access. Use sibling Skills for their documented capabilities and report missing deployment support accurately.
