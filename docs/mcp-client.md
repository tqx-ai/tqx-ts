# Connecting an agent to the hosted TQX MCP service

This document describes the public client workflow. The MCP service is unreleased and its
external HTTPS endpoint and public plugin distribution have not been confirmed. This page is
not an installable plugin or evidence that a public service is ready. Do not guess an endpoint.

## Choose the connection you need

- **MCP:** use a supported agent host's remote MCP/plugin connection and its native OAuth flow.
  Ordinary OAuth does not require installing the TQX CLI, creating a Python environment or
  supplying an API Key. The host manages the login interaction and its OAuth credentials.
- **CLI/SDK:** follow [INSTALL.md](../INSTALL.md) and the existing API-key instructions. These
  mature clients have their own workflows; do not require an MCP user to complete CLI login.
- A separately supplied MCP Key is an optional authorization constraint, not a substitute for
  login and not a required step for ordinary research OAuth.

Research authorization identifies the current user. Trading authorization additionally selects
an owned trading Agent/account; the user must see the Agent name, PAPER/LIVE account type and
masked account identifier before approval. Request only the capabilities needed for the task.

## Installation and acceptance sequence

1. Obtain the verified endpoint, target environment and versioned client package from TQX.
   Identify the actual agent host and use its supported plugin or remote MCP mechanism. A CNB
   source-repository URL is not an MCP endpoint.
2. Preserve unrelated host configuration and existing credentials. Select local, test or prod
   explicitly and do not infer an environment from an unfamiliar URL.
3. Start one native OAuth flow. While the user is deciding, keep the state pending. Opening the
   browser or writing configuration does not prove authorization. Do not approve on the user's
   behalf, create a hidden API Key or start another login to work around a pending flow.
4. Observe the real outcome and continue that flow. Distinguish denial, cancellation, actual
   expiry, missing permission and unavailable services. A dependency failure must not be
   presented as an invalid password or a reason to overwrite credentials.
5. Have the target host load the plugin. In a new actual conversation, discover its tools and
   perform an explicitly authorized read. For trading, use the available account/position read
   tools and verify the authorized account identity and actual data freshness.
6. Report configuration, authorization, tool discovery and successful read separately. A raw
   HTTP/CLI probe, health check or callback page does not prove that the host conversation can
   call the plugin. Do not perform a write as part of a READ acceptance check.

If the host needs a reload or user interaction, say exactly which step is pending. Never fill a
missing tool response with invented empty account data. Reopening a conversation with valid
authorization should not require a new login; failures need diagnosis before credentials change.

## Public plugin format

Use the [Agent Plugins 1.0 format](https://agent-plugins.org/specification): root `plugin.json`,
optional `skills/`, and `mcp.json`. A remote entry uses `streamable-http` with the verified URL.
Non-loopback endpoints require HTTPS. Package credentials, private network addresses, machine
paths and internal service configuration must not be included. Portable MCP configuration does
not define inline OAuth/scopes fields; authorization discovery and storage belong to the host.

Host-specific presentation belongs in its declared extension namespace. Format validation is
separate from real host loading and conversation-level acceptance. Publish one current MCP
connection workflow rather than old read-only packages, legacy MCP profiles or transition shims.

See [repository boundaries](./repository-boundaries.md) for source ownership. Public client
artifacts must be usable without access to the private service repository.
