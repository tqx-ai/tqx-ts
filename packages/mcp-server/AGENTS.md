# MCP Server Development & Architectural Guide

## 1. Overview and Scope

This package (`@tqx-ai/mcp-server`) provides the remote **Model Context Protocol (MCP)** server for the TQX ecosystem.

The server is designed as a centralized, high-concurrency, **ultra-lightweight, stateless remote server** exposed over **Streamable HTTP**, allowing multiple external clients (such as IDEs, desktop applications, web clients, and agent orchestrators) to connect concurrently, execute tools, query prompts, and stream real-time data back and forth.

In principle, this server acts strictly as an **intelligent forwarding and protocol-bridging layer**:

- **Zero Database Attachments:** It does **NOT** connect to external databases (no Redis, MongoDB, MySQL, PostgreSQL, etc.), keeping footprint and operational overhead minimal.
- **Upstream Forwarding & Delegation:** All authentication is delegated to `tqx-oauth`, and post-login resource/tool execution is routed to the internal Java gateway or the trading-side gateway.

> **Status:** Architectural specification and guidelines for AI agents and developers. This document defines technical decisions, constraints, and roadmaps prior to full implementation.

---

## 2. Core Technology Stack & Specifications

Before making any MCP-related change, read the relevant official
[MCP TypeScript SDK v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/)
and protocol specification first. Verify the recommended API against the installed
SDK version before editing code; do not rely on remembered APIs or deprecated examples.
Use `McpServer.registerTool` for ordinary tools and follow the official
[Valibot schema integration](https://ts.sdk.modelcontextprotocol.io/v2/advanced/schema-libraries#register-a-tool-with-a-valibot-schema).
Use low-level request handlers only when a concrete requirement cannot be met by
the documented high-level API.

All development in this package must strictly adhere to the following stack:

| Component                    | Technology                | Specification / Version                                                                                                                                                                                                                               |
| :--------------------------- | :------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP SDK**                  | MCP TypeScript SDK **v2** | [`https://ts.sdk.modelcontextprotocol.io/v2`](https://ts.sdk.modelcontextprotocol.io/v2)<br>Packages: `@modelcontextprotocol/server` (^2.x), `@modelcontextprotocol/hono` (^2.x).<br>**Strictly prohibit SDK v1 (`@modelcontextprotocol/sdk` v1.x).** |
| **MCP Protocol Spec**        | MCP Specification         | **`2026-07-28`** ([https://modelcontextprotocol.io/specification/2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28))                                                                                                               |
| **Web Framework**            | **Hono**                  | `hono` (^4.x) utilizing standard Web Standards (Fetch API, Request/Response, Web Streams).                                                                                                                                                            |
| **Type & Schema Validation** | **Valibot**               | `valibot` (^1.x) + `@valibot/to-json-schema` (^1.x) for all schema validation and MCP tool input JSON Schema generation. **Do not use Zod.**                                                                                                          |
| **Primary Runtime**          | **Bun**                   | **v1.4.4+** as the development, build, and primary production startup runtime.                                                                                                                                                                        |
| **Compatibility Targets**    | **Node.js & TypeScript**  | Must maintain full cross-runtime compatibility with **Node.js 26** and **TypeScript 7 (TS 7)**.                                                                                                                                                       |

---

## 3. Remote Server Architecture: Streamable HTTP

### 3.1 Streamable HTTP Remote Server Model

Unlike local stdio-based MCP servers (which spawn per-client sub-processes), this service is deployed as a long-running remote service accessible over the network.

- **Transport:** Streamable HTTP transport based on Server-Sent Events (SSE) / streaming HTTP chunked transfers according to MCP Spec 2026-07-28 and SDK v2.
- **Multiplexing & Multi-Client Support:**
  - Multiple distinct clients connect simultaneously to the server over HTTP/HTTPS.
  - Each client connection establishes a unique session (identified via session tokens or session headers).
  - Streaming responses, progress notifications, and asynchronous tool runs must be routed strictly to the corresponding client session.
- **Connection Lifecycle:**
  - `POST /mcp` (or dedicated endpoint): Handles JSON-RPC requests and initializes stream channels.
  - Session lifecycle management (connect, heartbeat, ping, graceful disconnect, timeout reclamation).
  - Backpressure-aware stream management using Web Streams (`ReadableStream`, `TransformStream`).

### 3.2 Session & Tenant Isolation

- **State Isolation:** Session states, message queues, and execution context must be strictly isolated per client/session in-memory. Never maintain global mutable state that leaks between concurrent connections.
- **Authentication Extraction:** Extract client credentials (e.g., `Authorization: Bearer <token>`) at the Hono middleware layer. Validate that incoming tokens target the MCP resource (`aud=https://www.tqx.trade/mcp`).
- **No Internal Privilege Injection:** The MCP server is a public-facing component and must never synthesize, inject, or assume internal private trust headers.

### 3.3 Stateless Architecture & Zero-Database Guarantee

The MCP server adheres strictly to a pure forwarding proxy pattern without local persistence:

1. **Zero Database Connections:**
   - The service maintains **no direct connections** to databases (no Redis, MongoDB, MySQL, etc.).
   - It maintains no local user tables, session databases, or persistent caches.
2. **In-Memory Cache (Read-Only Tools):**
   - Exchanged downstream API tokens for read-only tools are cached purely in-process (in-memory LRU + expiration, max TTL 5 minutes).
   - If an in-memory cache misses on a multi-replica deployment, the server simply performs a fresh exchange without functional degradation.
3. **Sensitive Write Bypass (`order:write`):**
   - Write/trading operations (e.g., placing or modifying orders) intentionally **bypass the in-memory token cache**.
   - Each write tool invocation triggers a real-time token exchange against the authorization server, ensuring instant revocation enforcement if the session was revoked upstream.

### 3.4 Downstream Delegation via RFC 8693 Token Exchange

To bridge MCP clients to downstream platform APIs without violating security specifications or leaking closed-source boundaries:

1. **Why RFC 8693 Token Exchange:**
   - **Prohibition of Token Passthrough:** The MCP specification and OAuth 2.0 security standards strictly prohibit blindly passing the client's MCP access token (`aud=https://www.tqx.trade/mcp`) to downstream resource servers (`aud=https://www.tqx.trade/api`), avoiding the "Confused Deputy" vulnerability.
   - **Open-Source vs. Closed-Source Clean Boundary:** `tqx-ts` is a public repository. The MCP server must communicate with upstream authorization and downstream APIs via standard, public RFC-compliant interfaces, without containing internal VPC IPs, closed-source repo paths, or private cluster trust headers.
2. **Exchange Mechanism:**
   - When executing tools that query downstream APIs, `mcp-server` acts as a **Confidential Client** to `tqx-oauth`.
   - It issues an RFC 8693 request to `POST /oauth/token` with:
     - `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
     - `subject_token=<incoming MCP access token>`
     - `subject_token_type=urn:ietf:params:oauth:token-type:access_token`
     - `resource=https://www.tqx.trade/api`
   - Client authentication uses standard RFC 7523 `private_key_jwt` (with the private key mounted via deployment secrets) or `client_secret_basic`.
3. **Downstream API Dispatch:**
   - The exchanged short-lived token is used by the MCP package's independent gateway client to invoke:
     - **Java Research Gateway:** For quant analysis, backtests, workflows, and market data.
     - **Trading Gateway:** For portfolio, order, and position operations.
4. **Least Privilege & Auditability:**
   - Exchanged tokens downscope scopes to only those required by the specific tool.
   - Preserves actor audit trails (`act` claim) identifying that the invocation was performed by the configured exchange client on behalf of the user.

---

## 4. Schema Definition and Type Checking (Valibot)

In alignment with workspace standards (which utilize Valibot in `@tqx-ai/sdk`), this package enforces **Valibot** exclusively:

1. **Tool Input Schemas:**
   - Define parameter schemas using Valibot constructs (`v.object`, `v.string`, `v.number`, `v.optional`, etc.).
   - Convert Valibot schemas to standard JSON Schema format required by MCP tools using `@valibot/to-json-schema`.
2. **Payload Validation:**
   - Register tool input schemas with `toStandardJsonSchema()` and let `McpServer.registerTool` validate arguments with Valibot before invoking the handler. Use `v.safeParse()` or `v.parse()` for query parameters and configuration blocks outside that flow.
   - Follow the SDK's documented error semantics: tool argument validation failures return tool results with `isError: true` and clear issue descriptions. Protocol-level failures, such as unknown tools or malformed requests, use JSON-RPC errors. Do not override `tools/list` or `tools/call` just to change standard tool validation errors into `-32602` responses.
3. **No Zod Dependency:**
   - The official MCP TS SDK v2 is schema-agnostic or supports pluggable adapters; do not bring in `zod` as an indirect dependency for tool schemas.

---

## 5. Runtime & Cross-Environment Compatibility

While the server is launched and executed using **Bun v1.4.4+**, the codebase must strictly maintain cross-compatibility with **Node.js 26** and **TypeScript 7**:

### 5.1 Standard Web APIs First

- Base all HTTP logic on standard Web APIs: `fetch`, `Request`, `Response`, `Headers`, `ReadableStream`, `WritableStream`, `TransformStream`, and `crypto`.
- **Do not** use Bun-proprietary APIs (`Bun.file`, `Bun.serve` directly in business logic, `bun:sqlite`, etc.) in shared server code.
- Hono serves as the platform abstraction layer, enabling the service to run on Bun natively (`export default app` or `Bun.serve`) while remaining fully runnable on Node.js 26 via `@hono/node-server`.

### 5.2 TypeScript 7 Strictness

- Adhere to TS 7 syntax standards: strict type-checking (`"strict": true`), pure ESM (`"type": "module"`), `NodeNext` or `Bundler` module resolution.
- Avoid deprecated TypeScript constructs, legacy experimental decorators, or non-standard type assertions.
- Use explicit type imports (`import type { ... } from '...'`) to guarantee zero runtime overhead and clean compilation.

### 5.3 Node.js 26 Forward Compatibility

- Use standard ESM import paths with no platform-specific hacks.
- Ensure dependency resolution and packaging work cleanly when imported or packaged into Node.js 26 container environments.

---

## 6. Implementation Blueprint (Phased Roadmap)

When implementation begins, development should proceed through the following phases:

### Phase 1: Hono & MCP SDK v2 Setup

- Initialize the Hono application router.
- Mount `@modelcontextprotocol/hono` transport middleware on the designated endpoint (e.g. `/mcp` or `/api/mcp`).
- Configure health checks (`/healthz`) and metadata endpoints.

### Phase 2: Streamable HTTP & Multi-Session Engine

- Implement session creation, heartbeat, and connection pool management.
- Ensure concurrent client requests receive dedicated streaming handles without cross-client pollution.
- Add graceful shutdown handling (closing active client streams, abort signals propagation).

### Phase 3: Valibot Schema Adapter & Tool Registry

- Implement a lightweight adapter converting Valibot schemas to MCP-compatible JSON Schemas via `@valibot/to-json-schema`.
- Build a modular Tool Registry where tools register their name, description, Valibot schema, and execution handler. All public tool names must start with `tqx_`; keep tool references in descriptions, prompts, docs, and tests synchronized.
- Implement gateway clients, types, Valibot schemas and errors inside this package. Do not import `@tqx-ai/sdk` or `@tqx-ai/cli`, including type-only or relative source imports.

### Phase 4: RFC 8693 Token Exchange & Upstream Forwarding

- Implement the RFC 8693 Token Exchange client interfacing with `tqx-oauth` (`grant_type=urn:ietf:params:oauth:grant-type:token-exchange`).
- Implement the in-memory token cache (LRU + TTL <= 5 min) for read-only tools and cache-bypass logic for `order:write` tools.
- Configure the independent MCP gateway client with the exchanged API tokens to invoke downstream endpoints.
- Add rate limiting and maximum concurrency guards per client connection.
- Verify execution under Bun v1.4.4+, and execute compatibility checks against Node.js 26 and TypeScript 7 compiler checks (`tsc --noEmit`).

---

## 7. Strict Rules and Prohibitions

1. **NO External Databases:** Strictly do NOT connect to Redis, MongoDB, MySQL, PostgreSQL, or any external datastores. The MCP server must remain an ultra-lightweight, stateless forwarding service.
2. **NO Token Passthrough:** Incoming MCP tokens (`aud=https://www.tqx.trade/mcp`) must never be forwarded directly to downstream resource servers. Always exchange them for short-lived API tokens (`aud=https://www.tqx.trade/api`) via RFC 8693.
3. **NO MCP SDK v1:** Never import from legacy `@modelcontextprotocol/sdk` v1 packages. Use official v2 packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/hono`).
4. **NO Zod:** Do not introduce `zod`. Keep the bundle light and coherent by using `valibot`.
5. **NO Runtime Lock-In:** Core business logic, tool handlers, and stream processing must not rely on proprietary `Bun.*` runtime namespaces.
6. **NO Global State Leaks:** Remote servers serve concurrent users; any mutable state must be tied to a request/session context.
7. **Open-Source Boundary Hygiene:** `tqx-ts` is a public repository. Committed code must never reference internal private IPs, closed-source repository internals, or proprietary internal cluster headers. All external interactions must go through standard public HTTP/OAuth interfaces.
8. **Forwarding Only:** Business domain logic, persistence, and trading execution belong to upstream services. The MCP server must only validate, translate, and stream.
9. **Specification Compliance:** Always align wire protocol messages with MCP Specification `2026-07-28`.
10. **Utility Organization:** Place reusable helper functions in `src/utils/`, grouped by purpose. Keep configuration assembly and OAuth-specific behavior in their owning modules.

## 8. Current Trading Implementation

Trading is opt-in through the four runtime values in `.env.example`. The public
trading token audience is separately configured (normally `/openapi`); do not
reuse the older generic `/api` examples above as a deployment contract. Only
HTTP Basic confidential-client authentication is implemented for exchange.
Research gateway integration remains future work. See [README.md](README.md) for
the implemented contracts, read-cache revocation window, and validation limits.
CLI and SDK packages must remain independent and unchanged by MCP implementation
work.
