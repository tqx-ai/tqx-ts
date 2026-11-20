# Qube Next CLI and SDK migration

The research client now targets the Qube Next backend in `qube-next/backend/qube_backend`.
Configure `TQX_BUILD_BASE_URL` or `TQX_BASE_URL` with a base ending in `/tqxApi`.
Research paths are relative `qube/api/...`; authentication, trading, and health retain their
root-relative OpenAPI paths and trading base URL.

## Breaking changes

| Previous contract               | Qube Next contract                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Integer resource IDs            | Lowercase 24-character ObjectIds                                                           |
| `/pandaApi/agent_quant/api/...` | `/tqxApi/qube/api/...`                                                                     |
| Offset-based library pages      | `limit` and opaque `cursor`; named collections, `has_more`, `next_cursor`, market counts   |
| Resource `name` / CLI `--name`  | Business `title` / CLI `--title` (named versions still use `name`)                         |
| Save/revert against version IDs | Dedicated source PUT with `base_source_revision`; config PATCH with `base_config_revision` |
| Implicit run state              | Explicit expected source/config revisions and request identity                             |
| `done` / `completed` run status | `succeeded`; `preparing`, `queued`, `running`, `failed`, `cancelled`                       |
| Strategy `run-backtest`         | POST `/strategies/{id}/backtests`                                                          |
| Whole-result list pagination    | Summary lists (maximum 10) and paged backtest result fields (maximum 500)                  |

Read current revisions with `info` before modifying or running a resource. On a revision conflict,
read current state and reconcile changes. Source save, run, version, restore, and tuning requests
carry request IDs. The CLI generates IDs, while tuning JSON and SDK callers supply them explicitly.
Source code is validated by the backend. Use the SDK's explicit `validateStrategy` call when a
separate validation receipt is needed before running.

## Supported operations

The SDK exposes factor/strategy creation, source and config updates, validation, cursor libraries,
analysis/backtest submission and cancellation, history summaries, polling, named versions and restore,
factor analysis snapshots, tuning create/list/detail/cancel/rerun/apply, paged results, charts, and
symbol daily bars. SSE async iterators use protocol 1 snapshots with sequence resume and abort support;
protocol 2 patch reduction and automatic reconnect are not exposed.

The CLI covers the core resource lifecycle, versions/restores, tuning requests from camelCase JSON
files, result pages, output modes, downloads, and explicit deletion confirmation. See
[commands](skills/tqx-research/references/commands.md) and [SDK usage](skills/tqx-research/references/sdk.md).

## Contract sources and verification

Contracts were checked against backend API routes, Pydantic models, registry/tuning service return
values, research query services, event projection, and result endpoints. Frontend API declarations
were used as supporting context; actual service returns take precedence.

Vitest uses injected Fetch to check paths, headers, methods, bodies, cursor/count mapping, revisions,
validation failures, terminal states, result schemas, stream parsing, CLI output modes, and exit codes.
The standalone differential test uses the new ObjectId, revision, version, and result contracts.
Full workspace and package smoke checks exercise generated Node/Bun packages separately from source.

The test gateway at `http://192.168.1.3:3051/tqxApi/qube/api/strategies?limit=24` requires authentication.
An unauthenticated response only verifies routing and authorization, not a successful resource
lifecycle or backtest execution. Authenticated remote coverage must be reported separately from
local contract tests.

Verification on November 10, 2026: `bun run test` passed all 507 unit tests, formatting, lint,
type checking, builds, and Node/Bun smoke checks. `bun run pack:check` and
`bun run release:preflight` passed. A locally compiled standalone binary passed 79 differential
cases; six credential-store cases were skipped by the test harness to protect the developer's
real keychain. The built CLI's read-only test-gateway request returned HTTP 401
`COMMON_UNAUTHORIZED`, so authenticated remote lifecycle tests remain unverified.
