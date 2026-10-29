# Public clients and the separate MCP service

The public `tqx-ts` repository owns the TypeScript SDK, CLI and reusable agent Skills.
The hosted MCP service is maintained independently in CNB. A private package flag only
controls package publication; it does not make source files in a public Git repository private.

## What belongs here

| Component                             | Public repository responsibility                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/sdk`                        | Public API paths/types, validation, transport, API Key/Bearer client support and SDK tests        |
| `packages/cli`                        | CLI commands, installation/update, local credential handling and terminal contracts               |
| `skills`                              | User-facing Skills, references and client-side helpers; existing CLI instructions stay compatible |
| Public plugin packages                | Client manifests, Skills, public assets and connections to a verified public MCP endpoint         |
| `docs`, `INSTALL.md`, release scripts | Public install/development/package instructions and the existing SDK/CLI release process          |

The SDK does not become an OAuth authorization server or exchange private business tickets.
The public CLI keeps its existing authentication behavior. MCP-specific authorization behavior
belongs to the independent service; splitting repositories does not require changing CLI login.

## What moves with the MCP service

- MCP tool definitions, resource-server authentication, introspection/token exchange and request leases.
- Server environment examples, network/host policies, deployment files and service operations docs.
- Service-side tests, synthetic research/Trading authorities, lifecycle fixtures and actual-client runners.
- Cross-service OAuth/MCP/Trading acceptance harnesses and their opt-in/private runtime configuration.

Personal Codex configuration, OAuth grants, keys, real env files, runtime stores and generated
output are not migration source or distributable plugin contents. Existing Git histories are
preserved; this split does not rewrite or purge previous commits.

## Agent Plugins 1.0 packaging

The [Agent Plugins specification](https://agent-plugins.org/specification) defines a client package,
not a requirement to distribute the hosted service implementation. Its portable layout is:

```text
<plugin-name>/
  plugin.json
  skills/<skill-name>/SKILL.md
  mcp.json
```

The root manifest uses the canonical versioned plugin `$schema`; Skills and MCP connections are
discovered at fixed locations. `mcp.json`, when included, has its own matching versioned `$schema`
and `mcpServers`; a remote server uses `type: "streamable-http"` and a verified endpoint URL.
Do not place portable `mcpServers` or inline Skills in `plugin.json`. Client-specific data belongs
under a reverse-domain `extensions` namespace. Any host-specific package must be tested against
the current target client rather than retained for an old MCP release. See the [manifest](https://agent-plugins.org/plugin-authors/manifest) and
[MCP configuration](https://agent-plugins.org/plugin-authors/mcp-servers) documentation.

Non-loopback HTTP is not a portable Agent Plugins 1.0 endpoint. Public plugin contents must not
contain credentials, internal service tokens, private LAN endpoints or developer-machine paths.
OAuth discovery, approval and credential storage are client-managed; do not invent portable OAuth
fields in the manifest. A local development package is distinct from a public distribution.

The current Skills remain usable directly. A future public MCP plugin should be added only after
the externally reachable HTTPS endpoint is confirmed. Do not replace it with a guessed host, a
placeholder that appears deployable, or this developer's localhost address. Conformance to the
file format does not establish that every client supports or has successfully loaded the plugin.

The existing trading/research Skills describe CLI/API-key workflows. Preserve that behavior and
provide a separate MCP workflow Skill with an eventual MCP plugin; do not make an already
authorized MCP user log in to the CLI or supply another Key just to discover MCP tools.
Generated Python caches do not belong in source or plugin/Skill distribution packages.

## Dependency and release boundaries

- The public Bun workspace explicitly includes only `packages/sdk` and `packages/cli`.
- Public checks and locks must work without a private MCP checkout.
- The MCP service consumes a versioned, verified SDK artifact. It must not depend on a sibling
  checkout, an absolute local path, or an unrecorded source alias as its deployable dependency.
- The MCP service has not been released. Maintain one current implementation, configuration
  contract and installation entry; do not ship obsolete MCP protocol branches or migration shims.
- Preserve existing licenses and provenance when moving source; do not silently relicense it.
- Continue the established SDK/CLI GitHub/npm release workflow. The MCP repository's CNB build
  and deployment are configured through the team's service workflow after its target is supplied.
  This split does not publish npm packages or deploy services.
