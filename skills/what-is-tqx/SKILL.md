---
name: what-is-tqx
description: Use when the user asks what TQX is, how Qube relates to trading or local data, or which TQX interface fits an introductory request. Route operational work to tqx-research, tqx-data, or tqx-trading.
---

# What Is TQX

TQX provides Qube for quantitative research and a separate account-based trading service. The local `tqx-data` Python package provides HK/US market data on the user's computer. Explain only the parts relevant to the question, then continue with the matching Skill when action is requested.

| User goal                                                                     | Continue with                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Qube factors, Python strategy source, analysis, backtests, versions or tuning | [tqx-research](../tqx-research/SKILL.md)                                            |
| Local Python price, reference, event or fundamental data                      | [tqx-data](../tqx-data/SKILL.md)                                                    |
| PAPER/LIVE accounts, balances, positions, orders, fills, or competition entry | [tqx-trading](../tqx-trading/SKILL.md)                                              |
| CLI installation, update or repair                                            | [Install protocol](../tqx-trading/references/install.md), then the requested domain |
| A specific Skills manager or project-scoped Skill installation                | [Installation commands](references/commands.md)                                     |

Qube simulation and backtesting are research; they do not execute trades. A PAPER trading account has simulated funds but real account/order lifecycles. A LIVE account can affect real funds. Local Python data, Qube engine data and the trading service have distinct contracts and symbol conventions.

For an overview-only request, explain these distinctions without installing software or requiring credentials. If the next task is ambiguous, ask which outcome the user wants. For an operational request, read and apply the selected Skill, preserving the user's intent and authorization. Do not merely tell the user to choose a Skill or send them back to this overview.

Competition requests start with the trading Skill's connection and account checks before strategy preferences. Research output does not expand trading authority. Never echo credentials or turn their presence in the controlled task into an unsupported claim of compromise. Use available local Skills; when loaded remotely, fetch references from the same revision using a non-browser HTTP client.
