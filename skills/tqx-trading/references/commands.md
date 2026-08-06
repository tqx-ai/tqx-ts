# TQX Trading CLI Reference

This reference describes the current CLI command shape and is updated with the source. Resolve the latest standalone release at task start from GitHub Releases metadata with an available HTTP client, without requiring Node.js or npm. Use `npm view @tqx-ai/cli version --json` only when npm is already available. The version shown in any older example is illustrative and must not override that runtime check. Current order parameters use
camelCase: `--orderType`, `--idempotencyKey`, and `--orderId`. Resolve one release version at task
start and use that same version for installation, execution, and verification.

## Table of contents

- [Package Manager Selection](#package-manager-selection)
- [Version and License](#version-and-license)
- [Install CLI](#install-cli)
- [Install SDK](#install-sdk)
- [Registry Troubleshooting](#registry-troubleshooting)
- [Command Entry](#command-entry)
- [Environment and Authentication](#environment-and-authentication)
- [Global Output](#global-output)
- [Read-Only Transaction Commands](#read-only-transaction-commands)
- [Write Trading Commands](#write-trading-commands)
- [Diagnostic Help](#diagnostic-help)

## Package manager selection

- For the CLI, check for an existing global `tqx` first. When it is missing or the version is wrong, prefer the matching GitHub Release standalone binary because it is the supported global installation path and does not require Node.js.
- When there is a `pnpm-lock.yaml` or the user explicitly uses pnpm, pnpm will be used. For new documents, write `pnpm dlx` first; `pnpx`
  is the equivalent shortcut that can be retained.
- Use Bun when the project has `bun.lock`, the user explicitly uses Bun, or you are developing the `tqx-ts` source. The repository's development toolchain is pinned to Bun 1.3.14.
- Existing projects always use the package manager corresponding to their lockfile, and do not mix multiple lockfiles.
- CLI should normally be installed globally; SDK is only installed to specific application projects, not installed globally. Temporary runners are an explicit fallback for isolated or one-time execution.

The npm package requires Node.js 22.18 or higher, but the preferred standalone CLI does not require Node.js. Check this only when using the npm fallback:

```powershell
node --version
```

## Version and License

- Resolve the current npm and standalone release versions at task start; do not rely on a version
  remembered from an older Skill or example.
- Both packages use the GNU General Public License v3.0, with the SPDX flag `GPL-3.0-only`.
- Check the package name, version and registry at the same time during installation and troubleshooting to avoid misuse of packages with the same name or floating versions.

## Install CLI

For a normal agent task, install the CLI globally so the `tqx` command remains available across commands and sessions.

First check the existing installation:

```powershell
tqx --version
tqx --help
```

Resolve the latest release without requiring Node.js:

```powershell
$release = Invoke-RestMethod 'https://api.github.com/repos/tqx-ai/tqx-ts/releases/latest'
$version = $release.tag_name.TrimStart('v')
```

If it is missing or outdated, install the matching latest GitHub Release standalone binary for the
user's OS and CPU architecture. Place the binary in a user-owned bin directory on `PATH`, and
verify it. Windows ARM64 has no standalone asset and should use the npm fallback.

Windows x64 PowerShell:

```powershell
$binDir = Join-Path $HOME '.local\bin'
New-Item -ItemType Directory -Force $binDir | Out-Null
curl.exe -L --fail '<resolved-release-asset-url>' -o (Join-Path $binDir 'tqx.exe')
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$binDir*") {
  [Environment]::SetEnvironmentVariable('Path', "$userPath;$binDir", 'User')
}
$env:Path = "$binDir;$env:Path"
tqx --version
tqx --help
```

macOS or Linux (select exactly one asset URL for the detected architecture):

```sh
mkdir -p "$HOME/.local/bin"
curl --fail --location '<resolved-release-asset-url>' -o "$HOME/.local/bin/tqx"
chmod +x "$HOME/.local/bin/tqx"
export PATH="$HOME/.local/bin:$PATH"
tqx --version
tqx --help
```

Select the matching release asset for macOS or Linux and the detected architecture. Persist the
`PATH` export in the user's shell startup file when needed.

If the standalone binary cannot be downloaded, the platform is unsupported, or the global bin directory is not writable, install the resolved npm package version globally instead:

```powershell
npm install --global @tqx-ai/cli@<version>
tqx --help
```

Use the equivalent `pnpm add -g @tqx-ai/cli@<version>` or `bun add --global @tqx-ai/cli@<version>` only when that
package manager is the user's chosen environment. Do not execute multiple installation commands
consecutively.
If pnpm reports that the global bin directory cannot be found, run
`pnpm setup`, restart the terminal and then install.

Only when the user explicitly requests isolation, the task is one-time, or global installation is
impossible, use the resolved version with a temporary runner such as `npx --yes @tqx-ai/cli@<version>`,
`pnpm dlx @tqx-ai/cli@<version>`, or `bunx @tqx-ai/cli@<version>`.

## Install SDK

Go to the actual TypeScript/JavaScript application directory and choose one based on the existing package manager for the project:

```powershell
npm install @tqx-ai/sdk@<version>
pnpm add @tqx-ai/sdk@<version>
bun add @tqx-ai/sdk@<version>
```

Do not install `@tqx-ai/sdk` globally. Follow the project's lockfile when reproducible builds are
required; pin the resolved version in the project manifest or lockfile rather than in this Skill.

Minimum SDK access:

```typescript
import { TqxClient } from '@tqx-ai/sdk'

const client = new TqxClient({
  apiKey: process.env.TQX_API_KEY,
})

const account = await client.trading.getAccount()
```

Do not write the API key into the source code. If the release package does not have a built-in default API address, it must be provided through `baseUrl` or the build environment.
`TQX_DEFAULT_BASE_URL`.

## Registry Troubleshooting

Before installation, you need to confirm that the package is visible in the current registry:

```powershell
npm view @tqx-ai/cli@<version> version license
npm view @tqx-ai/sdk@<version> version license
```

If 404 is returned, it usually means that the package has not been released yet, the package is a private package, the current account does not have permission, or the scope uses another registry.
pnpm, npm, and Bun all consume the npm registry by default; switching package managers usually doesn't resolve 404s. First check the registry and login status:

```powershell
npm config get registry
pnpm config get registry
bun pm whoami
```

If Bun reports `missing authentication`, let the user log in on his own terminal and verify again; do not ask for his npm password or OTP:

```powershell
bunx npm login
bun pm whoami
```

Modify `.npmrc` or registry configuration only if your organization explicitly provides a private registry, do not guess the address.

## Command entry

Prefer installed commands:

```powershell
tqx --help
```

When developing or debugging in the `tqx-ts` source code repository:

```powershell
bun install --frozen-lockfile
bun run build
node packages/cli/dist/index.mjs --help
```

The following sections use `tqx` for brevity. When running from source, replace it with
`node packages/cli/dist/index.mjs`. When running temporarily, replace it with the selected `npx`, `pnpm dlx`, `pnpx`, or
`bunx` prefix.

## Environment and Authentication

- `TQX_BASE_URL`: Runtime API address, which takes precedence over the build-time default address.
- `TQX_API_KEY`: process-level API key, takes precedence over persistent credentials.
- Persistent Credentials: Bun system keychain preferred; otherwise located in
  `$XDG_CONFIG_HOME/tqx/credentials.json` or `~/.config/tqx/credentials.json`.

Check service health and authentication:

```powershell
tqx status --json
```

A successful response contains `status`, `service`, `backend_version` and `authenticated`.

CLI login currently only accepts command line parameters and may enter shell history. When the user explicitly provides the API key in the current conversation, the agent can
use it directly for login, but do not echo the complete key in the reply or write it to source code, the repository, or unnecessary logs. When a persistent login is required:

```powershell
tqx login --api-key=<api-key>
```

Delete persistent credentials:

```powershell
tqx logout --json
```

## Global output

`--json` and `--plain` can be used anywhere in the command, but not at the same time. Agent calls use `--json` uniformly:

```powershell
tqx trading positions --market=HK --limit=100 --json
```

The JSON shape of stderr on failure is:

```json
{
  "error": {
    "message": "insufficient funds or buying power",
    "code": "insufficient_funds",
    "status": 409,
    "request_id": "...",
    "data": {
      "signal_id": "...",
      "state": "REJECTED",
      "order_id": null,
      "order_status": "REJECTED",
      "error_code": "ORDER_INSERT_ERROR_20001",
      "broker_error_id": 20001
    }
  }
}
```

Among them, `code`, `status`, `request_id` and `data` may be missing. When `data` exists in the rejection response, it should be retained
For `signal_id`, status and structured error fields, use the original `signal_id` to continue querying; do not treat the error response as unsubmitted and generate a new idempotent key and download again.

## Read-only transaction commands

Account:

```powershell
tqx trading account --json
tqx trading account --currency=HKD --json
tqx trading account --currency=USD --json
```

Account contains `account_id`, `mode` (`LIVE` or `PAPER`), `base_currency`, asset and cash fields, `as_of`, `is_stale`.

Position:

```powershell
tqx trading positions --json
tqx trading positions --symbol=00700.HK --market=HK --limit=100 --json
tqx trading positions --cursor=<next-cursor> --limit=100 --json
```

`market` can only be `HK` or `US`; `limit` is from 1 to 100. The response contains `items` and a nullable `next_cursor`.

Order list vs. single order:

```powershell
tqx trading orders list --limit=100 --json
tqx trading orders list --cursor=<next-cursor> --limit=100 --json
tqx trading orders get <order-id> --json
```

The order status is `PENDING`, `SUBMITTED`, `PARTIAL_FILLED`, `MODIFYING`, `CANCELLING`, `FILLED`,
`CANCELLED`, `REJECTED`, `TIMEOUT` or `FAILED`.

Trades:

```powershell
tqx trading trades --json
tqx trading trades --market=US --limit=100 --json
tqx trading trades --orderId=<order-id> --json
tqx trading trades --cursor=<next-cursor> --limit=100 --json
```

Signal:

```powershell
tqx trading signals get <signal-id> --json
```

The signal status is `PENDING`, `ACCEPTED`, `UNKNOWN`, or `REJECTED`. This is the signal lifecycle, not the order lifecycle. `ACCEPTED` means the signal request was accepted; it does not mean that the linked order was submitted or filled. The response may include a separate nullable `order_status` snapshot. A signal is not a fill report; use its `order_id` with `orders get` and `trades --orderId=<id>` to determine the order result.

`orders list` and the current-order `orders get` endpoint may omit terminal orders. An `order_not_found` response therefore does not by itself prove that an order was filled, canceled, or rejected; cross-check the signal, trades, account/positions, and any historical-order endpoint available for the account.

## Write Trading Commands

Market order:

```powershell
tqx trading orders place --symbol=AAPL.US --side=BUY --quantity=1 --yes --json
```

Limit order:

```powershell
tqx trading orders place --symbol=00700.HK --side=BUY --quantity=100 --orderType=LIMIT --price=350.00 --reason=<reason> --yes --json
```

Constraints:

- `symbol` uses `<code>.<market>`, the CLI will remove leading and trailing spaces and convert to uppercase.
- `side` can only be `BUY` or `SELL`.
- `quantity` must be a positive integer string.
- When `orderType` is omitted, the CLI defaults to `MARKET`.
- `LIMIT` must contain a positive number `price`; `MARKET` must not contain `price`.
- `reason` can be up to 512 characters long.
- `--yes` confirms submitting the order.
- When `idempotencyKey` is omitted, the CLI generates a new key. When you need to safely retry the same intent, you must explicitly pass in and reuse the stable key; the key length is 8 to 128, the first character is a letter or number, and the rest only allows letters, numbers, `. _ : -`.

Change order:

```powershell
tqx trading orders modify <order-id> --price=<positive-price> --json
```

Cancellation:

```powershell
tqx trading orders cancel <order-id> --json
```

Successful order-modification and cancellation responses contain `order_id` and `accepted`. `accepted: true` means only that the operation request was accepted; it does not mean that the order reached its final state. Run `orders get` and query trades afterward.

## Diagnostic Help

Check the parameters recognized at runtime layer by layer:

```powershell
tqx --help
tqx trading --help
tqx trading positions --help
tqx trading orders --help
tqx trading orders place --help
tqx trading orders modify --help
tqx trading trades --help
```

Exit code convention: usage or input verification error is 2, API/network/protocol error is 1, success is 0.
