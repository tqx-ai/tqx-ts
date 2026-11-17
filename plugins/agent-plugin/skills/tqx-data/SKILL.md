---
name: tqx-data
description: Use when the user needs Hong Kong or US market, reference, company, event, financial-statement, daily-bar, or tick data from the local Python tqx-data package, including API-key setup and typed errors. Do not use for the TQX CLI, Qube runtime, trading MCP tools, or undocumented methods.
---

# TQX Data

## Scope and boundaries

Use the local Python package `tqx-data` for Hong Kong and US daily, reference,
calendar, event, company, consensus, financial-statement, and
`TickStreamClient` data.

It is separate from `@tqx-ai/cli`, Qube's `tqx_data`, and trading MCP tools.
Route accounts, positions, orders, fills, cash flows, and controls to
`tqx-trading`; route MCP connection or OAuth problems to `tqx-setup`. Research
MCP is not provided by this plugin.

## Onboarding

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

## Contract and query rules

Read the installed `tqx_data.md` before requests. Use
[api-reference](references/api-reference.md) for local methods,
[qube-vs-local](references/qube-vs-local.md) for environment differences, and
[api-comparison](references/api-comparison.md) for complete signatures. Do not
invent undocumented methods, fields, defaults, or response shapes. Tabular
methods return `pandas.DataFrame`; preserve columns and dtypes unless the user
requests a presentation-only transformation.

Before a request, confirm market, symbols, dates, fields, and current versus
historical intent. Local methods use `market="hk"` or `"us"`, `.HK` symbols for
Hong Kong, bare US symbols, and `YYYYMMDD` dates unless `tqx_data.md` says
otherwise. `TickStreamClient` requires uppercase `HK` or `US`; use `us` in new
requests and reserve `nb` for legacy compatibility.
Use the narrowest method and field set that answers the question. Do not apply
Qube's `.NB` symbol convention to local requests.

After a request, verify symbols, dates, ordering, required fields, empty or
duplicate rows, missing values, and stale snapshots. Apply
[data-quality](references/data-quality.md), including point-in-time filters and
event adjustments. For analysis, report the method, complete non-secret parameters,
package version, row count, relevant columns, and limitations.

## Errors and routing

Classify typed failures with [errors](references/errors.md). Preserve the method,
non-secret parameters, package version, HTTP status, and request ID; never expose
raw bodies, API keys, or stack traces.

For data defects, record the method, complete non-secret parameters, version
from `info`, a complete bounded response sample, and the expected result. Use the
user's language while preserving API fields, identifiers, code, logs, and values.

For remote loading, fetch helper, references, and assets from the same revision;
never substitute another branch or Qube-only research references. Qube runtime,
factors, strategy source, strategy definitions, and backtests are outside this
Skill. Report unsupported methods as outside the package contract instead of
falling back to another TQX surface.
