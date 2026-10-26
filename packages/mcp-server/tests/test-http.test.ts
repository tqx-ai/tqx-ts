import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'
import { startService } from '../src/runtime'

const origins = [
  'http://192.168.1.3:3002',
  'http://192.168.1.3:26823',
  'http://192.168.1.3:8100',
  'http://192.168.1.3:3001',
]
const lan = {
  TQX_ENV: 'test',
  MCP_HOST: '0.0.0.0',
  MCP_PORT: '3002',
  MCP_RESOURCE: `${origins[0]}/mcp`,
  MCP_OAUTH_ISSUER: origins[1],
  MCP_API_RESOURCE: `${origins[2]}/api`,
  MCP_TRADING_BASE_URL: origins[2],
  MCP_ALLOWED_ORIGINS: origins[3],
}
const optedIn = { ...lan, TQX_TEST_HTTP_ORIGINS: origins.join(',') }
const active: { close(): Promise<void> }[] = []
afterEach(async () => {
  for (const service of active.splice(0)) await service.close()
})

describe('explicit test-profile HTTP exception', () => {
  it('before: rejects the planned LAN configuration without opt-in', () => {
    expect(() => loadConfig(lan)).toThrow('Invalid configuration: MCP_RESOURCE')
  })
  it('allows only the opted-in test tuple without pretending TLS termination', () => {
    expect(loadConfig(optedIn)).toMatchObject({
      environment: 'test',
      host: '0.0.0.0',
      resource: lan.MCP_RESOURCE,
      issuer: lan.MCP_OAUTH_ISSUER,
      jwksUrl: `${lan.MCP_OAUTH_ISSUER}/.well-known/jwks.json`,
      apiResource: lan.MCP_API_RESOURCE,
      tradingBaseUrl: lan.MCP_TRADING_BASE_URL,
      allowedHosts: ['192.168.1.3:3002'],
      allowedOrigins: [origins[3]],
      tlsTerminatedByProxy: false,
      tradingToolsEnabled: false,
      tradingWriteToolsEnabled: false,
    })
  })
  it.each(['local', 'prod', 'pro', 'production', 'dev', 'sandbox', 'legacy', ''])(
    'does not enable LAN HTTP in profile %j',
    (environment) => {
      expect(() => loadConfig({ ...optedIn, TQX_ENV: environment })).toThrow('MCP_RESOURCE')
    },
  )
  it.each([{ RUN_MODE: 'TEST' }, { OAUTH_MODE: 'test' }, { NODE_ENV: 'test' }, {}])(
    'does not invent environment selectors: %j',
    (extra) => {
      expect(() => loadConfig({ ...optedIn, TQX_ENV: undefined, ...extra })).toThrow('MCP_RESOURCE')
    },
  )
  it.each(['', ' ', undefined])('empty list preserves loopback and rejects LAN: %j', (value) => {
    expect(() => loadConfig({ ...lan, TQX_TEST_HTTP_ORIGINS: value })).toThrow('MCP_RESOURCE')
    expect(loadConfig({ TQX_ENV: 'test', TQX_TEST_HTTP_ORIGINS: value }).resource).toBe(
      'http://127.0.0.1:3002/mcp',
    )
  })
  it('ignores even an invalid irrelevant variable outside test, including production HTTPS', () => {
    for (const environment of ['local', 'prod', 'pro', 'production', 'legacy', undefined]) {
      expect(
        loadConfig({ TQX_ENV: environment, TQX_TEST_HTTP_ORIGINS: 'secret-malformed-value' }),
      ).toEqual(loadConfig({ TQX_ENV: environment }))
      expect(
        loadConfig({
          TQX_ENV: environment,
          TQX_TEST_HTTP_ORIGINS: 'secret-malformed-value',
          MCP_HOST: '0.0.0.0',
          MCP_RESOURCE: 'https://mcp.example.test/mcp',
          MCP_TLS_TERMINATED_BY_PROXY: 'true',
        }).resource,
      ).toBe('https://mcp.example.test/mcp')
    }
  })
  it('uses the existing selected test profile even for a production Node build', () => {
    expect(loadConfig({ ...optedIn, NODE_ENV: 'production' }).resource).toBe(lan.MCP_RESOURCE)
  })
  it.each([
    ['MCP_RESOURCE', 'http://192.168.1.3:3003/mcp'],
    ['MCP_RESOURCE', 'http://192.168.1.4:3002/mcp'],
    ['MCP_OAUTH_ISSUER', 'http://192.168.1.4:26823'],
    ['MCP_JWKS_URL', 'http://192.168.1.3:26824/.well-known/jwks.json'],
    ['MCP_API_RESOURCE', 'http://192.168.1.3:8101/api'],
    ['MCP_TRADING_BASE_URL', 'http://192.168.1.4:8100'],
    ['MCP_ALLOWED_ORIGINS', 'http://192.168.1.3:3005'],
    ['MCP_RESOURCE', 'http://192.168.1.3:3002/other'],
    ['MCP_RESOURCE', 'http://192.168.1.3:3002/mcp?x=1'],
    ['MCP_OAUTH_ISSUER', 'http://user:private@192.168.1.3:26823'],
    ['MCP_JWKS_URL', 'http://192.168.1.3:26823/.well-known/jwks.json#'],
    ['MCP_OAUTH_ISSUER', 'http://0xc0a80103:26823'],
  ])('does not relax endpoint checks: %s %s', (name, value) => {
    expect(() => loadConfig({ ...optedIn, [name]: value })).toThrow(name)
  })
  it.each([
    'http://example.test:3002',
    'https://192.168.1.3:3002',
    'http://8.8.8.8',
    'http://0.0.0.0',
    'http://169.254.1.1',
    'http://127.0.0.1:3002',
    'http://[::1]:3002',
    'http://100.64.0.1',
    'http://172.15.255.255',
    'http://172.32.0.0',
    'http://192.169.0.1',
    'http://10.0.0.1/',
    'http://10.0.0.1/path',
    'http://10.0.0.1?x=1',
    'http://10.0.0.1#',
    'http://user:private@10.0.0.1',
    'http://10.0.0.0/8',
    'http://10.*',
    'http://0x0a000001',
    'http://167772161',
    'http://010.0.0.1',
    'http://10.1',
    'http://%31%30.0.0.1',
    'HTTP://10.0.0.1',
    'http://10.0.0.1:80',
    'http://10.0.0.1:0',
    'http://10.0.0.1 , ,http://10.0.0.2',
    'http://10.0.0.1,',
    ',http://10.0.0.1',
    'http://10.0. 0.1',
    'http://10.0.0.1\n:3002',
  ])('rejects a dangerous/noncanonical origin: %j', (origin) => {
    expect(() => loadConfig({ TQX_ENV: 'test', TQX_TEST_HTTP_ORIGINS: origin })).toThrow(
      'Invalid configuration: TQX_TEST_HTTP_ORIGINS',
    )
  })
  it.each([
    'http://10.0.0.1',
    'http://10.255.255.255:65535',
    'http://172.16.0.0:3002',
    'http://172.31.255.255',
    'http://192.168.0.0',
    'http://192.168.255.255',
  ])('accepts canonical RFC1918 boundaries: %s', (origin) => {
    expect(
      loadConfig({
        TQX_ENV: 'test',
        TQX_TEST_HTTP_ORIGINS: ` ${origin}, ${origin} `,
        MCP_RESOURCE: `${origin}/mcp`,
      }).resource,
    ).toBe(`${origin}/mcp`)
  })
  it('retains TLS, credentials and timeout consistency checks after opt-in', () => {
    expect(() => loadConfig({ ...optedIn, MCP_TLS_TERMINATED_BY_PROXY: 'true' })).toThrow(
      'MCP_RESOURCE',
    )
    expect(() =>
      loadConfig({ ...optedIn, MCP_TLS_CERT_FILE: 'cert', MCP_TLS_KEY_FILE: 'key' }),
    ).toThrow('MCP_RESOURCE')
    expect(() => loadConfig({ ...optedIn, MCP_TLS_CERT_FILE: 'cert' })).toThrow(
      'MCP_TLS_CERT_FILE/MCP_TLS_KEY_FILE',
    )
    expect(() => loadConfig({ ...optedIn, MCP_TRADING_TOOLS_ENABLED: 'true' })).toThrow(
      'MCP_EXCHANGE_CLIENT_SECRET',
    )
    expect(() => loadConfig({ ...optedIn, MCP_HEADERS_TIMEOUT_MS: '50000' })).toThrow(
      'MCP_HEADERS_TIMEOUT_MS',
    )
  })
  it('retains the original full-URL default-port normalization and exact-resource rules', () => {
    const env = { TQX_ENV: 'test', TQX_TEST_HTTP_ORIGINS: 'http://10.0.0.1' }
    expect(
      loadConfig({
        ...env,
        MCP_OAUTH_ISSUER: 'http://10.0.0.1:80',
        MCP_JWKS_URL: 'http://10.0.0.1:80/keys',
      }),
    ).toMatchObject({ issuer: 'http://10.0.0.1:80', jwksUrl: 'http://10.0.0.1:80/keys' })
    expect(() => loadConfig({ ...env, MCP_RESOURCE: 'http://10.0.0.1:80/mcp' })).toThrow(
      'MCP_RESOURCE',
    )
    expect(() => loadConfig({ ...env, MCP_TRADING_BASE_URL: 'http://10.0.0.1:80' })).toThrow(
      'MCP_TRADING_BASE_URL',
    )
  })
  it('does not leak invalid list entries in errors', () => {
    expect(() =>
      loadConfig({ TQX_ENV: 'test', TQX_TEST_HTTP_ORIGINS: 'private-invalid-input' }),
    ).toThrow(/^Invalid configuration: TQX_TEST_HTTP_ORIGINS$/)
  })
  it('serves HTTP with advertised LAN identity through the real Host/Origin boundaries on an owned loopback listener', async () => {
    // No LAN socket is contacted: only the listener is changed to an ephemeral loopback address.
    const config = loadConfig(optedIn)
    config.host = '127.0.0.1'
    config.port = 0
    const service = await startService(config)
    active.push(service)
    const get = (path: string, host = '192.168.1.3:3002', origin = origins[3]) =>
      new Promise<{ status: number; data: any; challenge: string | undefined }>(
        (resolve, reject) => {
          const req = request(
            {
              host: '127.0.0.1',
              port: service.address.port,
              path,
              headers: { Host: host, Origin: origin },
            },
            (res) => {
              let body = ''
              res.on('data', (chunk: Buffer) => {
                body += chunk.toString()
              })
              res.on('end', () =>
                resolve({
                  status: res.statusCode!,
                  data: JSON.parse(body),
                  challenge: res.headers['www-authenticate'],
                }),
              )
            },
          )
          req.on('error', reject)
          req.end()
        },
      )
    expect((await get('/healthz')).status).toBe(200)
    expect((await get('/.well-known/oauth-protected-resource/mcp')).data).toMatchObject({
      resource: lan.MCP_RESOURCE,
      authorization_servers: [lan.MCP_OAUTH_ISSUER],
    })
    const unauthorized = await get('/mcp')
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.challenge).toContain(
      'http://192.168.1.3:3002/.well-known/oauth-protected-resource/mcp',
    )
    expect((await get('/healthz', '192.168.1.3:3003')).status).toBe(403)
    expect((await get('/healthz', '192.168.1.3:3002', 'http://192.168.1.3:3005')).status).toBe(403)
    expect(service.application.activeRequestCount).toBe(0)
  })
})
