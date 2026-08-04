# SDK Guide

## Public Surface

- `src/index.ts` is the package entry point. Preserve existing exports and add domain exports there
  only when they are intended to be public.
- Root modules are limited to client composition, shared errors, and shared protocol schemas.
  Domain code belongs in `src/<domain>/`; generic helpers belong in `src/utils/`.
- Keep dependencies one-way: a domain may use root protocol modules and `utils`, but root modules
  must not depend on a domain implementation. Avoid circular imports.

## Transport And Paths

- `TqxClient` owns Fetch calls, URL construction, API-key headers, timeouts/error translation, and
  response decoding. Domain clients receive an injected typed request function and do not fetch
  directly.
- Add all service paths to `src/config/APIs.ts`. Trading/OpenAPI paths are root-relative; Qube paths
  are relative to a `baseUrl` ending in `/pandaApi`, for example `agent_quant/api/factors`.
- OpenAPI responses use the strict `ApiEnvelopeSchema`. Qube gateway responses can be raw resource
  data or a gateway envelope; retain its `data`, business code, message, and request ID in errors.
- All authenticated requests use `X-API-Key`. Research must use the same API-key transport as
  trading, not legacy session, token-refresh, or YAML configuration code.

## Schemas And Domain Clients

- Validate every public input with Valibot before issuing a request and validate response data after
  decoding. Expose inferred public types next to their schemas.
- Keep camelCase SDK inputs and map them to the backend's snake_case bodies only in the domain API
  client. Encode and validate resource IDs before adding them to a path.
- Make response schemas strict enough to guarantee fields the caller uses, but use loose objects
  where Qube may add service-owned fields.
- Polling is public behavior: validate interval/timeout using the SDK error taxonomy, return a
  typed timeout result, and test success, terminal failure, cancellation, and timeout paths.
- `research/` models Qube factor definitions, factor analyses, strategies, and backtests. Do not
  reintroduce QuantFlow workflow builders, workflow import/export, legacy wallet calls, or session
  configuration there.

## Verification

- Cover each endpoint's URL, method, headers, body mapping, query serialization, validation, and
  gateway error shape in `test/`.
- Run `bun run typecheck` and the focused Vitest file during development. Run `bun run test` before
  handoff; run `bun run pack:check` for public-surface or packaging changes.
