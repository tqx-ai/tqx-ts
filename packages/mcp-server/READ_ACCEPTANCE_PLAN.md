# READ acceptance plan and contracts (2026-10-25)

Status: **B EXECUTED:113 UNIQUE CASES PASSED,1 PROVIDER CAPABILITY UNSUPPORTED**. See
[READ_ACCEPTANCE_RESULTS.md](READ_ACCEPTANCE_RESULTS.md) for the retained original107/4/2/1 results,
six targeted passes, separate preflight, actual transport/auth proof and zero safety deltas. Root
reported desktop A complete with31 actual calls and a clean A-after audit; that is separate Owner
evidence. This plan covers only the isolated-primary B READ contract.
No order placement/modification/cancellation/batch tool, real broker or trade effect is permitted.
Earlier 185 unit cases and 45+45 installed-kernel runs are separate engineering evidence, not
coverage of this new natural-language desktop conversation.

## Exact input and protocol contract

Source of truth: src/protocol.ts; workspace SDK trading/schemas.ts and trading-api.ts; Trading
routes/trading_routes.py and services/trading_service.py. Every argument object is strict: unknown
fields, identity/account overrides and unsupported filters must fail rather than be ignored.
All tools require trade:read at MCP. Read-only discovery must list these seven tools and no write
tools; a write-only source cannot execute them. Listing or attempting denied READ tools does not
require invoking any write tool. Authentication/JWT/online exchange remain the production path.

| Tool          | Exact accepted args                                                                                  | Successful validated data                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| getAccount    | currency?: HKD or USD; omitted is forwarded without a default                                        | Account record                                                                  |
| listPositions | symbol?: string length3..32; market?: HK or US; limit?; cursor?                                      | {items: Position[], next_cursor?: string or null}                               |
| listOrders    | limit?; cursor? only; no symbol/market/status/orderId filter                                         | {items: Order[], next_cursor?: string or null}                                  |
| getOrder      | orderId: string length1..128, required                                                               | One Order; not-found is an error, not null data                                 |
| listTrades    | market?: HK or US; orderId?: string length1..128; limit?; cursor?                                    | {items: Trade[], next_cursor?: string or null}                                  |
| listCashFlows | startDate?, endDate?: YYYY-MM-DD format strings; currency?: three uppercase letters; limit?; cursor? | {items: CashFlow[], next_cursor?: string or null}, only if provider supports it |
| getSignal     | signalId: string length8..128, required                                                              | One Signal; not-found is an error                                               |

All limits, if present, are integer1..100; MCP/SDK do not inject a default. Trading currently defaults
to50. Cursor is optional string length0..512 at MCP/SDK; **omit it for the first page**. Trading rejects
empty/malformed cursor with400. A returned cursor is opaque, binds resource kind and parsed filters,
and does not bind limit. Reuse it unchanged with the same filters; changing resource/filter must fail.
Terminal Trading pages return next_cursor=null; SDK also accepts missing next_cursor and preserves it.
Do not auto-page indefinitely: bounded fixture traversal proves completeness/no duplicates.

MCP forwards position filters without trimming/uppercasing; Trading normalizes gateway symbols.
IDs are encodeURIComponent-encoded by SDK; reserved characters need a real fixture contract and
observed refusal/success, not an assumption that encoding proves the backend can represent them.
Cash date grammar is checked by MCP/SDK; calendar truth/range is enforced by Trading. Current Trading
uses inclusive Hong Kong dates, default latest7 days and maximum90 days, and normalizes currency.
A lowercase currency is nevertheless invalid at the MCP boundary. No unsupported filter is invented.

Responses are MCP content text containing JSON of SDK data, not the HTTP envelope. Success SDK
schemas are loose and retain extra data; known optional fields missing remain missing. Amounts and
quantities remain strings, null is never zero, and mode/freshness are never inferred from broker names.
The read path currently does not add an envelope request_id; do not mistake parent_request_id for it.

## Required and nullable return fields

string below means preserved string, not a promise of ISO/calendar/decimal validity beyond the SDK
schema. Except account_id, monetary/quantity fields are strings, not JSON numbers.

