const APIs = {
  // Trading API
  ACCOUNT: '/openapi/v1/trading/account',
  POSITIONS: '/openapi/v1/trading/positions',
  ORDERS: '/openapi/v1/trading/orders',
  TRADES: '/openapi/v1/trading/trades',
  CASH_FLOWS: '/openapi/v1/trading/cash-flows',
  HOLD: '/openapi/v1/trading/hold',
  SIGNALS: '/openapi/v1/trading/signals',

  // Research API
  RESEARCH_FACTORS: 'qube/api/factors',
  RESEARCH_FACTOR_ANALYSES: 'qube/api/factor-analyses',
  RESEARCH_STRATEGIES: 'qube/api/strategies',
  RESEARCH_BACKTESTS: 'qube/api/strategy-backtests',
  RESEARCH_STRATEGY_VERSIONS: 'qube/api/strategy-versions',
  RESEARCH_FACTOR_VERSIONS: 'qube/api/factor-versions',
  RESEARCH_FACTOR_TUNINGS: 'qube/api/factor-tunings',
  RESEARCH_STRATEGY_TUNINGS: 'qube/api/strategy-tunings',

  // Bug Report API
  BUG_REPORTS: '/openapi/v1/bug-reports',
} as const

export default APIs
