# TQX MCP Server Guide

## Scope

- This is the private @tqx-ai/mcp-server package in the tqx-ts Bun workspace.
- Change only packages/mcp-server unless explicitly authorized. Follow the root AGENTS.md;
  root configuration, lockfile, SDK and CLI remain with their owners.
- Default-off acceptance preserves the empty stateless protocol skeleton. The Owner-approved v1
  integration enables only getAccount/listPositions after request-local Agent/grant JWT validation
  and online Basic token exchange. Never add write tools or forward the MCP bearer to Trading.
- No introspection or shared Redis/Mongo client. Use the API audience, source_client_id and grant_id
  from the shared v1; account ownership/session/grant/source-jti revocation remain AS/Trading duties.
- Synthetic AS/Trading tests do not prove real consent, account access, or broker connectivity.

## Engineering

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
- The imported checkpoint contains unverified v2 WIP. Migration does not authorize write tools
  or completion of that WIP. Preserve the historical v1 evidence without claiming a new pass.
- Do not commit, create a remote, or push without explicit authorization.
