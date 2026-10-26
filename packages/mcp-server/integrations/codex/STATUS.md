# Codex client acceptance status

2026-10-26 shared MCP HTTP is ready on remote loopback3002, with tools/WRITE false;
actual JWT client and the user's Agent consent remain Root follow-up. The optional callback
helper now supports explicit --scopes with strict trade:read/order:write validation/deduplication,
and checks the CLI authorize URL against that same selection before begin. The current binding
phase explicitly uses --scopes trade:read. Omitted scopes retain the historical two-scope default
only for compatibility. This helper change does not modify/redeploy the server or start a login.

2026-10-26 Root client probe: BLOCKED_CLIENT_LAN_HTTP_OAUTH_DISCOVERY on
codex-cli 0.164.0-alpha.11.1. Both LAN-resource/LAN-AS and LAN-resource/loopback-AS stopped after
resource metadata, before any AS metadata request. All-loopback produced an authorize URL but
ended in synthetic access_denied, not a login. Probe totals: seven fixture GETs; zero POST,
code/token/grant/model/business calls; temporary fixtures closed. Evidence lives in Root's
work/test-http-20261026/client-probe/result.json and RESULT.md. Server/helper test-URL acceptance
does not establish direct LAN OAuth support. See DEPLOYMENT_ENVIRONMENTS.md for the separate
loopback-only SSH-forwarding plan, not executed. Shared acceptance currently stops at installation,
OAuth and the user's Agent binding; WRITE false, no real Trading connection or business calls.

2026-10-26 test HTTP helper update: effective TQX_ENV=test plus a strict
TQX_TEST_HTTP_ORIGINS list permits only the selected RFC1918 HTTP service origins.
Non-test validation, exact issuer/resource/Origin and ephemeral loopback callbacks
remain unchanged. The helper bundle and embedded Markdown are synchronized; see
DEPLOYMENT_ENVIRONMENTS.md and evidence/test-http-helper-20261026.json for isolated
regressions and limits. Those helper tests remain isolated; the later Root probe above blocks
current CLI direct LAN OAuth, and actual shared host/browser/client acceptance is not complete;
no personal authorization, installed connection or running service was changed.

2026-10-25 external distribution preparation:9 MD-extracted cold/mock checks and4
actual native-CLI packaging steps pass in independent temporary homes, alongside8
environment compatibility checks. Repeated source generation now ignores only
binding provenance when deciding reuse. An allowlisted six-file kit/ZIP is prepared;
see DISTRIBUTION_ACCEPTANCE.md and evidence/distribution-cold-start-20261025.json.
No personal profile/login, main grant, public deployment or real broker was changed.
Windows paths were exercised; Linux/macOS execution and final human UX remain unverified.

2026-10-25 environment compatibility revision: this round's newly added deployment
gates were withdrawn on the human's clarification. local/test/prod and legacy labels
use explicit inputs > existing public configuration > known local defaults; output
displays effective URLs and sources. Missing remote inputs, HTTP/loopback, existing
aliases/versions or absent new binding files no longer impose selector gates.
Original callback/auth validation remains unchanged. Eight compatibility checks
and Node-only source/plan checks pass; MD embeds exact helper/selector and matching
templates. No profile, credentials, installation, login, production contact or
service changed. See DEPLOYMENT_COMPATIBILITY_REVIEW.md and
evidence/deployment-environments-20261025.json. Owner owns final commit/push.

Layer C host follow-up: Owner's installed fixture was not discovered in two chats;
CLI showed version local and no fixture server, audit zero. Missing portable
$schema discriminators in generated plugin.json/mcp.json were corrected in source
and generator under the same ID/URL. Static regression passes. Owner's supported
same-ID refresh now reports version 0.1.0 and mcp get finds the enabled original-URL
server, confirming CLI-loader recovery. Owner independently verified actual model
calls C1=10/C2=14 against the intermediate 24-call audit snapshot. Final independent
review now passes all 28 semantic cases: 34 calls plus four cross-session READs,
all 38 matching tool/argument hashes against the fixture audit. No writes or other
servers were used. Four client requests overlapped for 39ms; server processing peak
was not measured. This is public synthetic model-layer C, not a broker/layer B result.
Owner removed the unique plugin/marketplace; owned PID67260 and port52527 are closed,
with the 38-call audit saved before stop. See
evidence/public-read-loader-20261025.json. No cache/profile or app restart by this line.

