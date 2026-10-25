import { expect, it } from 'vitest'
import { createReadDriver, precheckReadSources } from './read-only-client'
import { evaluateReadRules, readManifestSchema, type ReadManifest } from './read-only-contract'
import { READ_TOOLS, type ReadCase, type ReadTool } from './read-only-plan'
import { runReadOnly, type ReadPermit } from './read-only-runner'
import { ReadFileControl } from './read-only-private'
import { bridgeReadManifest } from './read-only-bridge'
import { encodedReadPathProof } from './read-only-path'

const generation = 'owner-20261025-7648d1b4'
const target = {
  generation,
  namespace: 'isolated-read-memory',
  issuer: 'http://127.0.0.1:26825',
  resource: 'http://127.0.0.1:3004/mcp',
}
const permit = (): ReadPermit => ({
  approved: true,
  phase: 'B',
  subject: '740001',
  generation,
  expiresAt: Date.now() + 60_000,
  maxToolObservationsPerMinute: 20,
})
const account = {
  account_id: 'private-account',
  mode: 'PAPER',
  base_currency: 'HKD',
  total_assets: '9007199254740993.0001',
  cash: null,
  available_cash: null,
  frozen_cash: null,
  buying_power: null,
  market_value: null,
  unrealized_pnl: null,
  as_of: 'fixture-time',
  is_stale: false,
}
function token(overrides: Record<string, unknown> = {}) {
  const claims = {
    iss: target.issuer,
    aud: target.resource,
    sub: '740001',
    agent_id: 'test-agent',
    sid: 'test-session',
    grant_id: 'test-grant',
    jti: 'test-jti',
    client_id: 'test-client',
    scope: 'trade:read',
    exp: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  }
  return `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`
}
function caseFor(action: ReadCase['action'] = 'call'): ReadCase {
  return {
    id: action === 'call' ? 'getAccount.baseline' : `transport.${action}`,
    tool: 'getAccount',
    args: {},
    role: 'read',
    action,
    scenario: action,
    expected: 'data',
    checks: action === 'cancel' ? [] : ['sdk-schema', 'no-invented-fields'],
    requires: [],
  }
}
function manifest(tests: ReadCase[]): ReadManifest {
  return readManifestSchema.parse({
    schemaVersion: 1,
    testOnly: true,
    phase: 'B',
    generation,
    namespace: target.namespace,
    subject: '740001',
    binding: {
      uid: '740001',
      agentId: 'test-agent',
      accountId: 'test-account',
      brokerUserId: 'test-user',
      brokerCompanyId: '4',
    },
    allowedOAuth: [
      {
        sessionId: 'test-session',
        grantId: 'test-grant',
        sourceJti: 'test-jti',
        clientId: 'test-client',
      },
    ],
    capabilities: [],
    fixtureValues: {},
    datasets: { dataset: {} },
    controlDir: 'unused-memory-only',
    cases: Object.fromEntries(
      tests.map((test) => [
        test.id,
        {
          datasetId: 'dataset',
          expectedPrivateSemantics:
            test.action === 'cancel'
              ? {}
              : { 'no-invented-fields': [{ op: 'equal', path: '', value: account }] },
        },
      ]),
    ),
  })
}
function syntheticProtocol(tests: ReadCase[]) {
  let attempts = 0,
    active = 0,
    selected = tests[0]!,
    peak = 0,
    initializes = 0,
    aborted = 0
  const methods: string[] = []
  const transport: typeof fetch = async (_input, init) => {
    if (init?.method === 'GET') return new Response(null, { status: 405 })
    const message = JSON.parse(String(init?.body)) as {
      method: string
      id?: number
      params?: { name?: string }
    }
    methods.push(message.method)
    if (
      message.method === 'notifications/initialized' ||
      message.method === 'notifications/cancelled'
    )
      return new Response(null, { status: 202 })
    const json = (result: unknown) => Response.json({ jsonrpc: '2.0', id: message.id, result })
    if (message.method === 'initialize') {
      initializes++
      return json({
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'memory-only', version: '1' },
        capabilities: { tools: {} },
      })
    }
    if (message.method === 'tools/list')
      return json({ tools: READ_TOOLS.map((name) => ({ name, inputSchema: { type: 'object' } })) })
    if (message.method !== 'tools/call') throw new Error('Unexpected protocol method')
    attempts++
    active++
    peak = Math.max(peak, active)
    try {
      await new Promise<void>((done, reject) => {
        const onAbort = () => {
          clearTimeout(timer)
          aborted++
          reject(new Error('Synthetic abort'))
        }
        const timer = setTimeout(
          () => {
            init?.signal?.removeEventListener('abort', onAbort)
            done()
          },
          selected.action === 'cancel' ? 5000 : 35,
        )
        if (init?.signal?.aborted) onAbort()
        else init?.signal?.addEventListener('abort', onAbort, { once: true })
      })
      return json({ content: [{ type: 'text', text: JSON.stringify(account) }] })
    } finally {
      active--
    }
  }
  const control = {
    setup: async (test: ReadCase) => {
      selected = test
    },
    teardown: async () => {
      expect(active).toBe(0)
    },
    audit: async () => ({
      businessDigest: 'private-digest',
      tradingReadAttempts: attempts,
      tradingWriteAttempts: 0,
      effects: 0,
      activeReadAttempts: active,
      lastReadId: attempts ? `read-${attempts}` : null,
      integrityOk: true,
    }),
  }
  return {
    transport,
    control,
    stats: () => ({ attempts, active, peak, initializes, aborted, methods }),
  }
}

