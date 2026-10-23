import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  request,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose'
import type { ApplicationOptions } from '../src/app'
import { loadConfig } from '../src/config'
import { startService } from '../src/runtime'

// Synthetic keys/tokens exist only in memory, with no account, consent, or Trading binding.
export async function fixture(
  options: ApplicationOptions = {},
  jwksTimeoutMs?: number,
  env: NodeJS.ProcessEnv = {},
) {
  const keys = await generateKeyPair('RS256')
  const wrongKeys = await generateKeyPair('RS256')
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'synthetic-test-key',
    alg: 'RS256',
    use: 'sig',
  }
  const jwksState = {
    hits: [] as string[],
    unavailable: false,
    hold: false,
    active: 0,
  }
  const held = new Set<() => void>()
  const asState: {
    handle?: (req: IncomingMessage, res: ServerResponse) => void
  } = {}
  const jwks = createServer((req, res) => {
    if (req.url === '/oauth/token' && asState.handle) {
      asState.handle(req, res)
      return
    }
    jwksState.active++
    res.once('close', () => {
      jwksState.active--
    })
    jwksState.hits.push(req.url ?? '')
    if (req.url !== '/.well-known/jwks.json' || jwksState.unavailable) {
      res.writeHead(503).end('synthetic fixture unavailable')
      return
    }
    const send = () => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ keys: [jwk] }))
    }
    if (jwksState.hold) {
      held.add(send)
      res.once('close', () => {
        held.delete(send)
      })
    } else send()
  })
  await new Promise<void>((resolve) => jwks.listen(0, '127.0.0.1', resolve))
  const issuer = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}`
  const config = loadConfig({ ...env, MCP_OAUTH_ISSUER: issuer })
  if (jwksTimeoutMs !== undefined) config.jwksTimeoutMs = jwksTimeoutMs
  config.port = 0 // Tests alone request an OS-assigned port, avoiding fixed-port collisions.
  const service = await startService(config, options)
  const base = `http://127.0.0.1:${service.address.port}`
  // Finalize only the ephemeral test address before sending any requests.
  config.resource = `${base}/mcp`
  config.allowedHosts = [new URL(base).host]
  config.allowedOrigins = [base]
  return {
    config,
    service,
    base,
    issuer,
    jwksState,
    keys,
    wrongKeys,
    asState,
    releaseJwks: () => {
      jwksState.hold = false
      for (const send of held) send()
      held.clear()
    },
    sign: async (
      claims: Record<string, unknown> = {},
      signing: { key?: CryptoKey; header?: Record<string, unknown> } = {},
    ) => {
      const now = Math.floor(Date.now() / 1000)
      const payload = {
        iss: issuer,
        aud: config.resource,
        sub: 'synthetic-user',
        client_id: 'synthetic-client',
        sid: 'synthetic-session',
        jti: 'synthetic-token',
        scope: 'trade:read',
        iat: now,
        exp: now + 120,
        ...(config.tradingToolsEnabled
          ? { agent_id: 'synthetic-agent', grant_id: 'synthetic-grant' }
          : {}),
        ...claims,
      } as JWTPayload
      return new SignJWT(payload)
        .setProtectedHeader({
          alg: 'RS256',
          kid: 'synthetic-test-key',
          ...signing.header,
        })
        .sign(signing.key ?? keys.privateKey)
    },
    close: async () => {
      await service.close()
      jwks.closeAllConnections()
      await new Promise<void>((resolve) => jwks.close(() => resolve()))
    },
  }
}

export async function rawRequest(
  url: string,
  headers: Record<string, string> | string[],
  body = '',
) {
  return new Promise<{
    status: number
    headers: IncomingHttpHeaders
    body: string
  }>((resolve, reject) => {
    const req = request(url, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        }),
      )
    })
    req.setTimeout(5_000, () => req.destroy(new Error('Test request timeout')))
    req.on('error', reject)
    req.end(body)
  })
}

export const listBody = JSON.stringify({
  jsonrpc: '2.0',
  id: 7,
  method: 'tools/list',
  params: {},
})
export const rpcHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
}