| Record   | Required non-null fields                                                                                                                                          | Required nullable fields                                                                                                                                                                                                                    | Optional fields                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account  | account_id string or number; mode PAPER/LIVE; base_currency,total_assets,as_of strings; is_stale boolean                                                          | cash,available_cash,frozen_cash,buying_power,market_value,unrealized_pnl: string or null                                                                                                                                                    | cash_balances?: null or array of currency and nullable available_cash/frozen_cash/settling_cash/withdrawable_cash strings                                                                                                                                                                                                                                          |
| Position | symbol,symbol_name,currency,side,quantity,available_quantity,as_of strings; market HK/US                                                                          | average_cost,last_price,market_value,unrealized_pnl,unrealized_pnl_ratio                                                                                                                                                                    | price_currency?: string or null                                                                                                                                                                                                                                                                                                                                    |
| Order    | order_id,symbol,symbol_name,currency,quantity,filled_quantity,remaining_quantity strings; market HK/US; side BUY/SELL; order_type MARKET/LIMIT; status enum below | client_order_id,price,average_fill_price,submitted_at,updated_at                                                                                                                                                                            | time_in_force?: DAY; market_session,effective_trade_date,expire_at,cancel_request_id,price_currency?: string or null                                                                                                                                                                                                                                               |
| Trade    | trade_id,order_id,symbol,symbol_name,currency,quantity,price,amount,executed_at; market HK/US; side BUY/SELL                                                      | commission                                                                                                                                                                                                                                  | client_order_id,total_fees,price_currency?: string or null; fees?: null or map of string amounts                                                                                                                                                                                                                                                                   |
| Signal   | signal_id,created_at,updated_at; state PENDING/ACCEPTED/UNKNOWN/REJECTED                                                                                          | order_id,order_status,message                                                                                                                                                                                                               | error_code,rejection_reason,parent_request_id,symbol,requested_price,total_quantity,requested_quantity,available_quantity,excess_quantity,requested_value,available_buying_power,shortfall,currency,market_session,effective_trade_date,expire_at?: string or null; broker_error_id?: number or null; short_selling_allowed?: boolean or null; time_in_force?: DAY |
| CashFlow | flow_id,currency,amount; direction IN/OUT                                                                                                                         | category: TRADE/FEE/TRANSFER/FX/CORPORATE_ACTION/AWARD/OTHER or null; symbol,occurred_at,business_date,settle_date,reference_id,order_id,broker_type,business_name,description: string or null; settlement_status: SETTLED/SETTLING or null | SDK loose extras only                                                                                                                                                                                                                                                                                                                                              |

Order status is PENDING/SUBMITTED/PARTIAL_FILLED/MODIFYING/CANCELLING/FILLED/CANCELLED/REJECTED/TIMEOUT/FAILED.
Requesting currency=USD does not prove every provider converted the account to USD. Account totals
retain their reported base_currency; cash_balances retain each native currency. Availability/cash
fields require the provider's declared snapshot semantics. A returned HKD amount must not be relabeled
USD or converted using an invented rate. Trading identified the A fixture ignored money_type; the
MCP/SDK/route forwarded the parameter. B may declare separate HKD/USD historical snapshots, but that
is fixture-only evidence and does not enable FX for the real channel.

A signal PENDING/ACCEPTED acknowledges a signal, not a fill. UNKNOWN is not success/failure certainty;
order_status is merely the linked-order snapshot. Position has as_of but no mandatory is_stale;
orders/trades/signals do not acquire fabricated account freshness fields. Trade price/average-cost
currency uses reported price_currency; settlement amount/commission/fee fields use currency.

## Error boundaries

| Origin                                                    | Expected observation                                                           | Required proof                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Invalid tool args/unknown field                           | MCP isError plain SDK validation text or RPC -32602, not necessarily JSON      | Positive valid-args control; zero Trading GET/write dispatch                                 |
| READ hidden from write-only token                         | Tool-not-found result/-32602 with valid args                                   | Exact unavailable-tool category, not generic schema rejection; zero Trading dispatch         |
| Missing/expired/bad-signature/wrong-audience source       | HTTP401 invalid_token and resource-metadata challenge                          | Before Trading; no source/credential leaks                                                   |
| Valid source with no enabled scope                        | HTTP403 insufficient_scope                                                     | Before Trading; no auto-consent/scope upgrade                                                |
| Online revoked/old-refreshed source                       | HTTP401 from online exchange                                                   | Only isolated B grant/session changed; human740002 preserved                                 |
| Source expires during exchange verification               | HTTP401 with challenge                                                         | Source-expiry fix remains; valid M with bad/expired T stays502                               |
| Trading401/403/429                                        | Tool isError JSON authorization_required/permission_denied/rate_limit_exceeded | Authenticated protocol-level response; do not parse as a successful empty account            |
| Owned/missing or foreign order/signal                     | order_not_found/signal_not_found, with isError                                 | Foreign object existence established privately; no record disclosed                          |
| Other Trading4xx/cursor/date error                        | trading_request_rejected                                                       | Schema-valid request reaches intended backend path; sanitized error only                     |
| Trading5xx/network/read timeout                           | dependency_unavailable except public whitelisted codes                         | SDK GET retries retained up to3; no unbounded MCP retry                                      |
| Malformed/oversized/redirected/bad-schema backend success | upstream_protocol_error                                                        | B-scoped fault only; no redirect or bearer forwarding to another origin                      |
| Cash provider501                                          | cash_flows_unsupported                                                         | **Functional capability gap**, not cash-ledger functionality passed; never items=[] fallback |

