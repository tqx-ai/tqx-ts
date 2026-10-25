# MCP test-container packaging

This directory contains only the Dockerfile, this explanation and verify-package.mjs. It packages
the existing frozen74965d5 MCP runtime plus its source-inlined SDK, without changing application
defaults, authorization or validation. The checkout may have a later documentation-only HEAD;
manifest.json records both versions and a source inventory. This is not a shared-service deployment.

## Exact artifact boundary

The assembler accepts an explicitly selected frozen build directory. It verifies its recorded hashes
and copies only bundle/index.mjs, bundle/schema.mjs and the referenced protocol-*.mjs chunk. The SDK
is already in that chunk. It copies the installed production dependency closure using exact versions
and regular runtime JS/JSON/WASM/license files, preserving nested version conflicts. No npm install,
dependency lifecycle script or package upgrade runs. manifest.json enumerates every output path,
byte count, SHA256 and package version; audit rejects unexpected files or symlinks.

Excluded: source maps, original launchers/build helpers, local paths/profiles, keys/PEM, run-contract,
local OAuth/auth caches, credentials, exchange.secret, all .env files, tests/examples, product sources,
SDK/CLI workspace links and unrelated repository files. Third-party runtime JS under a package's
src directory (for example debug/src/index.js) is retained when part of its runtime distribution;
project TypeScript source and source maps are not copied. The assembler can also scan against an
explicit private secret file entirely in memory; neither its path nor value is put in the artifact.
Embedded key blocks, literal JWTs, local runtime paths and forbidden filenames fail the test-artifact
scan. These checks constrain this upload only; they add no application deployment policy.

From packages/mcp-server, using Node and a new ignored work directory:

```powershell
node deploy/test/verify-package.mjs --assemble --frozen-dir <frozen-build-directory> --output <new-work-context> --secret-file <private-secret-file>
node <new-work-context>/verify-package.mjs --audit
node <new-work-context>/verify-package.mjs --probe
```

The generated upload-files.list is OUTSIDE the context and is the exact archive input list. Use that
list, not the repository or frozen build directory, when creating an archive. Hash and audit it before
transferring to the already confirmed test host. Do not upload this checkout, private profiles or
personal SSH/OAuth material. Existing SSH configuration may be used without copying its key.

## Isolated test-host check

Panda_1_3 is the confirmed test host. Use only a new unique directory/tag. Inspect its already cached
node:22-alpine image ID first and record it; --pull=false plus a Dockerfile with no RUN avoids an
installer/network step. The Dockerfile consumes only the audited context and performs no registry
login/push, CI action, public port binding or existing-service replacement.

```sh
docker build --pull=false --network=none -t tqx-mcp-test:<unique-tag> <audited-context>
docker run --rm --pull=never --network=none tqx-mcp-test:<unique-tag> node verify-package.mjs --probe
```

The probe audits the copied files, checks compiled schema through official in-memory transports,
then starts only its own tool-disabled Node child on an internal temporary loopback port. It verifies
health/metadata200, no-token401 and orderly shutdown. It uses no real key, token, grant, exchange,
Trading/broker request, host mount or production/shared endpoint. Synthetic schema context is local
memory only; the helper never calls a tool. Network-none/container health is packaging evidence,
not shared OAuth pairing or actual Codex acceptance.

The image embeds no environment-specific configuration or secret. Actual paired issuer/resource/API
URLs and TLS/reverse-proxy details remain runtime inputs selected by Root/user; they are currently
unknown for the shared service. Existing application defaults still apply when no overrides are
supplied. A localhost address used by this isolated probe does not mean shared test is ready.
Keep the running local MCP75848 and existing shared containers untouched. Do not commit or push
from this line; Root coordinates review, any later rollout and final source-control actions.
