# Codex first-client acceptance

Migration note (2026-10-23): this directory now lives under
`tqx-ts/packages/mcp-server/integrations/codex`. Historical evidence below is
unchanged and has not been rerun after migration or the checkpoint's v2 WIP.
Run harness commands from `packages/mcp-server` after the Owner's root install
and SDK/package builds. Private files remain package-local under ignored
`work/codex`; no old runtime data or credentials were copied. The old project's
`.codex/config.toml` was excluded; examples remain opt-in and do not connect the
new workspace automatically. Root/global Codex configuration is unchanged.

This line changes only integrations/codex/**. It does not modify src, existing
tests, root config, dependencies, global Codex config, installed user plugins or
login state. See STATUS.md for current blockers. All source is ASCII TypeScript,
ESM, strict checked by this directory's tsconfig.json.

## Evidence boundaries

| Surface / identity                                                 | Executed here                                                 | Result                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------- |
| Installed Codex app-server + synthetic AS/Trading + built Node MCP | OAuth/discovery/calls/negative cases                          | Pass except duplicate identical iss accepted |
| Installed Codex CLI, separate home                                 | PKCE DCR login with no browser                                | Pass                                         |
| Installed Codex plugin parser/app-server, separate home            | Local install, OAuth with explicit trade:read, two tool calls | Pass                                         |
| Installed Codex app-server + actual Owner AS/MCP/SDK/Trading       | Public pre-registration, deny/approve, discovery, both calls  | Pass with synthetic Web/Agent/fake broker    |
| Installed Codex + actual Owner AS, auto DCR                        | Default registration, deny/approve, PKCE, discovery and calls | Pass with synthetic Web/Agent/fake broker    |
| Installed Codex + actual Owner AS, forced local cache expiry       | Refresh, old M/T rejection, own grant revocation              | Pass; health 200 and protected 401 controls  |
| Desktop UI and model choosing tools                                | Install/login/cards/conversation                              | Not executed                                 |
| Java login / browser consent / real user / real broker             | End-to-end identity/account                                   | Not executed                                 |

Tests do not generate real OAuth consent. The Owner runner calls the AS decision
API using an explicitly synthetic Web fixture. It does not visit the browser
consent page, sign in through Java, or execute a model turn. The source fixture
file is read in place; credentials are never copied to delivery artifacts.

## Run

From the MCP package directory, with Bun and Node on PATH, after the Owner completes
the root workspace install and SDK/package builds:

```powershell
bun run check
bun x tsc --project integrations/codex/tsconfig.json --noEmit
bun integrations/codex/compatibility.ts
bun integrations/codex/cli-login.ts
bun integrations/codex/install-check.ts
bun integrations/codex/install-check.ts --probe-default-scopes
bun integrations/codex/refresh-probe.ts
bun integrations/codex/prepare-client.ts
```

compatibility.ts intentionally exits 1 when the installed Codex accepts duplicate
identical iss. The default-scope probe intentionally exits 1 when unscoped plugin
login requests scopes beyond trade:read. These findings must remain visible;
they are not failures of the repository's existing unit tests.

The tests spawn the installed codex binary and the built Node dist/index.mjs.
Set TQX_CODEX_BIN or TQX_NODE_BIN only to select a different executable. Synthetic
AS/Trading listeners bind to ephemeral 127.0.0.1 ports. Each run creates a fresh
ignored work/codex/runs directory and file-based OAuth credentials in that home.
No auth.json is copied, no API key is required and no model inference is called.
Only child processes started by the run are cleaned up. Loopback NO_PROXY is set
only for child clients; the user's proxy configuration is not changed.

For the coordinated actual services, first obtain READY from the Owner. Set
TQX_CODEX_SYNTHETIC_FIXTURES to the Owner's existing private fixtures.json path
and run:

```powershell
bun integrations/codex/owner-environment.ts
# Separately supported pre-registered public-client path:
bun integrations/codex/owner-environment.ts --provided-public-client
```

The second command registers a public client with the observed stable /callback
path and RFC8252 loopback port flexibility, then lets Codex choose the actual
listener port. It does not hard-code an incompatible callback or give the
confidential tqx_mcp_server exchange secret to Codex. These commands neither
start/stop/seed the Owner environment nor read the service secret.

refresh-probe.ts captures the actual installed client's complete registration
field set and refresh parameter names using a synthetic AS, with no token values
in evidence. refresh-revoke.ts is an opt-in runner only for a home created by
owner-environment.ts. It requires the Owner to create derived.private.json in
that home using the service's exchange credential, so this line never reads the
service secret. Run it only while the Owner confirms the coordinated environment is READY:

```powershell
bun integrations/codex/refresh-revoke.ts work/codex/runs/owner-<generated>
```

It forces only that home's local cache expiry, checks a genuine pre-refresh
Trading 200 before asserting old-token 401, and revokes only the newly created
synthetic grant after checking its uid/Agent/client/resource/scope. It inspects
the exact Owner Redis container loopback binding, then changes one hash field
with a guarded single-key Lua operation. No key scan or broad cleanup occurs.
After revocation it checks MCP health 200 and current-source 401 independently
of an opaque client error. Do not rerun on an already-revoked home or count an
expired derived fixture as refresh evidence; obtain a new fixture from the Owner.

## Distribution and actual-version differences

distribution is a local marketplace with root plugin.json and mcp.json. It is
installable through codex plugin marketplace add and codex plugin add in an
isolated CODEX_HOME; install-check.ts proves discovery and calls, not just JSON
parsing. It contains no remote publication, hooks, service secret or credentials.
The endpoint is local-only; do not submit it to the public plugin directory.

Current official packaging describes portable MCP auth under
extensions["com.openai"].auth. This installed binary rejects that field when
loading mcp.json. Therefore the package uses bare HTTP discovery and the primary
safe acceptance route is config.example.toml with explicit trade:read scopes.
The plugin test supplies that scope explicitly to mcpServer/oauth/login.
An unscoped plugin login against broad AS metadata requests broader advertised
scopes. Automatic desktop plugin onboarding is not accepted until this is solved.
Do not assume successful plugin installation proves safe OAuth onboarding.

The actual AS currently advertises DCR, not CIMD. The CIMD fixture only proves
Codex's client-ID/path selection, not real remote metadata retrieval/validation.
Stable issuer-bound callback: http://127.0.0.1:<dynamic-port>/callback.
Without issuer binding: /callback/<server-specific-id>. Captured public callback
URIs and DCR payload fields are in the sanitized evidence, with no state/code.

## Desktop handoff

The current tool catalog has plugin discovery/permission tools but no supported
project-scoped MCP installer. CLI installation only affects its isolated home;
it does not make the running desktop use that home.

The AS DCR/refresh fixes have passed actual-client tests. The Owner must still
make Java/Web test login available. The proposed project-only configuration is
desktop-project-config.example.toml. The MCP owner has merged it into the
project's .codex/config.toml after Owner review. This line did not write that
shared file or change project trust/global settings/login state.
Use this path instead of unscoped plugin onboarding for the first desktop test.

After the Owner applies the project config, the shortest manual desktop test is:

1. Restart the desktop app as documented, open this trusted project and its MCP
   settings, and connect tqx. Record the actual displayed scope and redirect URI.
2. Complete TQX's real Java login and choose an Agent owned by the test user.
   Deny once, then reconnect and approve only trade:read. The callback must have
   the expected state and exactly matching metadata issuer.
3. Ask: "Use TQX to read my account and positions. Show the account mode,
   as_of and is_stale when provided; preserve decimals and nulls. Do not trade."
4. Save sanitized screenshots of connection status and the two tool calls. Show
   no token, code, state, secret, private URL query, user identifier or account
   identifier. Record absent fields as absent; never fabricate position freshness
   or PAPER/LIVE from the account response.
5. Record custom-card support separately. No card is delivered by this MCP, and
   official ChatGPT iframe support does not establish this desktop's UI support.

Desktop UI automation is prohibited by the installed Computer Use skill:
[guidance.md](C:/Users/13518/.codex/plugins/cache/openai-bundled/computer-use/26.1016.62342/docs/guidance.md)
says: "Do not automate the ChatGPT desktop app UI or Codex CLI or Codex extensions
within Windows apps." The [Computer Use SKILL.md](C:/Users/13518/.codex/plugins/cache/openai-bundled/computer-use/26.1016.62342/skills/computer-use/SKILL.md)
requires reading this guidance. We did not
automate the desktop or authentication dialogs, and there are no desktop
screenshots claimed as evidence. This requires manual desktop actions, not a
confirmation to bypass the skill.

## Remaining cases and runtime handoff

Actual Codex refresh/old-source/old-derived/grant revocation checks now pass
against the Owner's real isolated apps with synthetic identities. Forced cache
expiry is explicitly labeled; the signed source token was not altered. Desktop
expired tx, repeated code, wrong resource/scope/Agent, browser consent and
real-account readback remain to be run. Synthetic client tests include an
interrupted in-flight exchange, client process close and reconnection using its
own isolated OAuth cache. They also cover AS/Trading failure and recovery, wrong state, denial, missing/wrong
issuer, dynamic callbacks and only two read-only tools.

Runtime-owner proposals: add concise server instructions, document PAPER/LIVE and
freshness in tool descriptions, and provide structuredContent/outputSchema when
the Trading output contract can support it. Current results are useful JSON text
and preserve decimals/nulls, but structuredContent is absent. Preserve the default
empty skeleton, request-local auth and read-only tool surface when implementing.

## Official sources checked on 2026-10-23

- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [OAuth authentication](https://developers.openai.com/plugins/build/auth)
- [Plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [MCP quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [Optional UI](https://developers.openai.com/plugins/build/chatgpt-ui)

OpenAI Docs were checked before implementation. Runtime discrepancies above are
from this exact local build and must not be erased by copying newer examples.
