# Memory-only MCP checks

2026-10-25 policy update: local/test service and isolated persistence fixtures are now explicitly
permitted by the user. This document describes the stricter optional memory-only lane, not a global
ban on test-environment writes. Its configuration/guards remain unchanged. For persisted integration,
use fresh Owner-provided test endpoints, ignored credentials and independent namespaces; default
both tool gates remain off. No production, live funds/broker, deployment or destructive cleanup.
The restrictions and evidence dated 2026-10-23 below apply to that historical/selected lane.

2026-10-23 (Asia/Shanghai). Today's boundary permits source/static work and process-memory
objects/Map/JOSE with temporary loopback HTTP fixtures. It excludes actual database/middleware
writes, even isolated/local Redis, Mongo or SQLite, and excludes login/refresh/revoke, seeding,
index/schema creation, broker activity and persistent runtime credentials. No cleanup/rollback
of existing data or other owners' processes is part of this entry.

## Explicit safe entry

From packages/mcp-server, use Node directly:

```sh
node ../../node_modules/vitest/vitest.mjs run --config tests/memory.config.ts --configLoader runner
```

Do not substitute bun run check/test:mcp/smoke or start the built service today. Those are different
entry points and do not install these guards. Node avoids Bun's automatic .env loading;
--configLoader runner avoids the default configuration bundler's temporary file. The configuration
sets envDir=false, results/module cache=false, coverage=false, update=false, no optimizer and one
threads worker. No test subprocess, persistent report/snapshot/credential/key output is requested.
The tests use in-memory synthetic keys, keep state in objects/Map and close their temporary servers.

The include list is exact. New files require an audit before inclusion; no skip/test-name filter
is used to hide failures. Historical 166-test results remain historical. Current dedicated results
are recorded separately below.

## Original audited 166-test inventory (2026-10-23)

| File               | Cases | Storage, process and network behavior                                                                                                                              |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| config.test.ts     | 38    | Pure explicit environment objects/URL validation. TLS filenames and outside domains are strings only; no listener, file read or fetch.                             |
| http.test.ts       | 36    | In-memory signing keys and temporary fixture HTTP. Wrong issuer/audience/Origin/Host/key URLs are negative values; all actual sockets target owned loopback ports. |
| protocol.test.ts   | 4     | Official SDK client against in-process HTTP. No Codex process, OAuth disk cache, broker or storage.                                                                |
| review.test.ts     | 4     | Owned HTTP/JWKS, abort/body-expiry tests and temporary Date spies; no filesystem/subprocess.                                                                       |
| runtime.test.ts    | 5     | Owned HTTP servers, port-conflict check and process.emit signal events. No OS child/signal dispatch, native TLS files or database.                                 |
| trading.test.ts    | 43    | Synthetic AS/Trading HTTP, in-memory credentials and keypairs. Ambient wrong.invalid SDK destination is refused before fetch. Env change is restored.              |
| trading-v2.test.ts | 36    | Same owned HTTP plus in-memory Map/fake effects, batch/replay/revocation simulations, no real persistence or account.                                              |

Shared fixture.ts, trading-fixture.ts and v2-fixture.ts contain no mkdtemp/writeFile/private-key
serialization, filesystem write, database driver, subprocess or real account/consent connector.
All keys are generated in memory. Native HTTP request/raw-header helpers target owned fixture ports.
fixture calls loadConfig with an explicit object; it never imports src/index.ts or dotenv.
The SDK source dependency has no filesystem/database/child-process imports in this path.

The source runtime module imports readFile for optional TLS; audited tests never configure native
TLS/start that branch. The guard additionally denies .env, credential and PEM/private-key readFile.

## Excluded entry points

| Entry                                  | Reason it is not run by this configuration                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scripts/smoke.mjs                      | Spawns the built Node entry; excluded from today's no-subprocess test lane.                                                                                                            |
| src/index.ts / dist/index.mjs          | Loads optional .env.local and real runtime configuration. The safe import plugin rejects source entry imports; the built service is not loaded.                                        |
| integrations/codex real/live runners   | OAuth/CLI/client/file IPC/cache paths can create grant/session or disk state. This directory has its own owner and separate memory-only entry; no real client runner is included here. |
| Root default test/pack/runtime scripts | They can include CLI credentials/updater/pack/subprocess work and are outside this whitelist. Owner separately audits SDK-only memory checks.                                          |

No middleware is made acceptable by moving it to localhost or choosing an in-memory SQLite DSN.

## Guards and reuse

memory.setup.ts installs installMemoryGuards() from memory-guards.ts and restores builtins in its
last teardown hook. Audited fixtures finish/close before that hook (stack hook order).

