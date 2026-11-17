---
name: tqx-setup
description: Set up and diagnose the TQX MCP server for compatible Agent clients. Covers Streamable HTTP, OAuth discovery, Auto/CIMD/DCR registration, client metadata failures, post-auth verification, tqx_submit_bug_report, and the prepare_bug_report prompt. Do not use this Skill for CLI, tqx-data, research, or trading operations.
---

# TQX MCP Setup

## Scope

This Skill is the user-facing setup and diagnostics guide for the TQX MCP
server. It does not install or configure the TQX CLI, Python packages, API keys,
or local development tooling.

Keep the flow layered:

1. Agent client and plugin loading
2. Streamable HTTP transport
3. OAuth resource and authorization-server discovery
4. Client registration and authorization
5. MCP initialization and tool discovery
6. Domain routing to another Skill or MCP tool

Do not treat every failure as an authentication failure. Ask for the client name,
the failing URL, HTTP status, and the last completed step when the evidence is
insufficient.

## Authorization Flow

Recommend the client's `Auto` registration mode first. Treat `Auto` as a client
selection strategy, not as a separate OAuth protocol. The protocol-level paths
are CIMD and DCR.

Use this fallback order:

1. `Auto`
2. CIMD when the client can retrieve the public client metadata
3. DCR when CIMD retrieval or validation fails
4. A clear diagnostic report when both paths fail

Never ask the user to copy an access token, refresh token, client secret, or API
key into chat. Never ask the user to bypass TLS, disable Cloudflare, or weaken a
client security policy.

## Switching the AI Trading Account

Trading authorization is bound to the `agent_id` in the MCP access token. If a
user wants to switch to another AI trading account, the Agent client MUST remove
the currently stored MCP access token and refresh token before starting a new
authorization.

The client must then:

1. start a fresh OAuth authorization request;
2. request the required trading scopes, such as `trade:read` and `order:write`;
3. show the TQX consent page and let the user select the target AI trading account;
4. complete the callback and store the newly issued token pair; and
5. verify the resulting account before using a trading tool.

Refreshing a token, rotating a refresh token, reconnecting the MCP transport, or
disconnecting and reconnecting the server does not switch the bound account. A
refresh operation preserves the existing `agent_id`. If a client has no explicit
logout command, use its documented credential-removal or MCP reauthorization
flow; never ask the user to manually copy or edit token files.

The setup flow must not report that the account changed until the new consent
completed and a read-only trading call confirms the new authorized account.

## Client Metadata 403

If a client receives `403` while fetching a public `client.json`, classify the
failure as client metadata retrieval, not as a TQX account or password failure.

Ask for the exact failed URL before deciding that the MCP endpoint is blocked:

- `client.json` or another client metadata URL: use `Auto`, then switch to DCR.
- `https://www.tqx.ai/mcp`: diagnose MCP transport, endpoint policy, or resource
  authorization separately.

Do not tell the user to keep retrying the same CIMD request. Do not make the user
repair a provider-side WAF or manually construct client metadata.

## Post-Authorization Verification

Only report setup as complete after the client has:

- completed OAuth authorization;
- initialized the MCP session;
- listed or invoked a TQX MCP capability successfully; and
- received a response from the authorized session.

After successful authorization, tell the user that the authenticated MCP session
can use `tqx_submit_bug_report`. This tool submits a reproducible TQX product bug
report and does not require a trading permission or Agent binding, but it still
requires the authenticated MCP session.

The MCP server also exposes the `prepare_bug_report` prompt. Tell the user to
select it from the Agent client's prompt picker when available. The client should
insert the prompt into the Agent input area; the Agent then investigates ownership,
organizes the evidence, and calls `tqx_submit_bug_report` directly when the
evidence shows a TQX product issue. Do not stop at a draft when the prompt's
instructions require submission.

When reporting a submitted bug, preserve the returned status, bug ID, creation
time, request ID, and the exact title and Markdown description that were sent.

## Routing

- MCP connection, authorization, client metadata, or tool discovery: continue in
  this Skill.
- Account, positions, orders, fills, cash flows, or trading controls: use
  `tqx-trading`.
- Historical and reference market data through the local Python package: use the
  separate `tqx-data` Skill. It is not an MCP capability.
- Investment research, factor analysis, strategy creation, or backtesting: report
  that this plugin currently does not provide that capability. Do not invent an
  MCP tool or route the request to trading tools.
- CLI, SDK, or local package development: outside this plugin Skill.

## Response Format

For each diagnostic response, state:

1. current state;
2. evidence;
3. issue category;
4. one next action;
5. fallback path if that action fails.

Use the user's language for prose while preserving protocol names, URLs, tool
names, identifiers, request fields, and response values exactly.
