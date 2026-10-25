export const READ_TOOLS = [
  'getAccount',
  'listPositions',
  'listOrders',
  'getOrder',
  'listTrades',
  'listCashFlows',
  'getSignal',
] as const
export type ReadTool = (typeof READ_TOOLS)[number]
export type ReadExpectation =
  | 'data'
  | 'invalid_arguments'
  | 'tool_unavailable'
  | 'tool_error'
  | 'capability_gap'
  | 'http_401'
  | 'http_403'
export interface ReadCase {
  id: string
  tool: ReadTool
  args: Record<string, unknown>
  scenario: string
  action?: 'call' | 'cancel' | 'reconnect' | 'parallel-two'
  role:
    | 'read'
    | 'write-only'
    | 'expired'
    | 'wrong-audience'
    | 'bad-signature'
    | 'no-scope'
    | 'revoked'
    | 'refresh-old'
  expected: ReadExpectation
  expectedCode?: string
  checks: string[]
  requires: string[]
}
export const ref = (alias: string) => ({ $readFixture: alias })
export function readOnlyPlan(): ReadCase[] {
  const cases: ReadCase[] = []
  const normal: Record<ReadTool, Record<string, unknown>> = {
    getAccount: {},
    listPositions: {},
    listOrders: {},
    getOrder: { orderId: ref('ownOrder') },
    listTrades: {},
    listCashFlows: {},
    getSignal: { signalId: ref('signalPending') },
  }
  const add = (
    tool: ReadTool,
    name: string,
    args: Record<string, unknown>,
    expected: ReadExpectation = 'data',
    checks: string[] = [],
    requires: string[] = [],
    scenario = 'normal',
    expectedCode?: string,
  ) => {
    cases.push({
      id: `${tool}.${name}`,
      tool,
      args,
      scenario,
      role: 'read',
      expected,
      checks,
      requires,
      ...(expectedCode ? { expectedCode } : {}),
    })
  }
  for (const tool of READ_TOOLS) {
    add(
      tool,
      'baseline',
      normal[tool],
      tool === 'listCashFlows' ? 'capability_gap' : 'data',
      ['sdk-schema', 'no-invented-fields', 'zero-trade-writes'],
      tool === 'getOrder' ? ['ownOrder'] : tool === 'getSignal' ? ['signalPending'] : [],
      'normal',
      tool === 'listCashFlows' ? 'cash_flows_unsupported' : undefined,
    )
    add(
      tool,
      'unknown-identity-field',
      { ...normal[tool], account_id: 'disallowed-override' },
      'invalid_arguments',
      ['zero-trading-dispatch'],
    )
    const id = `${tool}.write-only-denied`
    cases.push({
      id,
      tool,
      args: normal[tool],
      expected: 'tool_unavailable',
      scenario: 'normal',
      role: 'write-only',
      checks: ['tool-not-found-not-validation', 'zero-trading-dispatch'],
      requires: ['isolatedWriteOnlySource'],
    })
  }
  for (const currency of ['HKD', 'USD'])
    add(
      'getAccount',
      currency,
      { currency },
      'data',
      ['native-currency', 'decimal-strings', 'nulls-not-zero'],
      ['accountCurrencies'],
    )
  add(
    'getAccount',
    'null-and-freshness',
    {},
    'data',
    ['nulls-not-zero', 'as_of-exact', 'is_stale-exact', 'mode-reported-only'],
    ['accountNulls'],
    'account_nulls',
  )
  add('getAccount', 'unsupported-currency', { currency: 'EUR' }, 'invalid_arguments')
  add('getAccount', 'currency-null', { currency: null }, 'invalid_arguments')
  add(
    'getAccount',
    'USD-provider-honesty',
    { currency: 'USD' },
    'data',
    ['reported-currency-not-relabelled', 'no-fabricated-FX'],
    ['accountCurrencyOracle'],
  )
  for (const market of ['HK', 'US'])
    add(
      'listPositions',
      `market-${market}`,
      { market },
      'data',
      ['all-items-match-filter'],
      ['richPositions'],
    )
  add(
    'listPositions',
    'symbol',
    { symbol: ref('hkSymbol') },
    'data',
    ['all-items-match-symbol'],
    ['richPositions', 'hkSymbol'],
  )
  add(
    'listPositions',
    'combined-filter',
    { symbol: ref('hkSymbol'), market: 'HK' },
    'data',
    ['filters-AND'],
    ['richPositions', 'hkSymbol'],
  )
  add(
    'listPositions',
    'no-match',
    { symbol: ref('emptySymbol') },
    'data',
    ['items-empty', 'terminal-cursor'],
    ['richPositions', 'emptySymbol'],
  )
  add(
    'listPositions',
    'explicit-empty',
    {},
    'data',
    ['items-empty', 'terminal-cursor'],
    ['emptyPositions'],
    'positions_empty',
  )
  add('listPositions', 'short-symbol', { symbol: 'AA' }, 'invalid_arguments')
  add('listPositions', 'long-symbol', { symbol: 'A'.repeat(33) }, 'invalid_arguments')
  add('listPositions', 'market-invalid', { market: 'CN' }, 'invalid_arguments')
  add('listPositions', 'limit-zero', { limit: 0 }, 'invalid_arguments')
  for (const tool of ['listPositions', 'listOrders', 'listTrades', 'listCashFlows'] as const) {
    const capability = tool === 'listCashFlows' ? 'supportedCashProvider' : `rich${tool.slice(4)}`
    const pageDataset = `threeRowPageDataset.${tool}`
    add(
      tool,
      'page-first',
      { limit: 2 },
      'data',
      ['two-rows', 'opaque-next-cursor'],
      [capability, pageDataset],
    )
    add(
      tool,
      'page-next',
      { limit: 2, cursor: ref(`${tool}NextCursor`) },
      'data',
      ['no-duplicates', 'complete-private-fixture-set', 'terminal-cursor'],
      [capability, pageDataset, `${tool}NextCursor`],
    )
    add(
      tool,
      'page-limit-change',
      { limit: 1, cursor: ref(`${tool}NextCursor`) },
      'data',
      ['cursor-not-bound-to-limit'],
      [capability, pageDataset, `${tool}NextCursor`],
    )
    add(
      tool,
      'empty-cursor-is-not-first-page',
      { cursor: '' },
      'tool_error',
      ['no-data-fabrication'],
      [],
      'normal',
      'trading_request_rejected',
    )
    add(
      tool,
      'malformed-cursor',
      { cursor: 'not-a-real-cursor' },
      'tool_error',
      ['bounded-sanitized-error'],
      [],
      'normal',
      'trading_request_rejected',
    )
  }
  add(
    'listOrders',
    'empty',
    {},
    'data',
    ['items-empty', 'terminal-cursor'],
    ['emptyOrders'],
    'orders_empty',
  )
  add(
    'listOrders',
    'foreign-candidates-before-owned',
    { limit: 1 },
    'data',
    ['owned-row-not-starved-by-foreign-candidates'],
    ['interleavedOrderOwners'],
    'orders_interleaved',
  )
  add('listOrders', 'unsupported-symbol-filter', { symbol: 'TEST.US' }, 'invalid_arguments')
  add('listOrders', 'limit-over-100', { limit: 101 }, 'invalid_arguments')
  add('listOrders', 'cursor-over-512', { cursor: 'x'.repeat(513) }, 'invalid_arguments')
  for (const [tool, field, own, missing, foreign] of [
    ['getOrder', 'orderId', 'ownOrder', 'missingOrder', 'foreignOrder'],
    ['getSignal', 'signalId', 'signalPending', 'missingSignal', 'foreignSignal'],
  ] as const) {
    add(
      tool,
      'missing',
      { [field]: ref(missing) },
      'tool_error',
      ['not-found-not-null-success'],
      [missing],
      'normal',
      tool === 'getOrder' ? 'order_not_found' : 'signal_not_found',
    )
    add(
      tool,
      'foreign-existing',
      { [field]: ref(foreign) },
      'tool_error',
      ['foreign-existence-proven-privately', 'no-data-disclosure'],
      [foreign],
      'normal',
      tool === 'getOrder' ? 'order_not_found' : 'signal_not_found',
    )
    add(tool, 'empty-id', { [field]: '' }, 'invalid_arguments')
    add(tool, 'overlong-id', { [field]: 'x'.repeat(129) }, 'invalid_arguments')
    add(tool, 'missing-id-field', {}, 'invalid_arguments')
    add(tool, 'wrong-id-type', { [field]: 1 }, 'invalid_arguments')
    add(
      tool,
      'encoded-id-boundary',
      { [field]: ref(`${own}Reserved`) },
      'tool_error',
      ['no-arbitrary-path-or-host', 'document-observed-refusal'],
      [`${own}Reserved`],
    )
  }
  for (const state of ['Filled', 'Cancelled'])
    add(
      'getOrder',
      'terminal-' + state,
      { orderId: ref('own' + state + 'Order') },
      'data',
      ['private-terminal-detail-not-assumed-current', 'reported-status-exact'],
      ['own' + state + 'Order'],
    )
  add('getSignal', 'id-below-8', { signalId: 'short' }, 'invalid_arguments')
  for (const state of ['Accepted', 'Unknown', 'Rejected'])
    add(
      'getSignal',
      `state-${state}`,
      { signalId: ref(`signal${state}`) },
      'data',
      ['signal-state-not-order-fill'],
      [`signal${state}`],
    )
  for (const market of ['HK', 'US'])
    add(
      'listTrades',
      `market-${market}`,
      { market },
      'data',
      ['all-items-match-filter', 'price_currency-distinct-from-settlement'],
      ['richTrades'],
    )
  add(
    'listTrades',
    'order-filter',
    { orderId: ref('ownOrderWithTrades') },
    'data',
    ['all-items-match-order'],
    ['richTrades', 'ownOrderWithTrades'],
  )
  add(
    'listTrades',
    'combined-filter',
    { market: 'US', orderId: ref('ownOrderWithTrades') },
    'data',
    ['filters-AND'],
    ['richTrades', 'ownOrderWithTrades'],
  )
  add(
    'listTrades',
    'empty',
    {},
    'data',
    ['items-empty', 'terminal-cursor'],
    ['emptyTrades'],
    'trades_empty',
  )
  add(
    'listTrades',
    'fees-and-null',
    {},
    'data',
    ['fees-preserved-or-null', 'no-zero-invention', 'decimal-strings'],
    ['tradeNullFees'],
    'trade_null_fees',
  )
  add(
    'listTrades',
    'foreign-candidates-before-owned',
    { limit: 1 },
    'data',
    ['owned-row-not-starved-by-foreign-candidates'],
    ['interleavedTradeOwners'],
    'trades_interleaved',
  )
  add('listTrades', 'fractional-limit', { limit: 1.5 }, 'invalid_arguments')
  add('listTrades', 'empty-order-id', { orderId: '' }, 'invalid_arguments')
  add(
    'listCashFlows',
    'supported-fixture-only',
    {},
    'data',
    ['fixture-only-not-provider-availability', 'native-signed-amount-null-category'],
    ['syntheticLedger'],
    'cash_synthetic',
  )
  add(
    'listCashFlows',
    'calendar-invalid',
    { startDate: '2026-02-30' },
    'tool_error',
    ['backend-date-validation'],
    [],
    'normal',
    'trading_request_rejected',
  )
  add(
    'listCashFlows',
    'reversed-range',
    { startDate: '2026-02-02', endDate: '2026-02-01' },
    'tool_error',
    ['inclusive-HK-date-range'],
    [],
    'normal',
    'trading_request_rejected',
  )
  add(
    'listCashFlows',
    'over-90-days',
    { startDate: '2026-01-01', endDate: '2026-06-01' },
    'tool_error',
    ['range-bounded'],
    [],
    'normal',
    'trading_request_rejected',
  )
  add('listCashFlows', 'bad-date-format', { startDate: '2026/02/01' }, 'invalid_arguments')
  add('listCashFlows', 'lowercase-currency', { currency: 'usd' }, 'invalid_arguments')
  add('listCashFlows', 'string-limit', { limit: '2' }, 'invalid_arguments')
  const faults: [string, string][] = [
    ['read_401', 'authorization_required'],
    ['read_403', 'permission_denied'],
    ['read_429', 'rate_limit_exceeded'],
    ['read_503', 'trading_service_unavailable'],
    ['read_timeout', 'trading_timeout'],
    ['read_bad_data', 'upstream_protocol_error'],
    ['read_redirect', 'upstream_protocol_error'],
  ]
  for (const [scenario, code] of faults)
    add(
      'getAccount',
      scenario,
      {},
      'tool_error',
      ['scoped-to-primary-B-only', 'zero-trade-writes', 'sdk-attempts-at-most-3'],
      [scenario],
      scenario,
      code,
    )
  for (const [role, expected] of [
    ['expired', 'http_401'],
    ['wrong-audience', 'http_401'],
    ['bad-signature', 'http_401'],
    ['no-scope', 'http_403'],
    ['revoked', 'http_401'],
    ['refresh-old', 'http_401'],
  ] as const)
    cases.push({
      id: `auth.${role}`,
      tool: 'getAccount',
      args: {},
      role,
      expected,
      scenario: 'normal',
      checks: ['normal-HTTP-challenge', 'no-trading-dispatch', 'only-isolated-B-grant'],
      requires: [`source.${role}`],
    })
  for (const action of ['cancel', 'reconnect', 'parallel-two'] as const)
    cases.push({
      id: `transport.${action}`,
      tool: 'getAccount',
      args: {},
      role: 'read',
      scenario: action,
      action,
      expected: 'data',
      checks: action === 'cancel' ? [] : ['sdk-schema', 'no-invented-fields'],
      requires: [`transport.${action}`],
    })
  return cases
}
export function assertReadTool(name: string): asserts name is ReadTool {
  if (!(READ_TOOLS as readonly string[]).includes(name))
    throw new Error('Read runner rejects non-READ tool')
}
export function planSummary() {
  const cases = readOnlyPlan()
  return {
    mode: 'plan-only',
    actualDesktop: false,
    actualProtocolCalls: 0,
    tradeWrites: 0,
    totalCases: cases.length,
    perTool: Object.fromEntries(
      READ_TOOLS.map((tool) => [tool, cases.filter((c) => c.tool === tool).length]),
    ),
    capabilityGapCases: cases.filter((c) => c.expected === 'capability_gap').map((c) => c.id),
    fixtureDependencies: [...new Set(cases.flatMap((c) => c.requires))].toSorted(),
  }
}
