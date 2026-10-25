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

## Deployment environments

`TQX_ENV=local|test|prod` selects optional public endpoint defaults, independently of `NODE_ENV`.
The CLI delegates URL resolution to the SDK. In the repository, public templates are available in
`packages/sdk/config/.env.local.example`, `.env.test.example`, and `.env.prod.example`.

| Selection | Trading default              | Research/User balance default |
| --------- | ---------------------------- | ----------------------------- |
| `local`   | `TQX_LOCAL_TRADING_BASE_URL` | `TQX_LOCAL_BASE_URL`          |
| `test`    | `TQX_TEST_TRADING_BASE_URL`  | `TQX_TEST_BASE_URL`           |
| `prod`    | `TQX_PROD_TRADING_BASE_URL`  | `TQX_PROD_BASE_URL`           |

Existing `TQX_BASE_URL` overrides these profile defaults. Omitted or blank fields use the previous
build/default chain; unknown/legacy selector values use that original chain without a new startup
rejection. The original requirement for some usable URL, HTTP(S) URL validation and authentication
checks remain. Test/production addresses are not guessed: their templates leave override fields
blank and explain the fallback. The local template explicitly uses Trading's gateway
`http://127.0.0.1:8102`; the OAuth audience ending in `/api`, Web, issuer and MCP addresses are
configured by their own modules.

Inspect effective public configuration without authentication, profile reads, or network:

```bash
tqx config --json
```

The output contains `environment` (recognized selected profile, otherwise `legacy`),
`requested_environment`, `base_url`, and `trading_base_url`. URL credentials and sensitive query
values are redacted. The displayed URLs are authoritative; a selected label alone does not verify
which deployment owns an explicitly overridden address. This command does not change profiles,
login state or environment variables, and does not run an automatic update check.

Authentication behavior stays the same in every selection: `TQX_API_KEY` takes precedence over
the existing `default` credential record. The existing explicit login/logout commands continue
using that record; no new credential slots, copying or migration are performed merely by selecting
an environment. Use credentials suitable for the chosen target. Selecting a profile does not move
OAuth grants or turn a token/key into authorization for another service.

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

To filter current active orders:

```bash
tqx trading orders list --startDate=2026-10-01 --endDate=2026-10-25 --status=submitted --symbol=0700.HK --json
```

The optional filters combine with AND and do not query historical orders. Dates are inclusive Hong
Kong calendar dates of submission; orders without a reliable submitted timestamp do not match date
filters. Status is trimmed and uppercased, and the server normalizes symbols. Unknown statuses return
no matches. Use each pagination cursor with the same filters; omitting filters keeps existing behavior.

## License

GNU General Public License v3.0.
