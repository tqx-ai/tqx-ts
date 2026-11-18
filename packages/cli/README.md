# @tqx-ai/cli

Command-line client for the TQX Open API. The standalone release binary does not require Node.js;
the npm distribution requires Node.js 22.18 or newer.

## Installation

The recommended installation for agents and servers is the standalone binary from the
[latest GitHub Release](https://github.com/tqx-ai/tqx-ts/releases/latest). Download the asset for
your operating system and CPU architecture (or its smaller `.gz` asset and decompress it), put it
on your `PATH` as `tqx` (`tqx.exe` on Windows), and verify it:

```bash
tqx --version
```

If a standalone binary is not available for your platform, install the npm package globally:

```bash
npm install --global @tqx-ai/cli
tqx --version
```

## Authentication

Provide an API key for the current process:

```bash
TQX_API_KEY=sk-example-xxxxxxxxxxxxxxxx tqx status
```

Or store it in the system keychain or user configuration:

```bash
tqx login --api-key=sk-example-xxxxxxxxxxxxxxxx
tqx status
tqx balance
tqx self-update
tqx self-update --check --json
tqx self-update --version=<version>
```

The self-update command verifies GitHub release checksums before replacing standalone binaries and
updates global npm, pnpm, Yarn Classic, or Bun installations when detected. Automatic checks run
at most once per 24 hours and never install a version without an explicit `tqx self-update`.
Automatic checks are skipped for `--json` and CI environments. Set `TQX_UPDATE_CHECK=0` to disable background checks. Custom release URLs must be trusted because
their metadata and checksums control the downloaded binary.

Passing a secret on the command line can save it in shell history. Prefer `TQX_API_KEY` when that
is a concern.

Use `tqx --help` to list commands. Human-readable output is colored by default; use `--plain` for
uncolored text or `--json` for machine-readable output.

## Research

Research commands connect to a gateway base ending in `/tqxApi` through `TQX_BASE_URL`.
Factor update/run support `--stockPool`: HK uses `all`, `HSI.HK`, `HSCE.HK`, `HSTECH.HK`;
US uses `all`, `SPX`, `IXIC`, `NDX`, `DJI`. Strategy create/update/run support
`--standardSymbol` with the corresponding index names (without `all`). Market compatibility
is checked by the backend. Use each command's `--help` for revision and run options.

Backtest result/chart reads may return empty or partial data while a run is pending.
Preserve the run ID and availability metadata; retry `LIVE_RESULT_UNAVAILABLE` reads with
backoff. Partial results do not imply a successful run. Chart JSON retains the benchmark curve.

## License

GNU General Public License v3.0.
