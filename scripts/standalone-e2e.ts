/**
 * Differential end-to-end check for a standalone CLI binary.
 *
 * Every case runs twice against the same local mock TQX API: once with
 * `node packages/cli/dist/index.mjs` (the compatibility reference) and once with the
 * standalone executable. stdout, stderr, and the exit status must match byte for byte.
 *
 * Why: unit tests run the TypeScript source and the smoke check only runs `--version`, so nothing
 * else exercises a compiled binary on real commands. The npm CLI on Node.js is the compatibility
 * contract, and a compiler or runtime change can silently break it: a Perry build of this CLI
 * returned exit code 0 for failures, reordered JSON keys, and crashed in strategy validation.
 * Run this after upgrading Bun and before adopting a different compiler.
 *
 * Usage: bun scripts/standalone-e2e.ts <path-to-standalone-binary>
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = resolve(import.meta.dirname, '..')
const referenceEntry = resolve(root, 'packages/cli/dist/index.mjs')
const binaryArgument = process.argv[2]
if (!binaryArgument) {
  process.stderr.write('Usage: bun scripts/standalone-e2e.ts <path-to-standalone-binary>\n')
  process.exit(2)
}
const binary = resolve(binaryArgument)
const version = (
  JSON.parse(readFileSync(resolve(root, 'packages/cli/package.json'), 'utf8')) as {
    version: string
  }
).version

const GOOD_KEY = 'sk-e2e-good-key'
const TIMESTAMP = 1_790_000_000

// ---------------------------------------------------------------------------
// Mock TQX API
// ---------------------------------------------------------------------------

interface MockReply {
  status?: number
  body?: unknown
  raw?: string
  contentType?: string
}

const account = {
  account_id: 'ACC-1',
  mode: 'PAPER',
  base_currency: 'HKD',
  total_assets: '1000000.00',
  cash: '500000.00',
  available_cash: '499000.50',
  frozen_cash: '1000.00',
  buying_power: '499000.50',
  market_value: '500000.00',
  unrealized_pnl: '-1234.56',
  as_of: '2026-09-27T01:02:03Z',
  is_stale: false,
}
const position = {
  symbol: '00700.HK',
  symbol_name: '腾讯控股',
  market: 'HK',
  currency: 'HKD',
  side: 'LONG',
  quantity: '200',
  available_quantity: '200',
  average_cost: '380.20',
  last_price: '401.00',
  market_value: '80200.00',
  unrealized_pnl: '4160.00',
  unrealized_pnl_ratio: '0.0547',
  as_of: '2026-09-27T01:02:03Z',
}
const order = {
  order_id: 'ORD-1',
  client_order_id: 'cli-order-1',
  symbol: 'AAPL.US',
  symbol_name: 'Apple Inc.',
  market: 'US',
  currency: 'USD',
  side: 'BUY',
  order_type: 'LIMIT',
  status: 'SUBMITTED',
  quantity: '10',
  price: '180.5',
  filled_quantity: '0',
  remaining_quantity: '10',
  average_fill_price: null,
  submitted_at: '2026-09-27T01:02:03Z',
  updated_at: null,
  time_in_force: 'DAY',
}
const trade = {
  trade_id: 'TRD-1',
  order_id: 'ORD-1',
  symbol: 'AAPL.US',
  symbol_name: 'Apple Inc.',
  market: 'US',
  currency: 'USD',
  side: 'BUY',
  quantity: '10',
  price: '180.5',
  amount: '1805.00',
  commission: '1.00',
  executed_at: '2026-09-27T01:02:03Z',
}
const signal = {
  signal_id: 'SIG-1',
  state: 'ACCEPTED',
  order_id: 'ORD-1',
  order_status: 'SUBMITTED',
  message: null,
  created_at: '2026-09-27T01:02:03Z',
  updated_at: '2026-09-27T01:02:04Z',
}
const strategy = {
  id: 101,
  name: 'E2E Strategy',
  description: 'differential test',
  code: 'def initialize(context):\n    pass\n',
  market: 'hk',
  params: { period_start: '2026-01-01', period_end: '2026-06-30', init_balance: 1000000 },
}
const strategyVersion = {
  id: 7,
  strategy_id: 101,
  version_number: 2,
  code: strategy.code,
  label: null,
  starred: false,
  origin: 'cli',
  params: null,
}
const factor = {
  id: 55,
  name: 'E2E Factor',
  description: null,
  code: 'close / delay(close, 5) - 1',
  code_type: 'formula',
  market: 'hk',
  latest_version: {
    id: 9,
    factor_id: 55,
    version_number: 1,
    code: 'close / delay(close, 5) - 1',
    code_type: 'formula',
    label: 'v1',
    starred: true,
    params: { period_start: '2026-01-01', group_number: 5 },
  },
}
const backtest = {
  id: 301,
  status: 'completed',
  progress: { percent: 100 },
  cancelled: false,
  strategy_id: 101,
  summary: { total_return: 0.1234, sharpe: 1.5, max_drawdown: -0.08 },
}

function openApi(data: unknown, status = 200, code = '0', message = 'success'): MockReply {
  return { status, body: { code, message, data, request_id: 'req-e2e', timestamp: TIMESTAMP } }
}

function gateway(data: unknown, status = 200): MockReply {
  return { status, body: { code: 0, message: 'success', data, request_id: 'gw-e2e' } }
}

function route(method: string, path: string, apiKey: string | undefined, body: string): MockReply {
  const authed = apiKey === GOOD_KEY
  if (path === '/openapi/v1/health') {
    return openApi({ status: 'ok', service: 'tqx_openapi', version: '1.0.0' })
  }
  if (path === '/releases') {
    return {
      body: [
        {
          tag_name: 'v99.0.0',
          draft: false,
          prerelease: false,
          assets: [{ name: 'SHA256SUMS', browser_download_url: `${origin}/assets/SHA256SUMS` }],
        },
        { tag_name: 'v98.0.0-beta.1', draft: false, prerelease: true, assets: [] },
      ],
    }
  }
  if (path.startsWith('/openapi/') && !authed) {
    if (apiKey === 'sk-e2e-unavailable') return { status: 503, raw: 'upstream down' }
    if (apiKey === 'sk-e2e-html')
      return { status: 500, raw: '<html>oops</html>', contentType: 'text/html' }
    return openApi(null, 401, 'AUTH_INVALID_API_KEY', 'The API key is invalid')
  }
  if (path === '/openapi/v1/auth/verify') return openApi({ valid: true })
  if (path === '/openapi/v1/trading/account') return openApi(account)
  if (path === '/openapi/v1/trading/positions')
    return openApi({
      items: [
        position,
        { ...position, symbol: '09988.HK', symbol_name: '阿里巴巴-W', unrealized_pnl: null },
      ],
      next_cursor: 'cursor-2',
    })
  if (path === '/openapi/v1/trading/orders' && method === 'GET')
    return openApi({ items: [order], next_cursor: null })
  if (path === '/openapi/v1/trading/orders' && method === 'POST') {
    const parsed = JSON.parse(body) as { symbol?: string }
    if (parsed.symbol === 'REJECT.HK')
      return openApi(
        {
          ...signal,
          state: 'REJECTED',
          order_id: null,
          order_status: null,
          rejection_reason: 'insufficient buying power',
          shortfall: '1000.00',
          currency: 'HKD',
        },
        422,
        'ORDER_REJECTED',
        'Order rejected',
      )
    return openApi({ ...signal, symbol: parsed.symbol ?? null })
  }
  if (path === '/openapi/v1/trading/orders/ORD-1' && method === 'GET') return openApi(order)
  if (path === '/openapi/v1/trading/orders/ORD-1' && method === 'PATCH')
    return openApi({ order_id: 'ORD-1', accepted: true })
  if (path === '/openapi/v1/trading/orders/ORD-1' && method === 'DELETE')
    return openApi({ order_id: 'ORD-1', accepted: true })
  if (path.startsWith('/openapi/v1/trading/orders/'))
    return openApi(null, 404, 'ORDER_NOT_FOUND', 'Order not found')
  if (path === '/openapi/v1/trading/trades') return openApi({ items: [trade], next_cursor: null })
  if (path === '/openapi/v1/trading/signals/SIG-1') return openApi(signal)
  if (path === '/openapi/v1/bug-reports' && method === 'POST')
    return openApi({ bug_id: 'BUG-42', created_at: '2026-09-27T01:02:03Z' })

  if (!authed) return { status: 401, body: { code: '401', message: 'Unauthorized', data: null } }
  if (path === '/userWallet/myWallet') return gateway({ computingPower: 8888.5 })
  const research = path.replace(/^\/agent_quant\/api\//, '')
  if (research === 'strategies' && method === 'GET')
    return gateway({
      items: [strategy, { ...strategy, id: 102, name: '第二个策略' }],
      has_more: true,
      next_offset: 2,
    })
  if (research === 'strategies' && method === 'POST') return gateway(strategy)
  if (/^strategies\/101$/.test(research) && method === 'GET') return gateway(strategy)
  if (/^strategies\/101$/.test(research) && method === 'PATCH') return gateway(strategy)
  if (/^strategies\/\d+$/.test(research) && method === 'DELETE') return gateway(null)
  if (/^strategies\/101\/versions$/.test(research))
    return gateway({
      items: [strategyVersion, { ...strategyVersion, id: 6, version_number: 1, starred: true }],
      has_more: false,
      next_offset: null,
    })
  if (/^strategies\/101\/backtest-params$/.test(research))
    return gateway({ source: 'saved', params: strategy.params })
  if (/^strategies\/101\/save$/.test(research))
    return gateway({ strategy, version: strategyVersion, version_created: true })
  if (research === 'factors' && method === 'GET') return gateway([factor])
  if (research === 'factors' && method === 'POST') return gateway(factor)
  if (/^factors\/55$/.test(research)) return gateway(factor)
  if (research === 'backtests' && method === 'GET')
    return gateway({ items: [backtest], has_more: false, next_offset: null, total: 1 })
  if (/^backtests\/301$/.test(research)) return gateway(backtest)
  if (research.startsWith('backtests/') || research.startsWith('strategies/'))
    return {
      status: 404,
      body: { code: 404, detail: { message: `No mock for ${method} ${path}` } },
    }
  return { status: 404, body: { detail: `No mock for ${method} ${path}` } }
}

let origin = ''
const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  const chunks: Buffer[] = []
  request.on('data', (chunk: Buffer) => chunks.push(chunk))
  request.on('end', () => {
    const url = new URL(request.url ?? '/', origin)
    const header = request.headers['x-api-key']
    const reply = route(
      request.method ?? 'GET',
      url.pathname,
      Array.isArray(header) ? header[0] : header,
      Buffer.concat(chunks).toString('utf8'),
    )
    const payload = reply.raw ?? JSON.stringify(reply.body ?? null)
    response.writeHead(reply.status ?? 200, {
      'Content-Type': reply.contentType ?? 'application/json; charset=utf-8',
      'X-Request-ID': 'hdr-e2e',
    })
    response.end(payload)
  })
})
await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

type Step = { args: string[]; env?: Record<string, string> }
interface Case {
  name: string
  steps: Step[]
  env?: Record<string, string>
  /**
   * Reads or writes persisted credentials. A Bun-compiled binary uses the OS keychain
   * (`Bun.secrets`), which can show a blocking permission dialog or replace a developer's
   * real stored key, so these cases run only in CI or with TQX_E2E_CREDENTIAL_STORE=1.
   */
  usesCredentialStore?: boolean
}

