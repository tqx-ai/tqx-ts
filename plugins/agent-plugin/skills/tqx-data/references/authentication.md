# Local data environment and authentication

The user needs a TQX Dev Settings API key with the `data` permission:

`https://www.tqx.ai/user-center?tab=dev-settings`

Install in the user's Python environment and initialize explicitly or with
environment variables. Use the base URL provided for the user's TQX environment:

```bash
python3 -m pip install --upgrade tqx-data
export TQX_API_KEY="<api-key>"
export TQX_API_BASE_URL="https://tqxdata.tqx.ai"
```

```python
import tqx_data

tqx_data.init(api_key="<api-key>", base_url="https://tqxdata.tqx.ai")
```

Never print, echo, commit, or include an API key in responses, command output,
logs, source, or generated files. Ask only when the package reports no key is
configured, and use it only in the current agent context. For persistent setup,
the helper creates an isolated virtual environment, installs `tqx-data`, and
stores credentials in the OS keychain when available, otherwise a `0600` file.

```bash
python3 scripts/tqx_data_auth.py setup
python3 scripts/tqx_data_auth.py status
python3 scripts/tqx_data_auth.py login <<'EOF'
{"api_key":"<api-key>","base_url":"https://tqxdata.tqx.ai"}
EOF
python3 scripts/tqx_data_auth.py run analysis.py
python3 scripts/tqx_data_auth.py info
python3 scripts/tqx_data_auth.py logout
```
