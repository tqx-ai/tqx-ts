# WRITE engineering entry points and remaining acceptance

2026-10-25, after checkpoint d6d604d. This is a reuse/gap inventory for Root's next isolated WRITE
window. Preparing or running the memory entry below does not authorize shared-service writes,
restarting3004/8102, editing READY/old data, reusing old grants/keys or contacting a real broker.

## Reusable engineering lane

From packages/mcp-server, with Node and the existing workspace dependencies:

```powershell
node ../../node_modules/vitest/vitest.mjs run --config tests/memory.config.ts --configLoader runner tests/trading-v2.test.ts
```

Use -t with a case-title fragment for a narrower run. The existing memory config disables dotenv,
installs connector/write/subprocess guards and allows only owned temporary loopback fixtures.
tests/v2-fixture.ts provides Map replay state, ordered fault plans, HTTP request records, effect
counts and explicit GET snapshot data. It is not a durable Trading database or real AS consent.

| Concern                   | Reusable case/entry                                                   | Exact limit                                       |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Scope/default gates       | keeps both flags default off; lists7/4/11; cross-scope denial         | synthetic JWT/exchange only                       |
| Stable intents            | requires stable keys and rejects every malformed batch                | no write before whole-input validation            |
| Replay/conflict           | prevalidates and submits sequentially...replays identical stable keys | Map fingerprint, not durable reservation          |
| Batch ordering            | maximum20; middle401/403/429/422; UNKNOWN/REJECTED                    | accepted is not filled; stop later items          |
| Lost response             | lost committed write followed by retry401                             | commit may exist despite later denial             |
| SDK retry budget          | terminal503 and stable keys                                           | at most3 SDK attempts; no added MCP retry/new key |
| Stored uncertainty        | fresh409/503 pending/unknown replay                                   | public reconciliation IDs only                    |
| Timeout/abort             | hold/malformed JSON; batch cancellation and actual HTTP disconnect    | owned fixture, no real effect rollback            |
| Per-item auth             | expiry before later item; concurrent identity isolation               | request-local token and source expiry             |
| New quota counterexamples | lost commit then retry403/429 remains unknown                         | no second intent; one synthetic effect            |
| New explicit polling      | UNKNOWN submission then PENDING/ACCEPTED/linked FILLED snapshots      | GETs only; no automatic resubmit/status inference |

The last three tests are new engineering counterexamples for this batch. The targeted run passed
all three (the original36 were not rerun in that -t invocation). After the optional READ extension,
the complete affected file passed46/46: original36, these3 and7 new filter/input checks. READ offline
56/56 and strict source/Codex types plus scoped format/lint/diff checks passed separately. These are
distinct from earlier190 engineering checks and historical installed-client runs; no shared live
WRITE service, durable fixture, real broker, quota store or user authorization was exercised.

## Actual-client harness references (owned by integration)

integrations/codex/v2-run.ts defaults to plan-only; --memory exercises its45-case manifest without
services or persistence. v2-matrix.ts covers scope, missing keys, three single-tool replay/conflict/
unknown replay families, batch bounds and middle-item failure/unknown/revoke/expiry/quota scenarios.
v2-suite.ts checks real request/effect receipts, stable keys and partial-batch semantics when Root
opens a fresh explicit actual-client window. V2_RUNNER.md documents its current commands and limits.
Do not modify that owner's files or run its old live inputs/READY merely to reuse this plan.

## Gaps for Root/Trading to prove in a new window

- Real durable reservation/fingerprint/UNKNOWN state, process restart and concurrent same-key
  requests across clients/auth kinds. A Map replay is not a DB uniqueness or broker-effect proof.
- Actual shared quota admission/debit/retry/reset behavior. Injecting HTTP429 proves MCP ambiguity
  mapping and batch stop only; it does not prove a real quota counter or fair concurrent admission.
- Persisted signal/order lifecycle polling, terminal snapshots, ownership/non-disclosure and bounded
  client polling budget. New explicit synthetic GET snapshots prove forwarding/no resubmit only.
- Real revocation between attempts/items, store outages, cancellation after committed effects and
  actual reconciliation against the original stable key/request/signal/order IDs.
- Separate protected write attempts from accepted signals, durable operations and fake-broker effects.
  Broker placement/modification/cancellation and actual funds remain outside these engineering tests.

MCP adds no polling engine, retry loop, replacement key, introspection or shared store connector.
Any further actual WRITE acceptance needs Root's separately selected inputs/oracles and runtime
window. No new application-wide policy is introduced by this isolated-test inventory.
