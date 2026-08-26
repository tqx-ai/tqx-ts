# @tqx-ai/cli

Command-line client for the TQX Open API. The standalone release binary does not require Node.js;
the npm distribution requires Node.js 22.18 or newer.

## Installation

The recommended installation for agents and servers is the standalone binary from the
[latest GitHub Release](https://github.com/tqx-ai/tqx-ts/releases/latest). Download the asset for
your operating system and CPU architecture, put it on your `PATH` as `tqx` (`tqx.exe` on Windows),
and verify it:

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

## License

GNU General Public License v3.0.
