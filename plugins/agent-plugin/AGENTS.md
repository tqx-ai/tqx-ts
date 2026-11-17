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

Support autonomous trading within the authority delegated by the user, including
unattended execution. Do not add per-call human approval requirements through
client extensions as part of compatibility work. Client-managed authorization
and any user-configured limits still apply.

The plugin must remain useful when loaded from a user's own compatible client.
Do not describe internal repository workflows, development-only utilities, or
TQX staff operations as user capabilities.

## Implementation Language

Use English for implementation code: identifiers, comments, internal diagnostics,
configuration fields, schema fields, test names, and developer-facing messages.
Non-English text is allowed only for explicitly user-facing product copy or
existing localization resources. Keep product copy separate from code semantics.

## Research Record

Research date: 2026-11-17 (Asia/Shanghai).

The following sources were reviewed and cross-checked:

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

## Client Compatibility Research

Reviewed on 2026-11-17 (Asia/Shanghai). The findings below describe documented
package formats and extension contracts, not completed installation or OAuth
tests in every client. Recheck the linked sources before changing a client
extension; a compatible package format does not guarantee identical runtime,
authentication, Python execution, or marketplace behavior.

### Reviewed client sources

- [GitHub Copilot plugins](https://docs.github.com/api/article/body?pathname=/en/copilot/concepts/customizations/plugins)
- [GitHub Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
- [Antigravity plugins](https://antigravity.google/docs/plugins.md)
- [Antigravity plugin authoring](https://antigravity.google/docs/build-plugins.md)
- [Antigravity manifest schema](https://antigravity.google/schemas/v1/plugin.json)
- [Hermes portable Agent Plugins packages](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins#portable-agent-plugins-v1-packages)
- [NanoClaw agent templates](https://raw.githubusercontent.com/nanocoai/nanoclaw/refs/heads/main/docs/templates.md)
- [OpenClaw plugin bundles](https://docs.openclaw.ai/plugins/bundles.md)
- [OpenClaw activation metadata](https://docs.openclaw.ai/plugins/manifest/capabilities#activation)
- [VS Code agent plugins](https://code.visualstudio.com/docs/agent-customization/agent-plugins.md)
- [VS Code plugin authoring reference](https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference.md)
- [OpenHands Agent Plugins packages](https://docs.openhands.dev/overview/agent-plugins.md)
- [Kiro powers](https://kiro.dev/docs/powers.md)
- [Kiro power authoring](https://kiro.dev/docs/powers/create.md)
- [Grok Bot skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations.md)
- [Perplexity custom plugins](https://www.perplexity.ai/help-center/en/articles/2026100802-create-or-upload-a-custom-plugin.md)
- [Cursor plugins](https://cursor.com/docs/plugins)
- [OpenAI plugin authoring](https://developers.openai.com/plugins/build/plugins)
- [OpenAI submission metadata](https://developers.openai.com/plugins/deploy/submission)
- [Claude plugin quickstart](https://claude.com/docs/plugins/quickstart.md)
- [Claude plugin structure and testing](https://claude.com/docs/plugins/build.md)
- [Claude plugin pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist.md)
- [Claude Code manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference)

### Namespace and package decisions

| Client              | Documented portable extension                                    | Decision for this package                                                          |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| OpenAI              | `com.openai`                                                     | Keep existing presentation metadata and `onboardingSkill`.                         |
| GitHub Copilot      | `com.github.copilot`                                             | Shared skills and MCP suffice; no client-only components to configure.             |
| VS Code / Copilot   | `com.github.copilot`                                             | Reuse Copilot's namespace; do not invent `com.microsoft.vscode`.                   |
| Antigravity         | No named Agent Plugins extension contract in the reviewed guides | Record the native-format mismatch; do not invent `com.google.antigravity`.         |
| Hermes              | `com.nousresearch.hermes`                                        | Omit optional trust overrides; retain client-managed authorization.                |
| NanoClaw            | `ai.nanoco.nanoclaw`                                             | Set `agentName` to `TQX`.                                                          |
| OpenClaw            | `ai.openclaw`                                                    | Declare tool activation with `onStartup: false`.                                   |
| OpenHands           | `dev.openhands`                                                  | Shared skills and MCP suffice; no entry command or native components to configure. |
| Kiro                | No client namespace specified in the reviewed guides             | Use standard metadata, activation keywords, skills, and MCP.                       |
| Grok Bot            | No plugin manifest or namespace specified in the supplied guide  | Record skills/routines only; package compatibility remains unestablished.          |
| Perplexity Computer | No client namespace specified in the reviewed guide              | Import the standard skills and HTTPS MCP connector.                                |
| Cursor              | No client namespace specified in the reviewed guide              | Keep the Agent Plugins package; do not invent `com.cursor`.                        |
| Claude              | No Agent Plugins extension namespace in the reviewed references  | Generate a separate native distribution; do not invent `com.anthropic`.            |

Absence of a namespace in a reviewed guide is not a reserved or implemented
namespace. Do not add empty extension objects as compatibility badges. A
documented namespace also does not require a manifest member when its optional
features are unused. Client-specific directories are needed only when this
package ships files owned by that namespace.

### GitHub Copilot and VS Code

The [Copilot concept guide](https://docs.github.com/en/copilot/concepts/customizations/plugins)
and [CLI reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference#agent-plugins-10-manifest-fields)
use root `plugin.json`, `skills/`, and `mcp.json` for Agent Plugins. Native
agents, commands, rules, hooks, and LSP configuration belong in
`com.github.copilot/`. Legacy component path fields must not be copied into our
closed root manifest.

The [VS Code authoring reference](https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference)
uses the same namespace. Its optional `automations.paths` setting lives in
`extensions["com.github.copilot"]`; paths are relative to the namespace directory.
TQX does not ship automation templates, so omit this setting. Installation,
enablement, enterprise policy, and the selected harness remain separate checks.

### Antigravity

The [usage guide](https://antigravity.google/docs/plugins.md) and
[authoring guide](https://antigravity.google/docs/build-plugins.md) describe a
native manifest targeting `https://antigravity.google/schemas/v1/plugin.json`.
Its `displayName`, `logo`, and `suggestedPrompts` are native fields, not portable
root fields. No owned extension namespace or translation of our `com.openai`
metadata is documented there.

The authoring guide explicitly says Antigravity ignores `mcp.json` and loads
`mcp_config.json`. A `.antigravity-plugin/plugin.json` overrides the root
manifest in that client. Therefore, our existing package must not be advertised
as providing its MCP connection in Antigravity without an adapter and live
verification. If a native distribution is needed, build it separately from the
canonical package; do not replace our schema or relocate its MCP configuration.
Validate that artifact with `agy plugin validate`; evaluate the documented
multi-tool warnings separately from errors. Root contributor `AGENTS.md` is not
an Antigravity plugin rule.

### Hermes

The [portable-package adapter](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins#portable-agent-plugins-v1-packages)
supports skills and `stdio` / `streamable-http` MCP; legacy `sse` is skipped.
Installation and enablement are separate. The adapter is an explicitly limited
subset, not a blanket claim of full conformance.

TQX omits the optional `com.nousresearch.hermes` extension because it needs no
Hermes-specific overrides. In particular, do not set `servers.tqx.trust` to
`untrusted` as a compatibility default: that policy requires confirmation for
tools without `readOnlyHint: true` and can block unattended trading. Users
delegate trading authority through their client and account authorization;
the package must not add a per-call approval requirement. Omitting the override
does not guarantee that a client's own policies permit unattended execution.
TQX order, activity-control, and bug-report writes must retain accurate MCP
annotations.

Optional server `timeout`, `costs`, `spend_limit`, and `cost_unit` settings exist,
but TQX declares none without a measured timeout need or a real billing contract.
For newer extension keys, check Hermes compatibility and the catalog's
`requires_hermes` floor rather than inventing a portable root field.

### NanoClaw

[NanoClaw templates](https://raw.githubusercontent.com/nanocoai/nanoclaw/refs/heads/main/docs/templates.md)
use the portable package and `ai.nanoco.nanoclaw` for display names, personas,
context, and scheduled tasks. TQX sets only `agentName: "TQX"` so a stamped group
has the product name. Optional files belong in `ai.nanoco.nanoclaw/context/`
and `ai.nanoco.nanoclaw/tasks/`; none are shipped now.

Stamping requires a local template directory; a registry fetch is a separate
operation. Native secrets belong in the credentials proxy. NanoClaw supports
`stdio` and `streamable-http`, skips `sse`, and rejects symlinks. Declared tasks
would start paused. Provider, model, and effort choices are user configuration,
not template metadata. Loading the template does not prove TQX OAuth works
through the installed gateway.

### OpenClaw

[OpenClaw bundles](https://docs.openclaw.ai/plugins/bundles.md) load the portable
skills and MCP configuration. Their `ai.openclaw` extension currently accepts
only `activation`; do not copy native plugin fields such as `configSchema` into
it. TQX sets `activation.onStartup: false` and
`activation.onCapabilities: ["tool"]` using the documented
[activation contract](https://docs.openclaw.ai/plugins/manifest/capabilities#activation).
This supplies activation metadata, not permission to trade or a guarantee of
successful tool execution.

OpenClaw also reads the existing
`extensions["com.openai"].interface.defaultPrompt` as recommended prompts, so do
not duplicate them in another manifest. Native or client-specific format
markers can take precedence over root `plugin.json`; do not add Codex, Cursor,
or Claude compatibility manifests casually. Keep the portable transport spelling
`streamable-http`, not the different OpenClaw-native configuration shape.

### OpenHands

[OpenHands Agent Plugins support](https://docs.openhands.dev/overview/agent-plugins.md)
ships in `openhands-sdk` 1.49.2 and later. A root manifest selects the portable
format before native compatibility manifests. The adapter loads skills and
`stdio` / `streamable-http` MCP and skips `sse`.

Native commands, agents, and hooks live under `dev.openhands/`. An optional
`extensions["dev.openhands"].entry_command` names a real packaged command. TQX
does not ship one, so omit that object rather than point it at a skill or create
an empty placeholder. Keep `tqx-setup` as a portable skill; onboarding metadata
in `com.openai` is not an OpenHands entry-command declaration.

### Kiro

[Powers](https://kiro.dev/docs/powers.md) and the
[authoring guide](https://kiro.dev/docs/powers/create.md) recommend Agent Plugins
for new powers. Kiro uses standard `keywords` for contextual activation and
documents `version`, `description`, `author`, and keywords as authoring
requirements. TQX already supplies them. No additional reverse-domain extension
is defined in these guides.

Do not migrate this package to legacy `POWER.md` or copy Kiro-specific variable
handling into portable MCP configuration. Keyword activation does not complete
OAuth or install the local Python data package.

### Grok Bot

The supplied [skills and routines guide](https://docs.x.ai/grok-bot/skills-routines-and-automations.md)
describes saving and publishing skills and configuring scheduled or event-driven
routines. It does not define `plugin.json`, an Agent Plugins loader, or a client
extension namespace. Do not infer `com.xai`, `ai.xai`, or `com.grok` from a product
name. Record plugin-package support as unestablished from this source. Do not
turn its routine examples into installed background trading actions.

### Perplexity Computer

[Custom plugins](https://www.perplexity.ai/help-center/en/articles/2026100802-create-or-upload-a-custom-plugin.md)
can be uploaded as ZIP packages or imported from a public GitHub repository,
including a plugin subfolder. Root `plugin.json` takes precedence over Claude
and Codex compatibility manifests. At least one skill or connector is required;
the documented limits are 32 skills, 1,000 files, 20 MB uncompressed, and 15
MCP servers. A supplied description is limited to 1,024 UTF-8 bytes.

TQX's explicitly typed HTTPS MCP entry has no fixed headers or unresolved
variables, matching the documented connector import shape. Perplexity skips
local `stdio` servers, fixed-header servers, and disallowed connectors. Users
still connect their own account. The guide defines no namespace for additional
metadata; do not invent `ai.perplexity` or claim the local Python data workflow
was verified by successful connector import.

### Cursor and OpenAI

[Cursor](https://cursor.com/docs/plugins) documents portable Agent Plugins
alongside its native `.cursor-plugin/plugin.json` layout, without a `com.cursor`
contract in the reviewed page. Keep the portable format while it covers TQX's
skills and MCP requirements.

[OpenAI](https://developers.openai.com/plugins/build/plugins) defines
`com.openai` presentation fields and `onboardingSkill`. Preserve the existing
configuration, including the support, privacy, and terms URLs, when adding other
clients. Those fields do not automatically configure every client; cross-client
reuse must be explicitly documented, as with OpenClaw's recommended prompts.

### Claude, Cowork, and Claude Code

The [quickstart](https://claude.com/docs/plugins/quickstart.md),
[structure guide](https://claude.com/docs/plugins/build.md), and
[manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference)
describe a native package format. They do not define an Agent Plugins extension
namespace or establish that Claude reads our portable root manifest. Do not add
`com.anthropic`, `com.claude`, or native fields to standard `plugin.json`.

| Component                      | Agent Plugins 1.0.0       | Documented Claude native format              |
| ------------------------------ | ------------------------- | -------------------------------------------- |
| Manifest                       | Root `plugin.json`        | `.claude-plugin/plugin.json`                 |
| Skills                         | `skills/<name>/SKILL.md`  | Same layout; reuse the skill sources         |
| MCP configuration              | Root `mcp.json`           | Root `.mcp.json`                             |
| Streamable HTTP transport type | `streamable-http`         | `http`                                       |
| Presentation metadata          | Vendor-owned `extensions` | Native manifest fields such as `displayName` |

The generated native artifact references the same TQX MCP endpoint as
`mcpServers.tqx` with `type: "http"` and `url: "https://www.tqx.ai/mcp"`.
Changing filenames and the configuration type spelling does not require a new
MCP service. Preserve the portable files and schema identifiers; generate a
separate native distribution rather than adding `.claude-plugin/` and
`.mcp.json` to this canonical package. Other clients' format precedence rules
make mixed manifests consequential.

The native distribution generator copies `name`, `version`, `description`, `author`,
`homepage`, `repository`, `license`, and `keywords` from the standard manifest.
Map existing `com.openai.interface` values explicitly:

| Existing field        | Claude native manifest field                                  |
| --------------------- | ------------------------------------------------------------- |
| `displayName` (`TQX`) | `displayName`                                                 |
| `logo`                | `icon`, pointing to an image copied inside the native package |
| `supportURL`          | `supportUrl`                                                  |
| `privacyPolicyURL`    | `privacyPolicyUrl`                                            |
| `termsOfServiceURL`   | `termsOfServiceUrl`                                           |

These native metadata keys are case-sensitive. Claude Code ignores `icon` and
the directory listing URL fields at runtime. No equivalent to our brand colors,
recommended prompts, or `onboardingSkill` is established by these references;
keep `tqx-setup` as a reusable skill rather than inventing mappings.

Skills load across Claude chat, Cowork, and Claude Code. Remote MCP entries
appear as connectors that users connect in chat and Cowork; Claude Code loads
them with the plugin. Agents, hooks, and local server execution have different
surface support. Test TQX OAuth and the Python data workflow on each intended
surface instead of inferring them from skill discovery. Do not add per-call
trading approval or alter client permissions as part of the packaging adapter.

The [submission checklist](https://claude.com/docs/plugins/pre-submission-checklist.md)
separates local syntax/schema validation from portal checks and a later security
scan. A native directory submission needs a README of at least 40 words outside
code blocks, explaining use and data handling, and either a `license` field or
a `LICENSE` file. All referenced files must be packaged; no secrets, symlinks,
system files, or paths outside the package. Additional size, launcher, script,
and credential-handling checks can block submission or require review. Check
them against the generated artifact, including its Python setup instructions;
do not treat `claude plugin validate` as directory approval.

The canonical source keeps its portable layout and provides a shared product
README. The native distribution is generated separately; it does not rely on
Claude Code's manifestless discovery or the directory's skills-only exception.

Run these commands from the workspace root:

```bash
bun run plugin:claude:build
bun run plugin:claude:check
```

The builder in `scripts/build-claude-plugin.ts` uses
`scripts/lib/claude-plugin.ts` to produce `dist/claude-plugin/` and
`dist/claude-plugin.zip`. It copies skill files, their supporting resources,
the shared README, the selected logo, and the workspace license. Source files
are never rewritten; only the native manifest and MCP configuration are
transformed. Local hidden files, caches, and system files are excluded, and
symbolic links are rejected. ZIP entries have fixed timestamps so identical
sources produce identical archives. Generated output stays ignored by Git.

`bun run build` generates the distribution. `bun run pack:check` verifies that
both the directory and ZIP match their current sources, including resource
contents and file lists. The focused tests in
`scripts/test/claude-plugin.test.ts` run with the workspace unit suite. The
release workflow stages a versioned `tqx-agent-plugin-claude-v<version>.zip`
alongside the npm and standalone CLI artifacts.

Load the generated directory with `claude --plugin-dir ./dist/claude-plugin`,
or upload its ZIP through Claude's plugin interface. Run
`claude plugin validate --strict ./dist/claude-plugin` against the generated
artifact before distribution. Native validation does not establish live OAuth,
trading, Python execution, or directory eligibility; surface tests and portal
checks remain separate. Do not commit a second maintained copy of the skills,
version, or native metadata.

On the review date, the generated artifact passed strict native validation with
the official Claude Code CLI 2.1.326. The validator discovered the `tqx` HTTP
server and all three skills. Live OAuth, trading, and portal submission were
not performed.

### Extension maintenance rules

- Add a client namespace only for a documented key with a concrete product use.
  Keep an exact source link and review date here; do not guess reverse-domain
  spelling, copy another vendor's schema, or use an empty object as proof of
  support.
- Preserve root `plugin.json`, `skills/`, `mcp.json`, their canonical 1.0.0 schema
  identifiers, and the declared `tqx` server name. Do not put native presentation,
  component paths, permissions, credentials, or transport aliases at portable
  top level.
- Keep client-only files under their exact documented namespace. A native-format
  adapter that cannot follow that layout belongs in a separate distribution.
- Keep namespaces independent: removing a vendor extension must leave portable
  skills and MCP discovery intact. Validate each extension's types and referenced
  server or file names separately because the core schema only checks that its
  value is an object.
- Do not add automatic trading, schedules, hooks, or native commands merely to
  populate a namespace. A runtime, auth, or marketplace limitation must be
  recorded as such instead of disguised as a manifest field.

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
