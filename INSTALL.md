# TQX CLI and Skills installation protocol for agents

Command: `tqx`. Releases: `https://github.com/tqx-ai/tqx-ts/releases` (standalone binaries plus
`SHA256SUMS`). npm fallback package: `@tqx-ai/cli` (needs Node.js 22.18+). API keys:
`https://www.tqx.ai/user-center?tab=agents`.

This file is the single source for installing, updating, verifying, and repairing the TQX CLI and
the four TQX Skills. It is
written for the agent that runs the commands. Follow it top to bottom; do not look for installation
steps in other TQX files while you are inside this workflow. When the CLI is ready, return to the
Skill that sent you here (`tqx-trading` for accounts and orders, `tqx-research` for Qube).

## Rules

- Run every command yourself, from your own execution context. Do not tell the user to open a
  terminal, and do not ask the user to run commands, unless your environment cannot run them at all
  (see **Restricted environments**).
- Do not install Node.js, npm, Homebrew, or any other tool just to install `tqx`. The standalone
  binary needs nothing but `curl`.
- Do not use `sudo`, and do not change ownership or permissions of system directories.
- Do not download a release asset over an existing installation. An installed `tqx` is upgraded with
  `tqx self-update`, which verifies checksums and detects how it was installed.
- Do not use `npx`, `pnpm dlx`, or `bunx` unless the user explicitly asks for a temporary runner.
- Do not open a browser for any step.
- Never print, log, or write the full API key anywhere except the `tqx login --api-key=...` command.
- Do not blame the API key until the CLI has actually started and returned an API error. Shell errors
  such as `command not found` happen before any request is sent.
- Run each command, read its output and exit code, and only then continue. Do not report success for
  a step you did not observe.

## Restricted environments

If your sandbox or approval policy blocks network access, writes under the user's home directory,
or running downloaded binaries, request permission (escalation) for the blocked command instead of
switching to a different install method. Before asking, tell the user exactly what installation
does:

- downloads one binary and `SHA256SUMS` from `github.com/tqx-ai/tqx-ts/releases`;
- writes `~/.local/bin/tqx` (`%USERPROFILE%\.local\bin\tqx.exe` on Windows);
- installs or updates the four TQX Skills in this agent's global Skills directory (for example
  `~/.claude/skills`), moving any outdated copy to `~/.tqx/skills-backup/`;
- appends one `PATH` line to the user's shell startup file (the user `Path` on Windows);
- stores the API key in the OS keychain, or in `~/.config/tqx/credentials.json` when no keychain is
  usable;
- connects to `www.tqx.trade` to check status and read the account.

If the environment can never run these commands, give the user the exact commands from step 2 and
wait for each result before continuing.

## Step 1: Inspect

POSIX (macOS, Linux):

```sh
command -v tqx && tqx --version
uname -sm
echo "$SHELL"
```

PowerShell (Windows):

```powershell
Get-Command tqx -ErrorAction SilentlyContinue
if (Get-Command tqx -ErrorAction SilentlyContinue) { tqx --version }
$env:PROCESSOR_ARCHITECTURE
```

Then choose exactly one path:

| What you observed                                              | Do this                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `tqx --version` prints a version                               | Go to **Step 4: Update**, then **Step 5** (Skills). Do not reinstall. |
| No `tqx`; macOS (arm64 or x64) or Linux (x64 or arm64/aarch64) | **Step 2A**                                                           |
| No `tqx`; Windows x64 (`AMD64`)                                | **Step 2B**                                                           |
| No `tqx`; Windows ARM64, or any other OS/CPU                   | **Step 3: npm fallback**                                              |
| `tqx` exists but fails to start                                | Find the symptom in **Troubleshooting**                               |

Release assets are named `tqx-v<version>-<os>-<arch>` with `<os>` in `macos`, `linux`, `windows`
and `<arch>` in `x64`, `arm64`. Windows assets end in `.exe`. Each binary also has a smaller `.gz`
copy. There is no Windows ARM64 binary.

## Step 2A: Install the standalone binary on macOS or Linux