it.each(['call', 'cancel', 'reconnect', 'parallel-two'] as const)(
  'observes %s through the real official SDK classes and synthetic fetch only',
  async (action) => {
    const test = caseFor(action),
      fake = syntheticProtocol([test])
    const driver = createReadDriver({
      permit: permit(),
      target,
      manifest: manifest([test]),
      sources: { read: token() },
      control: fake.control,
      fetch: fake.transport,
    })
    const report = await runReadOnly({
      permit: permit(),
      generation,
      cases: [test],
      openDriver: async () => driver,
    })
    expect(report.results).toMatchObject([{ outcome: 'passed' }])
    expect(report.layer).toBe('memory-double')
    expect(report.actualProtocol).toBe(false)
    expect(fake.stats().active).toBe(0)
    expect(fake.stats().attempts).toBe(action === 'parallel-two' ? 2 : 1)
    if (action === 'parallel-two') expect(fake.stats().peak).toBe(2)
    if (action === 'reconnect') expect(fake.stats().initializes).toBe(2)
    if (action === 'cancel') expect(fake.stats().aborted).toBe(1)
    expect(fake.stats().methods.every((method) => !method.includes('write'))).toBe(true)
  },
)
it('denies the personal subject before any connect/control IO', () => {
  expect(() =>
    precheckReadSources(manifest([caseFor()]), target, { read: token({ sub: '740002' }) }),
  ).toThrow('outside isolated primary')
})
it('has a second READ firewall inside the actual driver', async () => {
  const test = caseFor(),
    fake = syntheticProtocol([test])
  const driver = createReadDriver({
    permit: permit(),
    target,
    manifest: manifest([test]),
    sources: { read: token() },
    control: fake.control,
    fetch: fake.transport,
  })
  await expect(driver.observe('placeOrder' as ReadTool, {}, 'read')).rejects.toThrow('non-READ')
  expect(fake.stats().methods).toEqual([])
  await driver.close()
})
it('rejects static semantic booleans and forged pagination cursors', () => {
  const raw = manifest([caseFor()])
  expect(() =>
    readManifestSchema.parse({
      ...raw,
      cases: {
        'getAccount.baseline': { datasetId: 'dataset', expectedPrivateSemantics: { check: true } },
      },
    }),
  ).toThrow()
  const fake = syntheticProtocol([caseFor()])
  expect(() =>
    createReadDriver({
      permit: permit(),
      target,
      manifest: { ...raw, fixtureValues: { listOrdersNextCursor: 'invented' } },
      sources: { read: token() },
      control: fake.control,
      fetch: fake.transport,
    }),
  ).toThrow('actual first pages')
})
it('computes precise strings/null/absence and actual two-page completeness without prototype access', () => {
  expect(
    evaluateReadRules(
      [
        { op: 'equal', path: '/total_assets', value: account.total_assets },
        { op: 'type', path: '/cash', type: 'null' },
        { op: 'absent', path: '/not_present' },
      ],
      account,
      new Map(),
    ),
  ).toBe(true)
  expect(
    evaluateReadRules(
      [{ op: 'equal', path: '/total_assets', value: Number(account.total_assets) }],
      account,
      new Map(),
    ),
  ).toBe(false)
  expect(
    evaluateReadRules([{ op: 'type', path: '/constructor', type: 'object' }], {}, new Map()),
  ).toBe(false)
  const rules = [
    {
      op: 'unionIds' as const,
      path: '/items',
      key: 'id',
      ids: ['a', 'b', 'c'],
      withCaseId: 'first',
    },
  ]
  const prior = new Map([['first', { items: [{ id: 'a' }, { id: 'b' }] }]])
  expect(evaluateReadRules(rules, { items: [{ id: 'c' }] }, prior)).toBe(true)
  expect(evaluateReadRules(rules, { items: [{ id: 'b' }, { id: 'c' }] }, prior)).toBe(false)
  expect(evaluateReadRules(rules, { items: [] }, prior)).toBe(false)
})
it('preserves the exact five-field primary binding from schema parse into the actual RPC request', async () => {
  const test = caseFor(),
    parsed = readManifestSchema.parse(manifest([test]))
  const files = new Map<string, string>()
  let message: Record<string, unknown> | undefined
  const control = new ReadFileControl(
    parsed,
    permit(),
    {
      uid: '740001',
      agentId: 'test-agent',
      sessionId: 'test-session',
      grantId: 'test-grant',
      sourceJti: 'test-jti',
      clientId: 'test-client',
    },
    {
      writeNew: async (path, body) => {
        expect(files.has(path)).toBe(false)
        files.set(path, body)
      },
      publish: async (temporary, path) => {
        message = JSON.parse(files.get(temporary)!) as Record<string, unknown>
        files.set(
          path.replace('request-', 'response-'),
          JSON.stringify({ ...message, ok: true, synthetic: true, mode: 'PAPER', fake: true }),
        )
      },
      read: async (path) => {
        const value = files.get(path)
        if (!value) throw new Error('Missing synthetic response')
        return value
      },
    },
  )
  await control.setup(test)
  expect(message?.binding).toEqual({
    uid: '740001',
    agentId: 'test-agent',
    accountId: 'test-account',
    brokerUserId: 'test-user',
    brokerCompanyId: '4',
  })
  expect(Object.keys(message!.binding as object)).toHaveLength(5)
})
it('bridges an actual backend catalog without fabricating dataset metadata and blocks unknown references', () => {
  const parsed = manifest([caseFor()])
  const catalog = [
    { dataset_id: 'dataset', version: 1, row_count: 3, digest: 'synthetic-private-digest' },
  ]
  const backend = {
    ...parsed,
    datasets: undefined,
    datasetId: 'dataset',
    source: 'ISOLATED_PAPER_HISTORY_LEDGER',
    documents: { fixture_read_catalog: catalog },
  }
  const client = bridgeReadManifest(backend)
  expect(client.datasets.dataset).toEqual({ source: backend.source, catalog })
  expect(() =>
    bridgeReadManifest({ ...backend, cases: { unexpected: { datasetId: 'undeclared' } } }),
  ).toThrow('undeclared')
  expect(
    bridgeReadManifest({
      ...backend,
      schemaVersion: { $numberInt: '1' },
      cases: {
        'getAccount.baseline': {
          ...backend.cases['getAccount.baseline'],
          expectedPrivateSemantics: {
            exact: [{ op: 'length', path: '/items', value: { $numberInt: '2' } }],
          },
        },
      },
    }).cases['getAccount.baseline']!.expectedPrivateSemantics.exact,
  ).toEqual([{ op: 'length', path: '/items', value: 2 }])
  expect(() =>
    bridgeReadManifest({
      ...backend,
      documents: { fixture_read_catalog: [{ count: { $numberLong: '9007199254740993' } }] },
    }),
  ).toThrow('precision loss')
})
it.each(['getOrder', 'getSignal'])(
  'requires actual encoded %s ASGI evidence in addition to a local SDK URL projection',
  async (tool) => {
    const value = 'owned/id?x#fragment'
    const field = tool === 'getOrder' ? 'orderId' : 'signalId'
    const path = `/openapi/v1/trading/${tool === 'getOrder' ? 'orders' : 'signals'}/${encodeURIComponent(value)}`
    const configured = { ...target, apiResource: 'http://127.0.0.1:8102/api' }
    const actual = {
      method: 'GET',
      origin: 'http://127.0.0.1:8102',
      rawPath: path,
      queryPresent: false,
      status: 403,
    }
    expect(await encodedReadPathProof(configured, tool, { [field]: value }, [actual])).toBe(true)
    for (const changed of [
      { ...actual, origin: 'http://different.invalid' },
      { ...actual, rawPath: decodeURIComponent(path) },
      { ...actual, queryPresent: true },
      { ...actual, status: 302 },
    ])
      expect(await encodedReadPathProof(configured, tool, { [field]: value }, [changed])).toBe(
        false,
      )
    expect(await encodedReadPathProof(configured, tool, { [field]: value }, [])).toBe(false)
    expect(await encodedReadPathProof(configured, tool, { [field]: value }, [actual, actual])).toBe(
      false,
    )
  },
)
