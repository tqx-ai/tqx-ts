# TQX MCP Server

Stateless Streamable HTTP resource server using MCP SDK v2, Hono, and Valibot.
Every MCP request, including the `ping` demo, requires a TQX MCP Bearer token.
Each request gets a fresh server instance and its own verified identity.

## OAuth configuration

Configure these runtime values before starting the server. They are not SDK/CLI
build variables and are not embedded by tsdown. The package maintains its own
[`.env.example`](.env.example); local values belong in `packages/mcp-server/.env`.

| Variable                  | Meaning                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `TQX_MCP_RESOURCE_URL`    | Canonical public MCP resource, such as `https://www.tqx.trade/mcp`. Must match the AS resource and token `aud`.                        |
| `TQX_MCP_OAUTH_ISSUER`    | Trusted issuer, such as `https://auth.tqx.ai`. AS discovery and JWT `iss` must match it exactly after configuration URL normalization. |
| `TQX_MCP_ALLOWED_HOSTS`   | Comma-separated hostnames without scheme or port, such as `www.tqx.trade,127.0.0.1,localhost,[::1]`.                                   |
| `TQX_MCP_ALLOWED_ORIGINS` | Comma-separated exact browser origins, including scheme and port. An explicitly empty value permits native clients only.               |

All four variables must be explicitly set. Invalid or missing configuration stops
startup; there is no anonymous fallback. Production URLs/origins must use HTTPS.
HTTP URLs/origins, including LAN addresses and hostnames, are allowed outside
`NODE_ENV=production`. Host and Origin
checks remain enabled; native clients without an Origin header are supported.

## Run locally

Once workspace dependencies are installed, run in `packages/mcp-server/`.
Copy the example once, adjust its values, then start MCP:

```bash
cp .env.example .env
bun run dev
```

The copy command is only for initial setup; preserve an existing `.env`.
`scripts/dev.mts` explicitly loads the package's `.env` before spawning children,
which inherit the loaded variables. Existing process environment variables take
precedence. The file is optional when variables are already exported; missing
required OAuth configuration still prevents server startup. Deployments can inject
these variables directly.

Use `bun run start` in the same directory to run only the server; Bun loads the
local `.env` for that command.

The `dev` script runs `bun --hot src/index.ts`, waits up to 15 seconds for
anonymous `GET /healthz` to return `{"status":"ok"}`, then launches the official
[MCP Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector)
at `http://127.0.0.1:61102/mcp`. Inspector opens its browser UI automatically;
its first run may download the package. Ctrl+C stops both processes. If either
process exits, the other is stopped too. Use `start` instead of `dev` to run only
the server. The Bun entry listens at `127.0.0.1:61102` by default;
`TQX_MCP_BIND_HOST` overrides its listening address.

Add Inspector's exact browser origin (normally `http://localhost:6274`) to
`TQX_MCP_ALLOWED_ORIGINS` for development. Browser authorization must target a
canonical resource supported by the AS. A loopback listener does not make
`http://127.0.0.1:61102/mcp` a registered resource: use a dedicated test AS/resource,
or a controlled HTTPS test proxy to the local server and connect Inspector to
that public URL. Ensure the proxy forwards the path-aware well-known route too.

## Run with Docker Compose

Configure the package's `.env`, then run from `packages/mcp-server/`:

```bash
docker compose -f docker/compose.yaml up -d --build
docker compose -f docker/compose.yaml logs -f mcp-server
```

The Compose project is named `tqx-ts` and contains only the `mcp-server` service.
It loads `../.env` relative to the Compose file, listens on `0.0.0.0:61102` inside
the container, and publishes port `61102`. It runs the server without Inspector.
The image uses `docker.cnb.cool/liangyunzhijing/docker-sync/oven-bun:1.4.4-slim_amd64`
and the service explicitly targets `linux/amd64`. Dependencies are installed from
the workspace lockfile with `--frozen-lockfile --production` for the MCP package.
The Dockerfile's companion ignore file excludes local configuration, credentials,
development dependencies, and unrelated source files from the build context.

The image defaults to `NODE_ENV=production`, which requires HTTPS public URLs
and browser origins. For local or LAN HTTP testing, add `NODE_ENV=development`
to the package's `.env`, set the resource URL to the client-facing HTTP endpoint,
and add its hostname/IP (without scheme or port) to `TQX_MCP_ALLOWED_HOSTS`.
For browser clients, also add their exact origin to `TQX_MCP_ALLOWED_ORIGINS`.
The OAuth server's resource configuration and token `aud` must match the resource URL.
After changing `.env`, recreate the container with the Compose command above.
Container `localhost` refers to the container itself;
the OAuth issuer must be reachable from both the container and the MCP client,
and match the issuer published by tqx-oauth. A host-side issuer such as
`http://localhost:26823` needs an appropriate proxy or network setup before it
can be used from the container. The public resource URL and Host/Origin
allowlists still describe the client-facing endpoint, independently of the
container's bind address. The health check uses the resource URL's Host header.

