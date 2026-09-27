# Standalone Binary Size Research (QuickJS / Perry / scriptc / Porffor)

Research date: 2026-09-27. Conclusions first:

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
3. **`@lezer/python`'s `parser.parse()` throws `TypeError: object is not a function`**, so local
   strategy validation fails for every `research strategy create/save/update`. Minimal repro:

   ```ts
   import { parser } from '@lezer/python'
   parser.parse('def f(x):\n    return x + 1\n')
   ```

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

### scriptc (vercel-labs/scriptc, tested version 0.1.6)

- A static compiler: after TypeScript type checking it lowers TS to C/LLVM with a small native
  runtime. npm dependencies need `--dynamic`, which runs them in an embedded quickjs-ng "dynamic
  island" (about +620 KB).
- Compiling the bundled JS directly fails: it checks the inlined @lezer code against the
  repository's strict tsconfig (`noImplicitOverride`, "used before being assigned", and so on).
- After compiling `packages/cli/src/index.ts` (with `__TQX_BUILD_*__` replaced by literals and the
  SDK pointed at its source), `scriptc coverage --dynamic` reports that only **70% of statements
  compile statically**. The blockers are exactly the CLI's core patterns: passing `fetch` as a
  function value, `instanceof` on `unknown`, records with index signatures, `Object.values`,
  `new Error(msg, { cause })`, `globalThis`, generic interface method calls,
  `BunSecretsCredentialStore`, and more.
- Its design is "report an error for anything that cannot compile statically", which means
  rewriting a large amount of code into its subset, and it has documented intentional divergences
  such as `JSON.stringify` key order and Date parsing. **It does not meet the goal of matching
  `node xxx.ts`.**

### Porffor (CanadaHonk/porffor)

- An AOT JS-to-C compiler; hello world is about 34 KB.
- Its module resolver states `node builtin modules are not supported`, and its `fetch` is a
  server-side (uWebSockets) handler rather than an HTTP client. **It cannot run this CLI.**

### Additional evaluation: AWS LLRT (0.9.0-beta)

- A QuickJS core plus a subset of Node APIs implemented in Rust; the binary is about 10.9 MiB.
- Running the CLI fails immediately with `Could not find export 'parseArgs' in module 'util'`, and
  the probe showed that sync APIs such as `fs.existsSync` are missing as well. It also has no
  supported way to embed a script into a single-file executable. **Not usable.**

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
