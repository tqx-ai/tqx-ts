import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { readCases, sampleManifest } from './read-fixture-cases'
import { canonical, FIXTURE_MARKER, READ_TOOLS } from './read-fixture-data'
import { startReadFixture, writeReadFixtureSource } from './read-fixture'

let fixture: Awaited<ReturnType<typeof startReadFixture>>
let client: Client
const results = new Map<string, Record<string, unknown>[]>()
let sourceDirectory = ''
beforeAll(async () => {
  fixture = await startReadFixture()
  client = new Client({ name: 'public-synthetic-schema-selfcheck', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${fixture.origin}/mcp`), {
      fetch: (url, init) => {
        expect(new URL(url).origin).toBe(fixture.origin)
        return fetch(url, { ...init, redirect: 'error' })
      },
    }),
  )
})
afterAll(async () => {
  await client?.close()
  await fixture?.close()
  expect(fixture.activeRequests).toBe(0)
})
test('actual production protocol exposes exactly seven reads, exact schema and safe annotations', async () => {
  const inventory = await client.listTools()
  expect(inventory.tools.map((tool) => tool.name).sort()).toEqual([...READ_TOOLS].sort())
  for (const tool of inventory.tools) {
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    })
    expect(tool.inputSchema.additionalProperties).toBe(false)
  }
  sourceDirectory = await mkdtemp(
    resolve(fileURLToPath(new URL('./work/', import.meta.url)), 'public-read-source-check-'),
  )
  const source = await writeReadFixtureSource(sourceDirectory, fixture.origin, fixture.namespace)
  expect(source.server).not.toBe('tqx')
  expect(source.server).not.toBe('tqx_local')
  const mcp = JSON.parse(
    await readFile(resolve(sourceDirectory, `plugins/${source.id}/mcp.json`), 'utf8'),
  )
  expect(mcp).toEqual({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { [source.server]: { type: 'streamable-http', url: `${fixture.origin}/mcp` } },
  })
  const portablePlugin = JSON.parse(
    await readFile(resolve(sourceDirectory, `plugins/${source.id}/plugin.json`), 'utf8'),
  )
  expect(portablePlugin.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
  await writeFile(
    resolve(sourceDirectory, 'schema-selfcheck.json'),
    JSON.stringify(
      {
        fixture: FIXTURE_MARKER,
        tools: inventory.tools,
        catalog_sha256: createHash('sha256').update(canonical(inventory.tools)).digest('hex'),
        installed: false,
      },
      null,
      2,
    ),
  )
})
for (const item of readCases)
  test(`${item.id} ${item.tool}: ${item.expect}`, async () => {
    const pages: Record<string, unknown>[] = []
    let cursor: string | undefined
    do {
      const result = CallToolResultSchema.parse(
        await client.callTool({
          name: item.tool,
          arguments: { ...item.args, ...(cursor ? { cursor } : {}) },
        }),
      )
      expect(result['_meta']?.fixture).toBe(FIXTURE_MARKER)
      const text = result.content.find((content) => content.type === 'text')
      expect(text?.type).toBe('text')
      const data = JSON.parse(text && 'text' in text ? text.text : '')
      expect(data.fixture).toBe(FIXTURE_MARKER)
      expect(data.fixture_namespace).toBe(fixture.namespace)
      const errors: Record<string, string> = {
        C14: 'order_not_found',
        C15: 'trading_service_unavailable',
        C23: 'cash_flows_unsupported',
        C27: 'signal_not_found',
        C28: 'trading_request_rejected',
      }
      if (errors[item.id]) {
        expect(result.isError).toBe(true)
        expect(data.error).toBe(errors[item.id])
        expect(data.items).toBeUndefined()
      } else expect(result.isError).not.toBe(true)
      pages.push(data)
      if ('followOpaqueCursor' in item && item.followOpaqueCursor) {
        expect(data.next_cursor === null || /^[A-Za-z0-9_-]{43}$/.test(data.next_cursor)).toBe(true)
        cursor = data.next_cursor ?? undefined
      } else cursor = undefined
      expect(pages.length).toBeLessThanOrEqual(4)
    } while (cursor)
    results.set(item.id, pages)
  })
test('assert pages, precision, currencies, lifecycle, signed amounts, nulls and stale semantics', () => {
  const first = (id: string) => results.get(id)![0]!
  const rows = (id: string) =>
    results.get(id)!.flatMap((page) => page.items as Record<string, unknown>[])
  expect(first('C01')).toMatchObject({
    mode: 'PAPER',
    base_currency: 'HKD',
    is_stale: true,
    cash: null,
    as_of: '2020-01-02T08:00:00.000Z',
  })
  expect(first('C02').total_assets).toBe('9007199254740993.123456789012345678')
  for (const id of ['C04', 'C09', 'C16', 'C20']) {
    expect(results.get(id)).toHaveLength(2)
    expect(rows(id)).toHaveLength(4)
  }
  expect(new Set(rows('C04').map((row) => row.symbol)).size).toBe(4)
  expect(rows('C06').find((row) => row.symbol === 'BETA.US')?.quantity).toBe('9007199254740993')
  expect(rows('C07')[0]).toMatchObject({
    average_cost: null,
    last_price: null,
    market_value: null,
    price_currency: null,
  })
  expect(rows('C08')).toEqual([])
  expect(rows('C17').map((row) => row.quantity)).toEqual(['1', '2'])
  expect(rows('C18')[0]).toMatchObject({
    currency: 'HKD',
    commission: null,
    total_fees: null,
    fees: null,
  })
  expect(rows('C19')).toEqual([])
  expect(rows('C21').map((row) => row.amount)).toEqual([
    '-10.100000000000000001',
    '-0.010000000000000001',
  ])
  expect(rows('C22')[0]).toMatchObject({ currency: 'USD', category: null, occurred_at: null })
  expect(rows('C24')).toEqual([])
  expect(first('C25')).toMatchObject({ state: 'ACCEPTED', order_id: null, order_status: null })
  expect(first('C26')).toMatchObject({ state: 'UNKNOWN', order_id: null, order_status: null })
})
test('unknown writes and invalid arguments are rejected and attempted tool names are audited', async () => {
  for (const tool of [
    'placeOrder',
    'modifyOrder',
    'cancelOrder',
    'placeOrders',
    'publicUnknownWrite',
  ]) {
    const result = await client.callTool({ name: tool, arguments: {} })
    expect(result.isError).toBe(true)
    expect(fixture.audit.some((entry) => entry.tool === tool)).toBe(true)
  }
  const invalid = await client.callTool({ name: 'getAccount', arguments: { extra: 'must reject' } })
  expect(invalid.isError).toBe(true)
  const first = await client.callTool({ name: 'listPositions', arguments: { limit: 2 } })
  const text = first.content as { type: string; text: string }[]
  const cursor = JSON.parse(text[0]!.text).next_cursor
  const crossFilter = await client.callTool({
    name: 'listPositions',
    arguments: { limit: 2, market: 'HK', cursor },
  })
  expect(crossFilter.isError).toBe(true)
})
test('non-MCP write paths, hostile Origin/Host, credentials and OAuth discovery fail closed', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT'])
    for (const path of ['/openapi/v1/trading/orders', '/fixture/control', '/fixture/audit']) {
      const response = await fetch(`${fixture.origin}${path}`, { method, redirect: 'error' })
      expect(response.status).toBe(405)
      expect(response.headers.get('x-tqx-fixture')).toBe(FIXTURE_MARKER)
      await response.body?.cancel()
    }
  const rejectedHeaders: Record<string, string>[] = [
    { Origin: 'https://untrusted.invalid' },
    { Authorization: 'Bearer unrelated-credential' },
  ]
  for (const headers of rejectedHeaders) {
    const response = await fetch(`${fixture.origin}/healthz`, { headers, redirect: 'error' })
    expect([400, 403]).toContain(response.status)
    await response.body?.cancel()
  }
  await new Promise<void>((ok, fail) => {
    const request = httpRequest(
      `${fixture.origin}/healthz`,
      { headers: { Host: 'localhost:3004' } },
      (response) => {
        expect(response.statusCode).toBe(403)
        response.resume()
        response.once('end', ok)
      },
    )
    request.once('error', fail)
    request.end()
  })
  const metadata = await fetch(`${fixture.origin}/.well-known/oauth-authorization-server`, {
    redirect: 'error',
  })
  expect(metadata.status).toBe(404)
  await metadata.body?.cancel()
})
test('manifest and audit are public, marker tagged, args hash only; emit bounded selfcheck record', async () => {
  const response = await fetch(`${fixture.origin}/fixture/audit`, { redirect: 'error' })
  const body = await response.json()
  expect(body.fixture).toBe(FIXTURE_MARKER)
  expect(body.calls.length).toBeGreaterThanOrEqual(READ_TOOLS.length)
  for (const entry of body.calls)
    expect(Object.keys(entry).sort()).toEqual(['arguments_sha256', 'namespace', 'sequence', 'tool'])
  const manifest = sampleManifest(fixture.namespace)
  expect(manifest.cases).toHaveLength(28)
  await writeFile(
    resolve(sourceDirectory, 'selfcheck-result.json'),
    JSON.stringify(
      {
        fixture: FIXTURE_MARKER,
        layer: 'C fixture preparation only; not actual model session evidence',
        cases: manifest.cases.length,
        audit: body.calls,
        realAccountOrBrokerEvidence: false,
        installed: false,
        actualDesktopModelSessionRun: false,
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      publicReadSelfcheckSource: sourceDirectory,
      calls: body.calls.length,
      actualModelSession: false,
    }),
  )
})
