# Qube runtime data API

This stable entry now routes to the native `tqx_data` 0.1.0 reference, reviewed against Qube source `38ac48d7` on 2026-11-18. Use the focused contract and the selected market engine reference:

- [Native data contracts](data/index.md): symbols, factor fields, historical quotes and indices, financial-statement visibility, and data coverage.
- [HK engine](stock_hk_api.md) and [US engine](stock_us_api.md): the actual strategy source interfaces.

These signatures and fields describe the Qube Python runtime, not the local `tqx-data` service or the TypeScript/MCP resource transport. Native exports and strategy APIs are distinct. Current Qube strategy validation rejects direct `tqx_data` imports, including aliases and from-imports; use the market engine history API in generated strategy code. Actual data coverage and successful execution remain separate facts. Validate source and inspect actual returns. Never infer all `get_*` names or arbitrary DataFrame fields are supported.

Examples use historical Parquet data. Real-time and Tick methods are outside this reference; their absence does not itself prove the backend rejects them. Do not substitute live observations for historical point-in-time data. Do not install a different wheel or change runtime configuration to make source pass. Use the standalone data Skill for local market-data tasks.