Do not apply JSON.parse blindly to SDK plain-text tool errors. The protocol runner must separately
classify HTTP auth, RPC, plain validation/not-found, structured tool errors and schema-valid data.
A parser failure must fail the case, not disappear into an empty object treated as success.

## Per-tool meaningful case matrix

Machine-readable descriptors are in tests/read-only-plan.ts; a descriptor is a planned case, not
execution evidence. Shared error handling is covered once on a representative read, not multiplied
across all tools to inflate counts. Each tool still has its own baseline, strict unknown-field and
valid-argument scope-denial cases because registration/argument shape differs.

| Tool          | Normal/data semantics                                                              | Pagination/filter/empty and object cases                                                                           | Invalid/boundary cases                                                                                          |
| ------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| getAccount    | Default/HKD/USD, exact decimals/null/native balances; as_of/is_stale/mode truth    | Target bound account only; no account selector                                                                     | EUR/null currency, unknown identity field; representative scoped faults/auth cases                              |
| listPositions | Rich HK/US rows, null costs/price_currency, precision                              | market, symbol, AND filters, no match, explicit empty; limit2 page chain; change page size; malformed/empty cursor | symbol2/33, marketCN, limit0; common cursor/unknown/scope cases                                                 |
| listOrders    | Current-order status/nullable fields                                               | Page chain and empty; foreign candidates before owned rows must not starve owned page                              | No invented symbol/status filter, limit101, cursor513; invalid IDs belong getOrder                              |
| getOrder      | Existing owned current detail; no assumption every terminal order remains current  | Missing, existing foreign, reserved-character boundary                                                             | Missing/empty/129/numeric ID, unknown identity, valid-args scope denial                                         |
| listTrades    | Execution precision, fees map/null, price versus settlement currency               | HK/US, orderId, combined filter, empty, page chain; foreign candidates before owned                                | Fractional limit, empty orderId, malformed cursor, unknown identity                                             |
| listCashFlows | Real provider unsupported gap; synthetic supported ledger is fixture-only evidence | If provider supported: signed native amounts/null categories, date/currency filter/page chain                      | Calendar-invalid, reversed and >90-day ranges, malformed dates, lowercase currency/string limit, invalid cursor |
| getSignal     | Preseeded PENDING/ACCEPTED/UNKNOWN/REJECTED; not a fill                            | Owned, missing, existing foreign, reserved-character boundary                                                      | Missing/empty/7/129/numeric ID, unknown identity, valid-args scope denial                                       |

Transport/auth matrix additionally covers source401/403, online revoked and refresh-old isolated
sources, timeout/abort/reconnect, two bounded concurrent READs and stable response ownership.
Global issuer/JWKS rotation/outage or blanket quota exhaustion is not a safe shared-service fault;
use already-tested isolated local seams or separately authorized target-specific adapters. No live
controller arm/reset, middleware key edit or grant operation occurs merely by preparing this plan.

## Existing coverage and current fixture gaps

- 185 engineering tests: two-tool account/positions output exactness, 7-tool synthetic path mapping,
  scope visibility, some argument limits, cancellation and exchange failures, plus source-expiry fix.
  The 7-read mapping case often uses empty lists and fake cursor handling, not real page traversal.
- Historical45+45 kernel runs: a basic per-READ call and write-only denial exist, within a write-heavy
  matrix. They do not demonstrate new desktop natural-language turns or rich READ edge semantics.
- Current live PAPER account/positions fixture reports a fixed account model/empty positions. This
  can establish baseline protocol/schema/empty handling only; rich filtering/pagination remains blocked.
- Trading has prepared local source fixes for fixture market filtering and foreign-first ownership
  page starvation, with four red-to-green counterexamples and36 pure/read checks reported. They are
  not deployed into the A runtime. B must prove row contents and full page traversal after the
  coordinated test-runtime update, not just GET200 or a falsely empty page.