- fetch and native Socket.connect allow only HTTP to 127.0.0.1 ports actually registered by this
  worker's own listen(0, 127.0.0.1). Existing listeners, external hosts, socket paths, TLS and UDP
  are rejected before connecting. A conflict probe may attempt to rebind an already owned port.
- File writes/append/mkdir/mkdtemp/copy/move/remove/metadata mutation/write streams and write-mode
  opens are rejected. File-descriptor writes are limited to stdout/stderr. No test writes a key,
  credential, runtime receipt or fixture file; negative write tests fail before invoking native I/O.
- child_process spawn/exec/fork variants and process.loadEnvFile are rejected.
- Service/SDK/database/proxy environment prefixes are removed in the worker and restored afterward.
  No environment values or credentials are printed. Tests that deliberately alter a fake override
  still exercise production destination checks.
- assertMemoryImport() in memory-policy.ts is used by the Vite pre resolveId hook to reject known
  database/Redis/Mongo/SQLite/ORM and dotenv connectors. The hook also rejects the service entry.

These are regression guards for the audited suite, not a sandbox for arbitrary unreviewed code.
Do not add a global localhost allowlist or external-port exception to reach an existing service.
Memory-only adapter/auth tests retain real JWT, audience/scope/claim and Basic exchange verification;
no serverFactory/auth bypass is used to replace the production authorization path.

For Owner's SDK-only configuration (do not modify SDK/root from this line): reuse setupFiles pointing
to packages/mcp-server/tests/memory.setup.ts and the import policy/plugin, with an explicit SDK-only
include list, SDK source alias, test build defines and the same Node/runner/env/cache/thread settings.
All fake fetch callbacks remain usable; an accidental native network or disk write is blocked.
The guards only allow ports owned by this Node worker, so a separate Python/existing server is not
automatically trusted. Cross-service memory builders need their own audited entry and teardown.

## Direct application/exchange injection

memory-config.ts exports createMemoryConfig(endpoints, options). It reads no process.env or file,
constructs no listener/connector, and accepts explicit http://127.0.0.1:<port> endpoints only:

```ts
const config = createMemoryConfig(
  { issuer, resource, apiResource, tradingBaseUrl },
  { tools: true, writes: true, exchangeSecret: 'memory-only-synthetic-secret' },
)
const application = createApplication(config)
const exchange = createExchange(config)
// Attach application.app to an owned temporary HTTP server, if required by the audited builder.
// In finally: beginShutdown(), await closeRequests(), exchange.close(), and close the server.
```

Options tools/writes both default false. Resource is the exact MCP /mcp audience; apiResource is the
exact Trading /api audience; tradingBaseUrl is the independent SDK origin, not /api. issuer/JWKS,
Host/Origin and Basic secret are explicitly synthetic; native TLS paths are absent. Endpoint ports
must be assigned by the owning memory builder and remain subject to the socket guard. Do not use
existing 26823/3002/8100, reserved v2 listeners, actual config files or persisted signing keys.

Both gates true means 7/4/11 discovery for read/write/both scopes. With master off the protocol
surface stays empty. Every protected request still verifies JWT and performs real exchange against
the memory AS; AS/Trading must supply their normal authorization behavior using their memory adapters.
Owner/Agent Redis Hash changes do not change MCP claims, issuer/audience or exchange contracts.

## Historical dedicated verification (2026-10-23)

The final dedicated run passed **182 tests in 8 files**: all original 166 plus 16 guard/config
cases, with no skipped tests. Guard/config cases include default-off isolation from service env,
lazy application/exchange construction and remote-endpoint rejection. Scoped Oxfmt/Oxlint, package
strict no-emit TypeScript and git diff --check passed. All fixture listeners closed and the Node
runner exited; no persistent process remains from this run.

No build, real client, actual middleware, seed or persistent-service smoke was run in this lane.
Owner separately reported 146 SDK-only memory tests passed using the same guards. That separate
result is not added to this package's 182 and does not establish live backend/account acceptance.

## 2026-10-25 source-expiry extension

The same exact-file guarded entry now passes 185 tests in 8 files, with no skipped cases:
169 protocol/tool tests plus 16 guard/config cases. trading.test.ts grew from 43 to 46 cases.
The three additions cover M expiring after AS signed T but before verification (401 with challenge),
and malformed/expired T with still-valid M (502). They use in-memory keys, owned loopback HTTP and
a Date-only controlled clock; no persistence, production endpoint or key file is used. The original
166/182 results above remain historical. Guard configuration and module/network/file policy are unchanged.
