import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { loadConfig } from '../../src/config'
import { createProtocolServer } from '../../src/protocol'
import { canonical, FIXTURE_MARKER, readSample } from './read-fixture-data'
import { sampleManifest } from './read-fixture-cases'

type SendOptions = Parameters<StreamableHTTPServerTransport['send']>[1]
class FixtureTransport extends StreamableHTTPServerTransport {
  constructor(readonly namespace: string) {
    super({ sessionIdGenerator: undefined, enableJsonResponse: true })
  }
  override async send(message: JSONRPCMessage, options?: SendOptions) {
    const metadata = { fixture: FIXTURE_MARKER, fixture_namespace: this.namespace }
    if ('result' in message) {
      const result: typeof message.result = {
        ...message.result,
        _meta: { ...message.result['_meta'], ...metadata },
      }
      if (Array.isArray(result.content))
        result.content = result.content.map((item: unknown) => {
          if (
            !item ||
            typeof item !== 'object' ||
            !('type' in item) ||
            item.type !== 'text' ||
            !('text' in item) ||
            typeof item.text !== 'string'
          )
            return item
          try {
            return { ...item, text: JSON.stringify({ ...JSON.parse(item.text), ...metadata }) }
          } catch {
            return item
          }
        })
      message = { ...message, result }
    } else if ('error' in message)
      message = { ...message, error: { ...message.error, data: metadata } }
    await super.send(message, options)
  }
}
export interface ReadAudit {
  sequence: number
  namespace: string
  tool: string
  arguments_sha256: string
}
function json(response: ServerResponse, data: unknown, status = 200) {
  response
    .writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-tqx-fixture': FIXTURE_MARKER,
    })
    .end(JSON.stringify(data))
}
export async function startReadFixture(options: { namespace?: string } = {}) {
  const namespace = options.namespace ?? `c-read-${randomUUID()}`
  assert(/^c-read-[a-z0-9-]{8,64}$/.test(namespace), 'Invalid public fixture namespace')
  const audit: ReadAudit[] = []
  const active = new Set<() => Promise<void>>()
  let origin = ''
  let closing = false
  const http = createServer((request, response) => {
    void (async () => {
      response.setHeader('X-TQX-Fixture', FIXTURE_MARKER)
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Referrer-Policy', 'no-referrer')
      if (closing) return json(response, { fixture: FIXTURE_MARKER, error: 'fixture_closed' }, 503)
      const hostCount = request.rawHeaders.filter(
        (_, index) => index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === 'host',
      ).length
      if (
        hostCount !== 1 ||
        request.headers.host !== new URL(origin).host ||
        request.headers.origin !== undefined
      )
        return json(response, { fixture: FIXTURE_MARKER, error: 'fixture_boundary_rejected' }, 403)
      if (
        request.headers.authorization &&
        request.headers.authorization !== `Bearer ${FIXTURE_MARKER}`
      )
        return json(
          response,
          { fixture: FIXTURE_MARKER, error: 'fixture_expects_no_credentials' },
          400,
        )
      const url = new URL(request.url ?? '/', origin)
      if (url.pathname !== '/mcp') {
        if (request.method !== 'GET')
          return json(response, { fixture: FIXTURE_MARKER, error: 'fixture_read_only' }, 405)
        if (url.pathname === '/healthz')
          return json(response, { fixture: FIXTURE_MARKER, namespace, businessWrites: false })
        if (url.pathname === '/fixture/manifest') return json(response, sampleManifest(namespace))
        if (url.pathname === '/fixture/audit')
          return json(response, { fixture: FIXTURE_MARKER, namespace, calls: audit })
        const sample = readSample(url, namespace)
        return json(
          response,
          {
            fixture: FIXTURE_MARKER,
            code: sample.code,
            data: sample.data,
            message: FIXTURE_MARKER,
            request_id: `public-${namespace}`,
            timestamp: 1577952000,
          },
          sample.status,
        )
      }
      if (request.method !== 'POST')
        return json(response, { fixture: FIXTURE_MARKER, error: 'fixture_method_not_allowed' }, 405)
      let bytes = 0
      const chunks: Buffer[] = []
      for await (const part of request) {
        const chunk = Buffer.from(part)
        bytes += chunk.length
        if (bytes > 65536)
          return json(response, { fixture: FIXTURE_MARKER, error: 'fixture_body_too_large' }, 413)
        chunks.push(chunk)
      }
      let body: unknown
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return json(response, { fixture: FIXTURE_MARKER, error: 'fixture_invalid_json' }, 400)
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return json(response, { fixture: FIXTURE_MARKER, error: 'fixture_invalid_rpc' }, 400)
      const rpc = body as { method?: unknown; params?: { name?: unknown; arguments?: unknown } }
      if (rpc.method === 'tools/call') {
        audit.push({
          sequence: audit.length + 1,
          namespace,
          tool: typeof rpc.params?.name === 'string' ? rpc.params.name.slice(0, 256) : '<invalid>',
          arguments_sha256: createHash('sha256')
            .update(canonical(rpc.params?.arguments ?? {}))
            .digest('hex'),
        })
      }
      const controller = new AbortController()
      const config = {
        ...loadConfig({
          MCP_PORT: new URL(origin).port,
          MCP_RESOURCE: `${origin}/mcp`,
          MCP_OAUTH_ISSUER: origin,
          MCP_JWKS_URL: `${origin}/not-used`,
          MCP_API_RESOURCE: `${origin}/api`,
          MCP_TRADING_BASE_URL: origin,
        }),
        tradingToolsEnabled: true,
        tradingWriteToolsEnabled: false,
        tradingTimeoutMs: 5000,
      }
      const protocol = createProtocolServer({
        config,
        access: {
          token: FIXTURE_MARKER,
          scopes: ['trade:read'],
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        },
        signal: controller.signal,
      })
      const transport = new FixtureTransport(namespace)
      let closed: Promise<void> | undefined
      const close = () =>
        (closed ??= (async () => {
          controller.abort()
          await Promise.allSettled([protocol.close(), transport.close()])
          active.delete(close)
        })())
      active.add(close)
      response.once('close', () => {
        void close()
      })
      try {
        await protocol.connect(transport)
        if (!response.destroyed) await transport.handleRequest(request, response, body)
      } finally {
        if (response.writableEnded || response.destroyed) await close()
      }
    })().catch(() => {
      if (!response.headersSent)
        json(response, { fixture: FIXTURE_MARKER, error: 'fixture_internal_error' }, 500)
      else response.end()
    })
  })
  http.headersTimeout = 5000
  http.requestTimeout = 10000
  http.keepAliveTimeout = 1000
  await new Promise<void>((ok, fail) => {
    http.once('error', fail)
    http.listen(0, '127.0.0.1', ok)
  })
  const address = http.address()
  assert(address && typeof address === 'object')
  origin = `http://127.0.0.1:${address.port}`
  return {
    origin,
    namespace,
    audit,
    get activeRequests() {
      return active.size
    },
    async close() {
      if (closing) return
      closing = true
      await Promise.allSettled([...active].map((close) => close()))
      await new Promise<void>((ok) => {
        const timer = setTimeout(() => http.closeAllConnections(), 1000)
        http.close(() => {
          clearTimeout(timer)
          ok()
        })
        http.closeIdleConnections()
      })
    },
  }
}

