# Time-series strategies

Start with the same-market [complete moving-average example](strategy_templates.md), or implement the requested time-series signal using the documented public market framework. Adapt signal, entry/exit and sizing to the user request. Template defaults are examples; unspecified engine settings come from the resource's market defaults or saved configuration.

Read [source quality](strategy-quality.md) and the selected [HK](stock_hk_api.md)/[US](stock_us_api.md) framework. Declare source parameters once; copy them to `context.params` once in `initialize`. For rolling history, batch data in `init_preheating_data(context)` before the run start, cache it, and append completed Bars during replay. Check required fields, missing rows, duplicate observations, positive prices and sufficient history. Skip or wait explicitly when the window is incomplete; do not fabricate values or swallow query errors.

State whether each signal window includes the current completed Bar. Do not query an unrestricted future end date inside a callback. Keep intraday windows within the intended session, and distinguish historical query period `1m` from engine frequency `1M`. Daily orders evaluate completed information and use the next eligible Bar open as reference; obey sellable quantity and lot rules. Orders accepted or rejected are not confirmed fills.

Use the market engine history API in strategy source. Direct `tqx_data` imports are rejected by current Qube validation. Use [native historical data](tqx_data_usage.md) to verify underlying field and symbol conventions. This Skill does not recommend real-time or Tick methods as backtest history. Finish with [the saved-parameter workflow](workflow.md) only when remote execution is requested.
