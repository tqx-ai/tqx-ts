# CLI Guide

## Boundary

- The CLI owns Citty command definitions, global argument parsing, credential storage, output, and
  exit codes. It calls `TqxClient` methods and must not duplicate SDK endpoint paths, schemas,
  request-body mapping, or response-envelope decoding.
- Keep command implementation in `src/<domain>/command.ts`, common execution/authentication in
  `src/runtime/`, and presentation in `src/output.ts`. Do not put CLI-specific behavior in the SDK.

## Credentials And Configuration

- Resolve credentials through `resolveApiKey`; `TQX_API_KEY` has priority over the persisted key.
  Never echo a key, token, credential-file content, or secret in output, errors, tests, or docs.
- Runtime `TQX_BASE_URL` is passed to `TqxClient`. For Qube, users must supply or build with the
  `/pandaApi` gateway base; commands must not try to derive paths or authenticate with legacy
  Research sessions.
- Only expose a global flag when it changes runtime behavior. Parse, document, test, and pass every
  supported option to its consumer; remove obsolete configuration flags instead of silently
  ignoring them.

## Commands And Output

- Research commands are Qube resource commands: `factor`, `strategy`, and `backtest`. Do not add
  QuantFlow workflow, workflow import/export, or legacy wallet commands back to this branch.
- Use `CliUsageError` for invalid command input so the shared runtime returns exit code 2. Let typed
  SDK errors flow to the output layer for API/network/protocol failures.
- Preserve human, `--plain`, and `--json` output contracts. JSON output must be machine-readable;
  progress belongs on stderr and must not corrupt JSON stdout.
- Treat destructive commands deliberately: require `--yes` in non-interactive use, collect each
  positional ID exactly once, and test multiple IDs as well as a single ID.
- Keep command argument names camelCase to match current CLI conventions and map to SDK inputs;
  file reading, download destination handling, date normalization, and display-only result shaping
  remain CLI concerns.

## Tests

- Test commands through `runCli` with injected `fetch`, credential store, and output buffers.
  Assert the command's JSON/plain behavior, exit code, authentication source, and SDK-observable
  request mapping.
- Run focused CLI tests while changing commands and `bun run test` before handoff. Build artifacts
  are verified by the workspace smoke check; never edit `dist` directly.
