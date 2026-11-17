# TQX Agent Plugin Guide

## Scope

This directory contains the TQX plugin implemented in accordance with the
Agent Plugins protocol and specification:

- [Agent Plugins specification repository](https://github.com/agentplugins/agent-plugins-spec)
- [Agent Plugins official website](https://agent-plugins.org/)

All development and modifications in this directory MUST comply with the rules
defined by that protocol and specification. When local preferences conflict with
the Agent Plugins contract, the protocol takes precedence. The constraints below
are implementation guidance for this plugin and must not weaken the normative
requirements of the standard.

## Product Intent

`tqx-agent-plugin` is for people using compatible Agent clients, not an internal
developer assistant for the TQX team. It should help users invest in the future,
discover promising assets, and make better-informed investment and trading
decisions through the capabilities explicitly exposed by the plugin.

The plugin must remain useful when loaded from a user's own compatible client.
Do not describe internal repository workflows, development-only utilities, or
TQX staff operations as user capabilities. Product descriptions must not promise
returns or turn the plugin into personalized financial advice; expose evidence,
constraints, and uncertainty through the actual skills and tools.

## Implementation Language

Use English for implementation code: identifiers, comments, internal diagnostics,
configuration fields, schema fields, test names, and developer-facing messages.
Non-English text is allowed only for explicitly user-facing product copy or
existing localization resources. Keep product copy separate from code semantics.

## Research Record

研究日期：2026-11-17（Asia/Shanghai）。

已阅读并交叉核对以下资料：

- [Agent Plugins overview](https://agent-plugins.org/.md)
- [Agent Plugins Specification v1.0.0](https://agent-plugins.org/specification)
- [Build an Agent Plugin](https://agent-plugins.org/plugin-authors/build-an-agent-plugin)
- [Plugin manifest](https://agent-plugins.org/plugin-authors/manifest)
- [Skills](https://agent-plugins.org/plugin-authors/skills)
- [MCP servers](https://agent-plugins.org/plugin-authors/mcp-servers)
- [Client extensions](https://agent-plugins.org/plugin-authors/client-extensions)
- [Loading and discovery](https://agent-plugins.org/client-implementers/loading-and-discovery)
- [MCP runtime](https://agent-plugins.org/client-implementers/mcp-runtime)
- [Client conformance checklist](https://agent-plugins.org/client-implementers/conformance)
- [Agent Plugins plugin schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
- [Agent Plugins MCP schema 1.0.0](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)
- [Compatible Agent clients](https://agent-plugins.org/compatible-clients.md)
- [Agent Skills specification](https://agentskills.io/specification)
- [MCP specification](https://modelcontextprotocol.io/specification)

## Normative Findings

### Package boundary and manifest

- Agent Plugins v1.0.0 is a directory package with exactly one portable root
  manifest at `plugin.json`.
- `plugin.json` is loaded and validated before component discovery. It must be a
  JSON object with the canonical `$schema` value
  `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` and a `name`.
- Plugin names are 1-64 characters and may contain only lowercase ASCII letters,
  digits, hyphens, and periods. The name must start and end with an alphanumeric
  character and must not contain `--` or `..`.
- Portable manifest fields are closed: `$schema`, `name`, optional metadata
  (`version`, `description`, `author`, `homepage`, `repository`, `license`,
  `keywords`), and optional `extensions`.
- Unknown top-level manifest fields are reported and ignored when the rest of the
  manifest is valid. Other manifest schema violations are fatal and prevent all
  component discovery. A non-object `extensions` value is a documented
  non-fatal exception.
- Metadata is checked primarily by JSON type. Semantic Versioning, URL, email,
  and SPDX syntax are recommendations or metadata semantics, not blanket reasons
  to reject a manifest.

### Filesystem containment

- Every discovered, read, or executed package path must remain inside the
  filesystem-resolved plugin root after symlink/junction/reparse-point
  resolution.
- Plugin-relative path fields must begin with `./` and remain within the plugin
  root after resolution. A client must reject or isolate paths that escape.
- Failure handling is intentionally narrow: reject the whole plugin for a broken
  root manifest boundary, disable only a broken component type, skip only the
  affected skill or MCP entry where the specification permits it, and deny other
  escaping package paths.

### Component discovery

Agent Plugins v1 defines exactly two portable component types:

1. `skills/`: each immediate child directory containing a regular file named
   exactly `SKILL.md` is one discovered skill. Clients must not recursively scan
   descendants for more skills. Missing `skills/` is valid; an invalid skill is
   skipped without blocking sibling skills or MCP components.
2. `mcp.json`: one root JSON document describing MCP servers. Missing `mcp.json`
   is valid; a present path of the wrong filesystem kind invalidates only the MCP
   component type.

The manifest cannot relocate these component paths or embed inline component
configuration. Unsupported component types are ignored rather than treated as
plugin errors.

### Agent Skills dependency

`SKILL.md` follows the separate Agent Skills specification. Its YAML frontmatter
requires `name` and `description`; `name` is 1-64 characters, lowercase Unicode
letters/numbers plus hyphens, cannot start/end with a hyphen or contain `--`, and
must match the parent skill directory. Optional `license`, `compatibility`,
`metadata`, and experimental `allowed-tools` are available. `scripts/`,
`references/`, and `assets/` are conventional optional directories.

### MCP configuration and transports

- `mcp.json` must contain only `$schema` and `mcpServers`, with canonical schema
  value `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`.
- Each server entry is a closed transport variant. Supported variants are:
  - `stdio`: required `type` and `command`; optional `args`, string-valued `env`,
    and `cwd`.
  - `streamable-http`: required `type` and absolute `url`; optional literal
    `headers`.
  - `sse`: legacy HTTP+SSE, optional for clients and deprecated relative to
    Streamable HTTP.
- A `stdio` command is one executable token, not a shell command. A bundled
  executable uses a plugin-relative `./...` command. The default `cwd` is the
  plugin root.
- Explicit `cwd` must be plugin-relative (`./...`), rooted at `${PLUGIN_ROOT}`,
  or rooted at `${PLUGIN_DATA}`, and must remain within the corresponding root.
- Remote URLs must be absolute HTTP(S) URLs without userinfo or fragments.
  Non-loopback endpoints must use HTTPS. Configured headers are visible package
  data and must not contain credentials or secrets.
- The declared `type` selects the initial transport; Agent Plugins does not define
  automatic fallback after a failed connection. A client may continue loading
  other servers and components when one server is invalid, unsupported, or fails
  to start, authenticate, connect, or complete the MCP handshake.
- MCP wire behavior, initialization, capability negotiation, authorization, and
  lifecycle remain governed by the MCP specification, not by Agent Plugins.

### Plugin variables and secrets

- Stdio clients must provide `PLUGIN_ROOT` (the resolved plugin root) and
  `PLUGIN_DATA` (a dedicated writable persistent data directory).
- `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` expansion is single-pass and applies only
  to `args`, `env` values, and `cwd`. It does not apply to `command`, environment
  keys, fixed component locations, URLs, or HTTP headers. Unknown placeholder-like
  text remains literal.
- Configured `env` values and HTTP headers are package-visible data, not secret
  storage. A plugin must not embed credentials or secrets there, and it must not
  override the reserved `PLUGIN_ROOT` or `PLUGIN_DATA` environment names.
- Use `PLUGIN_ROOT` for bundled files and `PLUGIN_DATA` for generated files,
  caches, installed dependencies, and state that should survive plugin updates.

### Extensions and versioning

- Client-specific manifest data belongs under a reverse-domain namespace in
  `extensions`, and client-specific files belong in a matching top-level
  directory. Other clients ignore unimplemented namespaces without validating
  their contents.
- If both manifests are present, the Agent Plugins version in `plugin.json` and
  `mcp.json` must match. Canonical schema identifiers are immutable; a schema
  change requires a new specification release.
- Plugin `version` should use Semantic Versioning for update and cache decisions,
  but the package format version is declared by the canonical `$schema` value.

## Implementation Guidance for `tqx-ts`

- Keep the portable package layout at the plugin root; do not invent alternate
  manifest or component locations.
- Treat loading as a staged operation: establish and validate the root boundary,
  load `plugin.json`, discover supported components, then validate each component
  with the narrowest failure boundary.
- Prefer local validation against the supported canonical schemas. Do not fetch a
  schema during plugin loading; `$schema` selects locally supported rules.
- Preserve independent component availability. An invalid skill must not disable
  a valid MCP server, and one failed MCP entry must not disable sibling entries.
- If a loader is added to this workspace, make path resolution and containment
  checks explicit and test symlink/path traversal cases. Keep subprocess
  launching separate from manifest parsing so security decisions are auditable.
- Never treat `mcp.json` headers or configured environment values as a credential
  channel. Authentication and credential storage are client-managed.
- Keep this directory's package-specific rules here; workspace-wide TypeScript,
  Bun, formatting, testing, and release rules remain governed by the parent
  `/Users/yenche123/projects/dev/tqx-ts/AGENTS.md`.

## Verification Checklist

Before declaring Agent Plugins changes complete:

- Validate `plugin.json` and, when present, `mcp.json` against the matching local
  canonical schemas.
- Test required fields, plugin-name constraints, unknown-field handling,
  unsupported extensions, missing component locations, and wrong filesystem kinds.
- Test root containment, symlink/path traversal rejection, immediate-child skill
  discovery, and per-entry MCP failure isolation.
- Test stdio command tokenization, default and explicit `cwd`, reserved variables,
  single-pass placeholder expansion, and persistent `PLUGIN_DATA` behavior.
- Test remote URL/header validation, transport selection, and the rule that a
  failed server does not block unrelated components.
- Run the workspace's required formatter and checks after editing Markdown or
  implementation files.