Stop the Compose service from the same package directory:

```bash
docker compose -f docker/compose.yaml down
```

## Authorization Code login

The server publishes anonymous Protected Resource Metadata at
`/.well-known/oauth-protected-resource/mcp` for a canonical `/mcp` resource,
plus a root `/.well-known/oauth-protected-resource` alias. Other external resource
prefixes produce the corresponding path-aware well-known route. Anonymous MCP
requests receive HTTP 401 with a public `resource_metadata` challenge URL.

The MCP client follows that metadata to tqx-oauth, obtains its own client ID via
CIMD, pre-registration, or DCR, and completes **Authorization Code + PKCE S256**
in the browser. tqx-web provides login and consent. The client checks state and
issuer, receives its own callback, exchanges the code, and retains any refresh
token. It sends `Authorization: Bearer <access_token>` on every MCP request.
Discovery advertises all six TQX scopes, matching the API key permission groups:
`research:read`, `research:write`, `research:run`, `trade:read`, `order:write`, and
`ranking:read`. Clients that use the advertised list as their initial scope set
will request all six; clients can explicitly request a subset. Consent involving
`trade:read` or `order:write` requires an Agent selection in tqx-web. Existing
transactions and tokens retain their scopes; start a new authorization to request
additional permissions. `ping` itself has no additional business scope requirement
beyond a valid MCP token. Advertising these scopes does not add business tools.

This package does not implement Device Flow, an OAuth callback, an authorization
server, or code/refresh-token storage. It does not call device authorization,
registration, consent, or token endpoints. Downstream token exchange and business
gateway integration are separate work. Its only upstream requests fetch public
AS metadata and JWKS; the AS's global discovery may still advertise Device Flow.

JWT verification uses JOSE with RS256, trusted issuer, exact MCP audience, expiry,
optional `nbf`, and Valibot-validated identity claims. AS metadata must report the
configured issuer; JWKS must be on that issuer's origin. Discovery requests reject
redirects, omit credentials, time out after five seconds, and accept at most 64 KiB
per document and 32 keys. Public metadata/keys are cached in process for at most
ten minutes; unknown-key refreshes and failed-fetch retries have a 30-second
cooldown. Publish old and new keys together during rotation. No database is used.

Invalid tokens receive 401. Per-operation scope challenges use the SDK's HTTP 403
response before tool execution. Upstream discovery failures return a safe HTTP
500; no unverified request is allowed through. Browser CORS exposes
`WWW-Authenticate` on authentication errors. Legal OPTIONS preflights remain
anonymous and never execute a tool.

**Revocation limitation:** local JWT verification does not detect revoked AS
sessions before token expiry. This phase exposes only `ping`. Online revocation
checks or downstream token exchange must be implemented before enabling real
account data or write tools. Device-grant and code-grant tokens currently share
the same claims; the resource server cannot infer which login flow issued one.

Browser end-to-end login still requires the tqx-web consent page and a reachable,
compatible test AS/deployment. Workspace tests use test signing keys and injected
public discovery responses; they do not establish that those services are deployed.
See the [implementation plan](docs/oauth-authorization-code-plan.md) for ownership,
contracts, and the remaining integration checklist.

## Call a tool and test

After the MCP client completes login, it can call `ping` with
`params.arguments: {"name":"world"}`. The result contains
`content: [{"type":"text","text":"pong, world"}]`. Use `tools/list` for its schema.
Missing or non-string names produce `isError: true`; unknown tools return JSON-RPC
error `-32602`, following the SDK's standard behavior.

`src/app.ts` provides an injectable Fetch app factory, `src/auth/` owns resource
metadata and JWT verification, `src/server.ts` registers tools, and `src/index.ts`
is the Bun entry. Reusable helpers live in `src/utils/`, with configuration parsing
helpers in `src/utils/config.ts`. Other runtimes can serve `createApp().fetch` through an HTTP
adapter. Tests run the core under Node/Vitest and exercise authentication under Bun.

Run the workspace checks from the workspace root:

```bash
bun run test:unit packages/mcp-server/test
bun run test
```