- Root reported A D01-D14 actually reused desktop authorization after MCP process recovery. The
  initial seven READ calls and next four actual calls included an honest currency fallback, empty
  filtered data and invalid-cursor rejection; other turns deliberately made no redundant call.
  This is Owner desktop evidence with its own artifacts, not this runner's execution. Root then
  reported31 actual A calls complete, unchanged A-after digests and zero additional writes/effects,
  and explicitly released B; runtime readiness still gates actual B READs.
- Actual provider cash ledger remains501 unsupported. Its real success/empty/filter/page functions
  remain unavailable. A synthetic supported ledger does not remove this product/provider gap.

## Trading fixture handshake before B

Prepare, do not apply during A: separate740001 B profile/session. Each unfiltered paginated owned
dataset has exactly3 distinct rows with both HK and US represented: limit2 yields2 then1, and only
then may the second page assert terminal/null and complete private set. Its explicit capability is
threeRowPageDataset.<tool>. Larger/filter datasets are separate case-bound datasets and must not be
mistaken for a two-page terminal fixture. Include null/large-decimal examples and known foreign
existing order/signal from another isolated
fixture (not human740002); four preseeded signal states with persisted owner binding. No write tool
or real broker may be used to create these records. Fixture setup is distinct from READ execution.

Private schema1 manifest binds testOnly/phase B/generation/namespace/subject740001, the exact five-field
binding {uid:'740001',agentId,accountId,brokerUserId,brokerCompanyId:'4'} and the isolated
session/grant/source-jti/clientId allowlist. It contains capabilities,
fixtureValues, declared datasets with source/version/count/digest, and **cases[fullCaseId]** mapping
to datasetId, fault and private expected semantics. setup(test) must use test.id, not merely scenario:
cash provider501 baseline and supported page cases may both say normal; USD/native-fallback cases
also need different oracles. Any unmapped case is blocked. Cash support requires an explicit
PERSISTED_FIXTURE_SNAPSHOT/ISOLATED_PAPER_HISTORY_LEDGER declaration with matching binding and rowCount;
missing declaration remains501, damaged/count-inconsistent declaration503, never empty success.

Private manifest contains aliases/expected rows/fields, capability flags and scenario support;
Semantic verdicts must be computed by comparing the actual payload with private expected fields,
complete ID sets and sequence. A manifest literal true is not an oracle or evidence. Public reports
contain case IDs, computed boolean semantic checks and counts, never raw IDs/amounts/cursors/
tokens/grants or full backend text. Cursor refs must come from a real previous page, never hand-built
for a success assertion. Take business BSON digest+count and protected HTTP snapshots **after** each
scenario setup and before READ, then after READ but before restoring the scenario. Require unchanged
business effects/events/operations/orders/trades/signals/monitor and zero Trading POST/PATCH/DELETE,
even rejected writes. AS exchange/JTI/quota bookkeeping and controller rawReads are separate expected
read/auth audit changes, not broker effects. Snapshot-only observation does not authorize arm/reset.

All faults must be constrained to primary740001's B session/request and restored in finally. Missing
or unscoped controls/capabilities block a case; do not silently pass/skip it. Authority/profile failure
must not affect personal740002 or change a global issuer/key/ready marker. Shared controller being
write-enabled is not a READ firewall; the runner independently rejects non-READ tool names.

## Runner and phase gates

The prepared runner opens no session, fetch, token file, controller or service at import/plan time.
Default is plan-only. Its execution adapter is created only after a short-lived Owner B permit for
primary740001 and the exact generation; the permit is not old READY. No actual SDK/desktop execution
is claimed until an official protocol client adapter has run in that explicit window.
Use serial cases and at most2 explicitly bounded parallel READs; suggested default ceiling is20
protocol tool requests/minute, accounting separately for SDK retries, discovery/method probes and
AS exchange. Confirm actual shared budgets first; do not induce429 by flooding a global service.
A scoped rate-limit adapter is preferred. Stop immediately on any business mutation, trade-write
attempt, wrong subject, unscoped fault or teardown failure.

Expected report axes: executionLayer (source/unit, protocol SDK, installed kernel, actual desktop),
case outcome (passed/failed/blocked/unsupported/not-run), error-mapping result, business/audit deltas,
fixture/provider limitations and per-tool coverage. Provider unsupported is never included in a
count claiming the ledger feature works. No pending case becomes pass merely because plan generation
or static TypeScript validation succeeded.

## Prepared artifacts and verification limits

- tests/read-only-plan.ts: data-only descriptors, including exact args, alias dependencies, semantic
  oracles, roles and scoped scenarios. planSummary() emits only plan counts/aliases, not execution.
