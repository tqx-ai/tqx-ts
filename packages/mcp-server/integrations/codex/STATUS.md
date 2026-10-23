# Codex client acceptance status

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
