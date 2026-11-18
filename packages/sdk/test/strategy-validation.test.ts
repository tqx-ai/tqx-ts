import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { TqxClient, TqxValidationError, validateStrategyCode } from '../src/index'
import { catalogForMarket } from '../src/research/strategy-validation/data-api-catalog'
import { US_DAILY_MOVING_AVERAGE_FIXTURE } from './strategy-fixtures'

const STOCK_VALID = `
import panda_data as pd
from panda_backtest.api.api import *

STRATEGY_PARAMS = {}

def init_preheating_data(context):
    context.history = pd.get_market_data(
        start_date='2026-01-01',
        end_date='2026-02-01',
    )

def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
    init_preheating_data(context)

def handle_data(context, data):
    pass
`

const FUTURE_VALID = `
from panda_backtest.api.api import *

STRATEGY_PARAMS = {}

def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
    context.ready = True

def handle_data(context, data):
    pass
`

const HK_VALID = `
from panda_backtest.api.api import *
from panda_backtest.api.stock_hk_api import *

STRATEGY_PARAMS = {}

def init_preheating_data(context):
    context.history = stock_api_quotation(
        symbol_list=['0700.HK'],
        start_date='20260101',
        end_date='20260102',
        period='1d',
    )

def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
    init_preheating_data(context)

def handle_data(context, data):
    pass
`

