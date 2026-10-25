# External installation-guide preparation

The deliverable is an onboarding guide kit, not a public plugin submission or an
already-hosted MCP service. INSTALL_LOCAL_PLUGIN_WITH_CODEX.md remains self-contained:
two full Node programs plus portable templates. distribution-package.ts also creates
an allowlisted six-file folder with the MD, both convenience MJS copies, START_HERE,
a blank public-config worksheet and checksums. No personal configuration, fixture
binary, test evidence, credential, repository source or node_modules is packaged.

This round preserves compatible defaults and original authentication checks. A new
external user with no existing connection first supplies the real service address
or confirms their own same-host service. The guide no longer lets that onboarding
case silently install the author's loopback example as the user's remote target.
The selector's existing default chain remains available; no new service startup,
HTTPS/environment or authentication-slot policy is introduced.

## Verified behavior

Nine cold tests execute only code extracted from the actual single MD in an unrelated
temporary directory, with a separate HOME and without repo/module dependencies:

| Surface                | Observed result                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Node cold run          | local/test/prod plans display actual effective values; no service is contacted                               |
| Paths                  | Actual Windows relative paths, spaces, ampersand and non-ASCII directory; argument-array native child launch |
| Existing configuration | Original public config bytes, alias and0.2.0 preserved; no profile/token access                              |
| Repeat                 | Feeding the generated binding back through --config reuses the original source                               |
| Upgrade                | New version source is separate; old source and unrelated files preserved                                     |
| Bad public JSON        | Fixed bounded error; correction and retry succeeds without reset                                             |
| Permission wait        | Mock helper remains alive; no completion before one synthetic callback                                       |
| Denial/failure         | No success redirect; native-mock nonzero result is retained                                                  |
| Unsupported CLI        | No consent transaction or silent fallback started                                                            |
| Unanswered consent     | Bounded10-second fixture timeout; owned helper/mock children close                                           |

The callback portion uses a compiled mock Codex and owned random loopback AS. It
does not establish real OAuth PKCE/exchange/storage, consent, account access or broker
connectivity. It supplements the prior actual-client evidence; it does not replace it.
Linux/macOS execution was not performed. Their native path/runtime behavior remains
unverified; do not describe Windows execution as three-OS acceptance.

The cold repeat test exposed a source-generation bug: provenance switched from
explicit/default to existing-public-config on replay and was compared as if the
package changed. The selector now compares objects semantically and ignores only
valueSources in the public binding for source reuse. Effective connection values,
version and other package fields still distinguish a changed source. No credentials
or authentication behavior changed.

Separately, the installed native Codex CLI0.164.0-alpha.11.1 passed four steps in a
dedicated private HOME with file-only MCP credential storage: actual local-marketplace
install/MCP load, repeated install/source reuse, supported same-ID source upgrade to
0.3.1, and removal of only that temporary plugin/marketplace. Old0.3.0 source and an
unrelated disabled MCP configuration survived. No OAuth login or real tool call was
performed. The public verifier is distribution-native-check.mjs; it always creates
its own temporary HOME and uses an owned ephemeral local no-auth target.

Eight existing environment compatibility checks also pass. Strict integration types,
scoped lint and format checks pass. The unchanged helper bytes retain the original
nonce/state/issuer, native client completion and separate actual-read success rules.

## Reproduce locally

From the workspace root, without loading any env profile:

```text
bun --no-env-file x vitest run --config packages/mcp-server/integrations/codex/distribution.config.ts
bun --no-env-file x vitest run --config packages/mcp-server/integrations/codex/deployment-environment.config.ts
node packages/mcp-server/integrations/codex/distribution-native-check.mjs <ACTUAL_NATIVE_CODEX_BINARY>
bun --no-env-file packages/mcp-server/integrations/codex/distribution-package.ts <EXPLICIT_KIT_OUTPUT_DIRECTORY>
```

The test mock executable is built inside ignored work; it is not distributed. The
native verifier uses only the supported public CLI in its own isolated HOME. Its
upgrade changes only that private fixture registration, not the user's installed
plugins. Do not repurpose it to the main profile or a real service.

The prepared folder/ZIP and evidence paths are recorded in
evidence/distribution-cold-start-20261025.json. Inspect the archive allowlist and
CHECKSUMS.json after every rebuild. The ZIP is a guide kit; public plugin-directory
submission uses a different archive contract and has not been attempted.

## Actual remaining dependencies

- An installed supported Codex client and Node runtime for these standalone programs.
- The provider's reachable MCP URL and matching normal OAuth metadata/service.
- A trusted Web consent origin when using the branded callback helper; otherwise
  retain the existing supported client login path and label that UX separately.
- The human's actual Agent/account consent and subsequent real tool reads.
- A browser/execution-host callback path that is reachable in that deployment;
  remote/cloud hosts do not inherit another machine's localhost.
- Public hosting/tunnel/workspace resources if those deployment paths are requested.

No test/prod/public address, credential, tunnel ID or successful cloud connection is
invented. No real broker/production deployment, main-user grant change or fresh
human UX trial occurred in this round. Larger deployment or credential changes
remain for the user/Owner to decide under the existing authorization scope.

Official documentation was searched and opened before source conclusions:
[plugin packaging](https://developers.openai.com/plugins/build/plugins),
[MCP/OAuth](https://learn.chatgpt.com/docs/extend/mcp),
[CLI reference](https://learn.chatgpt.com/docs/cli/reference).
