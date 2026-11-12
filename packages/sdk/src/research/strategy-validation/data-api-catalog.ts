export type DataApiLiteral = string | number | boolean | null

export interface DataApiMethod {
  name: string
  required: readonly string[]
  params: readonly string[]
  enums: Readonly<Record<string, readonly DataApiLiteral[]>>
}

interface MethodInput {
  name: string
  required: readonly string[]
  params: readonly string[]
  enums?: Readonly<Record<string, readonly DataApiLiteral[]>>
}

function method(
  name: string,
  required: readonly string[],
  params: readonly string[],
  enums?: Readonly<Record<string, readonly DataApiLiteral[]>>,
): MethodInput {
  return { name, required, params, enums }
}

function buildCatalog(methods: readonly MethodInput[]): Record<string, DataApiMethod> {
  const entries = methods.map(
    (item) =>
      [
        item.name,
        {
          name: item.name,
          required: item.required,
          params: item.params,
          enums: item.enums ?? {},
        } satisfies DataApiMethod,
      ] as const,
  )
  return Object.fromEntries(entries) as Record<string, DataApiMethod>
}

const PANDA_DATA_METHODS = [
  method(
    'get_market_data',
    ['start_date', 'end_date'],
    ['start_date', 'end_date', 'symbol', 'fields', 'type', 'indicator', 'st'],
    { type: ['future', 'index', 'stock'] },
  ),
  method(
    'get_market_min_data',
    ['start_date', 'end_date'],
    ['start_date', 'end_date', 'symbol', 'fields', 'symbol_type', 'time_zone', 'frequency'],
    {
      symbol_type: ['future', 'index', 'stock'],
      frequency: ['15m', '1m', '5m', '60m'],
    },
  ),
  method('get_stock_detail', [], ['symbol', 'fields', 'market', 'status'], {
    market: ['cn'],
    status: [-1, 0, 1],
  }),
  method('get_index_detail', [], ['symbol', 'fields', 'status'], {
    status: [-1, 0, 1],
  }),
  method('get_concept_list', [], ['concept', 'start_date', 'end_date']),
  method('get_concept_constituents', [], ['concept', 'concept_stock', 'date', 'fields']),
  method('get_industry_detail', [], ['fields', 'level']),
  method('get_industry_constituents', [], ['industry_code', 'stock_symbol', 'level', 'fields'], {
    level: ['L1', 'L2', 'L3'],
  }),
  method('get_stock_industry', ['stock_symbol'], ['stock_symbol', 'level'], {
    level: ['L1', 'L2', 'L3'],
  }),
  method('get_index_indicator', [], ['symbol', 'start_date', 'end_date', 'fields']),
  method(
    'get_index_weights',
    ['start_date', 'end_date'],
    ['index_symbol', 'stock_symbol', 'start_date', 'end_date', 'fields'],
  ),
  method('get_lhb_list', [], ['symbol', 'type', 'start_date', 'end_date', 'fields']),
  method(
    'get_lhb_detail',
    ['start_date', 'end_date'],
    ['symbol', 'type', 'start_date', 'end_date', 'side', 'fields'],
    {
      side: ['buy', 'cum', 'sell'],
    },
  ),
  method('get_repurchase', [], ['symbol', 'start_date', 'end_date', 'fields']),
  method(
    'get_margin',
    ['start_date', 'end_date'],
    ['symbol', 'start_date', 'end_date', 'fields', 'margin_type'],
    {
      margin_type: ['cash', 'stock'],
    },
  ),
  method(
    'get_hsgt_hold',
    ['start_date', 'end_date'],
    ['symbol', 'start_date', 'end_date', 'fields'],
  ),
  method(
    'get_investor_activity',
    ['start_date', 'end_date'],
    ['symbol', 'start_date', 'end_date', 'fields'],
  ),
  method(
    'get_restricted_list',
    ['end_date'],
    ['symbol', 'start_date', 'end_date', 'fields', 'market'],
    {
      market: ['cn'],
    },
  ),
  method('get_holder_count', [], ['symbol', 'start_date', 'end_date', 'fields']),
  method(
    'get_top_holders',
    ['start_date', 'end_date'],
    [
      'symbol',
      'start_date',
      'end_date',
      'fields',
      'market',
      'start_rank',
      'end_rank',
      'stock_type',
    ],
    {
      market: ['cn'],
      stock_type: ['flow', 'total'],
    },
  ),
  method('get_block_trade', [], ['symbol', 'start_date', 'end_date', 'fields']),
  method(
    'get_share_float',
    ['start_date', 'end_date'],
    ['symbol', 'start_date', 'end_date', 'fields'],
  ),
  method('get_fina_forecast', [], ['symbol', 'fields', 'info_date', 'end_quarter']),
  method('get_fina_performance', [], ['symbol', 'fields', 'info_date', 'end_quarter']),
  method(
    'get_fina_reports',
    [],
    ['symbol', 'start_quarter', 'end_quarter', 'date', 'is_latest', 'fields'],
  ),
  method('get_audit_opinion', [], ['symbol', 'start_quarter', 'end_quarter', 'fields', 'market'], {
    market: ['cn'],
  }),
  method(
    'get_factor',
    ['start_date', 'end_date', 'factors'],
    ['start_date', 'end_date', 'symbol', 'factors', 'type', 'index_component'],
    {
      type: ['future', 'stock'],
    },
  ),
  method('get_adj_factor', [], ['symbol', 'start_date', 'end_date', 'fields']),
  method('get_trade_cal', [], ['start_date', 'end_date', 'exchange', 'is_trading_day', 'fields'], {
    exchange: ['SH', 'SZ'],
  }),
  method('get_prev_trade_date', ['date'], ['date', 'exchange', 'n'], {
    exchange: ['SH', 'SZ'],
  }),
  method('get_last_trade_date', [], ['exchange'], {
    exchange: ['SH', 'SZ'],
  }),
  method('get_stock_status_change', [], ['symbol', 'start_date', 'end_date', 'fields']),
  method('get_trade_list', ['date'], ['date', 'exchange'], {
    exchange: ['SH', 'SZ'],
  }),
  method('get_future_detail', [], ['symbol', 'fields', 'is_trading', 'exchange']),
  method(
    'get_future_market_post',
    ['start_date', 'end_date'],
    ['symbol', 'start_date', 'end_date', 'fields'],
  ),
  method(
    'get_future_dominant',
    ['start_date', 'end_date'],
    ['underlying_symbol', 'start_date', 'end_date'],
  ),
  method(
    'get_fund_detail',
    [],
    [
      'symbol',
      'exchange',
      'type',
      'operation_mode',
      'etf_lof_type',
      'is_class_fund',
      'index_fund_type',
      'status',
      'fund_status',
      'fields',
    ],
  ),
  method(
    'get_fund_daily',
    ['start_date', 'end_date'],
    ['start_date', 'end_date', 'symbol', 'exchange', 'fields'],
  ),
  method(
    'get_fund_daily_post',
    ['start_date', 'end_date'],
    ['start_date', 'end_date', 'symbol', 'exchange', 'fields'],
  ),
  method(
    'get_fund_daily_pre',
    ['start_date', 'end_date'],
    ['start_date', 'end_date', 'symbol', 'exchange', 'fields'],
  ),
  method(
    'get_fund_etf_cr_limits',
    ['start_date', 'end_date'],
    ['start_date', 'end_date', 'symbol', 'exchange', 'fields'],
  ),
  method(
    'get_fund_etf_cr_net',
    ['start_date', 'end_date'],
    ['start_date', 'end_date', 'symbol', 'exchange', 'fields'],
  ),
  method(
    'get_fund_etf_constituents',
    ['start_date', 'end_date'],
    ['start_date', 'end_date', 'symbol', 'exchange', 'fields'],
  ),
  method(
    'get_fund_etf_cr',
    ['start_date', 'end_date'],
    ['start_date', 'end_date', 'symbol', 'exchange', 'fields'],
  ),
] as const

