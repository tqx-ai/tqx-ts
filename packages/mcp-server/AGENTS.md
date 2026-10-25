# TQX MCP Server Guide

## Scope

- This is the private @tqx-ai/mcp-server package in the tqx-ts Bun workspace.
- Change only packages/mcp-server unless explicitly authorized. Follow the root AGENTS.md;
  root configuration, lockfile, SDK and CLI remain with their owners.
- Default-off acceptance preserves the empty stateless protocol skeleton. The Owner-approved v2
  integration enables seven read tools and, behind a second default-off gate, four write tools.
  Require request-local Agent/grant JWT validation and online Basic token exchange. Enforce each
  tool's scope and stable write idempotency keys. Never forward the MCP bearer to Trading.
- No introspection or shared Redis/Mongo client. Use the API audience, source_client_id and grant_id
  from the shared v1; account ownership/session/grant/source-jti revocation remain AS/Trading duties.
- Synthetic AS/Trading tests do not prove real consent, account access, or broker connectivity.

## Engineering

- Environment selection is compatible: local/test/prod and legacy aliases retain process-env
  precedence and the original local/default fallback. Optional profile files must not introduce new
  deployment gates. Preserve preexisting URL/Host/Origin/TLS/credential/auth checks; do not invent
  stricter policies, production endpoints or authentication-profile migrations. Show only effective
  public configuration, never secrets. Large behavior/policy changes remain with the Owner/user.
- Use strict TypeScript, ESM, extensionless local imports, native Fetch, and ASCII source.
- Use the pinned official MCP v1 SDK. Construct a fresh server and transport for every request;
  close them on completion, abort, failure, and shutdown. Never share identity state across requests.
- Keep issuer, exact single audience, JWKS URL, scope, Host, and Origin validation centralized.
- Recheck token expiry after body parsing. Stop disconnected authentication waits independently;
  cancel service-owned JWKS retrieval on shutdown without disrupting other active clients.
- Configuration comes from runtime environment; keep .env.local, PEM/private keys, credentials,
  node_modules, and generated dist out of Git. Never log tokens or internal verification exceptions.
- Tests use in-memory synthetic keys and isolated local JWKS. They are not real OAuth consent.
- Consume @tqx-ai/sdk through workspace:*. Do not substitute an npm artifact or an absolute
  local tarball. The original tarball fingerprint is historical evidence only.
- Use the root workspace Oxfmt/Oxlint and shared TypeScript/Vitest/tsdown tools. Do not add a
  package Biome configuration or upgrade dependencies as part of the migration.
- SDK v1 transport types are incompatible with exactOptionalPropertyTypes; strict remains enabled.

## Explicit local/test opt-in (2026-10-25)

- The user has reauthorized necessary local/test service, authorization and isolated persistence
  fixture writes. Use a fresh explicit test configuration and independent namespace/database/fixtures;
  never load .env.prod, assume old READY is current, or overwrite another run's business data.
- Default tool/write gates remain false. Enable either only in the explicitly selected test environment.
  Credentials belong in private/ignored files and must never appear in logs or coordination messages.
- Production, real funds/live brokers, deployment/publication and destructive database cleanup remain
  outside authorization. Preserve all uncommitted work; do not stage/commit/push from this line.
- The memory-only entry below remains a strict optional lane; its guards are not relaxed for live tests.
  Built-only validation uses tests/isolated-built.smoke.mjs with a new empty cwd and explicit child env.

## Memory-only lane (historical restriction, still available as an explicit guarded mode)

- When explicitly selecting the memory-only validation lane, follow MEMORY_ONLY.md and use only the dedicated
  Node/Vitest runner entry in tests/memory.config.ts. Do not run the normal check/test:mcp/smoke,
  built service, real client, login/refresh/revoke, middleware or persistent-store tests.
- No actual database, Redis/Mongo/SQLite, credential/private-key/runtime file mutation, seed, index
  creation, cleanup or rollback is allowed, even on local isolated services. Keep keys and state
  in process memory and network access limited to owned temporary loopback fixture ports.
- Preserve the earlier full-check results as historical; report the dedicated suite's exact count.

## Checks and documentation

- After the root Owner completes dependency installation and authorizes verification, run
  `bun run check` from this package (Oxfmt, Oxlint, strict typechecks, Vitest, build).
  Use `test:mcp` / `typecheck:mcp` for focused checks; do not add same-name root test/typecheck
  delegation that can recurse through Bun workspace script resolution.
- Run the built Node smoke on its temporary loopback port and verify health, metadata,
  and the unauthenticated 401 response. Do not stop Owner-managed services.
- Inspect `git status`, `git diff --check`, and all harness Markdown. Update README and acceptance
  documentation when routes, config, authorization behavior, or implementation status changes.
- Document remaining cross-repository work and limits. Do not fabricate real account authorization.
- Follow V2_CONTRACT.md for the approved tools and batch status contract. Prevalidate all batch
  items using the workspace SDK; submit sequentially and stop on the first failed/unknown result.
  No MCP retries or generated replacement keys. Preserve historical v1 evidence and distinguish
  synthetic HTTP tests from real cross-service, consent, account and broker acceptance.
- Do not commit, create a remote, or push without explicit authorization.
