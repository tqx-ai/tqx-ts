import { describe, expect, it, vi } from 'vitest'

import { TqxClient, TqxValidationError, validateStrategyCode } from '../src/index'
import { catalogForMarket } from '../src/research/strategy-validation/data-api-catalog'
import { US_DAILY_MOVING_AVERAGE_FIXTURE } from './strategy-fixtures'

const STOCK_VALID = `
import panda_data as pd
from panda_backtest.api.api import *

def init_market_data(context):
    context.history = pd.get_market_data(
        start_date='2026-01-01',
        end_date='2026-02-01',
    )

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    pass
`

const FUTURE_VALID = `
from panda_backtest.api.api import *

def initialize(context):
    context.ready = True

def handle_data(context, data):
    pass
`

const HK_VALID = `
import tqx_data as td
from panda_backtest.api.api import *
from panda_backtest.api.stock_hk_api import *

def init_market_data(context):
    context.index_members = td.get_index_component(
        market='hk',
        index_symbol='HSI',
    )

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    pass
`

function expectValidationError(code: string, market: string): TqxValidationError {
  try {
    validateStrategyCode(code, market, { locale: 'en' })
    throw new Error('expected validation error')
  } catch (error) {
    expect(error).toBeInstanceOf(TqxValidationError)
    return error as TqxValidationError
  }
}

