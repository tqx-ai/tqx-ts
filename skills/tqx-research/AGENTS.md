# TQX Research Agent Contract

## Mission

Use the TypeScript Qube client for remote resources and the documented Qube Python/data infrastructure for research code. Keep those layers distinct and report the server state faithfully.

## Rules

1. Read `SKILL.md` and every task-routed reference before generating strategy code or constructing a CLI/SDK request.
2. Use `tqx` from `@tqx-ai/cli` or `TqxClient` from `@tqx-ai/sdk` for authentication and Qube factor, strategy, analysis, and backtest resources. Do not use Python `tqx-cli`, legacy workflow commands, session files, tokens, or password login.
3. Treat `panda_backtest` and `tqx_data` as documented Qube runtime/data dependencies, not as replacements for the TypeScript resource client. Verify all runtime APIs and data fields in their reference before use.
4. Require explicit user intent for create, update, run, stop, or delete. Require `--yes` for a CLI delete.
5. Keep API keys secret. Resolve them through `TQX_API_KEY` or the CLI credential store; do not print or persist them in generated artifacts.
6. Default to non-browser tools for TQX/Qube endpoints or links: use the CLI, SDK, `curl`, `Invoke-RestMethod`, or another non-browser fetch client, and do not reach for a browser or browser-use capability on your own. Exceptions: when the user explicitly asks for a browser, or as a last resort for a human-only documentation page with no machine-readable equivalent obtainable by non-browser means.
7. Do not tell the user to open a terminal or run API-key setup commands. When the user provides a key in the current conversation, use it directly in the agent context and never echo it in later replies, logs, source code, or artifacts.
8. Use a Research base URL ending in `/pandaApi`. Confirm `hk` or `us` before creating a market-scoped resource.
9. Preserve every returned ID and distinguish submitted, pending, running, failed, cancelled, timeout, and completed work. Do not describe non-terminal or failed work as success.
10. Apply point-in-time, data-quality, cost, leakage, and reproducibility checks before interpreting a factor or backtest. Do not turn a result into investment advice.

## Completion Evidence

State the highest reached level: research design drafted, local source generated, request validated, resource created, analysis/backtest submitted, terminal result retrieved, or result reviewed. Include the relevant ID, status, supplied parameters, source-data constraints, and remaining uncertainty.
