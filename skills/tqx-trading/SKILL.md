---
name: tqx-trading
description: Use when the user wants TQX CLI/SDK account access, PAPER/LIVE balances, positions, orders, fills, competition participation, or authorized trading and monitoring. Also handles CLI installation and repair. Qube factors and backtests belong to tqx-research.
---

# TQX Trading

Use the independent account-based trading service through `tqx`. PAPER accounts have simulated trading funds and orders; LIVE accounts can affect real funds. Qube simulations and backtests are research, handled by [tqx-research](../tqx-research/SKILL.md). Local Python market data belongs to [tqx-data](../tqx-data/SKILL.md).

## Load only the task's references

- Missing CLI, install, update, PATH or startup failure: [Install protocol](references/install.md).
- First connection, API key, authentication or competition entry: [Onboarding](references/onboarding.md).
- A CLI query or SDK integration: Relevant section of [commands](references/commands.md).
- Place, modify, cancel, or reconcile an order; define continuing authority: [Orders](references/orders.md) and the relevant command.
- Repeated monitoring or resuming after interruption: [Monitoring](references/monitoring.md).
- API rejection, unknown outcome, or reproducible defect: [Errors](references/errors.md).

Do not load the full reference set for a balance query. Follow installation steps when setup is requested or required; do not update the CLI in the middle of an order operation. Prefer CLI/SDK and non-browser HTTP clients. Keep credentials out of replies, logs, source, and ordinary artifacts; use a configured credential store or protected process environment.

## Connect and report evidence

For account access or a competition request, authenticate with the available key, run `tqx status --json`, and require `authenticated: true`. Then query `tqx trading account --json`; also query `tqx trading positions --json` when requested or needed to build a strategy from holdings. Report actual mode, funds, positions and freshness before asking for missing strategy preferences. Repair a failed connection before claiming access. Do not ask the user to repeat setup in a terminal when the agent can perform it.

For a read-only request, return the requested current data and stop. Use the command reference and deployed `--help` for parameters, parse `--json`, retain decimal strings, pagination, null values and `as_of`/`is_stale`. Do not substitute remembered balances or fabricate values.

## Execute within the user's mandate

Before an order operation, establish account mode, instruments, direction, sizing, order type, prices, risk limits, timing, expiry and stop conditions. A confirmed competition or continuing mandate authorizes operations within its scope; do not request permission again for every covered order. An account query, a key by itself, and Qube output do not authorize trades. Resolve missing or changed boundaries before dependent execution.

Read the order workflow before writing. Save the intent's idempotency key and returned `signal_id`/`order_id`. `ACCEPTED` is signal acceptance, not an order fill. Query the existing signal, order and fills to establish the outcome; report unresolved states truthfully. After a timeout, reconcile first and reuse the same intent's key. Never submit a duplicate order with a fresh key because its result is unknown.

After an interruption or before a monitoring cycle, query current state again and verify the mandate is still valid. Stop trading when its expiry or stop conditions apply. Report what actually happened and any remaining uncertainty, without expanding the user's scope.
