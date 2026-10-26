# Compatible Codex environment selection

2026-10-26 actual-client update: codex-cli 0.164.0-alpha.11.1 is currently
BLOCKED_CLIENT_LAN_HTTP_OAUTH_DISCOVERY. Root's no-credential probe fetched LAN HTTP protected
metadata, but neither LAN-resource/LAN-AS nor LAN-resource/loopback-AS made an AS metadata
request or produced an authorize URL. Both resource and AS loopback reached the authorize URL
stage and were intentionally ended by synthetic access_denied, not a successful login. Across
the three probes there were seven fixture GETs, zero POST/token/code/grant/model/business calls;
all temporary fixtures were closed. This records the tested build, not an internal implementation
claim or a guarantee for other clients. Server/helper URL opt-in and passing fixture tests do not
mean that handing this Markdown to the current Codex makes direct LAN OAuth work.

Root evidence is work/test-http-20261026/client-probe/result.json and RESULT.md in the Root
coordination checkout; status, exact public metadata and cleanup evidence are retained there.
OpenAI Docs describes Streamable HTTP OAuth support separately from this version-specific
transport observation: https://learn.chatgpt.com/docs/extend/mcp?surface=cli.

Direct LAN values below remain server capabilities and unverified options for clients that
support them. Root is preparing a separate test-only loopback SSH-forwarding variant, not
executing it: the client-visible canonical MCP resource, AS issuer and authorize/token endpoints
must all be exact loopback URLs, genuinely published and validated by that test instance from
the start. Forwarding an existing LAN-advertising service, rewriting metadata/token strings or
only changing AS to loopback is insufficient. Preserve issuer/audience checks and review local/
remote port occupancy, service binding, Web browser reachability and CORS before any execution.
No new domain is required by this plan; no forwarding or deployment has been performed here.

The current shared phase is installation, OAuth and the user's Agent binding only. WRITE stays
false. Real Trading deployment/connection, account reads and trades are outside this phase;
the general read-verification instructions remain for separately authorized future acceptance.

INSTALL_LOCAL_PLUGIN_WITH_CODEX.md is the self-contained user handoff. It embeds
the complete Node source selector and the original callback helper. No author
checkout, Bun or sibling file is needed. This delivery generates source only;
it does not install, deploy, log in, migrate credentials or contact production.

The initial environment proposal imposed new deployment gates. The human clarified
that later integrations should preserve earlier defaults/configuration instead of
adding broad restrictions. Those gates have been withdrawn; see
DEPLOYMENT_COMPATIBILITY_REVIEW.md for each original-to-current difference.

The effective chain is explicit arguments, then existing public connection settings,
then known local defaults: MCP http://127.0.0.1:3004/mcp, AS issuer
http://127.0.0.1:26825, Web http://127.0.0.1:3000. Environment defaults to an existing
label or local; local/test/prod remain supported selections, and legacy labels such
as dev-pro are not rejected. NODE_ENV does not reinterpret the deployment.

The client selection label does not set the MCP service's TQX_ENV. Use the final
effective MCP URL confirmed by the service owner; a server mode does not by itself
change endpoints, enable tools or change PAPER/LIVE. Client authentication follows
the existing normal flow without profile edits or credential migration prerequisites.

test/prod without supplied deployment addresses retain the existing/default values.
Output displays the label and every effective URL; a prod label pointing to local
defaults is not claimed to be a production connection. Unknown remote values are
override placeholders, not invented URLs or new startup requirements.

Backend configuration is not a Codex user requirement. Local Trading SDK base is
http://127.0.0.1:8102, OAuth API audience is http://127.0.0.1:8102/api, and Web generic
API uses Java18080. These are different concepts and are not sent to the helper or
used as interchangeable HTTP bases.

The selector no longer rejects deployment URLs based on environment, HTTP/HTTPS,
loopback or path shape. Authentication and service validation remain owned by the
existing client/service. The callback helper still applies its earlier
issuer/state/nonce/PKCE checks when that optional presentation path is used;
its capability limitations are not a new application deployment policy.

