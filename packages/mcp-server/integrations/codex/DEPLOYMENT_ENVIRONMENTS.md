# Compatible Codex environment selection

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
existing client/service. The unchanged callback helper still applies its earlier
URL/issuer/state/nonce/PKCE checks when that optional presentation path is used;
its capability limitations are not a new application deployment policy.

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