Run this block as one command. It resolves the latest version without the GitHub API (no rate
limit), picks the asset for this machine, verifies the checksum, installs to `~/.local/bin`, and
persists `PATH` for future shells. Running it twice is safe.

```sh
set -eu
URL=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/tqx-ai/tqx-ts/releases/latest)
VERSION=${URL##*/v}
case "$(uname -s)" in Darwin) OS=macos ;; Linux) OS=linux ;; *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;; esac
case "$(uname -m)" in x86_64|amd64) ARCH=x64 ;; arm64|aarch64) ARCH=arm64 ;; *) echo "unsupported CPU: $(uname -m)" >&2; exit 1 ;; esac
ASSET="tqx-v${VERSION}-${OS}-${ARCH}"
BASE="https://github.com/tqx-ai/tqx-ts/releases/download/v${VERSION}"
TMP=$(mktemp -d)
curl -fL --retry 2 -o "$TMP/$ASSET.gz" "$BASE/$ASSET.gz"
curl -fsSL -o "$TMP/SHA256SUMS" "$BASE/SHA256SUMS"
if command -v sha256sum >/dev/null 2>&1; then SUM="sha256sum"; else SUM="shasum -a 256"; fi
(cd "$TMP" && grep " $ASSET.gz\$" SHA256SUMS | $SUM -c -)
mkdir -p "$HOME/.local/bin"
gunzip -c "$TMP/$ASSET.gz" > "$HOME/.local/bin/tqx"
chmod +x "$HOME/.local/bin/tqx"
rm -rf "$TMP"
case "${SHELL##*/}" in
  zsh) RC="$HOME/.zshrc" ;;
  bash) if [ "$OS" = macos ]; then RC="$HOME/.bash_profile"; else RC="$HOME/.bashrc"; fi ;;
  *) RC="$HOME/.profile" ;;
esac
grep -qs '\.local/bin' "$RC" || printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$RC"
export PATH="$HOME/.local/bin:$PATH"
echo "installed $ASSET to $HOME/.local/bin/tqx; PATH persisted in $RC"
tqx --version
```

For example, on Apple Silicon with release `v0.6.0` the block downloads
`https://github.com/tqx-ai/tqx-ts/releases/download/v0.6.0/tqx-v0.6.0-macos-arm64.gz`; on Linux
aarch64 it downloads `tqx-v0.6.0-linux-arm64.gz`. If the user's shell is fish, also run
`fish_add_path ~/.local/bin`.

Your tool may start every command in a fresh shell. If a later command says `tqx: command not
found`, prefix it with `export PATH="$HOME/.local/bin:$PATH";` or call `~/.local/bin/tqx` directly.
Then go to **Step 5**.

## Step 2B: Install the standalone binary on Windows x64

Run this block in PowerShell as one command:

```powershell
$ErrorActionPreference = 'Stop'
$url = curl.exe -fsSLI -o NUL -w '%{url_effective}' https://github.com/tqx-ai/tqx-ts/releases/latest
$version = $url.Split('/')[-1].TrimStart('v')
$asset = "tqx-v$version-windows-x64.exe"
$base = "https://github.com/tqx-ai/tqx-ts/releases/download/v$version"
$binDir = Join-Path $HOME '.local\bin'
New-Item -ItemType Directory -Force $binDir | Out-Null
$tmp = Join-Path $env:TEMP $asset
curl.exe -fL --retry 2 -o $tmp "$base/$asset"
$line = (curl.exe -fsSL "$base/SHA256SUMS") -split "`n" | Where-Object { $_ -match "\s$([regex]::Escape($asset))$" }
$expected = ($line -split '\s+')[0]
if ((Get-FileHash $tmp -Algorithm SHA256).Hash -ne $expected) { throw "SHA256 mismatch for $asset" }
Move-Item -Force $tmp (Join-Path $binDir 'tqx.exe')
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$binDir*") { [Environment]::SetEnvironmentVariable('Path', "$userPath;$binDir", 'User') }
$env:Path = "$binDir;$env:Path"
tqx --version
```

With release `v0.6.0` this downloads
`https://github.com/tqx-ai/tqx-ts/releases/download/v0.6.0/tqx-v0.6.0-windows-x64.exe`. Then go to
**Step 5**.