export async function writeReadFixtureSource(
  outputDirectory: string,
  origin: string,
  namespace: string,
) {
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  const id = `tqx-public-read-${namespace.replace(/^c-read-/, '').replaceAll('-', '')}`
  const marketplace = `${id}-market`
  const server = `${id}-mcp`
  const pluginDirectory = resolve(outputDirectory, 'plugins', id)
  await mkdir(resolve(outputDirectory, '.agents/plugins'), { recursive: true })
  await mkdir(pluginDirectory, { recursive: true })
  const save = (file: string, value: unknown) =>
    writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  await save(resolve(outputDirectory, '.agents/plugins/marketplace.json'), {
    name: marketplace,
    interface: { displayName: 'Public Synthetic Read Fixture' },
    plugins: [
      {
        name: id,
        source: { source: 'local', path: `./plugins/${id}` },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      },
    ],
  })
  await save(resolve(pluginDirectory, 'plugin.json'), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: id,
    version: '0.1.0',
    description: FIXTURE_MARKER,
    author: { name: 'TQX synthetic acceptance fixture' },
    extensions: {
      'com.openai': {
        requires_local_executor: true,
        interface: {
          displayName: 'Public Synthetic Read Fixture',
          shortDescription: 'Public synthetic PAPER reads',
          longDescription: `${FIXTURE_MARKER}. No real account, OAuth, broker or write capability.`,
          developerName: 'TQX',
          category: 'Productivity',
          capabilities: ['Read'],
          defaultPrompt:
            'Read only this public synthetic fixture; preserve decimal strings, nulls, currencies and uncertainty. Do not use tqx or tqx_local.',
        },
      },
    },
  })
  await save(resolve(pluginDirectory, 'mcp.json'), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { [server]: { type: 'streamable-http', url: `${origin}/mcp` } },
  })
  await save(resolve(outputDirectory, 'manifest.json'), {
    ...sampleManifest(namespace),
    origin,
    id,
    marketplace,
    server,
  })
  return { id, marketplace, server, pluginRef: `plugin://${id}@${marketplace}` }
}
async function main() {
  const args = process.argv.slice(2)
  assert(
    args[0] === '--output-dir' &&
      args[1] &&
      (args.length === 2 || (args.length === 4 && args[2] === '--lifetime-seconds')),
    'Expected --output-dir and optional --lifetime-seconds',
  )
  const lifetime = Number(args[3] ?? '3600')
  assert(Number.isInteger(lifetime) && lifetime >= 30 && lifetime <= 7200)
  const work = resolve(fileURLToPath(new URL('./work', import.meta.url)))
  const output = resolve(args[1])
  assert(
    output.startsWith(`${work}${sep}`),
    'Output must be a fresh directory within this integration work directory',
  )
  const fixture = await startReadFixture()
  try {
    const source = await writeReadFixtureSource(output, fixture.origin, fixture.namespace)
    console.log(
      JSON.stringify({
        event: 'public_read_fixture_ready',
        fixture: FIXTURE_MARKER,
        ...source,
        origin: fixture.origin,
        namespace: fixture.namespace,
        source: output,
        lifetimeSeconds: lifetime,
        pid: process.pid,
        expiresAt: new Date(Date.now() + lifetime * 1000).toISOString(),
        installed: false,
      }),
    )
    await new Promise<void>((ok) => {
      const stop = () => {
        clearTimeout(timer)
        process.off('SIGINT', stop)
        process.off('SIGTERM', stop)
        ok()
      }
      const timer = setTimeout(stop, lifetime * 1000)
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    })
    console.log(
      JSON.stringify({
        event: 'public_read_fixture_stopped',
        fixture: FIXTURE_MARKER,
        namespace: fixture.namespace,
        calls: fixture.audit,
      }),
    )
  } finally {
    await fixture.close()
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main().catch(() => {
    console.error('Public read fixture failed; no human connection was used.')
    process.exitCode = 1
  })