function expectValidationError(code: string, market: string): TqxValidationError {
  if (!code.includes('STRATEGY_PARAMS') && /def initialize\(context\):/.test(code)) {
    code = code.replace(
      /\ndef initialize\(context\):\n/,
      '\nSTRATEGY_PARAMS = {}\n\ndef initialize(context):\n    context.params = dict(STRATEGY_PARAMS)\n',
    )
  }
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

  it('accepts safe try/except blocks in strategy code', () => {
    expect(() =>
      validateStrategyCode(
        STOCK_VALID.replace(
          'def handle_data(context, data):\n    pass',
          `def handle_data(context, data):
    try:
        print(data)
    except Exception:
        return`,
        ),
        'stock',
      ),
    ).not.toThrow()
  })

  it('accepts named Qube API imports with the current parameter contract', () => {
    expect(() =>
      validateStrategyCode(
        `
from panda_backtest.api.api import MarketOrderStyle, order_shares
from panda_backtest.api.stock_us_api import stock_api_quotation

STRATEGY_PARAMS = {"symbol": "AAPL.NB"}

def init_preheating_data(context):
    context.history = stock_api_quotation(
        [context.params["symbol"]],
        start_date="20260101",
        end_date="20260102",
        period="1d",
    )

def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
    init_preheating_data(context)

def handle_data(context, data):
    pass
`,
        'us',
      ),
    ).not.toThrow()
  })

  it('requires init_preheating_data for HK/US historical queries', () => {
    const error = expectValidationError(
      `
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import stock_api_quotation

STRATEGY_PARAMS = {"symbol": "TSLA.NB"}

def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
    context.history = stock_api_quotation(
        [context.params["symbol"]], start_date="20260101", end_date="20260102", period="1d",
    )

def handle_data(context, data):
    pass
`,
      'us',
    )
    expect(error.issues[0]?.message).toContain('init_preheating_data')
  })

  it('allows historical refreshes only reachable from before_trading without a preheater', () => {
    const refresh = HK_VALID.replace(
      'def init_preheating_data(context):',
      'def before_trading(context):',
    ).replace('    init_preheating_data(context)\n', '')
    expect(() => validateStrategyCode(refresh, 'hk')).not.toThrow()
    const helper =
      refresh.replace('def before_trading(context):', 'def refresh_history(context):') +
      '\ndef before_trading(context):\n    refresh_history(context)\n'
    expect(() => validateStrategyCode(helper, 'hk')).not.toThrow()
    const shared = helper.replace(
      '    context.params = dict(STRATEGY_PARAMS)',
      '    context.params = dict(STRATEGY_PARAMS)\n    refresh_history(context)',
    )
    expect(expectValidationError(shared, 'hk').issues[0]?.message).toContain('init_preheating_data')
  })

  it('allows before_trading stock API refreshes and still rejects handle_data fetches', () => {
    const code = `
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import stock_api_pre_close
STRATEGY_PARAMS = {}
def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
def before_trading(context):
    context.previous = stock_api_pre_close(["AAPL.NB"])
def handle_data(context, data):
    pass
`
    expect(() => validateStrategyCode(code, 'us')).not.toThrow()
    const forbidden = code
      .replace('def before_trading(context):', 'def refresh_history(context):')
      .replace('    pass', '    refresh_history(context)')
    expect(() => validateStrategyCode(forbidden, 'us')).toThrow(TqxValidationError)
  })

  it('checks a declared preheater even when it contains no historical queries', () => {
    const code = FUTURE_VALID + '\ndef init_preheating_data(context):\n    pass\n'
    expect(expectValidationError(code, 'hk').issues[0]?.message).toContain('init_preheating_data')
  })

  it('preserves Python duplicate-key semantics for the strategy table', () => {
    expect(() =>
      validateStrategyCode(
        FUTURE_VALID.replace(
          'STRATEGY_PARAMS = {}',
          'STRATEGY_PARAMS = {"window": 1, "window": 2}',
        ),
        'future',
      ),
    ).not.toThrow()
  })

  it('rejects missing or duplicated strategy parameter tables', () => {
    const missingCode = `
from panda_backtest.api.api import *

def initialize(context):
    pass

def handle_data(context, data):
    pass
`
    const missing = (() => {
      try {
        validateStrategyCode(missingCode, 'future')
        throw new Error('expected validation error')
      } catch (error) {
        expect(error).toBeInstanceOf(TqxValidationError)
        return error as TqxValidationError
      }
    })()
    expect(missing.issues[0]?.message).toContain('STRATEGY_PARAMS')

    const duplicate = expectValidationError(
      `
from panda_backtest.api.api import *
STRATEGY_PARAMS = {}
STRATEGY_PARAMS = {}

def initialize(context):
    context.params = dict(STRATEGY_PARAMS)

def handle_data(context, data):
    pass
`,
      'future',
    )
    expect(duplicate.issues[0]?.message).toContain('STRATEGY_PARAMS')
  })

  it('ignores parameter examples in comments and strings and permits helpers before the table', () => {
    const code = FUTURE_VALID.replace(
      'STRATEGY_PARAMS = {}',
      `
# context.params = dict(STRATEGY_PARAMS)
def helper():
    print("context.params[key] = 42")

STRATEGY_PARAMS: dict = {"window": -10, "enabled": True, "symbols": ["AAPL.NB"]}
`,
    )
    expect(() => validateStrategyCode(code, 'future')).not.toThrow()
  })

  it.each([
    ['computed defaults', 'STRATEGY_PARAMS = dict(window=10)', 'pass', 'literal'],
    ['invalid key', 'STRATEGY_PARAMS = {"bad-key": 10}', 'pass', 'literal'],
    ['empty symbol list', 'STRATEGY_PARAMS = {"symbols": []}', 'pass', 'literal'],
    ['numeric list', 'STRATEGY_PARAMS = {"windows": [1, 2]}', 'pass', 'literal'],
    ['non-finite number', 'STRATEGY_PARAMS = {"window": 1e999}', 'pass', 'literal'],
    ['f-string', 'STRATEGY_PARAMS = {"symbol": f"AAPL"}', 'pass', 'literal'],
    [
      'undeclared parameter',
      'STRATEGY_PARAMS = {}',
      'print(context.params["missing"])',
      'Undeclared',
    ],
    ['dynamic key', 'STRATEGY_PARAMS = {}', 'print(context.params[key])', 'literal string keys'],
    [
      'dynamic get',
      'STRATEGY_PARAMS = {}',
      'print(context.params.get(key))',
      'literal string keys',
    ],
    ['subscript write', 'STRATEGY_PARAMS = {}', 'context.params["window"] = 10', 'read-only'],
    ['table write', 'STRATEGY_PARAMS = {}', 'STRATEGY_PARAMS["window"] = 10', 'read-only'],
    ['table update', 'STRATEGY_PARAMS = {}', 'STRATEGY_PARAMS |= {"window": 10}', 'read-only'],
    ['table update method', 'STRATEGY_PARAMS = {}', 'STRATEGY_PARAMS.update({})', 'read-only'],
    ['table pop', 'STRATEGY_PARAMS = {}', 'STRATEGY_PARAMS.pop("window")', 'read-only'],
    ['table clear', 'STRATEGY_PARAMS = {}', 'STRATEGY_PARAMS.clear()', 'read-only'],
    [
      'table setdefault',
      'STRATEGY_PARAMS = {}',
      'STRATEGY_PARAMS.setdefault("window", 10)',
      'read-only',
    ],
    ['table delete', 'STRATEGY_PARAMS = {}', 'del STRATEGY_PARAMS', 'read-only'],
    [
      'table read',
      'STRATEGY_PARAMS = {"window": 10}',
      'print(STRATEGY_PARAMS["window"])',
      'through context.params',
    ],
    [
      'table get',
      'STRATEGY_PARAMS = {"window": 10}',
      'print(STRATEGY_PARAMS.get("window"))',
      'through context.params',
    ],
    [
      'undeclared table read',
      'STRATEGY_PARAMS = {}',
      'print(STRATEGY_PARAMS["missing"])',
      'Undeclared',
    ],
    [
      'alias write',
      'STRATEGY_PARAMS = {}',
      'params = context.params\n    params.update({})',
      'read-only',
    ],
    [
      'alias read',
      'STRATEGY_PARAMS = {}',
      'params = context.params\n    print(params["missing"])',
      'Undeclared',
    ],
    ['delete', 'STRATEGY_PARAMS = {}', 'del context.params["window"]', 'read-only'],
    ['second copy', 'STRATEGY_PARAMS = {}', 'context.params = dict(STRATEGY_PARAMS)', 'read-only'],
  ])('rejects %s under the Qube parameter contract', (_label, table, statement, message) => {
    const code = FUTURE_VALID.replace('STRATEGY_PARAMS = {}', table).replace(
      'def handle_data(context, data):\n    pass',
      `def handle_data(context, data):\n    ${statement}`,
    )
    expect(expectValidationError(code, 'future').issues[0]?.message).toContain(message)
  })

  it('requires a real parameter copy and checks nested table declarations', () => {
    const commented = FUTURE_VALID.replace(
      'context.params = dict(STRATEGY_PARAMS)',
      '# context.params = dict(STRATEGY_PARAMS)',
    )
    expect(expectValidationError(commented, 'future').issues[0]?.message).toContain('exactly once')
    const nested = FUTURE_VALID.replace('context.ready = True', 'STRATEGY_PARAMS = {}')
    expect(expectValidationError(nested, 'future').issues[0]?.message).toContain('STRATEGY_PARAMS')
  })

  it.each([
    [
      'async',
      (code: string) => code.replace('def init_preheating_data', 'async def init_preheating_data'),
    ],
    [
      'wrong signature',
      (code: string) =>
        code.replace('def init_preheating_data(context):', 'def init_preheating_data():'),
    ],
    [
      'wrong call',
      (code: string) =>
        code.replace('    init_preheating_data(context)', '    init_preheating_data()'),
    ],
    [
      'duplicate call',
      (code: string) =>
        code.replace(
          '    init_preheating_data(context)',
          '    init_preheating_data(context)\n    init_preheating_data(context)',
        ),
    ],
    [
      'conditional call',
      (code: string) =>
        code.replace(
          '    init_preheating_data(context)',
          '    if True:\n        init_preheating_data(context)',
        ),
    ],
  ])('rejects a %s preheater', (_label, change) => {
    expect(expectValidationError(change(HK_VALID), 'hk').issues[0]?.message).toContain(
      'init_preheating_data',
    )
  })

  it('uses the current preheater name in historical-query diagnostics', () => {
    const code = HK_VALID.replace(
      'def handle_data(context, data):\n    pass',
      `def handle_data(context, data):
    stock_api_quotation(symbol_list=["0700.HK"], start_date="20260101", end_date="20260102", period="1d")`,
    )
    const error = expectValidationError(code, 'hk')
    expect(error.issues[0]?.message).toContain('init_preheating_data')
    expect(error.issues[0]?.message).not.toContain('init_market_data')
  })

  it('retains the pinned native data-reader signatures independently of strategy imports', () => {
    const contract = JSON.parse(
      readFileSync(new URL('./fixtures/tqx-data-contract.json', import.meta.url), 'utf8'),
    ) as {
      parameters: Record<string, string[]>
    }
    const params = Object.fromEntries(
      Object.entries(catalogForMarket('us').catalog).map(([name, spec]) => [name, spec.params]),
    )
    expect(params).toEqual(contract.parameters)
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

  it('accepts strategies that use init_preheating_data', () => {
    expect(() =>
      validateStrategyCode(
        `
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import stock_api_quotation

STRATEGY_PARAMS = {"symbol": "TSLA.NB"}

def init_preheating_data(context):
    context.history = stock_api_quotation(
        symbol_list=[context.params["symbol"]],
        start_date="20260101",
        end_date="20260102",
        period="1d",
    )

def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
    init_preheating_data(context)

def handle_data(context, data):
    pass
`,
        'us',
      ),
    ).not.toThrow()
  })

  it('rejects rolling-window lookbacks that start at the backtest boundary', () => {
    const error = expectValidationError(
      `
import pandas as pd
from panda_backtest.api.api import *
from panda_backtest.api.stock_us_api import *

STRATEGY_PARAMS = {}

def init_preheating_data(context):
    context.lookback = 30
    context.history = pd.DataFrame({"close": [1.0] * 60})
    context.requested_range = dict(start_date=context.run_info.start_date)

def initialize(context):
    context.params = dict(STRATEGY_PARAMS)
    init_preheating_data(context)

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

def init_preheating_data(context):
    pass

def initialize(context):
    init_preheating_data(context)

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

def init_preheating_data(context):
    pass

def initialize(context):
    init_preheating_data(context)

def handle_data(context, data):
    data.get('close')
`,
      'stock',
    )
    expect(error.issues[0]?.message).toContain('data.get')
  })

  it.each([
    'import tqx_data',
    'import tqx_data as td',
    'import math, tqx_data as td',
    'import tqx_data as td, math',
    'import tqx_data.reader as reader',
    'from tqx_data import get_hk_daily',
    'from tqx_data import get_us_daily as daily',
    'from tqx_data import (get_hk_daily as daily, get_us_daily)',
    'from tqx_data import *',
    'from tqx_data.reader import get_hk_daily as daily',
  ])('rejects unsupported native data imports: %s', (statement) => {
    for (const market of ['hk', 'us', 'stock', 'future']) {
      const error = expectValidationError(`${statement}\n${FUTURE_VALID}`, market)
      expect(error.issues[0]?.message).toContain('UNSAFE_IMPORT')
      expect(error.issues[0]?.message).toContain('tqx_data')
      expect(error.issues[0]?.message).toContain('panda_backtest.api')
    }
  })

  it('rejects nested native data imports and explains the selected market API', () => {
    for (const statement of [
      'import tqx_data as td',
      'from tqx_data import get_us_daily as daily',
      'from tqx_data import *',
    ]) {
      const code = FUTURE_VALID.replace('    context.ready = True', `    ${statement}`)
      expect(expectValidationError(code, 'us').issues[0]?.message).toContain('UNSAFE_IMPORT')
    }
    const error = expectValidationError(`import tqx_data\n${FUTURE_VALID}`, 'hk')
    expect(error.issues[0]?.path).toEqual([{ key: 'code' }])
    expect(() => validateStrategyCode(`import tqx_data\n${FUTURE_VALID}`, 'hk')).toThrow(
      'Invalid strategy code',
    )
  })

  it('does not confuse native data names in comments, strings, or import aliases', () => {
    const code = FUTURE_VALID.replace(
      'STRATEGY_PARAMS = {}',
      `import math as tqx_data
# import tqx_data
EXAMPLE = "from tqx_data import get_us_daily"
STRATEGY_PARAMS = {}`,
    )
    expect(() => validateStrategyCode(code, 'us')).not.toThrow()
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

  it('keeps the native data API catalog separate from allowed strategy imports', () => {
    const usDaily = catalogForMarket('us').catalog.get_us_daily
    const hkIndexComponent = catalogForMarket('hk').catalog.get_index_component
    const stockMarketData = catalogForMarket('stock').catalog.get_market_data

    expect(usDaily).toBeDefined()
    expect(hkIndexComponent).toBeDefined()
    expect(stockMarketData).toBeDefined()
    expect(usDaily?.required).toEqual([])
    expect(usDaily?.enums.market).toEqual(['nb', 'us'])
    const tqxCatalog = catalogForMarket('us').catalog
    expect(tqxCatalog.get_tick_data?.enums.market).toEqual(['hk', 'nb', 'us'])
    expect(tqxCatalog.get_filing_announcement?.enums.market).toEqual(['hk', 'nb', 'us'])
    for (const name of ['get_hk_min', 'get_us_min', 'get_min_data']) {
      expect(tqxCatalog[name]?.enums.frequency).toEqual(['10m', '1m', '5m', '60m'])
    }
    expect(tqxCatalog.get_event_devidend?.required).toEqual(['start_date', 'end_date'])
    expect(tqxCatalog.get_event_devidend?.enums.market).toEqual(['hk', 'nb', 'us'])
    expect(tqxCatalog.get_company_oper_metrics?.required).toEqual(['start_year', 'end_year'])
    expect(Object.keys(tqxCatalog)).toHaveLength(30)
    expect(Object.keys(tqxCatalog).toSorted()).toEqual([
      'get_company_concentration',
      'get_company_current',
      'get_company_imed',
      'get_company_insider_transaction',
      'get_company_investor',
      'get_company_oper_metrics',
      'get_company_price_vol',
      'get_company_shareholder_report',
      'get_company_top_concentration',
      'get_consensus_nonperiod',
      'get_consensus_recommend',
      'get_currency',
      'get_event_capital_market',
      'get_event_corporate_actions',
      'get_event_devidend',
      'get_event_fina_disclosure',
      'get_event_investor_relation_activities',
      'get_factor',
      'get_filing_announcement',
      'get_financial_statement',
      'get_hk_daily',
      'get_hk_min',
      'get_index_component',
      'get_live_market_data',
      'get_min_data',
      'get_stock_detail',
      'get_tick_data',
      'get_trading_calendar',
      'get_us_daily',
      'get_us_min',
    ])
    expect(tqxCatalog.calculate_indicators).toBeUndefined()
    expect(hkIndexComponent?.required).toEqual([])
    expect(stockMarketData?.enums.type).toEqual(['future', 'index', 'stock'])
  })
})
