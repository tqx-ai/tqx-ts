# TQX

Use TQX from your agent to connect a trading account, inspect your portfolio,
and execute trading instructions within the authority you delegate. The plugin
also guides access to Hong Kong and US market data through the local Python
`tqx-data` package, and Qube research through MCP for Hong Kong and US factors,
strategies, backtests, versions and parameter tuning.

## Get started

Install the plugin in a compatible client and ask the agent to connect your TQX
account. Complete the client's OAuth flow for the capabilities you need. Trading
requires selecting an AI trading account; research scopes do not require a trading
Agent binding. The setup skill checks the connection and authorization.

Try asking:

- "Connect my TQX account and show my balance and positions."
- "List my active orders and recent trades."
- "Help me set up Hong Kong and US market data."
- "Create a US momentum strategy and backtest it with my saved settings."

Trading tools support account snapshots, positions, order lookup, orders,
trades, cash flows, and activity controls. Agent execution follows your delegated
authority and the permissions configured in your client and TQX account.

## Included skills

- `tqx-setup`: connect the MCP server, complete authorization, and diagnose
  connection problems.
- `tqx-trading`: inspect an account and place, modify, or cancel orders.
- `tqx-data`: configure and use the Python market data package. This workflow
  requires a compatible Python environment and a TQX API key with data access.

- `tqx-research`: author HK/US factors and strategies and manage analyses,
  backtests, versions, factor bindings and parameter tuning through MCP.

## Data and local execution

The MCP connector sends account, trading and research requests to
`https://www.tqx.ai/mcp`. Your client manages OAuth credentials. The Python data
workflow installs `tqx-data` in your environment and sends data requests to the
configured TQX data service. Its optional authentication helper creates a local
virtual environment and stores credentials in the OS keychain when available,
otherwise in a file with restricted permissions. No credentials are bundled
with this plugin.

The client must support the execution environment required by each skill.
Research source and configuration are stored by Qube; requested analyses and
backtests execute remotely. Bundled Python examples are embedded in Markdown and do
not run merely by loading the Skill. Availability depends on the deployed MCP
catalog and granted scopes. Research is distinct from trading execution.

## Support and license

See [TQX support](https://docs.tqx.ai/more/contact-us), the
[privacy policy](https://www.tqx.ai/auth/privacy-policy), and the
[terms of service](https://www.tqx.ai/auth/user-agreement).

Licensed under GPL-3.0-only.