const authed = { TQX_API_KEY: GOOD_KEY }
const one = (name: string, args: string[], env?: Record<string, string>): Case => ({
  name,
  steps: [{ args }],
  env,
})
const stored = (testCase: Case): Case => ({ ...testCase, usesCredentialStore: true })

const fixtures = mkdtempSync(join(tmpdir(), 'tqx-e2e-fixtures-'))
const usStrategy = readFileSync(resolve(root, 'packages/sdk/test/fixtures/us_ma.py'), 'utf8')
writeFileSync(join(fixtures, 'us_ma.py'), usStrategy)
writeFileSync(
  join(fixtures, 'bad.py'),
  `from panda_backtest.api.api import *

def initialize(context):
    try:
        context.x = 1
    except Exception:
        pass

def handle_data(context, data):
    import os
    os.system('echo nope')
`,
)
writeFileSync(join(fixtures, 'syntax.py'), 'def initialize(context:\n    pass\n')

const helpTargets = [
  [],
  ['login'],
  ['status'],
  ['self-update'],
  ['balance'],
  ['research'],
  ['research', 'factor'],
  ['research', 'strategy'],
  ['research', 'strategy', 'create'],
  ['research', 'strategy', 'run'],
  ['research', 'backtest'],
  ['trading'],
  ['trading', 'orders'],
  ['trading', 'orders', 'place'],
  ['trading', 'positions'],
  ['trading', 'signals'],
  ['bug'],
  ['bug', 'report'],
]

