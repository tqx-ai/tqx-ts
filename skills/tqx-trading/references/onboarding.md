# Trading connection and credentials

## Credentials

- Default to non-browser tools for TQX endpoints, API documentation, and links in this Skill: use the documented CLI, and when a direct HTTP request is required, use `curl`, `Invoke-RestMethod`, or another non-browser fetch client. Do not reach for a browser or browser-use capability on your own. Two exceptions: when the user explicitly asks to view something in a browser, and the documented last-resort fallback for the human-only Scalar docs page (see "Official API reference").
- Do not tell the user to open a terminal or run a command to configure an API key. Ask the user to provide the key directly in the current conversation when it is unavailable, then use it in the agent's current execution context. Acknowledge receipt without quoting it.
- Never echo the complete key in this or a later conversation, command output, logs, source code, repository files, or ordinary artifacts. Prefer `tqx login` to store the key in the CLI credential store so it persists across sessions and terminal restarts; use process-scoped `TQX_API_KEY` for a one-off or isolated task, or when the user does not want the key persisted.

## Get an API key

When the user does not have an API key, tell them to complete these steps in the TQX web app:

1. [Open AI accounts](https://www.tqx.ai/user-center?tab=ai-accounts). TQX currently supports live accounts from Huatai, Panda Securities, and Tiger, along with TQX simulation accounts.
2. Create a competition instance from the AI accounts page.

After the competition instance is created, ask the user to provide the generated API key directly in the current conversation. Do not ask them to paste it into source code, public logs, or a repository.

## Install or repair

Before any CLI task, and whenever `tqx` is missing, outdated, or failing before it returns API JSON, open [`references/install.md`](install.md) and follow it from Step 1. It has the copy-paste install commands for every platform, the update path, installing the four TQX Skills, authentication, the first connection check, and a symptom-to-fix troubleshooting table. Do not assemble installation steps from other sections or from memory. When this Skill was fetched from a URL, read the same protocol at `https://raw.githubusercontent.com/tqx-ai/tqx-ts/refs/heads/main/INSTALL.md`.

## Credential behavior

When the user provides an API key in the current conversation, directly use the key to complete the CLI authentication of the current task. Do not ask the user to open a terminal or repeat the setup in another context.
You must still avoid echoing the full key in replies, source code, repositories, or unnecessary logs. If the user only provides protected secrets/environment variables, they can also be used directly;
When login fails, report the error truthfully and request a new key or repair the operating environment.

Authentication methods must be distinguished by command:

- `TQX_API_KEY` is the current process-level credential and takes precedence over system keychain and local persistent credentials. It can be used for `status`, account/position/order/deal/signal query and trading operations.
- `login` does not read `TQX_API_KEY` to replace parameters, you must explicitly pass in `tqx login --api-key=<key>`; the CLI's persistent credential storage will be written after success.
- `logout` only deletes persistent credentials; if the current process still has `TQX_API_KEY` set, the CLI will continue to use it and prompt.
- When the environment variable method fails, the conclusion can only be limited to "the key is rejected under this process, version and endpoint", and cannot directly assert that the key has expired. Log the complete exit code, `message`, `code`, `status` and `request_id` in the JSON error, and verify that persistent credentials are not misused.

The recommended process-level calling form is:

```bash
TQX_API_KEY="$TQX_API_KEY_VALUE" tqx status --json
TQX_API_KEY="$TQX_API_KEY_VALUE" tqx trading account --json
```

Do not echo the full key in Skill replies, logs, or command output. When the user provides a complete key in the current controlled conversation, continue the task under the user's authorization and verify authentication; do not automatically cancel or interrupt the task. Rotate a key only when you confirm that it has appeared in conversations, logs, or files accessible to unauthorized personnel: configure and verify the replacement first, then revoke the old key so the agent is not interrupted without a working credential.

## Competition onboarding

When the user says "help me compete", "win the championship", "trading competition", "investment contest", or uses a similarly broad competition request, treat the first goal as verifying that the local agent can access the user's trading account. Treat the request as authorization to enter the competition and, after the competition scope is confirmed, to trade autonomously within that scope. Do not require per-order confirmation when the competition mandate already covers the order. Never trade outside the documented competition scope.

When the user requests CLI installation, account information, positions, and strategy construction in the same task, complete this onboarding checkpoint in order: install and verify the CLI, authenticate with the provided key, query both the account and positions, report the real returned data, and only then actively ask for the user's strategy preferences. Do not stop after authentication or ask about strategy before reporting the requested account snapshot.

1. Follow [`references/install.md`](install.md) to inspect, install or update, and verify the CLI and to install the TQX Skills.
2. Authenticate through the supported API-key flow, then run `tqx status --json` and require `authenticated: true`.
3. Run `tqx trading account --json` as the first account query. Report the actual account mode (`PAPER` or `LIVE`), funds and all other returned fields; mark `is_stale` explicitly.
4. If authentication or the account query fails, report the real error and help repair the connection. Do not claim that the agent is connected.
5. After a successful account query, tell the user that the agent can access the account. If the user requested positions, run `tqx trading positions --json` before replying. Report the actual account and position data, including `PAPER`/`LIVE`, funds, holdings, quantities, and `is_stale`/`as_of` fields when returned. Only after this snapshot has been reported should you ask for the missing competition or strategy boundaries. Use [`tqx-research`](../../tqx-research/SKILL.md) separately if the user requests Qube research or decision support.

Keep the initial connection check read-only. An account query alone is not authorization to place, modify, or cancel an order. A competition request plus a confirmed competition mandate is authorization to operate inside that mandate; later Qube output remains decision support and never expands the trading scope.
