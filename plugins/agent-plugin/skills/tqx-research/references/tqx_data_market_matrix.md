# Runtime market and data routing

| Task                                   | Hong Kong                                                        | US                                                               |
| -------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Engine framework                       | [HK](stock_hk_api.md), `hk`                                      | [US](stock_us_api.md), `us`                                      |
| Daily, adjusted, minute, index history | [HK quotes](data/index.md)                                       | [US quotes](data/index.md)                                       |
| Factor fields                          | [HK catalog](data/index.md)                                      | [US catalog](data/index.md)                                      |
| Shared queries                         | [Shared methods](data/index.md), explicit HK market where needed | [Shared methods](data/index.md), explicit US market where needed |
| Engine symbols                         | `0700.HK`                                                        | `AAPL.NB`                                                        |
| Native data symbols                    | `0700.HK`                                                        | Bare `AAPL`, `.NB` compatible where documented                   |
| Benchmark indices                      | `HSI.HK`, `HSCE.HK`, `HSTECH.HK`                                 | `SPX`, `IXIC`, `NDX`, `DJI`                                      |

Factor analysis and tuning currently support only `all` (full market) as `stockPool`; the benchmark indices above are not supported factor pools. An index identifier's acceptance in benchmark configuration does not establish a native query's symbol format or data coverage. Consult its exact method page. Direct `tqx_data` imports are rejected in strategy source; use public market engine APIs. Source validation and live service results determine acceptance and availability; historical research examples use Parquet data. Standalone local market-data access belongs to `tqx-data`.