// Enum values follow the Qube runtime's tqx_data wheel. US market aliases are
// accepted as `us` and `nb`; `ny` is not a current runtime value.
const QUBE_MINUTE_FREQUENCIES = ['10m', '1m', '5m', '60m'] as const
const HK_US_MARKET = { market: ['hk', 'nb', 'us'] } as const
const DATED_REFERENCE_PARAMS = ['symbol', 'market', 'fields', 'start_date', 'end_date'] as const
const REFERENCE_PARAMS = ['symbol', 'market', 'fields'] as const

const TQX_DATA_METHODS = [
  method('get_hk_daily', [], ['symbol', 'start_date', 'end_date', 'fields']),
  method('get_us_daily', [], ['symbol', 'start_date', 'end_date', 'fields', 'market'], {
    market: ['nb', 'us'],
  }),
  method(
    'get_hk_min',
    [],
    ['symbol', 'start_date', 'end_date', 'fields', 'time_zone', 'frequency'],
    { frequency: QUBE_MINUTE_FREQUENCIES },
  ),
  method(
    'get_us_min',
    [],
    ['symbol', 'start_date', 'end_date', 'fields', 'time_zone', 'frequency', 'market'],
    { frequency: QUBE_MINUTE_FREQUENCIES, market: ['nb', 'us'] },
  ),
  method('get_stock_detail', [], ['symbol', 'market', 'status', 'fields'], {
    market: ['hk', 'nb', 'us'],
  }),
  method(
    'get_trading_calendar',
    [],
    ['start_date', 'end_date', 'market', 'is_trading_day', 'fields'],
    { market: ['hk', 'nb', 'us'] },
  ),
  method('get_currency', [], ['start_date', 'end_date', 'fields']),
  method('get_consensus_recommend', [], REFERENCE_PARAMS, {
    market: ['hk', 'nb', 'us'],
  }),
  ...[
    'get_event_devidend',
    'get_event_capital_market',
    'get_event_corporate_actions',
    'get_event_fina_disclosure',
    'get_event_investor_relation_activities',
    'get_company_insider_transaction',
    'get_company_shareholder_report',
  ].map((name) => method(name, ['start_date', 'end_date'], DATED_REFERENCE_PARAMS, HK_US_MARKET)),
  ...[
    'get_company_concentration',
    'get_company_top_concentration',
    'get_company_current',
    'get_company_imed',
    'get_company_price_vol',
    'get_consensus_nonperiod',
  ].map((name) => method(name, [], REFERENCE_PARAMS, HK_US_MARKET)),
  method('get_company_investor', [], [...REFERENCE_PARAMS, 'max_rank'], HK_US_MARKET),
  method(
    'get_company_oper_metrics',
    ['start_year', 'end_year'],
    [...REFERENCE_PARAMS, 'start_year', 'end_year'],
    HK_US_MARKET,
  ),
  method(
    'get_financial_statement',
    ['start_quarter', 'end_quarter', 'market'],
    [
      'start_quarter',
      'end_quarter',
      'symbol',
      'fields',
      'market',
      'date',
      'is_latest',
      'interim_type',
    ],
    { market: ['hk', 'nb', 'us'], interim_type: ['cumulative', 'single'] },
  ),
  method('get_live_market_data', ['symbols'], ['symbols', 'count']),
  method(
    'get_factor',
    ['start_date', 'end_date', 'factors'],
    ['symbol', 'start_date', 'end_date', 'type', 'factors'],
    { type: ['hk', 'nb', 'us'] },
  ),
  method(
    'get_filing_announcement',
    [],
    ['symbol', 'start_date', 'end_date', 'fields', 'market'],
    HK_US_MARKET,
  ),
  method('get_index_component', [], ['index_symbol', 'stock_symbol', 'market'], {
    market: ['hk', 'nb', 'us'],
  }),
  method('get_min_data', [], ['symbol', 'count', 'market', 'max_workers', 'frequency'], {
    market: ['hk', 'nb', 'us'],
    frequency: QUBE_MINUTE_FREQUENCIES,
  }),
  method('get_tick_data', [], ['symbol', 'market'], {
    market: ['hk', 'nb', 'us'],
  }),
] as const

export const PANDA_DATA_CATALOG = buildCatalog(PANDA_DATA_METHODS)
export const TQX_DATA_CATALOG = buildCatalog(TQX_DATA_METHODS)

export function catalogForMarket(market: string): {
  module: 'panda_data' | 'tqx_data'
  catalog: Record<string, DataApiMethod>
} {
  const normalized = String(market ?? '')
    .trim()
    .toLowerCase()
  if (normalized === 'hk' || normalized === 'us') {
    return { module: 'tqx_data', catalog: TQX_DATA_CATALOG }
  }
  return { module: 'panda_data', catalog: PANDA_DATA_CATALOG }
}
