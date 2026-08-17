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
      '        bar = data[symbol]\n',
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
    expect(hkIndexComponent?.required).toEqual(['market'])
    expect(stockMarketData?.enums.type).toEqual(['future', 'index', 'stock'])
  })
})
