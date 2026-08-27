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

After installation, use the built-in updater instead of manually downloading release assets:

```powershell
tqx self-update
tqx self-update --check --json
tqx self-update --version=<version>
```

Automatic checks run at most once every 24 hours before business commands. `tqx self-update` verifies
`SHA256SUMS` before replacing standalone binaries and upgrades detected global package-manager
installations. Temporary `npx`, `bunx`, and `pnpm dlx` executions must be installed globally
before they can be updated.
Automatic checks are skipped for `--json` and CI environments. Set `TQX_UPDATE_CHECK=0` to disable automatic checks. A custom `TQX_UPDATE_RELEASES_URL` is trusted
input and must provide authentic release metadata and SHA256SUMS.

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
If pnpm reports that the global bin directory cannot be found, run `pnpm setup` from the agent
context and use a fresh agent process if the PATH needs to be reloaded before installing.

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

If Bun reports `missing authentication`, do not ask the user to open a terminal or provide an npm password or OTP in chat. Use an already authenticated package-manager context if available; otherwise report that the package registry authentication is the environment blocker.

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

If the user does not have an API key, direct them to the TQX web app to [create an account](https://www.tqx.ai/user-center?tab=accounts), then [create a competition instance](https://www.tqx.ai/user-center?tab=agents). After the instance is created, ask the user to provide the generated key directly in the current conversation. Do not ask them to paste it into source code, public logs, or a repository.

- `TQX_BASE_URL`: Runtime API address, which takes precedence over the build-time default address.
- `TQX_API_KEY`: process-level API key, takes precedence over persistent credentials.
- Persistent Credentials: Bun system keychain preferred; otherwise located in
  `$XDG_CONFIG_HOME/tqx/credentials.json` or `~/.config/tqx/credentials.json`.

Check service health and authentication:

```powershell
tqx status --json
```

A successful response contains `status`, `service`, `backend_version` and `authenticated`.

CLI login currently only accepts command line parameters and may enter shell history. Do not instruct the user to run it. When the user explicitly provides the API key in the current conversation, the agent can use it directly for login from its own execution context. Do not echo the complete key in this or a later reply, or write it to source code, the repository, or unnecessary logs. Prefer `tqx login` so the key is saved to the CLI credential store and stays usable across later sessions and terminal restarts:

```powershell
tqx login --api-key=<api-key>
```

Reach for the process-scoped `TQX_API_KEY` instead only for a one-off or isolated task, or when the user does not want the key persisted.

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

Among them, `code`, `status`, `request_id` and `data` may be missing. When `data` exists in the rejection response, it should be retained. The trading API uses this status/code contract:

| HTTP | `error.code` | Meaning |
| ---: | --- | --- |
| 400 | `invalid_request` | Request or order parameters are invalid |
| 403 | `market_not_permitted` | The account is not permitted to trade this market |
| 404 | `order_not_found` | The order cannot be resolved for this account |
| 404 | `signal_not_found` | The trading signal cannot be resolved for this account |
| 409 | `idempotency_conflict` | The key was reused for a different order request |
| 409 | `order_not_cancellable` | The order exists but its state cannot be cancelled |
| 409 | `order_not_modifiable` | The order exists but its state cannot be modified |
| 409 | `insufficient_funds` | Buying power or available funds are insufficient |
| 409 | `insufficient_position` | Available position is insufficient for the sell |
| 409 | `position_direction_conflict` | The request conflicts with the current position direction |
| 409 | `market_closed` | The market or trading session does not currently accept this operation |
| 409 | `account_locked` | The trading account is temporarily locked |
| 409 | `invalid_trade_date` | The order belongs to a different trading day and can no longer be acted on |
| 422 | `invalid_lot_size` | Quantity does not satisfy the market lot rule |
| 422 | `invalid_order_price` | Price is invalid for the market or order rules |
| 422 | `invalid_symbol` | The symbol is unknown or not tradable |
| 422 | `risk_control_blocked` | A broker risk-control rule blocked the order |
| 422 | `order_rejected` | The broker rejected the order without a narrower code |
| 500 | `trading_data_mapping_error` | The upstream trading payload could not be interpreted safely |
| 502 | `upstream_rejected` | Legacy compatibility code; current unclassified order rejections use `422 order_rejected` |
| 503 | `trading_service_unavailable` | Trading channel unavailable, or no broker verdict could be obtained |
| 504 | `trading_timeout` | The trading operation timed out; query the original signal/order before retrying |

The status class tells you what to do next:

- **409** — the order conflicts with current state. The same order may succeed later once the state
  changes (market opens, funds settle, the lock clears). Do not change the order to "work around" it.
- **422** — the order content itself is not acceptable. Resubmitting it unchanged will fail again;
  fix the quantity, price, or symbol first.
- **403 / 400** — the account or the request is not eligible at all; do not retry.
- **500 / 502 / 503 / 504** — the failure is on the service or broker side, not with your order.
  Before retrying, query the original `signal_id` or order to confirm whether it was actually placed.

For rejection responses, preserve and inspect the envelope `message`, `code`, `status`, `request_id`, and `data`. The `data` object may include `signal_id`, `state`, `order_id`, `order_status`, `message`, `rejection_reason`, `error_code`, and `broker_error_id`. `message` is the stable API explanation; `rejection_reason` is the original broker detail when available. Use the original `signal_id` to continue querying; do not treat the error response as unsubmitted and generate a new idempotent key.

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
tqx trading orders place --symbol=00700.HK --side=BUY --quantity=100 --orderType=LIMIT --price=350.00 --timeInForce=DAY --reason=<reason> --yes --json
```

Constraints:

- `symbol` uses `<code>.<market>`, the CLI will remove leading and trailing spaces and convert to uppercase.
- `side` can only be `BUY` or `SELL`.
- `quantity` must be a positive integer string.
- When `orderType` is omitted, the CLI defaults to `MARKET`.
- `LIMIT` must contain a positive number `price`; `MARKET` must not contain `price`.
- `reason` can be up to 512 characters long.
- `timeInForce` currently supports `DAY` and defaults to `DAY`; the order expires at the current market session close.
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
