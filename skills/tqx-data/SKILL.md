---
name: tqx-data
description: Use TQX Hong Kong and US stock data on the user's own computer through the `tqx-data` Python package and a TQX data account (closed beta). Covers installing the package in a dedicated environment, logging in once with the data account email and password so later tasks never ask again, and querying daily bars, FX, trading calendars, stock details, dividend/split and other corporate events, company fundamentals, consensus, financial statements, short interest, and the real-time tick stream. Use when users mention tqx-data, `pip install tqx-data`, a TQX data account or data membership, tqx_data outside Qube, or need data that Qube strategies cannot call. Do not use for Qube factors, strategies, or backtests (use tqx-research) or for trading accounts, balances, positions, or orders (use tqx-trading).
---

# TQX Data

## Access: closed beta

`tqx-data` is in closed beta. It needs a **TQX data account**: an email and password that come with a data membership. This account is separate from the trading API key used by `tqx login` and from Qube.

If the user has no data account, or a login reports `access_denied`, tell them that tqx-data is in closed beta and that Audrey ([audrey@tqx.ai](mailto:audrey@tqx.ai)) enables data memberships. Do not try to register an account on their behalf.

## System boundary

- This Skill runs the `tqx-data` package locally. Qube's built-in `tqx_data` in strategy source is a different build with a different method set and parameter names; route Qube work to [`tqx-research`](../tqx-research/SKILL.md). Do not copy local-only methods into Qube strategy code, and do not assume that a Qube method exists locally. See [Qube vs local tqx-data](references/qube-vs-local.md).
- Data supports research, verification, and the agent's own calculations. It is not trading authorization and not an order channel; route accounts and orders to [`tqx-trading`](../tqx-trading/SKILL.md).
- Default to non-browser tools. Do not open a browser for this Skill unless the user asks for one.

## Log in once, never ask again

The user should type the email and password once per computer. Every later task, conversation, or scheduled run logs in silently.

tqx-data 0.1.2 deletes its own session file whenever a Python process exits, so `tqx_data.init_token()` alone would need the password again in every new process. The bundled helper `scripts/tqx_data_auth.py` closes that gap:

- `login` verifies the credentials with the data service, then saves them in the operating system's credential store: macOS Keychain, Windows Credential Manager, or the Linux Secret Service. Without a usable keychain it writes `credentials.json` with mode 0600 in the data home, the same fallback the TQX CLI uses for API keys.
- `run` logs in from the saved credentials before executing the agent's code.

Rules:

- Ask for the email and password only when `status` or `run` exits with 3 (`not_logged_in`) or with 5 and `credentials_rejected`. On exit 1 (service or network failure), report the error and retry later; never ask for the password again because of it.
- Pass the credentials only on stdin to `login`. Never put them in command arguments, environment variables, source code, files, logs, commit messages, or replies. Acknowledge receipt without repeating them.
- Do not call `tqx_data.init_token()` yourself, do not set `DEFAULT_USERNAME` or `DEFAULT_PASSWORD`, and do not store the credentials anywhere else.
- Run `logout` only when the user asks to sign out or switch accounts.

## Workflow

Resolve the absolute path of `scripts/tqx_data_auth.py` in this Skill's directory; the steps below call it `AUTH`. Invoke it with any Python 3.8 or later (`python3` on macOS and Linux, `py -3` on Windows). Every subcommand except `setup` switches into the dedicated environment by itself. Results are JSON on stdout, and errors are JSON on stderr.

### 1. Check the state

```bash
python3 "$AUTH" status
```

| Exit | Meaning | Next step |
| ---: | --- | --- |
| 0 | Logged in | Step 4 |
| 3 | No saved login | Step 3 |
| 4 | Environment not set up | Step 2 |
| 5 | `credentials_rejected` | Ask the user to re-enter the email and password, then step 3 |
| 5 | `access_denied` | Explain the closed beta and Audrey's contact; stop |
| 1 | Data service or network error | Report it and retry later; do not ask for the password |

### 2. Set up the environment once

```bash
python3 "$AUTH" setup
```