2026-10-25 layer C preparation: PUBLIC_READ_FIXTURE.md and read-fixture*.ts provide
a public synthetic read-only fixture without touching the actual human connection.
Current createProtocolServer/SDK are reused without core edits; seven exact read
tools, 28 matrix entries and boundary checks pass in 33 focused tests. The Owner
authorized its independent 7200-second listener and unique local plugin source;
installation and actual model session evidence belong to the Owner's next step.
See evidence/public-read-preparation-20261025.json. No DB/shared controller, human
credential access, helper/MD or main plugin change occurred in this preparation.

2026-10-25 callback handoff: INSTALL_LOCAL_PLUGIN_WITH_CODEX.md now embeds the
complete standalone Node callback-login.mjs plus unchanged frozen plugin JSON.
Public --no-browser/stdin keeps native CLI PKCE/exchange/storage; only native
exit 0 permits a 303 to the original bound consent transaction. Node approve,
deny and repeated login in the same already-authenticated isolated home passed,
as did 17 boundary tests, scoped lint, strict TypeScript and Node syntax checks.
See evidence/callback-stdin-20261025.json. No credential contents were read.
Owner separately verified the human local-plugin OAuth and two actual read tools;
preserve that personal grant. Final human same-window UX is pending Owner's one
new helper session after the Web build switch. This line does not start it.

2026-10-25 preparation: installed CLI/app-server is now 0.164.0-alpha.11.1.
The installed experimental JSON schema confirms oauth/login, loginId completion,
tool calls and scoped inventory parameters. New v2 CLI/app-server execution is
default-off and requires a fresh schema-v2 READY and isolated private HOME;
see V2_RUNNER.md. The actual app-server v2 run now passed 45/45, with 64 protected
write HTTP attempts and 41 correlated fake-broker submission effects. The first
zero-write scope-error parsing failure is retained; the fixed parser passed the
same inputs without key replacement. CLI 45 also passed with fresh nonoverlapping
inputs after the natural quota window, adding 64 HTTP attempts/41 effects. A new
HOME actual-client refresh passed (old signed source still unexpired/401, new
source/200); after Owner-controlled exact-grant revocation, both signed sources
were independently verified still unexpired and returned MCP 401. See
evidence/v2-app-server-20261025.json, evidence/v2-cli-20261025.json and
evidence/v2-refresh-revocation-20261025.json. All owned clients exited and this
line stopped online requests before the Owner's Redis recovery window.
The 2026-10-23 versions and evidence below remain historical v1 observations.

Migration note (2026-10-23): this directory now lives under
`tqx-ts/packages/mcp-server/integrations/codex`. Historical evidence below is
unchanged and has not been rerun after migration or the checkpoint's v2 WIP.
Run harness commands from `packages/mcp-server` after the Owner's root install
and SDK/package builds. Private files remain package-local under ignored
`work/codex`; no old runtime data or credentials were copied. The old project's
`.codex/config.toml` was excluded; examples remain opt-in and do not connect the
new workspace automatically. Root/global Codex configuration is unchanged.

