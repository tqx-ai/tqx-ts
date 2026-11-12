export type StrategyLocale = 'zh-CN' | 'en'

export type StrategyMessageKey =
  | 'code_empty'
  | 'strategy_params_invalid'
  | 'strategy_params_unique_table'
  | 'strategy_params_literal'
  | 'strategy_params_before_lifecycle'
  | 'strategy_params_readonly'
  | 'strategy_params_static_key'
  | 'strategy_params_undeclared'
  | 'strategy_params_copy_once'
  | 'strategy_params_context_read'
  | 'compile_code_prefix'
  | 'compile_error_framed'
  | 'compile_line_prefix'
  | 'context_attr_not_initialized'
  | 'data_api_enum_invalid'
  | 'data_api_invalid_arguments'
  | 'data_api_missing_arguments'
  | 'data_api_unknown_kwarg'
  | 'data_api_unknown_method'
  | 'data_get_forbidden'
  | 'forbidden_builtin'
  | 'forbidden_dependency'
  | 'future_now_used_as_trade_date'
  | 'future_order_on_continuous_symbol'
  | 'future_order_call_outside_handle_data'
  | 'future_panda_data_in_handle_data'
  | 'generic_syntax_error'
  | 'hk_index_symbol_must_use_catalog_code'
  | 'hk_symbol_must_be_four_digit'
  | 'hk_us_missing_init_preheating_data'
  | 'hk_us_data_outside_init_preheating_data'
  | 'hk_us_forbidden_a_share_symbol'
  | 'hk_us_forbidden_panda_data'
  | 'hk_us_forbidden_stock_api_import'
  | 'hk_us_wrong_market_api_import'
  | 'lifecycle_async_forbidden'
  | 'lifecycle_signature_mismatch'
  | 'missing_required_import'
  | 'missing_required_lifecycle_def'
  | 'missing_required_method'
  | 'market_symbol_suffix_mismatch'
  | 'nested_star_import'
  | 'missing_lookback_for_rolling_window'
  | 'preload_forbidden_future'
  | 'preload_forbidden_stock'
  | 'stock_unsupported_lifecycle'
  | 'stock_api_quotation_bad_period'
  | 'stock_api_quotation_frequency_kwarg'
  | 'stock_api_quotation_symbol_list_empty'
  | 'stock_api_quotation_unknown_kwarg'
  | 'stock_panda_data_outside_init_market_data'
  | 'bar_map_membership_forbidden'
  | 'future_unsupported_lifecycle'
  | 'trade_status_inverse_filter'
  | 'data_read_outside_allowed_window'
  | 'invalid_market'