`setup` creates the data home `~/.config/tqx/data` (`$XDG_CONFIG_HOME/tqx/data` when that is set, or `TQX_DATA_HOME` when the user wants another location), creates a Python 3.12 virtual environment in it, and installs `tqx-data` and `keyring`. It uses `uv` when available and otherwise a local Python 3.10-3.12. tqx-data pins `numpy<2.0`, so Python 3.13 and later cannot install it. If neither `uv` nor a supported Python exists, explain this and ask the user before installing `uv`.

Use `setup --upgrade` to update the packages and `setup --recreate` to rebuild a broken environment. Do not install tqx-data into the user's project or global Python: the package places its session file at the nearest project root above its install directory, and the dedicated home keeps that file out of the user's repositories.

### 3. Log in once

Ask the user, in the conversation, for the email and password of their TQX data account. Then pass them on stdin:

```bash
python3 "$AUTH" login <<'EOF'
{"email": "<email>", "password": "<password>"}
EOF
```

In PowerShell:

```powershell
@'
{"email": "<email>", "password": "<password>"}
'@ | py -3 $AUTH login
```

When `login` succeeds, tell the user that the login is saved on this computer and that they will not be asked again unless the password changes or they sign out.

### 4. Query data

Write ordinary Python that imports `tqx_data` and calls its methods, without any login code, then run it through the helper:

```bash
python3 "$AUTH" run analysis.py --any-script-args
```

For a short query, pass the code on stdin:

```bash
python3 "$AUTH" run - <<'EOF'
import tqx_data
print(tqx_data.get_hk_daily(symbol=["0700.HK"], start_date="20260901", end_date="20260930", fields=["date", "close"]))
EOF
```

Keep scripts and outputs in the user's working directory, not in the data home.

### 5. Read the installed documentation

```bash
python3 "$AUTH" info
```

`info` reports `tqx_data_version` and `doc`, the `tqx_data.md` file shipped inside the installed package. That file and `help(tqx_data.<method>)` are the authority for local method names, parameters, and fields; read a method's section before calling it. Ignore `tqx_data_bk.md` in the same directory, which describes methods the package does not export.

## Using the data correctly (tqx-data 0.1.2)

- **Symbols**: Hong Kong `0700.HK`; US `AAPL.NB` for HTTP methods, even though the bundled document's introduction shows bare `AAPL`; the parameter validator requires the `.NB` suffix. Returned rows may drop it. `TickStreamClient(market="NB")` takes bare `AAPL` instead.
- **Market names**: methods with a `market` parameter accept only `"hk"` or `"nb"`. Calendar and listing helpers take `exchange="HK"` or `"NB"`.
- **`alt_close` is not an adjusted price.** It equals `close`. The bundled document calls it adjusted, but its own `0001.HK` example keeps the two equal across later dividend dates. For an adjusted or total-return series, list cash dividends, stock dividends, and splits over the window with `get_event_devidend`, apply them yourself, and keep the event rows as evidence. When the window has no such events, the unadjusted close already is the total-return series.
- **Daily `bid` and `ask`** are the last quotes before the close, not live quotes.
- **`get_stock_detail` can return many duplicate rows.** Drop exact duplicates, then confirm that the remaining rows agree on every field you use, such as `min_order_amount`. If they disagree, report the conflict instead of choosing a row.
- **Point in time**: keep only events announced no later than the decision time. The announcement field differs by method, for example `publish_date` in `get_event_devidend` and `info_date` in `get_event_capital_market`.
- **Request size**: dates are `YYYYMMDD`, one call covers at most five years, and you should request only the symbols and fields you need.

## Bug reporting

When tqx-data returns wrong or inconsistent data reproducibly, prepare a report with the method, complete parameters, `tqx_data_version` from `info`, a complete response sample, and the expected result. When the TQX CLI is installed and the user authorized reporting, submit it with `tqx bug report` as described in [`what-is-tqx`](../what-is-tqx/SKILL.md); otherwise give the report to the user. Never include the email, password, or session token.

## Remote file

When this Skill was loaded from a remote URL instead of a local installation, fetch these files from the same revision with a non-browser HTTP client:

- `scripts/tqx_data_auth.py`: save it as `tqx_data_auth.py` in the data home and use that path as `AUTH`.
- `references/qube-vs-local.md`

The canonical helper URL is `https://raw.githubusercontent.com/tqx-ai/tqx-ts/refs/heads/main/skills/tqx-data/scripts/tqx_data_auth.py`.