const cases: Case[] = [
  one('version', ['--version']),
  one('version short', ['-V']),
  one('version lowercase', ['-v']),
  ...helpTargets.map((target) => one(`help ${target.join(' ') || 'root'}`, [...target, '--help'])),
  one('help short -H', ['trading', '-H']),
  one('help colored', ['--help'], { FORCE_COLOR: '1' }),
  one('no args', []),
  one('unknown command', ['definitely-unknown']),
  one('json and plain conflict', ['status', '--json', '--plain']),
  stored(one('status unauthenticated', ['status'])),
  stored(one('status json', ['status', '--json'])),
  stored(one('status plain', ['status', '--plain'])),
  stored(one('status colored', ['status'], { FORCE_COLOR: '1' })),
  one('status with env key', ['status', '--json'], authed),
  one('status rejected env key', ['status', '--json'], { TQX_API_KEY: 'sk-e2e-wrong' }),
  one('balance', ['balance'], authed),
  one('balance json', ['balance', '--json'], authed),
  stored(one('balance not logged in', ['balance', '--json'])),
  one('trading account', ['trading', 'account'], authed),
  one('trading account json', ['trading', 'account', '--json', '--currency', 'USD'], authed),
  one('trading account invalid enum', ['trading', 'account', '--currency', 'EUR'], authed),
  one('trading positions', ['trading', 'positions', '--limit', '5'], authed),
  one('trading positions plain', ['trading', 'positions', '--plain', '--market', 'HK'], authed),
  one('trading positions bad limit', ['trading', 'positions', '--limit', '500'], authed),
  one('trading orders list', ['trading', 'orders', 'list', '--json'], authed),
  one('trading orders get', ['trading', 'orders', 'get', 'ORD-1'], authed),
  one('trading orders get missing', ['trading', 'orders', 'get', 'ORD-404', '--json'], authed),
  one(
    'trading orders place limit',
    [
      'trading',
      'orders',
      'place',
      '--symbol',
      'aapl.us',
      '--side',
      'BUY',
      '--orderType',
      'LIMIT',
      '--quantity',
      '10',
      '--price',
      '180.5',
      '--idempotencyKey',
      'e2e-key-001',
      '--yes',
      '--json',
    ],
    authed,
  ),
  one(
    'trading orders place rejected',
    [
      'trading',
      'orders',
      'place',
      '--symbol',
      'REJECT.HK',
      '--side',
      'SELL',
      '--quantity',
      '100',
      '--idempotencyKey',
      'e2e-key-002',
      '--yes',
    ],
    authed,
  ),
  one(
    'trading orders place without yes',
    ['trading', 'orders', 'place', '--symbol', '00700.HK', '--side', 'BUY', '--quantity', '100'],
    authed,
  ),
  one(
    'trading orders place invalid',
    [
      'trading',
      'orders',
      'place',
      '--symbol',
      '00700',
      '--side',
      'BUY',
      '--quantity',
      '-1',
      '--idempotencyKey',
      'e2e-key-003',
      '--yes',
      '--json',
    ],
    authed,
  ),
  one('trading orders modify', ['trading', 'orders', 'modify', 'ORD-1', '--price', '181'], authed),
  one('trading orders cancel', ['trading', 'orders', 'cancel', 'ORD-1', '--plain'], authed),
  one('trading trades', ['trading', 'trades'], authed),
  one('trading signals get', ['trading', 'signals', 'get', 'SIG-1', '--json'], authed),
  one('trading unauthorized', ['trading', 'account', '--json'], { TQX_API_KEY: 'sk-e2e-wrong' }),
  one('trading 503 retries', ['trading', 'account', '--json'], {
    TQX_API_KEY: 'sk-e2e-unavailable',
  }),
  one('trading html error', ['trading', 'account'], { TQX_API_KEY: 'sk-e2e-html' }),
  one('trading network error', ['trading', 'account', '--json'], {
    ...authed,
    TQX_BASE_URL: 'http://127.0.0.1:9',
  }),
  one('invalid base url', ['status'], { TQX_BASE_URL: 'ftp://example.test' }),
  one('research strategy list', ['research', 'strategy', 'list'], authed),
  one(
    'research strategy list json',
    ['research', 'strategy', 'list', '--json', '--limit', '2'],
    authed,
  ),
  one('research strategy info', ['research', 'strategy', 'info', '101', '--json'], authed),
  one('research strategy versions', ['research', 'strategy', 'versions', '101'], authed),
  one('research strategy delete no yes', ['research', 'strategy', 'delete', '101'], authed),
  one(
    'research strategy delete',
    ['research', 'strategy', 'delete', '101', '102', '--yes', '--json'],
    authed,
  ),
  one(
    'research strategy create valid file',
    [
      'research',
      'strategy',
      'create',
      '--market',
      'us',
      '--file',
      'us_ma.py',
      '--name',
      'E2E',
      '--json',
    ],
    authed,
  ),
  one(
    'research strategy create invalid code',
    ['research', 'strategy', 'create', '--market', 'hk', '--file', 'bad.py'],
    authed,
  ),
  one(
    'research strategy create invalid code json',
    ['research', 'strategy', 'create', '--market', 'stock', '--file', 'bad.py', '--json'],
    authed,
  ),
  one(
    'research strategy create syntax error',
    ['research', 'strategy', 'create', '--market', 'future', '--file', 'syntax.py', '--json'],
    authed,
  ),
  one(
    'research strategy create missing file',
    ['research', 'strategy', 'create', '--market', 'hk', '--file', 'nope.py'],
    authed,
  ),
  one('research factor list', ['research', 'factor', 'list', '--plain'], authed),
  one('research factor info', ['research', 'factor', 'info', '55', '--json'], authed),
  one('research backtest list', ['research', 'backtest', 'list'], authed),
  one('research backtest result', ['research', 'backtest', 'result', '301', '--json'], authed),
  one('research unmocked route', ['research', 'strategy', 'result', '999', '--json'], authed),
  one('research bad id', ['research', 'strategy', 'info', 'abc'], authed),
  one(
    'bug report',
    ['bug', 'report', '--title', '标题 with 空格', '--description', 'line1\nline2', '--json'],
    authed,
  ),
  one('bug report missing title', ['bug', 'report', '--description', 'x'], authed),
  one('self-update check', ['self-update', '--check', '--json']),
  one('self-update check human', ['self-update', '--check']),
  {
    name: 'login flow',
    usesCredentialStore: true,
    steps: [
      { args: ['status', '--json'] },
      { args: ['login', '--api-key=sk-e2e-wrong'] },
      { args: ['login', '--json'] },
      { args: ['login', `--api-key=${GOOD_KEY}`] },
      { args: ['status'] },
      { args: ['trading', 'account', '--plain'] },
      { args: ['logout', '--json'] },
      { args: ['logout'] },
      { args: ['status', '--json'] },
    ],
  },
]

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<RunResult> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000)
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveRun({ code, stdout, stderr })
    })
  })
}

