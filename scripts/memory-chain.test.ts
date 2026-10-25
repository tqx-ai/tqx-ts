import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { resolve as resolvePath } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { createApplication } from '../packages/mcp-server/src/app'
import { createMemoryConfig } from '../packages/mcp-server/tests/memory-config'
import { installMemoryGuards } from '../packages/mcp-server/tests/memory-guards'

// This harness never writes protocol traffic, credentials, business data or keys.
// The only child entrypoints are reviewed dedicated pure-memory adapters.
type Json = Record<string, any>
type WireResponse = { status: number; headers: Record<string, string>; body: string }
type Snapshot = {
  protected_attempts: Json[]
  effects: Json[]
  maxConcurrent: number
  triggered: boolean
}
const order = (key: string, extra: Json = {}) => ({
  symbol: '00700.HK',
  side: 'BUY',
  orderType: 'LIMIT',
  quantity: '10',
  price: '350.5',
  idempotencyKey: key,
  ...extra,
})

class PipeClient {
  readonly child: ChildProcessWithoutNullStreams
  private next = 0
  private closed = false
  private readonly stopped: Promise<void>
  private pending = new Map<
    number,
    { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >()
  constructor(binary: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
    const env: Record<string, string> = { ...extraEnv }
    for (const name of ['SystemRoot', 'PATH', 'WINDIR'])
      if (process.env[name]) env[name] = process.env[name]!
    this.child = spawn(binary, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.stopped = new Promise((done) => this.child.once('close', () => done()))
    // Consume diagnostics in memory without printing potentially sensitive app logs.
    this.child.stderr.on('data', () => {})
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      let message: Json
      try {
        message = JSON.parse(line) as Json
      } catch {
        this.fail('Non-JSON child protocol output')
        return
      }
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error('Memory child rejected operation'))
      else pending.resolve(message.result)
    })
    this.child.on('error', () => this.fail('Memory child could not start'))
    this.child.on('exit', () => this.fail('Memory child exited'))
    this.child.stdin.on('error', () => {
      this.fail('Memory child pipe closed')
      this.child.kill()
    })
  }
  private fail(message: string) {
    this.closed = true
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error(message))
    }
    this.pending.clear()
  }
  call<T = any>(op: string, args: Json = {}): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Memory child is closed'))
    const id = ++this.next
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail('Memory child RPC timeout')
        this.child.kill()
      }, 15_000)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.child.stdin.write(JSON.stringify({ id, op, args }) + '\n')
      } catch {
        this.fail('Memory child pipe rejected request')
        this.child.kill()
      }
    })
  }
  async close() {
    this.child.stdin.end()
    this.child.kill()
    this.fail('Memory child closed')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.stopped,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Memory child did not exit')), 5_000)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const part of request) {
    chunks.push(Buffer.from(part))
    if (chunks.reduce((n, chunk) => n + chunk.length, 0) > 1_048_576)
      throw new Error('Memory proxy request too large')
  }
  return Buffer.concat(chunks).toString('utf8')
}
function headersOf(request: IncomingMessage) {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers))
    if (value !== undefined && !['host', 'connection', 'content-length'].includes(name))
      headers[name] = Array.isArray(value) ? value.join(', ') : value
  return headers
}
function respond(response: ServerResponse, result: WireResponse) {
  response.statusCode = result.status
  for (const [name, value] of Object.entries(result.headers))
    if (
      !['content-length', 'transfer-encoding', 'connection', 'content-encoding'].includes(
        name.toLowerCase(),
      )
    )
      response.setHeader(name, value)
  response.end(result.body)
}
function claims(token: string): Json {
  // Claims select stored AS records only; both services still verify RS256 themselves.
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Json
}