## Step 3: npm fallback

Use this only when no standalone binary exists for the platform (Windows ARM64, other CPUs) or the
standalone install failed for a reason the troubleshooting table cannot fix. It requires Node.js
22.18 or newer to be installed already:

```sh
node --version
npm view @tqx-ai/cli version
npm install --global @tqx-ai/cli@<version printed above>
tqx --version
```

Pin the exact version you resolved, for example `npm install --global @tqx-ai/cli@0.6.0`. If Node.js
is missing or older than 22.18, stop and tell the user that this platform needs Node.js 22.18+;
installing Node.js is the user's decision. Use `pnpm add --global` or `bun add --global` only when
that is the user's chosen package manager. If npm fails with `EACCES`, see **Troubleshooting**.
Then go to **Step 5**.

## Step 4: Update an existing installation

Updating TQX always means updating both the CLI (this step) and the TQX Skills (Step 5), even when
the user only said "update tqx".

```sh
tqx self-update --check --json
```

If `update_available` is `true`, run `tqx self-update`, then `tqx --version`. If the user asked for a
specific release or a rollback, run `tqx self-update --version=<version>`. Never update in the middle
of placing, modifying, or cancelling orders. If the check fails, find the message in
**Troubleshooting**; a CLI that already runs stays usable, so report that the latest version could not
be checked and continue. Then go to **Step 5**.

## Step 5: Install the TQX Skills

The four TQX Skills (`tqx-data`, `tqx-research`, `tqx-trading`, `what-is-tqx`) tell future sessions
how to use TQX. Install them as part of every TQX setup, even when the user only mentioned the CLI.
A Skill you read from a URL in this conversation is not installed: it is gone in the next session.
Do this step before asking for an API key, so it is done even if the user has no key yet.

1. Identify the agent product you are running in from your own system prompt or tool names, and
   pick its global Skills directory. If you cannot tell, or your agent is not listed, ask the user
   which agent this is. Do not guess, and do not install into several directories.

   | You are running in                                          | Global Skills directory                                                  |
   | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
   | Claude Code (terminal, desktop app Code tab, IDE extension) | `~/.claude/skills` (`$CLAUDE_CONFIG_DIR/skills` if that variable is set) |
   | Codex (CLI, IDE extension, ChatGPT desktop app)             | `~/.agents/skills`                                                       |
   | Cursor                                                      | `~/.cursor/skills`                                                       |
   | Gemini CLI                                                  | `~/.gemini/skills`                                                       |
   | OpenCode                                                    | `~/.config/opencode/skills` (`$XDG_CONFIG_HOME/opencode/skills` if set)  |
   | CodeBuddy                                                   | `~/.codebuddy/skills`                                                    |
   | Trae                                                        | `~/.trae/skills`                                                         |

   On Windows, `~` is `%USERPROFILE%`.