function baseEnvironment(
  configRoot: string,
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(TQX_|FORCE_COLOR$|NO_COLOR$|CI$|GITHUB_ACTIONS$|GH_TOKEN$|GITHUB_TOKEN$)/.test(key))
      delete env[key]
  }
  return {
    ...env,
    XDG_CONFIG_HOME: configRoot,
    LOCALAPPDATA: configRoot,
    APPDATA: configRoot,
    TQX_BASE_URL: origin,
    TQX_UPDATE_RELEASES_URL: `${origin}/releases`,
    TQX_UPDATE_CHECK: '0',
    ...extra,
  }
}

const KEYCHAIN_FALLBACK_WARNING =
  // The warning is colored in the default output mode, so ANSI escapes are matched on purpose.
  // oxlint-disable-next-line no-control-regex
  /^(?:\u001b\[[0-9;]*m)*Warning(?:\u001b\[[0-9;]*m)*: The system keychain is unavailable .*\n/m

function normalize(text: string, configRoot: string): string {
  return (
    text
      .replaceAll(configRoot, '<CONFIG>')
      .replaceAll(configRoot.replaceAll('\\', '/'), '<CONFIG>')
      // Node on Windows reports fs errors for relative paths with the absolute path, while Bun
      // keeps the relative path. Both refer to the same file in the fixtures working directory.
      .replaceAll(`${fixtures}${sep}`, '')
  )
}

const allowCredentialStore = Boolean(process.env.CI) || process.env.TQX_E2E_CREDENTIAL_STORE === '1'
let failures = 0
let skipped = 0
// Cases and steps run sequentially: steps share a config directory, and runs must not overlap.
/* eslint-disable no-await-in-loop */
for (const testCase of cases) {
  if (testCase.usesCredentialStore && !allowCredentialStore) {
    skipped += 1
    process.stdout.write(`skip - ${testCase.name} (set TQX_E2E_CREDENTIAL_STORE=1 to run)\n`)
    continue
  }
  const referenceRoot = mkdtempSync(join(tmpdir(), 'tqx-e2e-node-'))
  const binaryRoot = mkdtempSync(join(tmpdir(), 'tqx-e2e-bin-'))
  const problems: string[] = []
  for (const [index, step] of testCase.steps.entries()) {
    const env = { ...testCase.env, ...step.env }
    const expected = await run(
      process.env.TQX_E2E_NODE ?? 'node',
      [referenceEntry, ...step.args],
      baseEnvironment(referenceRoot, env),
      fixtures,
    )
    const actual = await run(binary, step.args, baseEnvironment(binaryRoot, env), fixtures)
    const label = `step ${index + 1} (${step.args.join(' ') || '<no args>'})`
    if (expected.code !== actual.code)
      problems.push(`${label}: exit ${expected.code} (node) != ${actual.code} (binary)`)
    for (const stream of ['stdout', 'stderr'] as const) {
      const left = normalize(expected[stream], referenceRoot)
      let right = normalize(actual[stream], binaryRoot)
      if (stream === 'stderr') {
        const fallback = right.match(KEYCHAIN_FALLBACK_WARNING)?.[0]
        if (fallback && process.platform === 'linux') {
          // Node.js has no keychain. A Linux host without a secret service makes the binary fall
          // back to the credentials file with a warning; macOS and Windows must keep the keychain.
          right = right.replace(fallback, '')
          process.stdout.write(`note - ${testCase.name}: binary used the credentials file\n`)
        }
      }
      if (left !== right)
        problems.push(`${label}: ${stream} differs\n--- node\n${left}\n--- binary\n${right}`)
    }
  }
  rmSync(referenceRoot, { recursive: true, force: true })
  rmSync(binaryRoot, { recursive: true, force: true })
  report(testCase.name, problems)
}
/* eslint-enable no-await-in-loop */

// Binary-only: exercise the standalone self-update path (gzip download, SHA256, decompression,
// spawning the downloaded binary, and cleanup). The downloaded binary is this binary, so it reports
// the current version and the update must be rejected.
{
  const workdir = mkdtempSync(join(tmpdir(), 'tqx-e2e-update-'))
  const executable = join(workdir, process.platform === 'win32' ? 'tqx.exe' : 'tqx')
  copyFileSync(binary, executable)
  const payload = readFileSync(binary)
  const platform =
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
  // Publish the asset under both architectures: an emulated binary (for example x64 under
  // Rosetta) reports a different process.arch than this script.
  const assetNames = ['x64', 'arm64'].map(
    (arch) => `tqx-v99.0.0-${platform}-${arch}${platform === 'windows' ? '.exe' : ''}`,
  )
  const compressed = gzipSync(payload)
  const sums = assetNames
    .map((name) => `${sha256(payload)}  ${name}\n${sha256(compressed)}  ${name}.gz\n`)
    .join('')
  const requested: string[] = []
  const updateServer = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname
    requested.push(path)
    if (path === '/releases/tags/v99.0.0') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          tag_name: 'v99.0.0',
          draft: false,
          prerelease: false,
          assets: [
            ...assetNames.flatMap((name) => [
              { name, browser_download_url: `${updateOrigin}/asset` },
              { name: `${name}.gz`, browser_download_url: `${updateOrigin}/asset.gz` },
            ]),
            { name: 'SHA256SUMS', browser_download_url: `${updateOrigin}/sums` },
          ],
        }),
      )
    } else if (path === '/asset') {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      response.end(payload)
    } else if (path === '/asset.gz') {
      response.writeHead(200, { 'Content-Type': 'application/gzip' })
      response.end(compressed)
    } else if (path === '/sums') {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end(sums)
    } else {
      response.writeHead(404)
      response.end()
    }
  })
  await new Promise<void>((resolveListen) => updateServer.listen(0, '127.0.0.1', resolveListen))
  const updateOrigin = `http://127.0.0.1:${(updateServer.address() as AddressInfo).port}`
  const configRoot = join(workdir, 'config')
  mkdirSync(configRoot)
  const result = await run(
    executable,
    ['self-update', '--version=99.0.0', '--json'],
    baseEnvironment(configRoot, { TQX_UPDATE_RELEASES_URL: `${updateOrigin}/releases` }),
    workdir,
  )
  updateServer.close()
  const problems: string[] = []
  const combined = `${result.stdout}${result.stderr}`
  if (result.code !== 1) problems.push(`expected exit 1, got ${result.code}`)
  if (!requested.includes('/asset.gz') || requested.includes('/asset'))
    problems.push(`expected only the gzip asset to be downloaded, got ${requested.join(', ')}`)
  if (!combined.includes(`Downloaded binary reports version ${version} instead of 99.0.0`))
    problems.push(`unexpected self-update output:\n${combined}`)
  const leftovers = readdirSync(workdir).filter((name) => name.endsWith('.tmp'))
  if (leftovers.length > 0)
    problems.push(`temporary files were not cleaned up: ${leftovers.join(', ')}`)
  rmSync(workdir, { recursive: true, force: true })
  report(
    'self-update downloads the gzip asset, verifies it, and rejects a mismatched binary',
    problems,
  )
}

server.close()
rmSync(fixtures, { recursive: true, force: true })
const total = cases.length + 1 - skipped
process.stdout.write(
  `\n${total - failures}/${total} standalone e2e cases passed (${skipped} skipped)\n`,
)
if (failures > 0) process.exitCode = 1

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function report(name: string, problems: string[]): void {
  if (problems.length === 0) {
    process.stdout.write(`ok - ${name}\n`)
    return
  }
  failures += 1
  process.stdout.write(
    `not ok - ${name}\n${problems.map((problem) => `  ${problem.replaceAll('\n', '\n  ')}`).join('\n')}\n`,
  )
}