Updated 2026-10-23. File boundary: only integrations/codex/**. Runtime, tests,
root configuration and dependency files remain with the MCP owner.

Installed Windows desktop package: 26.1016.8622.0. Bundled CLI/app-server:
0.163.0-alpha.11.2. This is the installed client binary, not a generic MCP SDK
client. App-server results do not constitute desktop UI acceptance.

## Actual AS client acceptance passed

Owner environment was handed over READY on 127.0.0.1 ports 26823 (AS), 8100
(Trading), 3002 (MCP with tools). All health/metadata checks pass and metadata
advertises RFC9207. After the AS owner's complete compatibility batch (166
isolated tests), the installed Codex default automatic DCR flow passed without
public pre-registration. Deny/approve callbacks used dynamic loopback ports
58858/58864 with /callback, unique exact iss, PKCE and explicit trade:read.
Tool discovery and both calls reached actual MCP/SDK/Trading. See
evidence/owner-auto-dcr.json. Web decisions use synthetic identities/fake broker;
Java login and browser/desktop interaction are not covered.

The complete DCR field set is application_type ("native"), client_name ("Codex"),
grant_types (["authorization_code", "refresh_token"]), redirect_uris ([the actual
dynamic loopback /callback]), response_types (["code"]), scope ("trade:read"),
token_endpoint_auth_method ("none"). No fields are omitted from this list. Types
and safe values are in evidence/client-refresh-request.json. The AS owner fixed
strict optional metadata compatibility and registered scope ceilings. No AS code
changed in this line.

The installed client's refresh request has exactly client_id, grant_type,
refresh_token, resource, scope, with no Authorization header. Resource is the
exact MCP resource and scope is trade:read. Actual installed-client refresh now
passes. Only its independent home's expires_at was forced to 1. A control read
proved the derived token usable before refresh; afterward old source and derived
tokens were 401, new sid/jti/refresh rotated, grant/uid/Agent/client stayed equal,
and both read tools continued. The single new synthetic grant was then revoked
with an identity-guarded one-key mutation. MCP health remained 200 and current
source access became 401. Client tool-isError is recorded separately without
inventing its underlying reason. See evidence/owner-refresh-revocation.json.

Run owner-environment.ts against the READY Owner fixture to reproduce auto DCR.
It uses the actual Codex PKCE flow, not the Owner's already-issued OAuth tokens.
Only the explicitly synthetic Web fixture authorizes/denies the new transactions.
No service process is started, stopped or seeded by this runner.

The supported pre-registered public-client path has now passed against those
actual services: owner-environment.ts --provided-public-client. Codex chose
http://127.0.0.1:64846/callback for denial and :64851/callback for approval.
AS callback iss, Codex completion, tool discovery and both tool calls passed.
This uses an RFC8252 loopback registration matching the actual stable callback,
not a fabricated incompatible redirect. See evidence/owner-public-client.json.
Automatic DCR and pre-registration have independent successful evidence.

## Client-only evidence

- Built Node MCP health, protected-resource discovery and unauthenticated 401 pass.
- Actual Codex app-server DCR, public pre-registration, dynamic loopback callbacks,
  tools/list, getAccount and listPositions pass against isolated synthetic AS/Trading.
- CIMD automatic client-ID selection is observed in stable and callback-specific
  modes. The synthetic AS does not fetch/validate the remote CIMD document; this
  is not a real AS CIMD acceptance claim.
- Denial, wrong state, missing iss and wrong iss reject before code exchange.
- Duplicate identical iss is accepted by this Codex binary and triggers one token
  exchange. compatibility.ts deliberately returns exit code 1 for this mismatch.
  This is an observed client behavior, not a claimed exploit or a server defect.
- Actual Codex CLI --no-browser PKCE login passes in a separate CODEX_HOME.
- Portable plugin installs into a separate CODEX_HOME and its MCP is discovered
  and called through the installed app-server when login explicitly requests
  trade:read. The current runtime rejects the documented portable MCP
  extensions["com.openai"].auth object with unknown field extensions (expects url
  or headers). The package therefore uses bare portable mcp.json discovery.
- Unscoped plugin login requests AS-advertised scopes beyond trade:read. Keep
  the direct config (explicit scopes) as the primary acceptance path until the
  plugin scope behavior is resolved. Do not label automatic plugin onboarding
  production ready.
- Tool results are JSON text today, with no structuredContent/outputSchema or
  server-wide instructions. Account mode, as_of, is_stale, decimals and nulls are
  preserved. Proposals belong to the existing MCP runtime owner.

## Next handoff

AS26823/Trading8100/MCP3002 remain managed by the Owner; this line does not own or
stop those services and has finished the bounded client runs. Our fixtures use ephemeral
loopback ports and clean up only their own children. No global Codex config,
installed plugins, login state, remote, commit or deployment has changed.

The MCP owner has merged the proposed project-scoped .codex/config.toml after
Owner review. It explicitly limits scopes/tools; no global configuration changed.

Remaining: Java login, browser consent, real identity/account and desktop UI/model selection.
Official iframe documentation alone does not prove desktop custom-card support.
