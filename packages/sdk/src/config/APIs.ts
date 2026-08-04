const APIs = {
  // User API
  AUTH_VERIFY: '/openapi/v1/auth/verify',
  HEALTH: '/openapi/v1/health',
  USER_BALANCE: 'userWallet/myWallet',

  // Trading API
  ACCOUNT: '/openapi/v1/trading/account',
  POSITIONS: '/openapi/v1/trading/positions',
  ORDERS: '/openapi/v1/trading/orders',
  TRADES: '/openapi/v1/trading/trades',
  SIGNALS: '/openapi/v1/trading/signals',

  // Research API
  RESEARCH_FACTORS: 'agent_quant/api/factors',
  RESEARCH_FACTOR_ANALYSES: 'agent_quant/api/factor-analyses',
  RESEARCH_STRATEGIES: 'agent_quant/api/strategies',
  RESEARCH_BACKTESTS: 'agent_quant/api/backtests',
} as const

export default APIs
