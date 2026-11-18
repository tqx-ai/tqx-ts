# Research CLI setup and authentication

## Credentials

- Default to non-browser tools for Qube/TQX endpoints, API documentation, and links in this Skill: use `@tqx-ai/cli` or `@tqx-ai/sdk`, and when a direct HTTP request is required, use `curl`, `Invoke-RestMethod`, or another non-browser fetch client. Do not reach for a browser or browser-use capability on your own. Exceptions: when the user explicitly asks to view something in a browser, or as a last resort for a human-only documentation page that has no machine-readable equivalent obtainable by non-browser means.
- Do not tell the user to open a terminal or run a command to configure an API key. Ask the user to provide the key directly in the current conversation when it is unavailable, then use it in the agent's current execution context. Acknowledge receipt without quoting it.
- Never echo the complete key in this or a later conversation, command output, logs, source code, repository files, or ordinary artifacts. Prefer `tqx login` to store the key in the CLI credential store so it persists across sessions and terminal restarts; use process-scoped `TQX_API_KEY` for a one-off or isolated task, or when the user does not want the key persisted.

## Get an API key

For a research-only task, ask the user to create a key in
[Dev Settings](https://www.tqx.ai/user-center?tab=dev-settings) with the Research
permission. Research scopes are `research:read`, `research:write` and
`research:run`; they do not require a trading Agent binding, brokerage account or
competition instance. Use only the permissions needed by the task.

Use an available key directly. If none is configured, ask the user to provide it
in the current conversation or through the environment's protected secret input.
Do not ask them to put it in source code, public logs or a repository. Verify
access with a read-only listing for the requested market; a successful trading
account query does not prove research authorization.

## Install or repair

Before a CLI task, and whenever `tqx` is missing, outdated, or failing before it returns API JSON, open [`references/install.md`](install.md) and follow it from Step 1. It has the copy-paste install commands for every platform (the standalone binary needs no Node.js), the `tqx self-update` path, installing the four TQX Skills, authentication, and a symptom-to-fix troubleshooting table. Do not assemble installation steps from other files or from memory. When this Skill was fetched from a URL, read the same protocol at `https://raw.githubusercontent.com/tqx-ai/tqx-ts/refs/heads/main/INSTALL.md`.

## Product defects

When a reproducible TQX/Qube product defect is found during a coding-agent task, use the bug-report interface to proactively send a complete diagnostic report when the user has asked to investigate, fix, or report the defect. If the task does not authorize an external report, prepare the report and ask for confirmation before submitting it.

```text
tqx bug report --title="Short title" --desc="Steps to reproduce, environment, complete response, and request_id" --json
```

The command accepts a title and Markdown description. Do not add undocumented flags or fields.

Make the description as detailed as possible so developers can reproduce and fix the issue quickly. Include relevant input parameters and response fields with reproduction steps, environment and request ID. Remove credentials, personal information, source secrets and private storage paths before any report.
