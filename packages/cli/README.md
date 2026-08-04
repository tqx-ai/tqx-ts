# @tqx-ai/cli

Command-line client for the TQX Open API. It requires Node.js 22.18 or newer.

## Installation

```bash
npm install --global @tqx-ai/cli@0.1.5
tqx --version
```

## Authentication

Provide an API key for the current process:

```bash
TQX_API_KEY=sk-example-xxxxxxxxxxxxxxxx tqx status
```

Or store it in the system keychain or user configuration:

```bash
tqx login --api-key=sk-example-xxxxxxxxxxxxxxxx
tqx status
tqx balance
```

Passing a secret on the command line can save it in shell history. Prefer `TQX_API_KEY` when that
is a concern.

Use `tqx --help` to list commands. Human-readable output is colored by default; use `--plain` for
uncolored text or `--json` for machine-readable output.

## License

GNU General Public License v3.0.
