# TQX MCP Server

Minimal stateless Streamable HTTP server using MCP SDK v2, Hono, and Valibot.
Each request gets a fresh server instance. The `ping` demo requires no authentication.

Run from the workspace root:

```bash
bun install
bun run --filter @tqx-ai/mcp-server dev
```

The `dev` script runs `bun --hot src/index.ts`, waits up to 15 seconds for
`GET /healthz` to return `{"status":"ok"}`, then launches the official
[MCP Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector)
with `bunx`, connected to `http://127.0.0.1:61102/mcp`. Inspector opens its browser
UI automatically; its first run may download the package. Ctrl+C stops both
processes. If either process exits, the other is stopped too.

The server listens at `http://127.0.0.1:61102`. Use `start` instead of `dev` to run
only the server, without hot reloading or Inspector.

Call the `ping` tool via `POST /mcp` (the name belongs in MCP `params.arguments`):

```bash
curl http://127.0.0.1:61102/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/call' \
  -H 'Mcp-Name: ping' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{"name":"world"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
```

The response contains `content: [{"type":"text","text":"pong, world"}]`.
Use `tools/list` to discover the tool and its generated JSON Schema. Missing or
non-string `name` values return a tool result with `isError: true`, following the
SDK's standard validation behavior. Unknown tools return JSON-RPC error code `-32602`.

The Fetch-based app factory lives in `src/app.ts`, protocol handlers in
`src/server.ts`, and the tool in `src/tools/ping.ts`. `src/index.ts` is the Bun
startup entry; other runtimes can serve `createApp().fetch` through an HTTP adapter.

Run the focused tests from the workspace root:

```bash
bun run test:unit packages/mcp-server/test/app.test.ts
```
