# V2 client runner

Updated 2026-10-25. The human user reopened local/test execution. Only isolated
PAPER/fake-broker fixtures are authorized. Production, real funds, deployment,
destructive cleanup and unrelated data mutation remain excluded. No commit or
push is authorized. This line owns integrations/codex/** only.

## Default and memory modes

From the tqx-ts workspace root:

```powershell
bun --no-env-file packages/mcp-server/integrations/codex/v2-run.ts --plan
bun --no-env-file packages/mcp-server/integrations/codex/v2-run.ts --memory
bun x vitest run --config packages/mcp-server/integrations/codex/offline.config.ts
```

The default is plan-only. --memory runs the 45-case manifest with signed fixture
tokens, Map state and an in-memory receipt recorder; no listener, network, client
process or persistent state is created. Its evidence says actualCodex:false,
clientKind:in-process-protocol,persistence:false,externalNetwork:false. It does
not prove AS/MCP/SDK/Trading, actual OAuth, account access or a real client passed.
Historical v1 evidence is unchanged and cannot count as a v2 run.

## Live prerequisites and explicit opt-in

The Owner must first verify actual AS/MCP/Trading configuration, test stores,
health and synthetic identity/account/fake-broker binding. Old READY files are
rejected. [v2-ready.example.json](v2-ready.example.json) is a non-ready template:

- schemaVersion:2, contract:tqx-mcp-v2, ready:true only after verification;
- generation: a safe current run ID beginning with a letter or digit;
- issuedAt: ISO timestamp issued within 30 minutes, not more than 5 seconds ahead;
- expiresAt: in the future, no more than two hours after issuedAt;
- fixtureNamespace:tqx_v2_YYYYMMDD_RANDOM, matching the issuedAt UTC date;
- synthetic:true, mode:PAPER, broker:fake;
- exact issuer/mcpResource/apiResource matching the independently selected target;
  canonical HTTP loopback, explicit ports, no credentials/query/fragment;
- redis:{host:127.0.0.1,port:OWNER_PORT,db:0..15,prefix:NAMESPACE:};
- mongo:{database:NAMESPACE}; Owner separately verifies the test Mongo endpoint
  and dedicated SQL database; this client neither connects to nor restricts Mongo
  to loopback, and never receives database connection secrets;
- scopes:[trade:read,order:write], tools:all eleven contract names;
- fixtureData and controlDir: relative paths whose real paths remain inside the
  READY private directory. The marker lives in an ignored work directory.

READY contains no credential. fixtures.json has synthetic:true,mode:PAPER,
broker:fake,generation,fixtureNamespace,users:[{uid,agentId,webAccessToken}],inputs
and optional expectedErrors. Tokens remain only in private ignored files. The
Owner should verify git check-ignore for private paths before handing them over.
The current Owner run-contract.json binds the selected generation, namespace,
SQL database, endpoints and private file paths; it is not itself a READY marker.

```powershell
$env:TQX_CODEX_PROFILE = 'v2'
$env:TQX_CODEX_SCOPES = 'trade:read order:write'
$env:TQX_CODEX_ISSUER = 'http://127.0.0.1:26825'
$env:TQX_CODEX_MCP_RESOURCE = 'http://127.0.0.1:3004/mcp'
$env:TQX_CODEX_API_RESOURCE = 'http://127.0.0.1:8102/api'
$env:TQX_CODEX_LIVE = 'isolated-test'
$env:TQX_CODEX_GENERATION = '<independently supplied Owner generation>'
$env:TQX_CODEX_NAMESPACE = '<independently supplied Owner namespace>'
$env:TQX_CODEX_READY = '<private fresh schema-v2 Owner READY file>'
$env:TQX_CODEX_DRIVER = 'app-server'
bun --no-env-file packages/mcp-server/integrations/codex/v2-run.ts --run --allow-synthetic-writes
# Separate actual CLI login; tools are then called by app-server in that same home.
$env:TQX_CODEX_DRIVER = 'cli'
bun --no-env-file packages/mcp-server/integrations/codex/v2-run.ts --run --allow-synthetic-writes
```

Missing opt-in, generation/namespace mismatch or expired/malformed READY blocks
before network access. A live permit is issued only by the validated factory;
env alone or a forged permit cannot launch Codex. Legacy v1 harness entry points
remain closed; they cannot bypass this contract. Fixture preflight failures stop
execution. The Owner services are never started/stopped/seeded by this runner.

Each invocation creates a fresh ignored integrations/codex/work/live/<generation>
run directory; each case creates a separate HOME/config and OAuth grant. HOME,
USERPROFILE, CODEX_HOME, APPDATA, LOCALAPPDATA, TMP and TEMP point into that home.
Children inherit only basic executable/system paths, never user OpenAI/API auth,
user proxy or Codex configuration. No auth.json is copied and no model inference
is called. Analytics is disabled. Only owned child processes are stopped and exit
is awaited; other processes/data are untouched. Credentials and selected receipt
IDs remain private; raw client logs, OAuth URLs, tokens and internal errors are
not printed. Expired READY stops new operations without preventing owned cleanup.

## Actual-client behavior and evidence

The installed version observed on 2026-10-25 is 0.164.0-alpha.11.1. Its experimental
schema was generated under ignored work/capability-20261025, confirming
mcpServer/oauth/login (clientRegistration/scopes/timeoutSecs), loginId completion,
mcpServerStatus/list and mcpServer/tool/call. CLI help confirms --no-browser,
--scopes and --oauth-client-registration. This is capability inspection, not an
OAuth acceptance pass. Official source pages consulted:

- https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- https://developers.openai.com/plugins/build/auth
- https://learn.chatgpt.com/docs/app-server

Both drivers use actual automatic client registration and PKCE. The AS decision
API is called using the declared test Web identity; this is not browser consent.
The callback has exactly one matching issuer/state/code and the registered
loopback host/path. No token is substituted for actual client login. The stored
client token is verified against AS JWKS for exact issuer/audience/scopes and
uid/Agent before obtaining the case principal. Different roles use different
homes/grants. Never normalize the issuer or relax callback validation.

Inventory must be exactly 7/4/11 by scope with matching readOnlyHint. Client
configuration does not prefilter enabled_tools: discovery must expose the actual
server result. Opposite-scope calls use both the host and a direct protected MCP
probe with its actual acquired token; 401, outage and internal errors do not count
as scope-denial passes. Decimal strings/nulls and actual mode/freshness/state are
observed without numeric conversion. accepted and signal state are not final
fills, cancellations or modifications. cash_flows_unsupported is accepted only if
fixtures.expectedErrors explicitly declares it for that case; never replace 501
with a successful empty ledger.

## Matrix and fixture inputs

v2Matrix() is the executable 45-case manifest: seven reads, four writes, eleven
opposite-scope denials, four missing-key calls, replay/conflict/UNKNOWN replay for
three single-write tools, invalid batches (empty/>20/duplicate/invalid-later),
exactly 20 sequential items and item-2 failure/uncertainty/revocation/session
expiry/quota. The plan output is machine-readable and contains every input key.

fixtures.inputs[inputKey] is an array of argument objects. Ordinary cases have
one call; replay/unknownReplay/conflict have two calls sharing one stable key.
Replay arguments are identical, conflict arguments differ. Input keys containing
dots are literal dictionary keys. All selected inputs must exist before any
session starts. over20 uses 21 otherwise-valid distinct keys. Price and quantity
remain strings. getOrder/getSignal/modify/cancel refer to real prepared test
objects; an order alone does not prove a same-ID signal exists. Every arm prepares
fresh case-specific objects/state; do not reset unknown operations or reuse a
cancelled fixture order. The runner never creates replacement idempotency keys.

## File arm/snapshot control

[v2-control.example.json](v2-control.example.json) contains complete machine-readable
arm request/response and snapshot request/response templates. Control schema stays
version 1, independent from READY schema 2. The Owner watches *.request.json and
atomically writes matching *.response.json. Client requests are written with
exclusive temporary creation then atomic rename. The bounded wait is 15 seconds.
Requests contain id,generation,action,caseId,tool,inputKey,scenario and the exact
verified principal:{uid,agentId,grantId,sessionId,sourceJti,clientId}. No bearer,
refresh token, verifier, code or service secret enters control IPC. The Owner
must verify the principal belongs to this namespace and authoritative records.
Responses echo schemaVersion/id/generation/caseId/principal and have
ok:true,synthetic:true,mode:PAPER,broker:fake. snapshot adds audit:

- generation/caseId/synthetic/mode/broker exactly match; settled:true means bounded
  observation is complete; maxConcurrent counts fake backend commands and is <=1;
- attempts includes EVERY protected write HTTP request including retries/denials,
  in arrival order. index is logical input index, transportIndex is the preserved
  strictly increasing raw HTTP ordinal (may skip read requests), request_id is
  the actual HTTP request ID. Read HTTP rows may be retained in separate raw
  evidence; attempts/effects are empty for read/invalid/scope-denied cases;
- effects has unique id,index,idempotencyKey plus original backendKey,request_id,
  correlation:operation_request_id. Backend signal/action keys are not assumed
  equal to Idempotency-Key. The operation request ID must uniquely match one real
  attempt with the same index/header key; guessed/missing mappings cannot pass.

The SDK permits three TOTAL transport attempts per logical item; explicit two-call
replay cases can each use this budget. No MCP retry is added. Fault injection
must target the actual second input key, never the second HTTP request: a retry
of item 1 cannot trigger item-2 injection. Failed items blocked before transport
can have zero HTTP rows; never manufacture a row to meet item counts.

UNKNOWN permits zero/one effect and stops later batch items. Pending/unknown
409/503 stays unknown. Conflict may be failed but does not disprove historical
effects or authorize a new key. fail_at_2 is definite pre-effect failure;
uncertain_at_2 can lose the response after an effect. revoke_before_2 sets
audit.grantRevoked:true; expire_before_2 sets audit.sessionExpired:true based on
authoritative session expiry (not an invented change to signed JWT exp);
quota_at_2 denies before effect 2. No later index may be submitted after failed
or unknown. Unavailable arm is blocked; actual client/result/audit failure after
valid READY is failed, with submission:unknown if a call was dispatched. Stop at
that case. No automatic resubmission or fresh-key retry occurs.

## Verification boundary

Preparation: focused offline tests, strict TypeScript, formatting and linting are
run in this directory. The 45 model cases remain separate from actual client
execution. A completed run must retain driver/version, namespace/generation,
all case outcomes, actual HTTP attempts and correlated effects. The 2026-10-25
installed app-server run passed all 45 cases after fresh Owner READY, with 64
protected-write HTTP attempts and 41 correlated fake-broker submission effects.
The initial seven-read/zero-write parsing failure remains recorded separately.
The separate CLI driver also passed all 45 cases with another 64 HTTP attempts
and 41 effects after Owner's atomic fresh input rotation and a natural new
quota minute. Never run both drivers concurrently or reuse earlier driver
keys/orders/signals. Retain RESERVED/UNKNOWN and accepted operations. The public
snapshots are evidence/v2-app-server-20261025.json and evidence/v2-cli-20261025.json. Model/HTTP-source
results cannot stand in for the installed client, Java login, browser consent,
desktop UI, model-selected tools, real account authorization or broker connectivity.
Genuine JWT elapsed-time expiry needs separate evidence from authoritative
session-expiry injection. Historical v1 evidence is not rerun.

## Separate read-only actual-client refresh and revocation

After both driver rounds finish, wait for a natural new quota minute. Keep the
same live opt-in, namespace, generation and fresh READY, but select only
TQX_CODEX_SCOPES=trade:read:

```powershell
bun --no-env-file packages/mcp-server/integrations/codex/v2-refresh.ts --refresh
# Owner verifies the returned source.private.json and revokes exactly its grant.
bun --no-env-file packages/mcp-server/integrations/codex/v2-refresh.ts --verify-revoked '<returned private refresh-state.private.json>'
```

--refresh creates a new HOME and actual DCR grant, verifies a read, closes its
client, changes only that home's .credentials.json expires_at cache to 1, then
restarts its app-server and reads. It never changes a signed token or AS/Java
state. It verifies access/refresh token and sid/jti rotation, unchanged
grant/uid/Agent/client, old signed source still unexpired but rejected with 401,
and new source read 200. It emits only ignored private file paths, never tokens.
The 2026-10-25 refresh phase passed. The Owner performs the precise grant control
using the private source file; no Redis or database credentials enter this client.
Only after the Owner confirms that control, --verify-revoked independently checks
both signed sources are still unexpired and protected getAccount rejects both.
That independent revocation verification passed on 2026-10-25 with both signed
sources still unexpired and both MCP responses 401. See
evidence/v2-refresh-revocation-20261025.json. All owned clients exited; this line
then stopped online requests for the Owner's isolated Redis recovery window.