For the explicitly authorized LAN HTTP test setup, the service and optional callback helper
must each run with their existing effective TQX_ENV=test selection. TQX_TEST_HTTP_ORIGINS is
a comma-separated exact-origin allowlist; it permits only canonical literal RFC1918 IPv4 HTTP
origins. The helper needs the selected MCP, AS and Web origins, for example
http://192.168.1.3:3002,http://192.168.1.3:26823,http://192.168.1.3:3001. These are planned
test values, not a running deployment. Empty lists retain the old behavior. Wrong ports,
unlisted hosts, DNS/public/link-local addresses, alternate IP spellings, URL parts and wildcard
entries fail. In every other effective profile the variable is ignored and the original
HTTPS/explicit-127.0.0.1 rules remain. A selector --environment test label alone does not set
TQX_ENV for a service or the helper. No TLS-termination flag or forwarded header is fabricated.

The callback listener and original CLI callback remain on ephemeral loopback; exact service
issuer/resource, Origin, state, nonce and PKCE checks still apply. target.ts, READY and the
existing synthetic/live acceptance runners remain restricted to their original owned loopback
fixtures. They are not a LAN deployment runner and must not be used to assert LAN client access.
The helper's injected env is used consistently for its initial and proxy URL checks; its child
inherits the same selected process environment. No private profile or authorization is changed.

2026-10-26 helper evidence: 23 new boundary cases were added. The initial callback run was
32 passing / five failing out of 37; after the opt-in and env propagation fixes plus three port boundaries all 40 pass.
The eight deployment-selector checks and nine isolated standalone distribution checks pass,
as do strict integration TypeScript, scoped formatting/lint and Node helper syntax. See
evidence/test-http-helper-20261026.json. The distribution bundle and the single Markdown's
embedded helper are identical; the shared profile/allowlist policy is bundled without a checkout
dependency. All network checks were mocked or owned loopback; no LAN OAuth/client deployment
acceptance, production access or broker connectivity is claimed.

Existing server/plugin/marketplace/version can be preserved through a public
configuration JSON or explicit flags. New-source names have a stable environment/
endpoint hash suggestion, not a mandatory credential slot. deployment-binding.json
is advisory public metadata; its absence or differences do not block old clients.
Original local0.2.0/tqx and other normal aliases are not automatically renamed or
upgraded. The selector reads no private profile/token/keychain and never edits them.

```text
node packages/mcp-server/integrations/codex/deployment-environment.mjs --plan
node packages/mcp-server/integrations/codex/deployment-environment.mjs --environment test --plan
node packages/mcp-server/integrations/codex/deployment-environment.mjs --config <PUBLIC_CONNECTION_JSON> --environment prod --mcp-url <OPTIONAL_EXPLICIT_URL> --plan
```

Omit unused override flags entirely. --config is an explicitly chosen public
configuration file, not a private authentication file. For source generation replace
--plan with --output-dir <SOURCE>. Relative paths and existing directories work;
matching source is reused, conflicting files remain intact and a separate child
source is returned. No new absolute-path/exclusive-directory deployment rule is
introduced. The output event's actual source path is authoritative.

Portable manifests still include their required schema discriminators and the
normal bare MCP type/url. These reflect the installed loader's demonstrated package
contract, not a new environment policy. Original OAuth consent, scope, issuer,
token expiry, one native transaction and actual CLI completion are unchanged.

Eight focused offline checks cover defaults, partial overrides, legacy configuration
and aliases, advisory comparison, non-destructive idempotent generation and exact
MD-code/template correspondence. Actual Node plan/generation checks use only local
files and inert URL strings. Both MD code blocks match source bytes and pass syntax
checks. See evidence/deployment-environments-20261025.json for hashes and limits.

Larger changes to existing behavior, connection URLs or credential handling are not
implemented here; describe the current behavior, proposed change and impact for the
human before introducing them. This follows the user's explicit instruction. Owner
coordinates final acceptance/commit/push. No actual test/prod account, consent or
broker connectivity is claimed by these offline checks.
