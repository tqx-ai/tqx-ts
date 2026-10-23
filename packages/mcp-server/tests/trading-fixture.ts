import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { decodeJwt, SignJWT } from 'jose'
import { fixture } from './fixture'

// Entire AS, Trading data, credentials and accounts in this fixture are synthetic.
export async function tradingFixture(
  options: { exchangeTimeoutMs?: number; tradingTimeoutMs?: number } = {},
) {
  const state = {
    exchange: [] as {
      form: URLSearchParams
      authorization: string | undefined
    }[],
    trading: [] as { url: string; token: string; subject: string }[],
    error: undefined as { status: number; code: string } | undefined,
    claims: {} as Record<string, unknown>,
    envelope: {} as Record<string, unknown>,
    wrongKey: false,
    malformed: false,
    asContentType: 'application/json',
    redirect: false,
    holdExchange: false,
    holdTrading: false,
    activeExchange: 0,
    activeTrading: 0,
    tradingStatus: 200,
    invalidTradingData: false,
    tradingRedirect: false,
  }
  const trading = createServer((req, res) => {
    state.activeTrading++
    res.once('close', () => {
      state.activeTrading--
    })
    const token = req.headers.authorization?.slice(7) ?? ''
    const payload = token ? decodeJwt(token) : {}
    const subject = String(payload.sub)
    state.trading.push({ url: req.url ?? '', token, subject })
    if (state.tradingRedirect) {
      res.writeHead(302, { Location: '/synthetic-redirect-trap' }).end()
      return
    }
    if (state.holdTrading) return
    res.setHeader('Content-Type', 'application/json')
    if (state.tradingStatus !== 200) {
      res.writeHead(state.tradingStatus).end(
        JSON.stringify({
          code: 'synthetic_error',
          message: 'synthetic private backend error',
          data: null,
          request_id: 'synthetic-request',
          timestamp: 1,
        }),
      )
      return
    }
    const data = req.url?.startsWith('/openapi/v1/trading/account')
      ? {
          account_id: subject,
          mode: 'PAPER',
          base_currency: 'USD',
          total_assets: '9007199254740993.123456',
          cash: null,
          available_cash: '10.00',
          frozen_cash: null,
          buying_power: '10.00',
          market_value: '0',
          unrealized_pnl: null,
          as_of: 'synthetic-as-of',
          is_stale: true,
        }
      : {
          items: [
            {
              symbol: 'SYNTHETIC.US',
              symbol_name: subject,
              market: 'US',
              currency: 'USD',
              side: 'LONG',
              quantity: '9007199254740993',
              available_quantity: '1',
              average_cost: null,
              last_price: '10.1234',
              market_value: null,
              unrealized_pnl: null,
              unrealized_pnl_ratio: null,
              as_of: 'synthetic-as-of',
              price_currency: null,
            },
          ],
          next_cursor: 'synthetic-next',
        }
    res.end(
      JSON.stringify({
        code: '0',
        message: 'ok',
        data: state.invalidTradingData ? {} : data,
        request_id: 'synthetic-request',
        timestamp: 1,
      }),
    )
  })
  await new Promise<void>((resolve) => trading.listen(0, '127.0.0.1', resolve))
  const tradingBase = `http://127.0.0.1:${(trading.address() as AddressInfo).port}`
  const f = await fixture({}, undefined, {
    MCP_TRADING_TOOLS_ENABLED: 'true',
    MCP_EXCHANGE_CLIENT_SECRET: 'synthetic-secret: +/=',
    MCP_API_RESOURCE: `${tradingBase}/api`,
    MCP_TRADING_BASE_URL: tradingBase,
    MCP_EXCHANGE_TIMEOUT_MS: String(options.exchangeTimeoutMs ?? 5_000),
    MCP_TRADING_TIMEOUT_MS: String(options.tradingTimeoutMs ?? 5_000),
  })
  let sequence = 0
  f.asState.handle = (req, res) => {
    state.activeExchange++
    res.once('close', () => {
      state.activeExchange--
    })
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      void (async () => {
        const form = new URLSearchParams(body)
        state.exchange.push({ form, authorization: req.headers.authorization })
        if (state.holdExchange) return
        if (state.redirect) {
          res.writeHead(302, { Location: `${tradingBase}/trap` }).end()
          return
        }
        res.setHeader('Content-Type', state.asContentType)
        if (state.error) {
          res.writeHead(state.error.status).end(
            JSON.stringify({
              error: state.error.code,
              error_description: 'synthetic private AS detail',
            }),
          )
          return
        }
        if (state.malformed) {
          res.end('{synthetic malformed')
          return
        }
        const source = decodeJwt(form.get('subject_token') ?? '')
        const now = Math.floor(Date.now() / 1000)
        const exp = Math.min(now + 60, source.exp ?? 0)
        const payload = {
          iss: f.issuer,
          aud: f.config.apiResource,
          sub: source.sub,
          sid: source.sid,
          grant_id: source.grant_id,
          agent_id: source.agent_id,
          source_client_id: source.client_id,
          client_id: 'tqx_mcp_server',
          act: { sub: 'tqx_mcp_server' },
          jti: `synthetic-derived-${++sequence}`,
          iat: now,
          exp,
          scope: 'trade:read',
          ...state.claims,
        }
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-test-key' })
          .sign(state.wrongKey ? f.wrongKeys.privateKey : f.keys.privateKey)
        res.end(
          JSON.stringify({
            access_token: token,
            issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
            token_type: 'Bearer',
            expires_in: exp - now,
            scope: 'trade:read',
            ...state.envelope,
          }),
        )
      })().catch(() => {
        if (!res.destroyed) res.writeHead(500).end()
      })
    })
  }
  return {
    ...f,
    state,
    tradingBase,
    close: async () => {
      await f.close()
      trading.closeAllConnections()
      await new Promise<void>((resolve) => trading.close(() => resolve()))
    },
  }
}