const MESSAGES: Record<StrategyMessageKey, Record<StrategyLocale, string>> = {
  strategy_params_invalid: {
    'zh-CN': '策略参数无效：{reason}',
    en: 'Invalid strategy parameters: {reason}',
  },
  strategy_params_unique_table: {
    'zh-CN': '必须声明唯一的顶层 STRATEGY_PARAMS 字典',
    en: 'Declare exactly one module-level STRATEGY_PARAMS dictionary',
  },
  strategy_params_literal: {
    'zh-CN': '参数表只能包含标识符键与有限数字、布尔值、字符串或非空字符串列表（最多 256 个参数）',
    en: 'Use identifier keys and literal finite numbers, booleans, strings (up to 4096 characters), or lists of 1-50 nonempty strings (up to 256 parameters)',
  },
  strategy_params_before_lifecycle: {
    'zh-CN': 'STRATEGY_PARAMS 必须在生命周期函数之前声明',
    en: 'Declare STRATEGY_PARAMS before lifecycle functions',
  },
  strategy_params_readonly: {
    'zh-CN': '初始化以外禁止修改 context.params 或参数表',
    en: 'Keep context.params and the parameter table read-only after initialization',
  },
  strategy_params_static_key: {
    'zh-CN': '策略参数必须使用静态字符串键',
    en: 'Read strategy parameters with literal string keys',
  },
  strategy_params_undeclared: {
    'zh-CN': '代码引用了未声明参数：{name}',
    en: 'Undeclared strategy parameter: {name}',
  },
  strategy_params_copy_once: {
    'zh-CN': 'initialize 必须且只能使用一次 context.params = dict(STRATEGY_PARAMS)',
    en: 'initialize must copy context.params = dict(STRATEGY_PARAMS) exactly once',
  },
  strategy_params_context_read: {
    'zh-CN': '请通过 context.params 读取参数；直接读取 STRATEGY_PARAMS 不会被调优识别',
    en: 'Read parameters through context.params; direct STRATEGY_PARAMS reads are not recognized for tuning',
  },

  code_empty: {
    'zh-CN': '代码为空',
    en: 'Code is empty',
  },
  compile_code_prefix: {
    'zh-CN': '代码',
    en: 'Code',
  },
  compile_error_framed: {
    'zh-CN': '{where}：{msg}{snippet}',
    en: '{where}: {msg}{snippet}',
  },
  compile_line_prefix: {
    'zh-CN': '第 {lineno} 行',
    en: 'Line {lineno}',
  },
  context_attr_not_initialized: {
    'zh-CN': '第 {lineno} 行读取 `context.{attr}`，但该属性没有在初始化阶段创建。',
    en: 'Line {lineno}: reads `context.{attr}`, but the attribute is not initialized.',
  },
  data_api_invalid_arguments: {
    'zh-CN': '`{method}` 的位置参数过多或重复传入参数。',
    en: '`{method}` has too many positional arguments or a duplicate argument.',
  },
  data_api_missing_arguments: {
    'zh-CN': '`{method}` 缺少必填参数：{missing}。',
    en: '`{method}` is missing required arguments: {missing}.',
  },
  data_api_enum_invalid: {
    'zh-CN':
      '第 {lineno} 行：`{module}.{method}` 参数 `{kwarg}` 取值 `{value}` 非法；允许：{allowed}',
    en: 'Line {lineno}: `{module}.{method}` argument `{kwarg}` value `{value}` is invalid; allowed: {allowed}',
  },
  data_api_unknown_kwarg: {
    'zh-CN': '第 {lineno} 行：`{module}.{method}` 不支持参数 `{kwarg}`。允许参数：{allowed}',
    en: 'Line {lineno}: `{module}.{method}` does not support `{kwarg}`. Allowed args: {allowed}',
  },
  data_api_unknown_method: {
    'zh-CN': '第 {lineno} 行：`{module}.{method}` 不在允许列表中，禁止臆造。可用方法：{known}',
    en: 'Line {lineno}: `{module}.{method}` is not in the allowlist. Available methods: {known}',
  },
  data_get_forbidden: {
    'zh-CN':
      '第 {lineno} 行请直接使用 `data[symbol]`，再按返回 bar 的有效字段判断是否跳过；不要用 `data.get(...)`。',
    en: 'Line {lineno}: use `data[symbol]` directly, then skip by checking the returned bar fields; do not use `data.get(...)`.',
  },
  forbidden_builtin: {
    'zh-CN': '第 {lineno} 行调用了被禁用的内建函数 `{name}`。',
    en: 'Line {lineno}: calls forbidden builtin `{name}`.',
  },
  forbidden_dependency: {
    'zh-CN':
      '代码出现了被禁用的依赖 `{forbidden}` —— 策略只能用 panda_backtest / panda_data / pandas / numpy，不能外发网络 / 读写 mongo / sleep',
    en: 'Forbidden dependency `{forbidden}` — strategies may only use panda_backtest / panda_data / pandas / numpy; no network / mongo / sleep',
  },
  future_now_used_as_trade_date: {
    'zh-CN': '第 {lineno} 行把 `context.now` 当成交易日使用；请改用 `context.trade_date`。',
    en: 'Line {lineno}: uses `context.now` as the trading date; use `context.trade_date` instead.',
  },
  future_order_on_continuous_symbol: {
    'zh-CN': '第 {lineno} 行 `{func_name}` 把连续标识 `{symbol}` 当成可成交合约。',
    en: 'Line {lineno}: `{func_name}` treats continuous symbol `{symbol}` as a tradable contract.',
  },
  future_order_call_outside_handle_data: {
    'zh-CN':
      '第 {lineno} 行在 `{func_name}` 的调用链中执行 `{call_name}`；所有下单只能放在 handle_data。',
    en: 'Line {lineno}: calls `{call_name}` from within the `{func_name}` call chain; all order placement must live in handle_data.',
  },
  future_panda_data_in_handle_data: {
    'zh-CN':
      '第 {lineno} 行在 `handle_data` 中调用了 `panda_data.{method}`；历史行情只能前置到 `initialize` / `before_trading`。',
    en: 'Line {lineno}: `handle_data` calls `panda_data.{method}`; historical fetches must be moved to `initialize` / `before_trading`.',
  },
  generic_syntax_error: {
    'zh-CN': '语法错误',
    en: 'Syntax error',
  },
  hk_index_symbol_must_use_catalog_code: {
    'zh-CN':
      '恒生指数成分查询的 `index_symbol` 必须使用目录精确代码；当前目录代码是 `HSI`，不是 `HSI.HK`。',
    en: 'The Hang Seng constituents `index_symbol` must use the exact catalog code; the catalog code is `HSI`, not `HSI.HK`.',
  },
  hk_symbol_must_be_four_digit: {
    'zh-CN': '港股代码必须是 4 位 + .HK（如 0700.HK），禁止五位写法。',
    en: 'HK symbols must be 4 digits + .HK (e.g. 0700.HK); five-digit forms are forbidden.',
  },
  hk_us_missing_init_preheating_data: {
    'zh-CN':
      '港美股历史查询必须定义顶层同步 `init_preheating_data(context)`，并由 `initialize(context)` 直接调用一次。',
    en: 'HK/US historical queries require a top-level synchronous `init_preheating_data(context)` called directly exactly once by `initialize(context)`.',
  },
  hk_us_data_outside_init_preheating_data: {
    'zh-CN':
      '第 {lineno} 行在 `{func_name}` 中查询历史数据；请把查询移到 `init_preheating_data(context)`，每日有限刷新可放在 `before_trading(context)`。',
    en: 'Line {lineno}: `{func_name}` queries historical data; move it into `init_preheating_data(context)` or a bounded daily refresh in `before_trading(context)`.',
  },
  hk_us_forbidden_a_share_symbol: {
    'zh-CN': '{market_label}策略禁止混用 A 股 .SH/.SZ 代码。',
    en: '{market_label} strategies must not mix A-share .SH/.SZ symbols.',
  },
  hk_us_forbidden_panda_data: {
    'zh-CN': '港美股策略禁止使用 panda_data，请用 stock_api_quotation / tqx_data。',
    en: 'HK/US strategies must not use panda_data; use stock_api_quotation / tqx_data.',
  },
  hk_us_forbidden_stock_api_import: {
    'zh-CN':
      '港美股策略禁止 `from panda_backtest.api.stock_api import *`；请改用 stock_{api_suffix}_api。',
    en: 'HK/US strategies must not use `from panda_backtest.api.stock_api import *`; use stock_{api_suffix}_api instead.',
  },
  hk_us_wrong_market_api_import: {
    'zh-CN': '港美股策略导入了错误的市场 API `{import_path}`；请改用 `{expected_import}`。',
    en: 'HK/US strategies imported the wrong market API `{import_path}`; use `{expected_import}` instead.',
  },
  lifecycle_async_forbidden: {
    'zh-CN': '第 {lineno} 行：生命周期函数 `{name}` 不能是 async。',
    en: 'Line {lineno}: lifecycle function `{name}` must not be async.',
  },
  lifecycle_signature_mismatch: {
    'zh-CN': '第 {lineno} 行：`{name}` 签名必须是 `({signature})`。',
    en: 'Line {lineno}: `{name}` signature must be `({signature})`.',
  },
  missing_required_import: {
    'zh-CN': '缺少必需的导入 `from {required_import} import ...`（panda_backtest 的 API 入口）',
    en: 'Missing required import `from {required_import} import ...` (panda_backtest API entry)',
  },
  missing_required_lifecycle_def: {
    'zh-CN': '缺少必需的函数定义 `{func_name}`（策略生命周期函数）',
    en: 'Missing required function `{func_name}` (strategy lifecycle)',
  },
  missing_lookback_for_rolling_window: {
    'zh-CN':
      '代码用了 {max_window} 日滚动窗口（rolling），但 `start_date=context.run_info.start_date` 仍然直接用了回测起点；请至少向前挪 {buffer_days} 个自然日，并把历史缓存显式截断到有限长度。',
    en: 'The code uses a {max_window}-day rolling window, but `start_date=context.run_info.start_date` still uses the backtest start directly; shift it earlier by at least {buffer_days} calendar days and cap the history cache explicitly.',
  },
  missing_required_method: {
    'zh-CN': '缺少必需的方法 `{method}`。',
    en: 'Missing required method `{method}`.',
  },
  market_symbol_suffix_mismatch: {
    'zh-CN':
      '第 {lineno} 行符号 `{symbol}` 与市场 `{market_label}` 不匹配；请使用 `{expected_suffix}` 后缀。',
    en: 'Line {lineno}: symbol `{symbol}` does not match market `{market_label}`; use suffix `{expected_suffix}`.',
  },
  nested_star_import: {
    'zh-CN': '第 {lineno} 行的 `from ... import *` 必须出现在模块顶层。',
    en: 'Line {lineno}: `from ... import *` must appear at module top level.',
  },
  preload_forbidden_future: {
    'zh-CN': '代码里出现 `preload(...)`；期货策略不使用该废弃 API。',
    en: 'Code uses `preload(...)`; futures strategies must not use this deprecated API.',
  },
  preload_forbidden_stock: {
    'zh-CN': '代码里出现 `preload(...)`；这是废弃 API。',
    en: 'Code uses `preload(...)`; this API is deprecated.',
  },
  stock_unsupported_lifecycle: {
    'zh-CN': '第 {lineno} 行定义了不支持的生命周期 `{name}`；股票策略不要写该钩子。',
    en: 'Line {lineno}: unsupported lifecycle `{name}`; equity strategies must not define this hook.',
  },
  bar_map_membership_forbidden: {
    'zh-CN':
      '第 {lineno} 行使用了 `{pattern}`；回测 `data` 是 BarMap，不支持 `symbol in data` 或 `symbol not in data`。请直接用 `data[symbol]` 读取，并按返回 bar 的有效字段判断是否跳过。',
    en: 'Line {lineno}: uses `{pattern}`; backtest `data` is a BarMap and does not support `symbol in data` or `symbol not in data`. Read `data[symbol]` directly and skip by checking the returned bar fields.',
  },
  stock_api_quotation_bad_period: {
    'zh-CN': '第 {lineno} 行 `stock_api_quotation(...)` 的 `period` 只能是 `"1d"` 或 `"1m"`',
    en: 'Line {lineno}: `stock_api_quotation(...)` `period` must be `"1d"` or `"1m"`',
  },
  stock_api_quotation_frequency_kwarg: {
    'zh-CN':
      '第 {lineno} 行 `stock_api_quotation(...)` 不接受参数 `frequency`；请改用 `period="1d"` 或 `period="1m"`',
    en: 'Line {lineno}: `stock_api_quotation(...)` does not accept `frequency`; use `period="1d"` or `period="1m"`',
  },
  stock_api_quotation_symbol_list_empty: {
    'zh-CN': '第 {lineno} 行 `stock_api_quotation(...)` 的 `symbol_list` 不能为空',
    en: 'Line {lineno}: `stock_api_quotation(...)` `symbol_list` must not be empty',
  },
  stock_api_quotation_unknown_kwarg: {
    'zh-CN':
      '第 {lineno} 行 `stock_api_quotation(...)` 出现未知参数 `{kwarg}`；合法参数为 symbol_list/start_date/end_date/fields/period',
    en: 'Line {lineno}: `stock_api_quotation(...)` has unknown arg `{kwarg}`; valid args are symbol_list/start_date/end_date/fields/period',
  },
  stock_panda_data_outside_init_market_data: {
    'zh-CN':
      '第 {lineno} 行在 `{func_name}` 的调用链中调用 `panda_data`；历史行情只能写在 `init_market_data(context)`（由 `initialize` 调用），按交易日刷新有限数据只允许在幂等的 before_trading。',
    en: 'Line {lineno}: calls `panda_data` from the `{func_name}` call chain; historical fetches must live in `init_market_data(context)` (called from `initialize`), and bounded daily refreshes only inside idempotent before_trading.',
  },
  future_unsupported_lifecycle: {
    'zh-CN':
      '第 {lineno} 行出现不支持的生命周期 `{name}`；默认仅生成 initialize/handle_data，按需增加 before_trading/after_trading。',
    en: 'Line {lineno}: lifecycle `{name}` is not supported; generate only initialize/handle_data by default, adding before_trading/after_trading as needed.',
  },
  trade_status_inverse_filter: {
    'zh-CN':
      '代码里出现 `{snippet}` 的写法 —— panda 的 trade_status 是 0=正常交易，非 0=停牌。请用 `df["trade_status"] == 0`。',
    en: 'Code uses `{snippet}` — panda `trade_status` is 0=tradable, non-zero=suspended. Use `df["trade_status"] == 0`.',
  },
  data_read_outside_allowed_window: {
    'zh-CN':
      '第 {lineno} 行在 `{func_name}` 中调用 `{call_name}`；历史行情只能写在 `init_market_data(context)` 或 `before_trading(context)`。',
    en: 'Line {lineno}: `{func_name}` calls `{call_name}`; historical fetches must live in `init_market_data(context)` or `before_trading(context)`.',
  },
  invalid_market: {
    'zh-CN': '不支持的市场：{market}',
    en: 'Unsupported market: {market}',
  },
}

export function normalizeStrategyLocale(locale: string | undefined): StrategyLocale {
  const normalized = String(locale ?? 'zh-CN')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
  if (normalized.startsWith('en')) return 'en'
  return 'zh-CN'
}

export function t(
  key: StrategyMessageKey,
  locale: string | undefined,
  params: Record<string, unknown> = {},
): string {
  const lang = normalizeStrategyLocale(locale)
  const template = MESSAGES[key][lang] ?? MESSAGES[key]['zh-CN']
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_match, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? '' : String(value)
  })
}