describe('strategy validation', () => {
  it.each([
    ['stock', STOCK_VALID],
    ['future', FUTURE_VALID],
    ['hk', HK_VALID],
    ['us', US_DAILY_MOVING_AVERAGE_FIXTURE],
  ] as const)('accepts valid %s strategy code', (market, code) => {
    expect(() => validateStrategyCode(code, market)).not.toThrow()
  })

  it('normalizes US ticker suffixes before symbol checks', () => {
    expect(() => validateStrategyCode(US_DAILY_MOVING_AVERAGE_FIXTURE, 'us')).not.toThrow()
  })

  it('rejects try/except blocks in strategy code', () => {
    const error = expectValidationError(
      STOCK_VALID.replace(
        'def handle_data(context, data):\n    pass',
        `def handle_data(context, data):
    try:
        print(data)
    except Exception:
        return`,
      ),
      'stock',
    )

    expect(error.issues[0]?.message).toContain('try')
    expect(error.issues[0]?.message).toContain('except')
  })

  it.each([
    ['symbol in data', `        if symbol in data:\n            bar = data[symbol]\n`],
    [
      'symbol not in data',
      `        if symbol not in data:\n            continue\n\n        bar = data[symbol]\n`,
    ],
  ])('rejects the legacy US %s pattern', (_label, replacement) => {
    const legacyUsTemplate = US_DAILY_MOVING_AVERAGE_FIXTURE.replace(
      /        bar = data\[symbol\]\r?\n/,
      replacement,
    )
    const error = expectValidationError(legacyUsTemplate, 'us')

    expect(error.issues[0]?.message).toContain('BarMap')
    expect(error.issues[0]?.message).toContain('data[symbol]')
  })

  it('rejects US strategies that skip init_market_data', () => {
    const error = expectValidationError(
      `
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *

def initialize(context):
    context.account = "15032863"
    context.stock_universe = ["TSLA.NB"]
    context.fast_window = 4
    context.slow_window = 12
    context.max_position_ratio = 0.9
    context.today_trades = []
    context.close_history = {symbol: [] for symbol in context.stock_universe}

def handle_data(context, data):
    pass
`,
      'us',
    )

    expect(error.issues[0]?.message).toContain('init_market_data')
    expect(error.issues[0]?.message).toContain('initialize')
  })

  it('rejects rolling-window lookbacks that start at the backtest boundary', () => {
    const error = expectValidationError(
      `
import pandas as pd
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *

def init_market_data(context):
    context.lookback = 30
    context.history = pd.DataFrame({"close": [1.0] * 60})
    context.requested_range = dict(start_date=context.run_info.start_date)

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    context.history["close"].rolling(context.lookback).mean()
`,
      'us',
    )

    expect(error.issues[0]?.message).toContain('30')
    expect(error.issues[0]?.message).toContain('60')
    expect(error.issues[0]?.message).toContain('calendar days')
  })

  it('rejects syntax errors with a framed validation issue', () => {
    const error = expectValidationError(
      `
def initialize(context)
    pass
`,
      'stock',
    )
    expect(error.issues[0]).toMatchObject({
      path: [{ key: 'code' }],
      message: expect.stringContaining('Syntax error'),
    })
  })

  it('rejects market-specific import violations', () => {
    const error = expectValidationError(
      `
from panda_backtest.api.api import *
from panda_backtest.api.stock_api import *

def init_market_data(context):
    pass

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    pass
`,
      'hk',
    )
    expect(error.issues[0]?.message).toContain('stock_api')
  })

  it('rejects forbidden API usage', () => {
    const error = expectValidationError(
      `
from panda_backtest.api.api import *

def init_market_data(context):
    pass

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    data.get('close')
`,
      'stock',
    )
    expect(error.issues[0]?.message).toContain('data.get')
  })

  it('rejects enum violations on aliased data API calls', () => {
    const error = expectValidationError(
      `
from tqx_data import get_us_daily as daily
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *

def init_market_data(context):
    context.history = daily(
        symbol='AAPL.US',
        start_date='2026-01-01',
        end_date='2026-02-01',
        market='sg',
    )

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    pass
`,
      'us',
    )
    expect(error.issues[0]?.message).toContain('market')
  })

  it('accepts the US market and minute frequency names the Qube runtime uses', () => {
    const code = `
import tqx_data
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *

def init_market_data(context):
    context.latest = tqx_data.get_tick_data(symbol=['XPEV.NB'], market='nb')
    context.filings = tqx_data.get_filing_announcement(symbol=['XPEV.NB'], market='nb')
    context.minutes = tqx_data.get_min_data(symbol=['XPEV.NB'], market='nb', frequency='10m')

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    pass
`
    expect(() => validateStrategyCode(code, 'us')).not.toThrow()
  })

  it('accepts event, company, and consensus data in Qube strategies', () => {
    const code = `
import tqx_data
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *

def init_market_data(context):
    context.dividends = tqx_data.get_event_devidend(
        symbol=['NIO.NB'], start_date='20260101', end_date='20261012', market='us',
    )
    context.investors = tqx_data.get_company_investor(symbol=['NIO.NB'], market='us', max_rank=10)
    context.metrics = tqx_data.get_company_oper_metrics(
        symbol=['NIO.NB'], start_year='2024', end_year='2026', market='us',
    )
    context.consensus = tqx_data.get_consensus_recommend(symbol=['NIO.NB'], market='us')

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    pass
`
    expect(() => validateStrategyCode(code, 'us')).not.toThrow()
  })

  it.each([
    ["tqx_data.get_tick_data(symbol=['XPEV.NB'], market='us')", 'market'],
    ["tqx_data.get_filing_announcement(symbol=['XPEV.NB'], market='us')", 'market'],
    ["tqx_data.get_min_data(symbol=['XPEV.NB'], market='nb', frequency='15m')", 'frequency'],
    [
      "tqx_data.get_event_devidend(symbol=['XPEV.NB'], start_date='20260101', end_date='20261012', market='nb')",
      'market',
    ],
    ['tqx_data.calculate_indicators(market_data={}, indicator_params={})', 'allowlist'],
  ])('rejects runtime-invalid arguments in %s', (call, keyword) => {
    const error = expectValidationError(
      `
import tqx_data
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *

def init_market_data(context):
    context.result = ${call}

def initialize(context):
    init_market_data(context)

def handle_data(context, data):
    pass
`,
      'us',
    )
    expect(error.issues[0]?.message).toContain(keyword)
  })

  it('rejects lifecycle and context-state violations', () => {
    const orderError = expectValidationError(
      `
from panda_backtest.api.api import *

def initialize(context):
    pass

def before_trading(context):
    buy_open('IF88.DOMINANT', 1)

def handle_data(context, data):
    pass
`,
      'future',
    )
    expect(orderError.issues[0]?.message).toContain('handle_data')

    const contextError = expectValidationError(
      `
from panda_backtest.api.api import *

def initialize(context):
    context.ready = True

def handle_data(context, data):
    print(context.custom_flag)
`,
      'future',
    )
    expect(contextError.issues[0]?.message).toContain('context.custom_flag')
  })

  it('exposes validateStrategyCode through the research client without fetching', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = new TqxClient({
      baseUrl: 'https://api.example.test/pandaApi',
      apiKey: 'key',
      fetch,
    })

    await expect(
      client.research.validateStrategyCode(STOCK_VALID, 'stock'),
    ).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the static data API catalog aligned with the market rules we rely on', () => {
    const usDaily = catalogForMarket('us').catalog.get_us_daily
    const hkIndexComponent = catalogForMarket('hk').catalog.get_index_component
    const stockMarketData = catalogForMarket('stock').catalog.get_market_data

    expect(usDaily).toBeDefined()
    expect(hkIndexComponent).toBeDefined()
    expect(stockMarketData).toBeDefined()
    expect(usDaily?.enums.market).toEqual(['nb', 'ny'])
    const tqxCatalog = catalogForMarket('us').catalog
    expect(tqxCatalog.get_tick_data?.enums.market).toEqual(['hk', 'nb'])
    expect(tqxCatalog.get_filing_announcement?.enums.market).toEqual(['hk', 'nb'])
    for (const name of ['get_hk_min', 'get_us_min', 'get_min_data']) {
      expect(tqxCatalog[name]?.enums.frequency).toEqual(['10m', '1m', '5m', '60m'])
    }
    expect(tqxCatalog.get_event_devidend?.required).toEqual(['start_date', 'end_date', 'market'])
    expect(tqxCatalog.get_event_devidend?.enums.market).toEqual(['hk', 'us'])
    expect(tqxCatalog.get_company_oper_metrics?.required).toEqual([
      'start_year',
      'end_year',
      'market',
    ])
    expect(Object.keys(tqxCatalog)).toHaveLength(30)
    expect(tqxCatalog.calculate_indicators).toBeUndefined()
    expect(hkIndexComponent?.required).toEqual(['market'])
    expect(stockMarketData?.enums.type).toEqual(['future', 'index', 'stock'])
  })
})
