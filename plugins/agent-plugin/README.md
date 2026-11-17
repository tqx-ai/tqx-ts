# TQX

Use TQX from your agent to connect a trading account, inspect your portfolio,
and execute trading instructions within the authority you delegate. The plugin
also guides access to Hong Kong and US market data through the local Python
`tqx-data` package.

## Get started

Install the plugin in a compatible client and ask the agent to connect your TQX
account. Complete the client's OAuth flow and select the AI trading account you
want to use. The setup skill checks the connection and authorized account.

Try asking:

- "Connect my TQX account and show my balance and positions."
- "List my active orders and recent trades."
- "Help me set up Hong Kong and US market data."

Trading tools support account snapshots, positions, order lookup, orders,
trades, cash flows, and activity controls. Agent execution follows your delegated
authority and the permissions configured in your client and TQX account.

## Included skills

- `tqx-setup`: connect the MCP server, complete authorization, and diagnose
  connection problems.
- `tqx-trading`: inspect an account and place, modify, or cancel orders.
- `tqx-data`: configure and use the Python market data package. This workflow
  requires a compatible Python environment and a TQX API key with data access.

## Data and local execution

The trading connector sends account queries and trading requests to
`https://www.tqx.ai/mcp`. Your client manages OAuth credentials. The Python data
workflow installs `tqx-data` in your environment and sends data requests to the
configured TQX data service. Its optional authentication helper creates a local
virtual environment and stores credentials in the OS keychain when available,
otherwise in a file with restricted permissions. No credentials are bundled
with this plugin.

The client must support the execution environment required by each skill.
Research, factor analysis, and backtesting are outside this plugin's current
capabilities.

## Support and license

See [TQX support](https://docs.tqx.ai/more/contact-us), the
[privacy policy](https://www.tqx.ai/auth/privacy-policy), and the
[terms of service](https://www.tqx.ai/auth/user-agreement).

Licensed under GPL-3.0-only.
