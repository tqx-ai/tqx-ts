# TQX TypeScript Workspace Guide

## Scope And Ownership

- This Bun 1.3.14+ workspace publishes the Node.js 22.18+ `@tqx-ai/sdk` and
  `@tqx-ai/cli` packages. Run workspace commands from this directory.
- `packages/sdk` owns the public client, API paths, public types, Valibot validation, transport,
  response decoding, and typed API errors. `packages/cli` owns Citty commands, credentials,
  terminal output, and process exit behavior.
- Keep the dependency direction one-way: CLI consumes the SDK; it must not recreate endpoint
  strings, request bodies, gateway decoding, or SDK schemas.
- `scripts/` contains release, package, and runtime smoke checks. `dist/` is generated; never edit
  it manually. Do not commit `.env`, credentials, API keys, tarballs, or generated output.

## Gateway Configuration

- `TQX_BUILD_BASE_URL` configures non-trading APIs at build time and `TQX_BASE_URL` is the runtime
  override for every request group. Both are public values embedded by `tsdown`.
- Qube research requests use a gateway base ending in `/pandaApi` and relative paths under
  `agent_quant/api`. Keep those paths relative so URL resolution preserves `/pandaApi`.
- Authentication, trading, and `health()` use `tradingBaseUrl` / `TQX_BUILD_TRADING_BASE_URL`.
  Their root-relative OpenAPI paths deliberately resolve outside `/pandaApi`.
- Store every backend path in `packages/sdk/src/config/APIs.ts`. If a build-time variable changes,
  update both `tsdown.config.ts` files, `.env.example`, docs, release preflight, and tests.

## Shared Engineering Rules

- Use strict TypeScript, ESM syntax, extensionless local imports, ASCII source by default, and the
  native Fetch API. Keep `fetch`, credential stores, and output streams injectable for tests.
- Validate public SDK inputs and response payloads with Valibot. Preserve
  `TqxConfigurationError`, `TqxNetworkError`, `TqxProtocolError`, `TqxValidationError`, and
  `TqxApiError`; do not leak raw transport, parser, or range errors from public methods.
- Keep request construction centralized in `TqxClient`: normalize URLs, encode identifiers, omit
  undefined query values, and retain API error code, data, and request ID.
- CLI commands must preserve human, `--plain`, and `--json` output contracts. Never print secrets
  or API keys. `TQX_API_KEY` takes precedence over persisted credentials.
- Make focused changes. Do not refactor unrelated code or alter public schemas, error messages,
  credential behavior, or CLI output without an explicit reason.

## Tests And Release Checks

- Add focused Vitest coverage for URL selection, HTTP method, headers, body mapping, query
  serialization, validation failures, and CLI output/exit status.
- Unit tests resolve `@tqx-ai/sdk` to source through `vitest.config.ts`; do not rely on local
  `dist` output. Build and smoke checks cover package behavior.
- Run the narrowest relevant test while developing, then run `bun run test` before handoff. It runs
  formatting, linting, type checking, unit tests, production builds, and Node/Bun smoke tests.
- For packaging or release changes, also run `bun run pack:check` and, when relevant,
  `bun run release:check`. Release defaults must be valid HTTPS URLs.
