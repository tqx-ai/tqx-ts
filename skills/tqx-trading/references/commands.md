# TQX Trading CLI Reference

This reference is based on the actual help output of `@tqx-ai/cli` 0.1.5 and the `tqx-ts` source code. Current order parameters use
camelCase: `--orderType`, `--idempotencyKey`, and `--orderId`. Installation examples are pinned to 0.1.5 so that a later release cannot silently change their behavior.

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

- For ordinary CLI users without existing projects, npm/npx is recommended first. It comes with Node.js and requires no additional installation of a package manager.
- When there is a `pnpm-lock.yaml` or the user explicitly uses pnpm, pnpm will be used. For new documents, write `pnpm dlx` first; `pnpx`
  is the equivalent shortcut that can be retained.
- Use Bun when the project has `bun.lock`, the user explicitly uses Bun, or you are developing the `tqx-ts` source. The repository's development toolchain is pinned to Bun 1.3.14.
- Existing projects always use the package manager corresponding to their lockfile, and do not mix multiple lockfiles.
- CLI can be run temporarily or installed globally; SDK is only installed to specific application projects, not installed globally.

The release package declares Node.js 22.18 or higher. Before installation, you can check:

```powershell
node --version
```

## Version and License

- The current npm version of CLI and SDK is `0.1.5`; the corresponding Git tag is `v0.1.5`.
- Both packages use the GNU General Public License v3.0, with the SPDX flag `GPL-3.0-only`.
- Check the package name, version and registry at the same time during installation and troubleshooting to avoid misuse of packages with the same name or floating versions.

## Install CLI

When running only once or experiencing it first, priority is given to temporary execution to avoid modifying the global environment.

npm/npx (recommended by default):

```powershell
npx --yes @tqx-ai/cli@0.1.5 --help
npx --yes @tqx-ai/cli@0.1.5 status --json
```

pnpm:

```powershell
pnpm dlx @tqx-ai/cli@0.1.5 --help
pnpm dlx @tqx-ai/cli@0.1.5 status --json
```

`pnpx` is a shortcut to `pnpm dlx`, also available:

```powershell
pnpx @tqx-ai/cli@0.1.5 --help
pnpx @tqx-ai/cli@0.1.5 status --json
```

Bun:

```powershell
bunx @tqx-ai/cli@0.1.5 --help
bunx @tqx-ai/cli@0.1.5 status --json
```

When you need to use the `tqx` command for a long time, choose another method to install it globally:

```powershell
npm install --global @tqx-ai/cli@0.1.5
pnpm add -g @tqx-ai/cli@0.1.5
bun add --global @tqx-ai/cli@0.1.5
tqx --help
```

Do not execute three installation commands consecutively; only execute the one corresponding to the user environment. pnpm's `-g` is equivalent to `--global`.
If pnpm reports that the global bin directory cannot be found, run
`pnpm setup`, restart the terminal and then install.

## Install SDK

Go to the actual TypeScript/JavaScript application directory and choose one based on the existing package manager for the project:

```powershell
npm install @tqx-ai/sdk@0.1.5
pnpm add @tqx-ai/sdk@0.1.5
bun add @tqx-ai/sdk@0.1.5
```

Do not install `@tqx-ai/sdk` globally. Follow the project's lockfile when reproducible builds are required, and install 0.1.5 explicitly.

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
npm view @tqx-ai/cli@0.1.5 version license
npm view @tqx-ai/sdk@0.1.5 version license
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

The signal status is `PENDING`, `ACCEPTED`, `UNKNOWN`, or `REJECTED`. A signal is not a fill report; use its `order_id` to continue checking the order.

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

Successful order-modification and cancellation responses contain `order_id` and `accepted`. `accepted: true` means only that the request was accepted; it does not mean that the order reached its final state. Run `orders get` afterward.

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