// Cases share an AS and deliberately advance ordered grant/batch/replay state.
/* eslint-disable no-await-in-loop */
it('runs real OAuth -> MCP -> SDK -> Trading source entirely with process-memory state', async () => {
  const repo = fileURLToPath(new URL('..', import.meta.url))
  const repos = resolvePath(repo, '..')
  let oauth!: PipeClient
  let trading!: PipeClient
  let guard: ReturnType<typeof installMemoryGuards> | undefined
  const servers: ReturnType<typeof createServer>[] = []
  let application: ReturnType<typeof createApplication> | undefined
  let proxyActive = 0,
    proxyPeak = 0
  const proxyEvents: { key: string; phase: 'start' | 'end' }[] = []
  const evidence: { name: string; attempts: number; effects: number }[] = []
  let intercept:
    | { mode: string; key: string; sid: string; grantId: string; triggered: boolean }
    | undefined
  const listen = async (handler: (req: IncomingMessage, res: ServerResponse) => void) => {
    const server = createServer(handler)
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }
  const proxy =
    (handler: (request: IncomingMessage) => Promise<WireResponse>) =>
    (request: IncomingMessage, response: ServerResponse) => {
      void handler(request)
        .then((result) => respond(response, result))
        .catch(() => {
          response.statusCode = 503
          response.end('{"error":"memory_proxy_failed"}')
        })
    }
  try {
    oauth = new PipeClient(
      resolvePath(homedir(), '.bun/bin', process.platform === 'win32' ? 'bun.exe' : 'bun'),
      ['--no-env-file', 'tools/memory-oauth-stdio.ts'],
      resolvePath(repos, 'tqx-oauth'),
    )
    trading = new PipeClient(
      resolvePath(
        repos,
        'panda_workflow/.venv-openapi',
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
      ),
      ['-B', 'tests/memory/openapi_v2_memory_stdio.py'],
      resolvePath(repos, 'panda_workflow'),
      { PYTHONPATH: resolvePath(repos, 'panda_workflow/src'), PYTHONDONTWRITEBYTECODE: '1' },
    )
    guard = installMemoryGuards()
    const issuer = await listen(
      proxy(async (request) =>
        oauth.call('request', {
          path: request.url,
          method: request.method,
          headers: headersOf(request),
          body: (await bodyOf(request)) || undefined,
        }),
      ),
    )
    const tradingBase = await listen(
      proxy(async (request) => {
        const headers = headersOf(request)
        const key = headers['idempotency-key'] ?? ''
        proxyActive++
        proxyPeak = Math.max(proxyPeak, proxyActive)
        proxyEvents.push({ key, phase: 'start' })
        try {
          if (intercept && !intercept.triggered && headers['idempotency-key'] === intercept.key) {
            intercept.triggered = true
            if (intercept.mode === 'revoke_before_2')
              await oauth.call('revokeGrant', { grantId: intercept.grantId })
            if (intercept.mode === 'expire_before_2')
              await oauth.call('expireSession', { sid: intercept.sid })
          }
          let authState: Json = { sessions: {}, grants: {}, jtis: {} }
          if (headers.authorization?.startsWith('Bearer ')) {
            const tokenClaims = claims(headers.authorization.slice(7))
            const first = await oauth.call('snapshot', {
              sid: tokenClaims.sid,
              grantId: tokenClaims.grant_id,
              jti: tokenClaims.jti,
            })
            const state = await oauth.call('snapshot', {
              sid: tokenClaims.sid,
              grantId: tokenClaims.grant_id,
              jti: tokenClaims.jti,
              sourceJti: first.session?.jti,
            })
            authState = {
              sessions: { [tokenClaims.sid]: state.session },
              grants: { [tokenClaims.grant_id]: state.grant },
              jtis: {
                [tokenClaims.jti]: state.jti,
                ...(state.session?.jti ? { [state.session.jti]: state.sourceJti } : {}),
              },
            }
          }
          return await trading.call('request', {
            path: request.url,
            method: request.method,
            headers,
            body: await bodyOf(request),
            authState,
          })
        } finally {
          proxyActive--
          proxyEvents.push({ key, phase: 'end' })
        }
      }),
    )
    const mcpBase = await listen((request, response) => {
      if (application) application.app(request, response)
      else response.writeHead(503).end()
    })
    const resource = `${mcpBase}/mcp`,
      apiResource = `${tradingBase}/api`
    const as = await oauth.call('init', {
      issuer,
      mcpResource: resource,
      apiResource,
      uid: '42',
      agentId: 'memory-agent',
      accountId: '101',
    })
    const config = createMemoryConfig(
      { issuer, resource, apiResource, tradingBaseUrl: tradingBase },
      { tools: true, writes: true, exchangeSecret: as.exchangeSecret },
    )
    application = createApplication(config)
    const users = await oauth.call('users')
    const user = Array.isArray(users) ? users[0] : users.users[0]
    const resetTrading = async (mode = 'normal', itemKeys: string[] = []) => {
      intercept = undefined
      await trading.call('init', {
        issuer,
        apiResource,
        mcpResource: resource,
        publicJWKS: as.publicJwks,
        identities: [
          { uid: '42', agent_id: 'memory-agent', account_id: '101' },
          { uid: '43', agent_id: 'memory-agent-2', account_id: '202' },
        ],
      })
      await trading.call('arm', { mode, item_keys: itemKeys })
    }
    const asRequest = async (
      path: string,
      method = 'GET',
      body?: Json,
      authorization?: string,
      form = false,
    ) => {
      const response = await fetch(issuer + path, {
        method,
        redirect: 'manual',
        headers: {
          ...(body
            ? { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' }
            : {}),
          ...(authorization ? { authorization } : {}),
        },
        ...(body
          ? {
              body: form
                ? new URLSearchParams(body as Record<string, string>).toString()
                : JSON.stringify(body),
            }
          : {}),
      })
      const text = await response.text()
      return {
        status: response.status,
        headers: response.headers,
        data: text ? (JSON.parse(text) as Json) : {},
      }
    }
    const issue = async (scope = 'trade:read order:write', approve = true) => {
      const redirect = `${mcpBase}/memory-callback`,
        verifier = 'memory-verifier-'.repeat(5)
      const registered = await asRequest('/oauth/register', 'POST', {
        application_type: 'native',
        client_name: 'Owner memory chain',
        redirect_uris: [redirect],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope,
      })
      expect(registered.status).toBe(201)
      const clientId = registered.data.client_id as string
      const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: 'code',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        resource,
        scope,
        state: 'memory-chain-state',
      })
      // authorize is a redirect to the consent page, so do not parse its HTML as JSON.
      const begin = await fetch(issuer + '/oauth/authorize?' + query, { redirect: 'manual' })
      expect(begin.status).toBe(302)
      const tx = new URL(begin.headers.get('location')!).searchParams.get('tx')!
      await begin.body?.cancel()
      const decision = await asRequest(
        `/oauth/tx/${tx}/decision`,
        'POST',
        { approved: approve, ...(approve ? { agent_id: 'memory-agent' } : {}) },
        `Bearer ${user.webJwt}`,
      )
      expect(decision.status).toBe(200)
      const callback = new URL(decision.data.redirect_to as string)
      expect(callback.searchParams.get('iss')).toBe(issuer)
      expect(callback.searchParams.get('state')).toBe('memory-chain-state')
      if (!approve) {
        expect(callback.searchParams.get('error')).toBe('access_denied')
        expect(callback.searchParams.has('code')).toBe(false)
        return undefined
      }
      const token = await asRequest(
        '/oauth/token',
        'POST',
        {
          grant_type: 'authorization_code',
          client_id: clientId,
          code: callback.searchParams.get('code'),
          redirect_uri: redirect,
          code_verifier: verifier,
          resource,
        },
        undefined,
        true,
      )
      expect(token.status).toBe(200)
      const access = token.data.access_token as string
      return {
        access,
        claims: claims(access),
        refresh: token.data.refresh_token as string,
        clientId,
      }
    }
    const rpc = async (access: string, method: string, params: Json = {}) => {
      const response = await fetch(resource, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-03-26',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      const body = (await response.json()) as Json
      return { status: response.status, body }
    }
    const call = async (access: string, name: string, args: Json = {}) => {
      const result = await rpc(access, 'tools/call', { name, arguments: args })
      const tool = result.body.result as Json | undefined
      let data: Json = {}
      try {
        data = JSON.parse(tool?.content?.[0]?.text ?? '{}') as Json
      } catch {
        /* SDK input errors are plain text. */
      }
      return { ...result, tool, data }
    }
    const record = async (name: string) => {
      const audit = await trading.call<Snapshot>('snapshot')
      expect(audit.maxConcurrent).toBeLessThanOrEqual(1)
      // Measured before the serialized Python pipe, so concurrent MCP dispatch cannot hide.
      expect(proxyActive).toBe(0)
      expect(proxyPeak).toBeLessThanOrEqual(1)
      for (const effect of audit.effects) expect(effect.correlation).toBe('operation_request_id')
      evidence.push({
        name,
        attempts: audit.protected_attempts.length,
        effects: audit.effects.length,
      })
      return audit
    }
    await resetTrading()
    expect(await issue(undefined, false)).toBeUndefined()
    const full = (await issue())!,
      read = (await issue('trade:read'))!,
      write = (await issue('order:write'))!
    const reads = [
      'getAccount',
      'listPositions',
      'listOrders',
      'getOrder',
      'listTrades',
      'listCashFlows',
      'getSignal',
    ]
    const writes = ['placeOrder', 'modifyOrder', 'cancelOrder', 'placeOrders']
    const validArguments: Record<string, Json> = {
      getAccount: { currency: 'HKD' },
      listPositions: {},
      listOrders: {},
      getOrder: { orderId: 'memory-open-1' },
      listTrades: {},
      listCashFlows: {},
      getSignal: { signalId: 'memory-open-1' },
      placeOrder: order('scope-place-key'),
      modifyOrder: { orderId: 'memory-open-1', price: '351', idempotencyKey: 'scope-modify-key' },
      cancelOrder: { orderId: 'memory-open-1', idempotencyKey: 'scope-cancel-key' },
      placeOrders: { orders: [order('scope-batch-key')] },
    }
    for (const [ticket, names] of [
      [full, [...reads, ...writes]],
      [read, reads],
      [write, writes],
    ] as const) {
      const listed = await rpc(ticket.access, 'tools/list')
      expect(listed.status).toBe(200)
      expect(listed.body.result.tools.map((tool: Json) => tool.name)).toEqual(names)
    }
    evidence.push({
      name: 'DCR/PKCE/R2 allow+deny and 11/7/4 scoped visibility',
      attempts: 0,
      effects: 0,
    })
    for (const [ticket, names] of [
      [write, reads],
      [read, writes],
    ] as const) {
      for (const name of names) {
        const denied = await call(ticket.access, name, validArguments[name]!)
        expect(denied.tool?.isError).toBe(true)
        expect(denied.tool?.content?.[0]?.text).toMatch(/Tool .*not found/i)
      }
    }
    expect((await record('cross-scope calls fail before Trading')).protected_attempts).toHaveLength(
      0,
    )
    const placed = await call(full.access, 'placeOrder', order('memory-open-1'))
    expect(placed.data.status).toBe('accepted')
    for (const [name, args] of [
      ['getAccount', { currency: 'HKD' }],
      ['listPositions', {}],
      ['listOrders', {}],
      ['getOrder', { orderId: 'memory-open-1' }],
      ['listTrades', {}],
      ['getSignal', { signalId: 'memory-open-1' }],
    ] as const) {
      const got = await call(full.access, name, args)
      expect(got.tool?.isError, name).not.toBe(true)
    }
    const cash = await call(full.access, 'listCashFlows')
    expect(cash.data.error).toBe('cash_flows_unsupported')
    expect(cash.tool?.isError).toBe(true)
    expect((await call(full.access, 'getOrder', { orderId: 'memory-open-2' })).data.error).toBe(
      'order_not_found',
    )
    expect(
      (
        await call(full.access, 'modifyOrder', {
          orderId: 'memory-open-1',
          price: '351',
          idempotencyKey: 'joint-modify-1',
        })
      ).data.status,
    ).toBe('accepted')
    expect(
      (
        await call(full.access, 'cancelOrder', {
          orderId: 'memory-open-1',
          idempotencyKey: 'joint-cancel-1',
        })
      ).data.status,
    ).toBe('accepted')
    expect(
      (await record('seven reads and single writes, unsupported cash ledger, cross-owner denial'))
        .effects,
    ).toHaveLength(3)
    await trading.call('arm')
    const replayed = await call(full.access, 'placeOrder', order('memory-open-1'))
    expect(replayed.data.status).toBe('accepted')
    expect(replayed.data.data).toEqual(placed.data.data)
    expect(
      (await call(full.access, 'placeOrder', order('memory-open-1', { quantity: '11' }))).data
        .error,
    ).toBe('idempotency_conflict')
    expect(
      (await record('same-key replay and payload conflict create no effect')).effects,
    ).toHaveLength(0)
    for (const name of writes) {
      const args: Json = structuredClone(validArguments[name]!)
      if (name === 'placeOrders') delete args.orders[0].idempotencyKey
      else delete args.idempotencyKey
      await trading.call('arm')
      expect((await call(full.access, name, args)).tool?.isError).toBe(true)
      expect((await record(`missing key rejected: ${name}`)).protected_attempts).toHaveLength(0)
    }
    for (const [label, orders] of [
      ['empty', []],
      ['over20', Array.from({ length: 21 }, (_, i) => order(`invalid-over-${i}`))],
      ['duplicate', [order('duplicate-key'), order('duplicate-key')]],
      [
        'invalid-later',
        [order('invalid-later-1'), order('invalid-later-2', { symbol: 'NO_SUFFIX' })],
      ],
    ] as const) {
      await trading.call('arm')
      expect((await call(full.access, 'placeOrders', { orders })).tool?.isError).toBe(true)
      expect((await record(`batch prevalidation ${label}`)).protected_attempts).toHaveLength(0)
    }
    for (const mode of [
      'normal',
      'revoke_before_2',
      'expire_before_2',
      'quota_before_2',
      'fail_before_2',
      'timeout_before_2',
      'timeout_after_2',
    ]) {
      const orders = Array.from({ length: mode === 'normal' ? 20 : 3 }, (_, i) =>
        order(`joint-${mode}-${i}`),
      )
      const keys = orders.map((item) => item.idempotencyKey)
      await resetTrading(
        mode === 'revoke_before_2' || mode === 'expire_before_2' ? 'normal' : mode,
        keys,
      )
      const ticket = (await issue())!
      const eventStart = proxyEvents.length
      if (mode === 'revoke_before_2' || mode === 'expire_before_2')
        intercept = {
          mode,
          key: keys[1]!,
          sid: ticket.claims.sid as string,
          grantId: ticket.claims.grant_id as string,
          triggered: false,
        }
      const batch = await call(ticket.access, 'placeOrders', { orders })
      const statuses = batch.data.results?.map((result: Json) => result.status)
      expect(statuses, mode).toEqual(
        mode === 'normal'
          ? Array(20).fill('accepted')
          : ['accepted', mode.startsWith('timeout') ? 'unknown' : 'failed', 'not_submitted'],
      )
      const audit = await record(`batch ${mode}`)
      const observedEvents = proxyEvents.slice(eventStart)
      const submittedKeys = mode === 'normal' ? keys : keys.slice(0, 2)
      expect(observedEvents).toEqual(
        submittedKeys.flatMap((key) => [
          { key, phase: 'start' },
          { key, phase: 'end' },
        ]),
      )
      expect(audit.effects).toHaveLength(
        mode === 'normal' ? 20 : mode === 'timeout_after_2' ? 2 : 1,
      )
      expect(
        audit.protected_attempts.every((attempt) => attempt.key !== keys[2] || mode === 'normal'),
      ).toBe(true)
      for (const attempt of audit.protected_attempts)
        expect(attempt.itemIndex).toBe(keys.indexOf(attempt.key))
      if (mode === 'timeout_after_2') {
        await trading.call('arm', { item_keys: keys })
        const replay = await call(ticket.access, 'placeOrder', orders[1]!)
        expect(replay.data.status).toBe('unknown')
        expect((await record('UNKNOWN same-key replay never repeats effect')).effects).toHaveLength(
          0,
        )
      }
    }
    await resetTrading()
    const refreshTicket = (await issue())!
    const refresh = await asRequest(
      '/oauth/token',
      'POST',
      {
        grant_type: 'refresh_token',
        client_id: refreshTicket.clientId,
        refresh_token: refreshTicket.refresh,
        resource,
        scope: 'order:write',
      },
      undefined,
      true,
    )
    expect(refresh.status).toBe(200)
    expect((await rpc(refreshTicket.access, 'tools/list')).status).toBe(401)
    expect(
      (await rpc(refresh.data.access_token as string, 'tools/list')).body.result.tools.map(
        (tool: Json) => tool.name,
      ),
    ).toEqual(writes)
    const latest = claims(refresh.data.access_token as string)
    await oauth.call('revokeGrant', { grantId: latest.grant_id })
    expect((await rpc(refresh.data.access_token as string, 'tools/list')).status).toBe(401)
    evidence.push({
      name: 'refresh narrowing, old-source and grant online revocation',
      attempts: 0,
      effects: 0,
    })
    console.log(
      JSON.stringify({
        kind: 'real-source-memory-chain',
        actualCodex: false,
        middlewareConnections: false,
        persistedBusinessData: false,
        parentProxyPeakConcurrency: proxyPeak,
        evidence,
        limitations: [
          'Map adapters do not prove database/Lua atomicity or durability',
          'Java login and Web browser are separate checks',
          'PAPER object broker only; cash ledger unsupported',
        ],
      }),
    )
  } finally {
    try {
      for (const server of servers) server.closeAllConnections()
      const cleaned = await Promise.allSettled([
        application?.closeRequests(),
        ...servers.map((server) => new Promise<void>((done) => server.close(() => done()))),
        oauth?.close(),
        trading?.close(),
      ])
      expect(
        cleaned.every((result) => result.status === 'fulfilled'),
        'all owned children/listeners must close',
      ).toBe(true)
    } finally {
      guard?.restore()
    }
  }
})