2. Run the block for your OS with `DIR` set to that directory. It downloads the current `main` of
   the TQX repository (no Node.js needed) and syncs each of the four Skills: a missing Skill is
   installed, an identical one is left alone, and an outdated or edited one is replaced with the
   latest version after its previous copy is moved to `~/.tqx/skills-backup/<timestamp>/`. Running it
   again is safe and only creates a backup when something changed.

   macOS or Linux:

   ```sh
   set -eu
   DIR="$HOME/.claude/skills"   # the directory from the table
   BACKUP="$HOME/.tqx/skills-backup/$(date +%Y%m%d-%H%M%S)"
   TMP=$(mktemp -d)
   curl -fsSL --retry 2 -o "$TMP/tqx-ts.tar.gz" https://codeload.github.com/tqx-ai/tqx-ts/tar.gz/refs/heads/main
   tar -xzf "$TMP/tqx-ts.tar.gz" -C "$TMP"
   mkdir -p "$DIR"
   for s in tqx-data tqx-research tqx-trading what-is-tqx; do
     NEW="$TMP/tqx-ts-main/skills/$s"
     if [ ! -e "$DIR/$s" ]; then
       cp -R "$NEW" "$DIR/$s"; echo "installed $DIR/$s"
     elif diff -rq -x __pycache__ -x .DS_Store "$NEW" "$DIR/$s" >/dev/null 2>&1; then
       echo "up to date $DIR/$s"
     else
       mkdir -p "$BACKUP"; mv "$DIR/$s" "$BACKUP/$s"; cp -R "$NEW" "$DIR/$s"
       echo "updated $DIR/$s (previous copy saved in $BACKUP/$s)"
     fi
   done
   rm -rf "$TMP"
   ls "$DIR"/*/SKILL.md
   ```

   Windows PowerShell:

   ```powershell
   $ErrorActionPreference = 'Stop'
   $dir = Join-Path $HOME '.claude\skills'   # the directory from the table
   $backup = Join-Path $HOME (".tqx\skills-backup\" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
   $tmp = Join-Path $env:TEMP "tqx-skills-$PID"
   New-Item -ItemType Directory -Force $tmp | Out-Null
   curl.exe -fsSL --retry 2 -o "$tmp\tqx-ts.tar.gz" https://codeload.github.com/tqx-ai/tqx-ts/tar.gz/refs/heads/main
   tar.exe -xzf "$tmp\tqx-ts.tar.gz" -C $tmp
   New-Item -ItemType Directory -Force $dir | Out-Null
   function Get-TreeHash($root) {
     $root = (Resolve-Path $root).Path
     Get-ChildItem $root -Recurse -File | Where-Object { $_.FullName -notmatch '\\__pycache__\\' } |
       ForEach-Object { $_.FullName.Substring($root.Length) + ' ' + (Get-FileHash $_.FullName).Hash } | Sort-Object
   }
   foreach ($s in 'tqx-data', 'tqx-research', 'tqx-trading', 'what-is-tqx') {
     $new = Join-Path $tmp "tqx-ts-main\skills\$s"
     $dest = Join-Path $dir $s
     if (-not (Test-Path $dest)) { Copy-Item -Recurse $new $dest; "installed $dest" }
     elseif (-not (Compare-Object (Get-TreeHash $new) (Get-TreeHash $dest))) { "up to date $dest" }
     else {
       New-Item -ItemType Directory -Force $backup | Out-Null
       Move-Item $dest (Join-Path $backup $s); Copy-Item -Recurse $new $dest
       "updated $dest (previous copy saved in $backup\$s)"
     }
   }
   Remove-Item -Recurse -Force $tmp
   Get-ChildItem $dir -Filter SKILL.md -Recurse | Select-Object -ExpandProperty FullName
   ```

3. Report each Skill as installed, up to date, or updated. For an updated Skill, tell the user where
   the previous copy was saved, so any personal edits can be copied back. Never delete a backup.
4. Skills load when a session starts. Tell the user that a new session will have the TQX Skills; the
   current session continues with the files you have already read.

If the user explicitly prefers a Skills manager, `npx skills add tqx-ai/tqx-ts --skill tqx-data
--skill tqx-research --skill tqx-trading --skill what-is-tqx --agent <agent> --global --yes` is
equivalent (it needs Node.js). Then go to **Step 6**.

## Step 6: Authenticate

```sh
tqx status --json
```

A healthy response has `"status": "ok"`. If `authenticated` is `true`, skip to **Step 7**.

If `authenticated` is `false` and the user gave an API key in the conversation, log in with it
yourself and check again:

```sh
tqx login --api-key=<the key the user gave>
tqx status --json
```

`tqx login` saves the key in the OS keychain (or `~/.config/tqx/credentials.json`), so later sessions
do not need it again. Use the process variable `TQX_API_KEY` instead only for a one-off isolated task
or when the user does not want the key stored. Never repeat the full key in replies.

If there is no key, ask the user to sign in at `https://www.tqx.ai/user-center?tab=accounts`, create a
competition instance at `https://www.tqx.ai/user-center?tab=agents`, and paste the generated API key
into the conversation.

## Step 7: First connection check

