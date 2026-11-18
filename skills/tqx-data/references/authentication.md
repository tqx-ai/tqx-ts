# Local data environment and authentication

The local package uses an API key in the `X-API-Key` header. Username/password
login is disabled. Initialize it explicitly or through environment variables:

```python
import tqx_data

tqx_data.init(
    api_key="sk-tqx-...",
    base_url="https://tqxdata.tqx.ai",
)
```

```bash
export TQX_API_KEY="sk-tqx-..."
export TQX_API_BASE_URL="https://tqxdata.tqx.ai"
```

`api_key` takes precedence over `TQX_API_KEY`. `base_url` is the service base
URL. Use the base URL supplied for your TQX environment.

Use the bundled helper when a task needs a persistent local setup. It stores the
key in the operating-system credential store when available and otherwise in a
0600 file. It never prints the key:

```bash
python3 scripts/tqx_data_auth.py setup
python3 scripts/tqx_data_auth.py status
python3 scripts/tqx_data_auth.py login <<'EOF'
{"api_key":"<key>","base_url":"https://tqxdata.tqx.ai"}
EOF
python3 scripts/tqx_data_auth.py run analysis.py
python3 scripts/tqx_data_auth.py info
python3 scripts/tqx_data_auth.py logout
```

Ask the user for the key only when `status` or `run` reports that no key is
stored. Never put a key in source code, command arguments, logs, generated
files, or replies. `TQX_API_KEY` is the only process-scoped fallback; do not
reuse the old email/password workflow.
