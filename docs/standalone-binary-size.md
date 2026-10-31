# Standalone Binary Size Research (QuickJS / Perry / scriptc / Porffor / TinyJS)

Research dates: 2026-09-27 and 2026-10-31. Conclusions first:

- **No candidate can currently replace `bun build --compile` while keeping behavior identical to
  `node packages/cli/dist/index.mjs`.** The closest is Perry (24.2 MiB on macOS arm64, about 40% of
  the Bun binary), but it crashes during strategy validation (`@lezer/python`) and changes JSON
  output and exit codes, so it cannot be used for a trading CLI.
- Implemented, feasible solution: **keep compiling with Bun and publish an additional
  gzip-compressed asset for every binary** (55%–60% smaller downloads); `tqx self-update` prefers
  the `.gz` asset. A per-platform differential end-to-end suite now compares every binary byte for
  byte with the Node.js reference on its own platform before release.
- The earlier "stuck on the keychain" problem with Perry and scriptc is explained below in
  [Credential storage (keychain)](#credential-storage-keychain--why-earlier-attempts-stalled).
- **Node SEA does not reduce the runtime cost.** On macOS arm64 with Node v26.13.0, a signed SEA
  was 139.2 MiB (41.8 MiB gzip), compared with the 140.5 MiB Node executable it was based on.
- **TinyJS's underlying txiki.js runtime is the first credible sub-10 MiB candidate.** A v26.6.0
  macOS arm64 runtime and a compiled hello-world program were both about 5.9 MB. It cannot run the
  current CLI unchanged because txiki.js is not Node-compatible; it requires a runtime port and a
  new differential test pass.

## Official project links

Keep this index near the top of the report so future experiments can start from the primary project
pages and documentation rather than from search results.

| Project | Website | Documentation | GitHub |
| ------- | ------- | ------------- | ------ |
| Perry | [perryts.com](https://perryts.com/) | [docs.perryts.com](https://docs.perryts.com/) | [PerryTS/perry](https://github.com/PerryTS/perry) |
| scriptc | [scriptc.dev](https://scriptc.dev/) | [scriptc docs](https://scriptc.dev/docs) · [Node compatibility](https://scriptc.dev/compatibility) | [vercel-labs/scriptc](https://github.com/vercel-labs/scriptc) |
| Porffor | [porffor.dev](https://porffor.dev/) | [Porffor docs](https://porffor.dev/docs) | [CanadaHonk/porffor](https://github.com/CanadaHonk/porffor) |
| QuickJS-ng | — | [QuickJS-ng README](https://github.com/quickjs-ng/quickjs#readme) | [quickjs-ng/quickjs](https://github.com/quickjs-ng/quickjs) |
| TinyJS / txiki.js | [tinyjs.app](https://tinyjs.app/) | [TinyJS docs](https://tinyjs.app/docs/) · [txiki.js docs](https://tinyjs.app/docs/txiki) | [saghul/txiki.js](https://github.com/saghul/txiki.js) |
| Node SEA | [Node.js](https://nodejs.org/) | [Single executable applications](https://nodejs.org/api/single-executable-applications.html) | [nodejs/node](https://github.com/nodejs/node) |

## Current state

v0.5.0 release assets (`bun build --compile`, Bun 1.4.x):

| Asset       |      Raw |  gzip -9 |   xz -9e |
| ----------- | -------: | -------: | -------: |
| macOS arm64 | 61.3 MiB | 24.8 MiB | 15.9 MiB |
| macOS x64   | 67.8 MiB | 27.2 MiB | 19.4 MiB |
| Linux x64   | 79.1 MiB | 35.0 MiB | 26.4 MiB |
| Linux arm64 | 79.0 MiB | 35.0 MiB | 24.5 MiB |
| Windows x64 | 85.1 MiB | 38.1 MiB | 28.6 MiB |

The CLI's own JavaScript (including valibot, citty, picocolors, and @lezer/python) is only about
0.4 MiB after bundling, so nearly all of the size comes from the Bun runtime. `--minify` saves only
about 0.1 MiB. Bun's musl variants are about 6 MiB smaller, but they depend on the musl dynamic
loader and cannot replace the glibc builds on glibc distributions.

## Runtime requirements of the CLI

A replacement must correctly support at least the following (all taken from `packages/cli/src` and
`packages/sdk/src`):

- ESM with top-level `await`, private class fields, `Error` `cause`, `Intl.NumberFormat`, and
  object key insertion order.
- `node:fs` / `node:fs/promises` (reads and writes, `rename`, `chmod`, `stat`, `ENOENT` codes and
  messages).
- `node:os` (`homedir`, `networkInterfaces`), `node:path`, and `node:util` (`parseArgs`, used by
  citty).
- `node:crypto` (`createHash('sha256')`, `randomUUID`) and `node:zlib` (self-update decompression).
- `node:child_process.spawn` (pipes, `detached`, `kill`; used by self-update and package-manager
  upgrades).
- HTTPS `fetch`, `Headers`, `URL`, `AbortSignal.timeout`, and `Buffer`.
- `process.exitCode`, `process.argv`, `process.execPath`, and `process.env`.
- Full JavaScript semantics for third-party dependencies: valibot validation and the
  `@lezer/python` parser (strategy code validation).

## Candidate evaluation

### QuickJS-ng (quickjs-ng/quickjs)

- An embeddable JS engine. `qjs --compile` produces standalone executables, and they are very small
  (around 1 MiB).
- Its standard library only has `qjs:std` / `qjs:os`: **no `node:*` modules, no `fetch`, and no
  TLS**.
- Using it would mean writing a Node compatibility layer plus HTTPS (including a TLS library for
  three platforms), which amounts to writing a new runtime. The compatibility risk and maintenance
  cost are unacceptable.
- Worth noting: scriptc's `--dynamic` mode and AWS LLRT both embed QuickJS(-ng).

### Perry (PerryTS/perry, tested version 0.5.1520, latest on npm)

Perry uses SWC and LLVM to compile TS/JS ahead of time into native executables, with Node APIs
implemented in Rust.

Size (macOS arm64, fully bundled CLI):

| Build                                                                                                    |     Size |
| -------------------------------------------------------------------------------------------------------- | -------: |
| Prebuilt full stdlib                                                                                     | 32.9 MiB |
| auto-optimize (`PERRY_WORKSPACE_ROOT` points at the matching source; runtime/stdlib trimmed to features) | 24.2 MiB |

Size breakdown (`--report-size`): our 0.4 MiB of JS compiles to about 11 MiB (8.5 MiB code plus
2.6 MiB data), the Perry runtime is about 5 MiB, and the rest is stdlib. Generated code already
uses `-Os` by default.

Compatibility: a probe program covering every Node API listed above produced output identical to
Node, which looked promising. Running the real CLI through `scripts/standalone-e2e.ts` (see below),
however, passed only **48/80** cases and exposed these problems:

1. `new URL(...) instanceof URL` is `false`, so `fetch(new URL(...))` throws `Invalid URL`. The SDK
   calls `fetch` with a `URL` object, so every network command reports "Unable to reach the TQX
   API". (This can be worked around in the standalone entry by wrapping `globalThis.fetch` to
   convert URLs to strings.)
2. Writing `process.exitCode` through an alias (`getRuntimeProcess().exitCode = 1`) has no effect,
   so every failing command exits with 0. Only the literal `process.exitCode = N` form works. The
   alias write does work in a small standalone program but not in the real bundle, which points to
   a context-dependent compiler bug.
3. **Perry loses the Lezer `Tree` prototype on the `@lezer/python` parse path**, so local strategy
   validation fails for every `research strategy create/save/update`. The earlier shorthand that
   `parser.parse()` itself throws `TypeError: object is not a function` was imprecise. With
   Perry 0.5.1520, parsing completes, but the returned value is a null-prototype object:

   ```ts
   import { parser } from '@lezer/python'
   const tree = parser.parse('x = 1\n')
   console.log(typeof tree)                 // object
   console.log(Object.getPrototypeOf(tree)) // null (Perry)
   console.log(tree.topNode)                // undefined (Perry)
   console.log(tree.topNode.name)           // fails
   ```

   There is no Python-specific function call at this point. The generated
   `@lezer/python/dist/index.js` only deserializes the grammar at line 302:
   `const parser = LRParser.deserialize({...})`. The relevant call chain is:

   - `@lezer/common` `Parser.parse` (lines 1754-1759) calls `parse.advance()` until it
     receives a tree.
   - `@lezer/lr` `StackToTree.stackToTree` (lines 1521-1530) calls
     `Tree.build({ buffer: StackBufferCursor.create(stack), ... })`.
   - `@lezer/common` `Tree.build` (line 551) enters `buildTree`; its `makeTree` helper
     (lines 1414-1423) returns `new Tree(...)`.
   - The `Tree` API defines `get topNode()` at `@lezer/common` lines 450-452. That getter
     lives on `Tree.prototype`. Since Perry returns a tree-shaped object with
     `Object.getPrototypeOf(tree) === null`, the getter is absent and `tree.topNode` is
     `undefined`. The next access in TQX, `root.name` (`packages/sdk/src/research/strategy-validation/validate.ts`
     line 163), then fails. Traversal getters such as `TreeNode.firstChild` (line 781),
     `parent` (lines 804-805), and `nextSibling` (lines 807-808) are affected for the same
     reason.

   Node 22/26 returns an actual `Tree` instance and `tree.topNode.name === "Script"` for the
   same input. Perry also supports ordinary class getters and direct `new Tree(...)` in smaller
   probes, so this is a compiler/runtime bug in the cross-module `StackBufferCursor` →
   `Tree.build` path, rather than a syntax error in the Python grammar. The exact Perry error
   text can vary by which missing method is reached; the full CLI previously reported
   `TypeError: object is not a function`.

4. Some nested objects (such as `params` from the API and error `data`) are **printed with keys
   sorted alphabetically**, while JavaScript requires insertion order, which changes `--json`
   output. Simple cases such as `JSON.parse`, `for...in`, and object spread are correct; the problem
   appears on more complex data paths.
5. fs error messages differ from Node: `ENOENT: No such file or directory (os error 2)` versus
   Node's `ENOENT: no such file or directory`.
6. The default is `--march native`; release builds must pass `--march generic` explicitly or they
   may SIGILL on older CPUs.
7. Cross-compiling for Windows requires `perry setup windows`, which downloads about 700 MB of MSVC
   CRT/SDK files (after accepting the Microsoft license), so native builds on a Windows runner are a
   better fit. Cross-compiling Linux binaries from macOS was not verified.

Perry's issue numbers are past 11,000, and issues such as "exits 0 where node exits N" and "object
is not a function" keep recurring on real npm packages while being fixed. **Perry should not be
used for the trading CLI until it passes our differential suite.**

### scriptc (vercel-labs/scriptc, current release v0.4.7)

- Compared with the `0.1.6` version tested in the September report, `v0.4.7` adds substantial
  Node-parity coverage: `http`, `path`, `querystring`, `Intl`, `Proxy`, streams, typed arrays,
  process behavior, and more. The release is still explicitly experimental and supports only a
  subset of JavaScript, TypeScript, and Node.js APIs. See the [v0.4.7 changelog](https://github.com/vercel-labs/scriptc/releases/tag/v0.4.7)
  and [documented limitations](https://scriptc.dev/docs/limitations).
- `v0.4.6` also added **Node islands**, which can load Node.js in-process for code the native tier
  cannot compile. This is a useful compatibility escape hatch, but it embeds or requires the Node
  runtime and therefore does not solve the small standalone-binary goal.
- The old `scriptc coverage --dynamic` result of **70% static statements** applies only to `0.1.6`;
  it should not be presented as a current `0.4.7` measurement. We have not yet rerun the complete
  TQX coverage and differential suite on `0.4.7`.
- The remaining TQX risk is still structural: the CLI uses dynamic function values, `unknown`/`any`
  flows, index-signature records, `Object.values`, generic calls, `globalThis`, `Error` causes,
  Bun credential storage, and runtime-dependent behavior. A fresh coverage run is worthwhile, but
  this is still a porting project rather than a drop-in compiler. **It is the second-closest option,
  behind Perry.**

### Porffor (CanadaHonk/porffor)

- An AOT JS-to-C compiler; hello world is about 34 KB.
- Its module resolver states `node builtin modules are not supported`, and its `fetch` is a
  server-side (uWebSockets) handler rather than an HTTP client. **It cannot run this CLI.**

### Additional evaluation: AWS LLRT (0.9.0-beta)

- A QuickJS core plus a subset of Node APIs implemented in Rust; the binary is about 10.9 MiB.
- Running the CLI fails immediately with `Could not find export 'parseArgs' in module 'util'`, and
  the probe showed that sync APIs such as `fs.existsSync` are missing as well. It also has no
  supported way to embed a script into a single-file executable. **Not usable.**

### Additional evaluation: Node single executable applications (SEA, 2026-10-31)

Node v26.13.0 now has the built-in `node --build-sea` workflow (introduced in Node v25.5.0). SEA
injects a preparation blob into a copy of the Node executable; it does not provide a smaller
runtime. See the [official SEA documentation](https://nodejs.org/api/single-executable-applications.html).

The experiment used the current bundled CLI entry and a temporary esbuild bundle because the
repository's normal CLI output still leaves `citty`, `valibot`, and `picocolors` as external imports.
SEA's injected module can load built-ins by default, but external packages must be bundled first.
The resulting macOS arm64 measurements were:

| Artifact                                 |       Bytes |      Size |
| ---------------------------------------- | ----------: | --------: |
| Node v26.13.0 executable                 | 147,346,864 | 140.5 MiB |
| Signed SEA with the CLI                  | 145,928,240 | 139.2 MiB |
| Signed SEA, gzip -9                      |  43,830,050 |  41.8 MiB |
| Bundled CLI JavaScript injected into SEA |     235,370 |   230 KiB |

The SEA ran the real CLI's `--version` and `--help` commands successfully after bundling. On macOS,
the binary must be re-signed after injection; running the unsigned artifact was terminated with
exit status 137. `useCodeCache` and `useSnapshot` were disabled for the size comparison.

SEA is therefore a compatibility option when Node's runtime is required, not a size optimization.
It is substantially larger than the Bun release assets and still requires a platform-specific
build and signing step.

### Additional evaluation: TinyJS / txiki.js (2026-10-31)

[TinyJS](https://tinyjs.app/) is a desktop application framework whose backend runs on
[txiki.js](https://github.com/saghul/txiki.js/). The small binary is txiki.js itself: QuickJS-ng plus
libuv and selected native modules. TinyJS's GUI launcher and system WebView are useful for desktop
apps, but are unnecessary for a terminal CLI. The relevant CLI path is `tjs compile`, not
`tinyjs build`.

The official v26.6.0 macOS arm64 archive was downloaded and tested locally:

| Artifact                             |     Bytes |     Size |
| ------------------------------------ | --------: | -------: |
| `tjs` runtime                        | 5,913,888 | 5.64 MiB |
| `tjs compile` hello-world executable | 5,914,109 | 5.64 MiB |

The compiled program executed a standard `fetch()` request successfully. txiki.js also provides
file I/O, subprocesses, sockets, WebCrypto, `randomUUID`, compression streams, SQLite, and
standalone compilation. Its [runtime documentation](https://tinyjs.app/docs/txiki) explicitly states
that it has no `require`, `process`, `Buffer`, or `node:*` modules.

The current TQX CLI cannot be passed to `tjs compile` unchanged. Running `tjs bundle
packages/cli/dist/index.mjs` fails on the CLI's Node imports:

```text
Could not resolve "node:fs/promises"
Could not resolve "node:os"
Could not resolve "node:path"
Could not resolve "node:fs"
Could not resolve "node:crypto"
Could not resolve "node:child_process"
```

The required port is broader than replacing one import. The runtime boundary would need adapters for
`fs`/`fs/promises`, `os`, `path`, `crypto.createHash`, `child_process.spawn`, `util.parseArgs`,
`zlib.gunzip`, `process.argv`/`process.env`/`process.exitCode`, `Buffer`, and credential storage.
The SDK also reads `process.env` directly. Pure JavaScript dependencies such as Valibot and most of
the CLI code may bundle, but `@lezer/python` and every output/error path still need compatibility
tests on QuickJS.

TinyJS's `app.secrets` API is an OS credential-store API for a TinyJS app backend. A direct `tjs`
CLI does not inherit the existing Bun service/account contract, so a port must either define a new
credential store or implement a migration-compatible adapter. The current self-update flow would
also need to be rewritten around txiki.js's APIs.

**Conclusion:** txiki.js is the most promising route for reducing a TQX standalone binary to roughly
6 MB, but it is a new runtime target rather than a packaging switch. Prototype it behind the existing
runtime abstraction with `--version`, `--help`, `health`, one authenticated request, and credential
read/write first. Keep Bun as the production runtime until the existing differential suite passes for
all commands and all release platforms.

## Credential storage (keychain) — why earlier attempts stalled

The standalone binary stores the API key in the OS credential store through `Bun.secrets`
(`BunSecretsCredentialStore` in `credentials.ts`, service `trade.tqx.cli`, account `default`).
Under Node there is no `Bun`, so it falls back to `$XDG_CONFIG_HOME/tqx/credentials.json`. Replacing
Bun removes `Bun.secrets`:

- Perry's `keychainSave/Get/Delete` belong to its UI platform layer, use a fixed service name, and
  are file-backed on Linux GTK, so they cannot read entries written by Bun. scriptc rejects
  `BunSecretsCredentialStore` during static checking.
- As a result, users who logged in with a standalone binary would appear logged out after
  upgrading, unless a compatible keychain reader and writer is implemented.

Bun's storage format on each platform (from `src/jsc/bindings/Secrets*.cpp` in `oven-sh/bun`), for
future migrations:

| Platform | Location and keys                                                                       |
| -------- | --------------------------------------------------------------------------------------- |
| macOS    | Keychain generic password, `kSecAttrService=trade.tqx.cli`, `kSecAttrAccount=default`   |
| Linux    | libsecret, schema `com.oven-sh.bun.Secret`, attributes `service` / `account`            |
| Windows  | Credential Manager, `CRED_TYPE_GENERIC`, TargetName `trade.tqx.cli/default`, UTF-8 blob |

If a non-Bun runtime is adopted later, compatible reads can use system tools: macOS
`security find-generic-password -s trade.tqx.cli -a default -w`, Linux
`secret-tool lookup service trade.tqx.cli account default`, and on Windows a PowerShell P/Invoke of
`CredReadW` (several hundred milliseconds per call). On macOS, access from a different executable
shows an authorization dialog (this also happens when a new Bun binary version has a different
signature).

## Implemented solution

1. **gzip-compressed assets** (the `package-binaries` job in `.github/workflows/release.yml`):
   `gzip -9 --keep --no-name tqx-v*`, with `SHA256SUMS` covering both the raw files and the `.gz`
   files. Raw binaries are still published so `tqx self-update` in v0.5.0 and earlier can find its
   assets.
2. **`tqx self-update` prefers the `.gz` asset** (`packages/cli/src/update.ts`): the `.gz` asset is
   used only when `SHA256SUMS` covers it. The compressed hash is verified first, the decompressed
   binary is checked against the raw asset's hash, and then the existing "write temporary file →
   `--version` self-check → replace" flow continues. Otherwise it falls back to the raw asset.
3. **Per-platform differential end-to-end tests**:
   - `scripts/standalone-e2e.ts <binary>` starts a local mock TQX API and runs every case with both
     `node packages/cli/dist/index.mjs` and the binary under test, requiring identical stdout,
     stderr, and exit codes. It covers help, version, login/logout/status, trading, research
     (including @lezer strategy validation and syntax errors), bug reports, error paths (401, 422,
     503 retries, HTML error pages, unreachable network, argument validation), and the standalone
     self-update flow (download `.gz`, verify, decompress, run the downloaded binary, clean up
     temporary files).
   - Cases that read or write the credential store (Bun uses the real keychain, which can show a
     dialog or overwrite a developer's saved key) run only in `CI` by default; set
     `TQX_E2E_CREDENTIAL_STORE=1` to run them locally.
   - `scripts/verify-release-assets.ts <dir> <asset>` verifies `SHA256SUMS` and confirms that the
     `.gz` decompresses to exactly the raw binary.
   - A new `verify-binaries` matrix job verifies each asset on `ubuntu-latest`, `ubuntu-24.04-arm`,
     `macos-latest`, `macos-15-intel`, and `windows-latest`; the GitHub Release is created only
     after all of them pass.

4. **Ad-hoc signing of macOS binaries** (the `compile-macos` job): the first dry run of the release
   workflow failed the `login flow` case on `macos-15-intel`. `bun build --compile` for darwin-x64
   keeps Bun's Developer ID signature, which appending the CLI invalidates; macOS then rejects
   keychain reads with `errSecAuthFailed (-25293)`, so `Bun.secrets` stores the API key but can
   never read it back and the user appears logged out. This also affects the v0.5.0 Intel macOS
   binary. The arm64 runtime gets an ad-hoc linker signature and works. macOS binaries are now
   compiled on a macOS runner and re-signed with `codesign --force --sign -`, which was verified to
   fix keychain reads for both architectures. The same dry run showed that Node on Windows reports
   fs errors for relative paths with the absolute path while Bun keeps the relative path; this is a
   message-only difference that already exists in v0.5.0, so the e2e suite normalizes that prefix.

Local results (built with Bun 1.4.0, Node 26 as the reference):

| Asset               | Checksums + gzip round trip | Differential e2e                                |
| ------------------- | --------------------------- | ----------------------------------------------- |
| macOS arm64         | Pass                        | 74/74 (6 credential-store cases skipped, above) |
| macOS x64 (Rosetta) | Pass                        | 74/74 (same)                                    |
| Linux x64 / arm64   | Pass                        | Cannot run locally; verified by the CI matrix   |
| Windows x64         | Pass                        | Cannot run locally; verified by the CI matrix   |

The same suite against the Perry build: 48/80 (with the entry patch, 32 cases still fail, 29 of
them on exit codes).

### Why the macOS x64 asset is verified on `macos-15-intel`

`tqx-v<version>-macos-x64` is for Intel Macs that predate Apple Silicon (M series). `macos-latest`
is already arm64, and `macos-15-intel` is currently the only free standard GitHub runner on real
Intel hardware.

Trade-offs between the two verification approaches:

| Approach                   | Pros                                                                                                    | Cons                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `macos-15-intel` (current) | Real Intel hardware; catches instructions older CPUs lack and problems that only occur on native x86_64 | Uses a special runner; the label has a retirement date                        |
| `macos-latest` + Rosetta   | No Intel runner needed and unaffected by the retirement; already verified locally this way (74/74)      | Rosetta papers over some CPU instructions, so it misses those hardware issues |

Timeline and impact:

- GitHub introduced `macos-15-intel` in September 2025 as the last x86_64 macOS image in Actions,
  available until **August 2027**. After that GitHub Actions provides no Intel macOS runners; jobs
  that reference the label cannot be scheduled, so the `verify-binaries` matrix fails and blocks
  releases.
- Apple is also dropping Intel: macOS 26 is the last macOS release to support Intel Macs, and the
  Intel user base will keep shrinking.

Recommendations:

1. Keep `macos-15-intel` for now to verify the Intel asset on real hardware.
2. Before August 2027, switch the `macos-x64` entry to run under Rosetta on `macos-latest`, for
   example by changing the matrix entry to `runner: macos-latest` and making sure Rosetta is
   available (`softwareupdate --install-rosetta --agree-to-license`). The test steps do not need to
   change: `scripts/standalone-e2e.ts` already supports emulated binaries (the mock release offers
   both x64 and arm64 asset names).
3. At that point, use GitHub Release download counts to decide whether to keep publishing
   `macos-x64`. If it is dropped, also update the release notes, README, and skill installation
   guide, and make sure `tqx self-update` gives Intel Macs a clear "asset missing; install manually
   or use npm" message (the current implementation reports `Release <version> is missing ...`).

## Re-evaluating Perry (when a new version is released)

```bash
mkdir -p /tmp/perry && cd /tmp/perry && npm init -y && npm install @perryts/perry
# Produce a fully bundled CLI (all dependencies inlined)
bun build packages/cli/dist/index.mjs --target=node --format=esm --outfile=/tmp/perry/tqx.mjs
# Optional: clone the matching source to enable auto-optimize trimming
git clone --depth 1 --branch v<perry-version> https://github.com/PerryTS/perry.git /tmp/perry/src
PERRY_WORKSPACE_ROOT=/tmp/perry/src node_modules/.bin/perry compile tqx.mjs -o tqx --march generic
# Perry does not use the keychain, so the credential cases are safe to enable
TQX_E2E_CREDENTIAL_STORE=1 bun scripts/standalone-e2e.ts /tmp/perry/tqx
```

Acceptance criteria: the differential e2e suite passes completely (especially
`research strategy create` and the exit-code cases), and it also passes on Linux and Windows. Keep
Bun until then. At that point, also implement credential reads compatible with `Bun.secrets` (see
the table above) so logged-in users keep their login after upgrading.