For trading tasks, run both read-only queries and report the real values (account mode `PAPER` or
`LIVE`, funds, holdings, `as_of`, `is_stale`):

```sh
tqx trading account --json
tqx trading positions --json
```

For Qube research tasks, run a read-only listing such as `tqx research factor list --market=hk --json`.
Continue the rest of the task with `tqx-trading` or `tqx-research`.

## Troubleshooting

Match the exact message first. Fix the cause, then re-run only the step that failed. When the binary
is already in place, repair it; do not download it again.

| Symptom                                                                                        | Meaning                                                                                                                                                    | Fix                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Permission denied` when running `~/.local/bin/tqx`                                            | The file was downloaded without the executable bit                                                                                                         | `chmod +x ~/.local/bin/tqx`, then `tqx --version`. Do not download again.                                                                                                                                                                                                                                                          |
| `curl: (22) ... 404` while downloading a release asset                                         | The asset name or version in the URL is wrong (for example `darwin` instead of `macos`, or a missing `v`)                                                  | Assets are `tqx-v<version>-<os>-<arch>[.exe][.gz]` with `<os>` in `macos`, `linux`, `windows`. Run the Step 2A or 2B block, which builds the correct name.                                                                                                                                                                         |
| `command not found: tqx` right after installing, or in a new session                           | `~/.local/bin` is not on this shell's `PATH`                                                                                                               | Check `ls -l ~/.local/bin/tqx`. If it exists, do not reinstall: run `export PATH="$HOME/.local/bin:$PATH"`, and make sure the startup file (`~/.zshrc` for zsh, `~/.bashrc` for Linux bash, `~/.bash_profile` for macOS bash) contains `export PATH="$HOME/.local/bin:$PATH"`; append it if missing. Then `tqx --version`.         |
| `sh: tqx: command not found` (exit 127) from `npx`/`bunx`/`pnpm dlx` inside a project          | The temporary runner did not put the binary on `PATH`, which happens inside npm/Bun workspaces. The CLI never started; this says nothing about the API key | Install globally (Step 1 to 3) and call `tqx` directly. If a temporary runner is required, run it from outside the workspace: `(cd /tmp && npx --yes @tqx-ai/cli@<version> status --json)`.                                                                                                                                        |
| `npm ERR! code EACCES` / `permission denied` under `/usr/lib/node_modules` or `/usr/local/lib` | npm's global prefix is a system directory                                                                                                                  | Do not use `sudo`. Prefer the standalone binary (Step 2A/2B). If npm is required: `npm config set prefix "$HOME/.local"`, then repeat the npm install; the binary lands in `~/.local/bin`.                                                                                                                                         |
| `npm ERR! 404` for `@tqx-ai/cli`                                                               | The registry in use does not serve the package                                                                                                             | Run `npm config get registry`; it should be `https://registry.npmjs.org/`. Do not guess a private registry. Prefer the standalone binary.                                                                                                                                                                                          |
| `Update check failed with HTTP 403. GitHub API rate limit exhausted`                           | Anonymous GitHub API quota is used up (common on shared IPs and CI)                                                                                        | If a GitHub token is available, pass it: `GH_TOKEN="$TOKEN_VAR" tqx self-update` (the CLI also reads `GITHUB_TOKEN`). Otherwise wait until the reset time in the message. The installed CLI keeps working meanwhile.                                                                                                               |
| `Unable to check for updates. The Node.js fetch client does not automatically use HTTPS_PROXY` | The update check needs a proxy that this runtime ignores                                                                                                   | Use the standalone binary, which does not have this limitation, or retry later from a network without the proxy. Continue the task with the installed CLI.                                                                                                                                                                         |
| `This CLI is running from a temporary npx/bunx/pnpm dlx cache`                                 | `self-update` cannot update a temporary runner                                                                                                             | Install the CLI globally (Step 1 to 3).                                                                                                                                                                                                                                                                                            |
| `Unable to determine the pnpm global bin path`                                                 | pnpm's global bin directory is not configured                                                                                                              | Run `pnpm setup`, then reload the shell (`source ~/.zshrc`, or start a new session), then `tqx self-update` again.                                                                                                                                                                                                                 |
| `Yarn Berry does not support global add`                                                       | Yarn 2+ cannot install global packages                                                                                                                     | Use the standalone binary (Step 2A/2B).                                                                                                                                                                                                                                                                                            |
| `"pending_restart": true` from `tqx self-update --json` (Windows)                              | The running `tqx.exe` cannot be replaced while in use; a helper swaps it after the process exits                                                           | This is expected. Run `tqx --version` in a new PowerShell process; it should print `latest_version`. Do not download the binary manually.                                                                                                                                                                                          |
| `SHA256 checksum mismatch`                                                                     | The download was corrupted or intercepted                                                                                                                  | Delete the temporary file and run the install block again once. If it fails again, stop and report it; never skip verification.                                                                                                                                                                                                    |
| `Standalone updates are unavailable for <os>/<arch>` or no matching asset                      | No binary for this platform                                                                                                                                | Use Step 3 (npm fallback).                                                                                                                                                                                                                                                                                                         |
| `"authenticated": false` from `tqx status --json`                                              | No stored key and no `TQX_API_KEY`                                                                                                                         | Step 6: `tqx login --api-key=...` with the user's key, then `tqx status --json`.                                                                                                                                                                                                                                                   |
| `--api-key is required` (exit 2) from `tqx login`                                              | `login` never reads `TQX_API_KEY`                                                                                                                          | Pass the key explicitly: `tqx login --api-key=...`.                                                                                                                                                                                                                                                                                |
| `401 invalid_api_key` although `tqx login` worked before                                       | `TQX_API_KEY` in the environment overrides the stored login                                                                                                | Check `printenv TQX_API_KEY`. Retry without it: `env -u TQX_API_KEY tqx status --json`. If that works, `unset TQX_API_KEY` and remove the `export TQX_API_KEY=...` line from the shell startup file (ask before editing it if the user did not request the fix). Do not run `tqx logout`.                                          |
| `401 invalid_api_key` with no `TQX_API_KEY` set                                                | The stored key was rejected by this endpoint                                                                                                               | Report the `request_id`. Ask the user for a current key and run `tqx login --api-key=...` again. Do not claim the key expired; say it was rejected.                                                                                                                                                                                |
| `network_error` / `Unable to reach the TQX API`                                                | The API host is unreachable                                                                                                                                | Check `printenv TQX_BASE_URL`. A leftover `TQX_BASE_URL` points the CLI elsewhere: `unset TQX_BASE_URL` (and remove it from the startup file) for production, then `tqx status --json`. Without an override, check connectivity with `curl -sI https://www.tqx.trade`. This is not an authentication problem; do not log in again. |
| Warning that the keychain is unavailable during `tqx login`                                    | No usable OS keychain (common on headless Linux)                                                                                                           | Expected. The key was saved to `~/.config/tqx/credentials.json` with owner-only permissions. Continue.                                                                                                                                                                                                                             |
| Unknown flag or unknown command                                                                | Your instructions do not match the installed version                                                                                                       | Run `tqx --help` (and `tqx <command> --help`) and follow the installed CLI. Update with Step 4 if it is old.                                                                                                                                                                                                                       |

Exit codes: `0` success, `1` API, network, or protocol error, `2` usage or validation error.

If a reproducible CLI defect remains after these fixes, and the user asked you to report or fix it,
file it with `tqx bug report --title="<short title>" --desc="<steps, OS/arch, tqx --version, full
error JSON, request_id>" --json`; otherwise draft the report and ask first.

## Completion report

Finish with this report, using only values you observed:

- CLI: `tqx` version, install method (standalone or npm), and path (`command -v tqx`).
- PATH: which startup file was updated, or that no change was needed.
- Skills: the directory used; which of the four were installed, up to date, or updated, and the
  backup path for any updated one; that they load in a new session.
- Authentication: `authenticated` value from `tqx status --json`. Never include the key.
- First check: the account and positions summary (trading) or the listing result (research), or the
  exact error with `code`, `status`, and `request_id`.
- Next action: the next step of the user's task, or the single blocker and what is needed to clear
  it.
