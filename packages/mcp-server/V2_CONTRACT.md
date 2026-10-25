# MCP v2 tool and handoff contract

Updated 2026-10-23 (Asia/Shanghai). This is the MCP package's implemented contract for
Owner coordination. The Owner's v2 scope replaces the historical two-tool limit.
No claim here establishes real consent, account access, broker connectivity or deployment.

## Ownership and enabled scopes

- MCP owns strict tool schemas, request-local JWT/exchange, tool visibility/permission checks,
  SDK dispatch, bounded/cancellable I/O and batch result classification.
- OAuth owns consent and exact source/derived scopes, session/grant/source-jti revocation and
  Basic token exchange. No introspection or shared database connection is added to MCP.
- Trading owns every request's authoritative owner/Agent/account binding, session/grant/source
  and derived jti, quotas, order/signal ownership, write gate and durable operation idempotency.
- SDK owns paths, URL encoding, request/response mapping, validation and its existing retries.
  MCP consumes workspace:*; no SDK/CLI/root config or lockfile changes are required here.
- Codex owns integrations/codex/** and actual-client acceptance. MCP does not modify that directory.

Both MCP_TRADING_TOOLS_ENABLED and MCP_TRADING_WRITE_TOOLS_ENABLED default to false.
Master off always yields an empty tool list, even if the write flag is true. Master on exposes
seven reads to trade:read. Four writes additionally require the write flag and order:write.
Discovery/initialize accept either enabled scope; each request lists only its permitted tools.
Write-only tokens cannot read and read-only tokens cannot write. Metadata advertises trade:read
and additionally order:write only when both gates are on. The default empty skeleton retains
trade:read metadata for compatibility. Existing read-only client consent is never upgraded implicitly.

Every protected HTTP request still performs online Basic exchange after JWT/body-expiry checks.
Exchange requests exactly the source/enabled scope intersection. No token or authorization cache
crosses HTTP requests. A batch reuses that HTTP request's derived token; every item sends a separate
protected Trading request. MCP checks local expiry/cancellation before every SDK attempt; Trading
must recheck authoritative revocation/binding/quota state for every attempt/item.

If the source expires during the AS/JWKS wait, the HTTP boundary returns 401 invalid_token with
its resource-metadata challenge, even if derived-token verification failed first. With a still-valid
source, malformed/expired T remains 502 upstream_protocol_error. Clients own refresh and retry with
the newly issued source; MCP does not relax expiry or verify/dispatch a failed exchange result.

## Strict input schemas

All tool argument objects reject unknown fields, including user/Agent/account/URL overrides.
All IDs are strings and are SDK URL-encoded; no automatic pagination occurs.

| Tool          | Scope       | Input                                                                                        |
| ------------- | ----------- | -------------------------------------------------------------------------------------------- |
| getAccount    | trade:read  | currency?: HKD or USD                                                                        |
| listPositions | trade:read  | symbol?: 3..32 chars; market?: HK or US; limit?; cursor?                                     |
| listOrders    | trade:read  | limit?; cursor?; startDate?/endDate?: YYYY-MM-DD; status?: string; symbol?: 3..32 chars      |
| getOrder      | trade:read  | orderId: 1..128 chars                                                                        |
| listTrades    | trade:read  | market?: HK or US; orderId?: 1..128 chars; limit?; cursor?                                   |
| listCashFlows | trade:read  | startDate?, endDate?: YYYY-MM-DD format; currency?: three uppercase letters; limit?; cursor? |
| getSignal     | trade:read  | signalId: 8..128 chars                                                                       |
| placeOrder    | order:write | Place input below; stable idempotencyKey required                                            |
| modifyOrder   | order:write | orderId: 1..128 chars; price: positive decimal string; idempotencyKey required               |
| cancelOrder   | order:write | orderId: 1..128 chars; idempotencyKey required                                               |
| placeOrders   | order:write | orders: array of 1..20 Place inputs; every key unique                                        |

Optional limit is an integer 1..100. Optional cursor permits the empty string and is at most 512
characters. Date filters validate format only; calendar validity/order is not promised by MCP/SDK.
Place input: symbol (3..64 raw characters, normalized by SDK to <code>.HK/US), side BUY/SELL,
orderType MARKET/LIMIT, quantity as a positive integer string, optional price as a positive decimal
string, optional reason of at most 512 raw characters, optional timeInForce DAY, and idempotencyKey.
LIMIT requires price and MARKET forbids it. Decimal strings retain precision; never convert to number.
SDK performs authoritative symbol validation/normalization and reason trimming. It defaults DAY.

Every write key is 8..128 characters, begins with an ASCII letter/digit and contains only letters,
digits, periods, underscores, colons or hyphens. MCP neither generates keys nor replaces them.
SDK sends the key in Idempotency-Key, never in the body. Modify/cancel's SDK-optional key is mandatory
at the MCP boundary. Read annotations: readOnly=true, destructive=false. Write annotations:
readOnly=false, destructive=true. All declare idempotent=true/openWorld=true; preserving stable keys
and Trading's durable operation contract is essential to write idempotency.

## Results, uncertainty and retry rules

listOrders still reads the provider's current active-order snapshot. Trading applies optional
filters to that snapshot; this is not a broker historical-order query. startDate/endDate are
inclusive Hong Kong dates derived from submitted_at; rows without a reliable submitted time do
not match a date filter. status trims/uppercases with no fixed-enum restriction; unknown values
return no matches. Symbol matching uses Trading's existing normalization. All filters combine
with AND before pagination; filtered rows sort by submitted_at descending with stable order_id
ties. Filtered cursors bind the actual normalized filters; a different filter cannot reuse one.
No-filter behavior and existing cursors remain unchanged, and ownership checks still apply.

Read outputs remain the unmodified validated SDK data: strings, nulls, actual mode/freshness and
pagination are preserved. cash_flows_unsupported (501) is explicit, not an empty ledger.
Single writes return JSON text containing:

```json
{
  "idempotencyKey": "stable-intent-001",
  "status": "accepted",
  "data": { "signal_id": "synthetic-signal", "state": "ACCEPTED" },
  "request_id": "synthetic-http-request"
}
```

The example is schematic: actual data is the complete validated SDK data, with nulls preserved.
status is accepted, failed or unknown. data/error/request_id are present when available. request_id
comes from this operation's final SDK-validated HTTP envelope (or the public SDK error); it is separate
from data.parent_request_id. Diagnostic IDs must be printable ASCII and at most 256 characters;
unsafe/missing envelope IDs become null or are omitted. They never influence authorization.

- Signal PENDING/ACCEPTED means accepted request/signal, never a fill. Signal REJECTED means failed;
  UNKNOWN means unknown, even though the SDK promise resolved successfully.
- Modify/cancel status UNKNOWN/RESERVED takes precedence over accepted. Explicit REJECTED means
  failed; accepted=true with no status or SUBMITTED means accepted request, not completed action.
  Legacy accepted=false without an explicit rejection remains unknown. Unrecognized statuses are
  conservatively unknown.
- Definite business/HTTP 4xx rejections fail the current request, except stable pending/unknown codes.
  idempotency_conflict is failed and stops the batch; it does not prove that an earlier request with
  that key never executed. Never recommend a replacement key on that basis.
- trading_operation_pending and trading_outcome_unknown are always unknown, including on a new HTTP
  request with no local preceding failure, whether the backend returns 409 or 503. trading_timeout,
  network loss, response/protocol failure after dispatch and 5xx are conservatively unknown.
- If an SDK attempt might have committed but lost its response, a subsequent retry's 401/403/429 does
  not establish non-submission. The item stays unknown. Original keys and available IDs are retained.
- Unknown API error data is filtered to status, UNKNOWN state, operation and request_id/signal_id/action_id/order_id;
  no raw error message, credential, exception, URL or arbitrary backend data is returned.

placeOrders returns the following JSON text; index is zero-based:

```json
{
  "results": [
    {
      "index": 0,
      "idempotencyKey": "stable-key-001",
      "status": "accepted",
      "data": {},
      "request_id": "request-1"
    },
    {
      "index": 1,
      "idempotencyKey": "stable-key-002",
      "status": "unknown",
      "error": "trading_outcome_unknown"
    },
    { "index": 2, "idempotencyKey": "stable-key-003", "status": "not_submitted" }
  ],
  "stopped": true
}
```

The complete array is validated/normalized through the SDK public Standard Schema interface before
any write, and duplicate keys reject the whole batch without dispatch. Submissions are sequential;
the first failed/unknown item stops all later submissions. Each accepted item retains its signal/data
and available request ID. A partial/stopped batch and any failed/unknown single write set MCP isError=true.
Invalid batch input returns an invalid_arguments tool error before any submission. Batches are not atomic.

MCP adds no retry. SDK retains up to three attempts for GET/keyed requests after network failures or
502/503/504, with identical URL/body/key. Each attempt still checks expiry, abort and the per-item
MCP_TRADING_TIMEOUT_MS deadline. A disconnected caller aborts upstream work; later items are not sent.
A timeout/disconnect cannot prove a previously dispatched write did not execute. Reconcile using the
same intent/key, returned signal/action/request IDs and an appropriately authorized read client.

## Verification and remaining acceptance

Executed in this package on 2026-10-23:

| Check                                 | Result                                                                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bun run check                         | Passed: Oxfmt, Oxlint with deny-warnings, both strict TypeScript configurations, 166 Vitest tests in 7 files, tsdown build                                  |
| bun run smoke                         | Passed: built Node entry on temporary loopback, health=200, metadata=200, unauthenticated MCP=401, clean SIGTERM-handler exit=0; both tool flags forced off |
| git diff --check and scope inspection | Passed; no Git mutation, existing service operation or out-of-scope write by this implementation                                                            |

The 166 tests include the original 130 plus 36 v2 cases. All new tests use in-memory synthetic keys,
isolated random loopback HTTP servers, synthetic identities and fake operation state; they do not
prove real OAuth consent, SQL ownership or durable backend storage behavior. The Codex harness is a
separate concurrent workstream; its actual-client checks are not counted in these 166 tests.

Acceptance coverage: default empty surface; 7/4/11 scope-filtered discovery and direct-call denial;
exact SDK paths/headers/decimal/null data; mandatory/duplicate keys; all-item SDK validation; 20-item
maximum; ordered success and replay/conflict; middle-item 401/403/429/422; resolved UNKNOWN/REJECTED;
direct stored pending/unknown replays at 409/503; lost write followed by retry/401; SDK retry count/key
stability; timeout/bad response; per-item expiry; batch abort and actual HTTP resource cleanup;
concurrent write identity isolation; final-attempt request IDs and unsafe-ID rejection.

Pending Owner-coordinated work:

1. Bring up isolated v2 AS/MCP/Trading, confirm both write gates and explicit trade:read order:write
   consent/exchange. Reserved ports 26825/3004/8102 are not readiness evidence. Existing 26823/3002/8100
   services remain untouched by this package's tests.
2. Prove Trading's real durable RESERVED/UNKNOWN replay behavior, cross-auth-kind stable keys,
   fingerprints/conflicts, object ownership, revocation/refresh, account state and shared quotas.
3. Run actual Codex kernel/client against READY services via its separate harness; verify all tools,
   scope isolation, same-key reconciliation and partial batches. Client harness acceptance is separate.
4. Real Java/browser consent, desktop UI, real accounts/brokers and Linux/TLS/deployment remain separate
   acceptance layers. No real funds, standalone autonomous trading, deployment or Git action is included.