- tests/read-only-runner.ts: gated serial runner core. A missing/A/expired permit is rejected before
  opening the protocol/controller adapter; non-READ names are rejected at runtime. It classifies
  SDK plain text separately, validates data through public SDK schemas and requires private semantic
  booleans rather than logging data. Unsupported ledger mapping is unsupported, not passed.
- Driver audit counters must be append-only. Any trade write/effect or business-digest mutation
  stops subsequent cases; scenario teardown/driver close are mandatory. Missing fixture/oracle is
  blocked, never a pass. The report contains public case IDs, outcome/reason enums and audit deltas,
  with no raw values, account IDs, cursor, token/grant or digest copied from the observation.
- tests/read-only-client.ts: official Client/StreamableHTTPClientTransport, request-local role sessions,
  exact MCP URL/method and READ-tool firewalls, manual redirects, bounded timeouts and mandatory close.
  Cancellation waits for an actual active Trading read, aborts its HTTP signal and waits for the
  controller to settle. Reconnect closes a Client and initializes a new one; parallel-two actually
  issues two calls and measures overlapping response consumption. The redacted report includes these
  measured counts. Injected fetch always labels the run memory-double, never actualProtocol.
- tests/read-only-contract.ts: schema1 private manifest and structured semantic rules. JSON Pointer
  rules equal/absent/type/length/keys/allEqual/ids/unionIds compare real data, with exact decimal/null
  types, no prototype traversal and captured actual previous pages. Static true is rejected. Dynamic
  NextCursor aliases are accepted only from a validated first-page observation.
- tests/read-only-private.ts: append-only UUID file RPC under the explicit private control directory,
  actions setup/audit/teardown/semantic, exact five-field binding and six-field primary principal.
  Missing mappings/oracles are blocked. Expired permits prevent new setup while bounded cleanup and
  audit remain possible. Counter and foreign-owner checks require actual controller evidence.
- tests/read-only-cli.ts: default --plan has no file/token/network/controller IO; --execute-B requires
  generation/expiry/rate/private/contract/manifest/sources. A fresh permit is checked before private
  reads, paths remain within that explicit private directory, and the control source signature is
  verified against the configured AS keys before any controller request. Use Bun --no-env-file.
- tests/read-only-authorize.ts: separately opted-in normal DCR/PKCE/consent/token source preparation.
  It selects only primary740001 from the fresh synthetic fixture; no personal grant/cache is read.
  Current B preparation actually created four new isolated grants, refreshed one normally and precisely
  revoked another through Root's control. Positive read uses the refreshed source; refresh-old uses
  its rotated predecessor. Tokens remain private; Trading receives a metadata-only binding receipt.
  Empty-scope JWT is not issued by AS; missing normal-flow roles are never represented as issued.
- tests/read-only-sign-faults.ts: Root separately authorized controlled JWT fault fixtures for this
  B run. The script confirms the exact test AS profile key, original source signature and current
  JWKS kid/modulus/exponent, reads the key without modifying it and changes only exp/aud/scope
  independently; bad-signature changes only the signature. These four fixtures are explicitly
  normalASIssued:false, not normal consent/issuance. No AS/JWKS/Redis/Java/human state is changed.
- tests/read-only-bridge.ts: explicitly adapts the backend's persisted catalog into the client's
  datasets mapping and decodes canonical BSON numeric wrappers. Unsafe long integers are rejected;
  decimal/ID strings remain exact. Actual private schema parsing and supportsCase114/114 passed,
  with zero protocol/controller IO. The earlier parse failure and premature coordination success
  message were corrected; the original canonical-format failure is not counted as live evidence.
- tests/read-only-offline.config.ts:56 checks passed (44 runner/classifier and12 client/contract checks).
  These include all34 production public tool-error codes, especially trading_service_unavailable,
  plus actual SDK classes with synthetic fetch for cancel/reconnect/two overlapping calls. The
  schema.parse-to-RPC regression preserves binding.uid. No test uses live AS/Trading or a filesystem
  controller; these56 are separate from the actual isolated OAuth/key-fixture preparation above.
  Unsupported ledger mapping also rejects extra debug fields or additional content instead of
  bypassing the public-error boundary. Private per-case before/observation/after/semantic files are
  retained by opted-in live runs; public reports contain only safe outcomes and measured metrics.

The plan has114 descriptors, including three transport actions; the provider gap remains unsupported.
Strict source TypeScript, scoped Oxfmt/Oxlint and git diff --check passed. The shared frozen MCP3004
bundle was not rebuilt, restarted or substituted. Later compatible environment-selection changes were
verified using a separate ignored build and three clean Node smoke processes; no running service's
bundle/profile was replaced. HANDOFF.md separates those engineering checks from actual B evidence.
