# READ B executed results (2026-10-25)

Latest unique-case outcomes:114 total,113 passed,1 unsupported,0 failed/blocked/not-run. This is
official MCP SDK protocol evidence against the isolated AS/MCP/Trading applications, with synthetic
primary identity and PAPER history/fake broker. It is not actual desktop or real broker acceptance.

| Run                               | Passed | Failed | Blocked | Unsupported | MCP tool POSTs | Trading READ attempts |
| --------------------------------- | ------ | ------ | ------- | ----------- | -------------- | --------------------- |
| Separate baseline preflight       | 1      | 0      | 0       | 0           | 1              | 1                     |
| Original114-case matrix, retained | 107    | 4      | 2       | 1           | 109            | 78                    |
| Six targeted repairs, retained    | 6      | 0      | 0       | 0           | 6              | 10                    |
| Actual attempts across all runs   | -      | -      | -       | -           | 116            | 89                    |

All114 original cases and six targeted cases have actual private before/observation/after records.
Every audit was settled and integrity-valid; Trading write/effect deltas and business-digest changes
were zero. Clients closed and selectors were torn down. Extra preflight and targeted attempts are
not counted as additional unique cases.

The original failures remain in their report. Two market-filter cases exposed B history fields named
priceCurrency that the native provider parser did not consume; Trading added a B-only projection
from that persisted field to originalCurrency. No FX, production SDK guess, DB rewrite or golden
currency change was introduced. Two error expectations were stale: a declared503 preserves
trading_service_unavailable, and the API-declared timeout fixture preserves trading_timeout. Production
error behavior was correct; only the test expectations changed. This timeout fixture is not evidence
of a separately induced native transport deadline.

Two encoded-ID cases initially lacked proof and were blocked. The targeted run compared the public
SDK's inert local URL projection with actual per-case append-only ASGI method/origin/raw_path/query/
status evidence. Both were exactly one same-target GET with the encoded ID, no query and403; this
establishes the observed refusal without HTTP3xx following. The local projection alone is not live
evidence. The runtime did not record Location-header presence; no absence claim is made.

Actual transport observations: cancellation waited for a started Trading read, aborted its request
and settled; reconnect closed and initialized two clients; parallel-two sent two calls with peak
inflight2. All three passed. Positive READs used a normally refreshed AS token; its rotated predecessor
and a separately precisely revoked new grant were refused. Expired/audience/scope single-claim
signed fixtures and signature corruption are explicitly controlled JWT faults, not normal AS-issued
tokens. The test profile key was read-only and matched current JWKS; no personal740002 grant/cache
was changed.

The sole unsupported feature is the real provider cash ledger501. A declared isolated historical
ledger passed fixture-only semantics and does not establish provider availability. No production
network, deployment, real broker, funds or trading write tool was used.

Root outputs contain mcp-read-b-20261025.json and the matching Markdown summary, with per-tool and
per-case redacted outcomes. Private raw records are retained separately. AS has no public revoke
endpoint. Root separately authorized its existing internal revokeGrant service function for exact
cleanup: all four new B principal/session/client/JTI receipts and the isolated Redis profile were
checked before mutation; three active grants were retired, one already revoked was skipped, and all
four reread revoked with non-status grant fields unchanged. Public cleanup evidence is separate in
mcp-read-b-grant-retirement-20261025.json. This is not HTTP revocation acceptance. No new endpoint,
ad-hoc HSET, personal grant/cache change, audit/business deletion or Trading call was used.
