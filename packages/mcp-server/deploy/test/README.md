# MCP test-container packaging

This directory contains only the Dockerfile, this explanation and verify-package.mjs. It packages
an explicitly selected fresh frozen MCP runtime plus its source-inlined SDK, without changing
application defaults, authorization or validation. manifest.json records the runtime commit,
packaging HEAD and complete MCP/SDK source inventory. Older74965d5/8407d20 artifacts are historical;
they are not substitutes for the current source-bound candidate. This is not a shared deployment.

## Exact artifact boundary

The assembler accepts an explicitly selected frozen build directory. It verifies its recorded hashes
and copies only bundle/index.mjs, bundle/schema.mjs and the referenced protocol-*.mjs chunk. The SDK
is already in that chunk. It copies the installed production dependency closure using exact versions
and regular runtime JS/JSON/WASM/license files, preserving nested version conflicts. No npm install,
dependency lifecycle script or package upgrade runs. manifest.json enumerates every output path,
byte count, SHA256 and package version; audit rejects unexpected files or symlinks. One frozen
tool-disabled loopback test runner is copied as bundle/isolated-built.smoke.mjs, separately
allowlisted and included in the source inventory; other project tests remain excluded.

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
docker run --rm --pull=never --network=none --tmpfs /app/work:rw,uid=1000,gid=1000,mode=0700 tqx-mcp-test:<unique-tag> node bundle/isolated-built.smoke.mjs --bundle bundle/index.mjs
docker run --rm --pull=never --network=none --tmpfs /app/work:rw,uid=1000,gid=1000,mode=0700 tqx-mcp-test:<unique-tag> node bundle/isolated-built.smoke.mjs --bundle bundle/index.mjs --test-http
```

The probe audits the copied files, checks compiled schema through official in-memory transports,
then starts only its own tool-disabled Node child on an internal temporary loopback port. It verifies
health/metadata200, no-token401 and orderly shutdown. It uses no real key, token, grant, exchange,
Trading/broker request, host mount or production/shared endpoint. Synthetic schema context is local
memory only; the helper never calls a tool. Network-none/container health is packaging evidence,
not shared OAuth pairing or actual Codex acceptance.

The two built-smoke lanes run as the image's node user with an explicit clean child environment.
Their /app/work tmpfs belongs only to the container, not a host bind mount. Neither publishes a
host port. Original mode checks health/metadata200, no-token401, forbidden Origin403 and shutdown0;
test-http additionally checks the advertised LAN identity and wrong Host port403, while all real
sockets remain ephemeral container loopback. These are not actual LAN requests. Do not add a fake
TLS-termination flag or rewrite issuer/resource metadata to make a client appear compatible.

2026-10-26 source-bound candidate: runtime43c8a7dcd657b5f90e12278049ab57d9c7100be6,
tree d394773dbef714b51019b9f75a17f3e16b3d9986. A fresh SDK-source alias/alwaysBundle build
used empty build-default API URLs and kept sourcemaps local for source proof. The uploaded context
contains1458 regular files,94 exact dependency instances (92 versions), and a41-file source
inventory (38 MCP/SDK source files, two package manifests and the single smoke runner). Three Linux
amd64/Node22.23.2 lanes passed in a newly built image:
tqx-mcp-test:linux-43c8a7dc-20261026t042210z-bc85b1,
image sha256:6cac9b0f9474f975597f24d171de9b97efc096c1fc9b304e5bd0a8e3ab421cbb.
The image manifest SHA matches the audited local/remote context. Detailed inventories, source/map
proof, archive/image IDs, raw Linux logs and reproduction commands live under the ignored
work/linux-43c8a7dc-20261026T042210Z directory. All owned test containers exited and were removed;
the unique candidate image/context are retained for Root review. No previous image was removed.

This candidate is preparation for installation/OAuth/user Agent binding only, with WRITE false.
No AS exchange, account/business tool, database or broker was used. Shared profile, SSH forwarding,
human authorization and deployment have not been executed. The current Codex CLI direct LAN HTTP
OAuth discovery limitation remains; see integrations/codex/DEPLOYMENT_ENVIRONMENTS.md. Passing
container HTTP tests neither clears that client limitation nor establishes shared-service readiness.

The image embeds no environment-specific configuration or secret. Paired issuer/resource/API
URLs remain runtime inputs. Root's preparation records both the direct-LAN and exact-loopback
forwarded test plans; neither is a running shared-service configuration yet. Existing defaults apply
when overrides are absent. A localhost address used by this probe does not mean shared test is ready.
Keep the existing local MCP main and shared containers untouched. Do not commit or push
from this line; Root coordinates review, any later rollout and final source-control actions.
