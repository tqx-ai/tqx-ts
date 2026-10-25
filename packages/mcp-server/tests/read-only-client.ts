import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpError } from '@modelcontextprotocol/sdk/types.js'
import { createLocalJWKSet, decodeJwt, jwtVerify } from 'jose'
import { setTimeout as delay } from 'node:timers/promises'
import { readBoundedBody } from '../src/network'
import {
  evaluateReadSemantics,
  type ReadManifest,
  type ReadPrincipal,
  type ReadTarget,
  type ReadRequestEvidence,
} from './read-only-contract'
import { encodedReadPathProof } from './read-only-path'
import { assertReadTool, READ_TOOLS, type ReadCase, type ReadTool } from './read-only-plan'
import {
  checkReadPermit,
  builtInReadChecks,
  classifyReadObservation,
  type ReadAudit,
  type ReadDriver,
  type ReadObservation,
  type ReadPermit,
} from './read-only-runner'

export type ReadSources = Partial<Record<ReadCase['role'], string>> & { read: string }
export interface ReadControl {
  setup(test: ReadCase): Promise<void>
  audit(): Promise<ReadAudit>
  teardown(test: ReadCase): Promise<void>
  semantic?(test: ReadCase, observed: unknown): Promise<Readonly<Record<string, boolean>>>
  requestEvidence?(test: ReadCase): readonly ReadRequestEvidence[]
}
function localUrl(value: string, path: string): URL {
  const url = new URL(value)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== path
  )
    throw new Error('Invalid isolated READ target')
  return url
}
// This decode is an isolation precheck, never a replacement for server JWT verification.
export function precheckReadSources(
  manifest: ReadManifest,
  target: ReadTarget,
  sources: ReadSources,
) {
  const principals = new Map<ReadCase['role'], ReadPrincipal>()
  for (const [rawRole, token] of Object.entries(sources)) {
    const role = rawRole as ReadCase['role']
    if (
      ![
        'read',
        'write-only',
        'expired',
        'wrong-audience',
        'bad-signature',
        'no-scope',
        'revoked',
        'refresh-old',
      ].includes(role) ||
      typeof token !== 'string' ||
      token.length > 32768
    )
      throw new Error('Invalid isolated READ source')
    const claims = decodeJwt(token)
    if (
      claims.sub !== '740001' ||
      claims.agent_id !== manifest.binding.agentId ||
      claims.iss !== target.issuer ||
      typeof claims.sid !== 'string' ||
      typeof claims.grant_id !== 'string' ||
      typeof claims.jti !== 'string' ||
      typeof claims.client_id !== 'string' ||
      !manifest.allowedOAuth.some(
        (allowed) =>
          allowed.sessionId === claims.sid &&
          allowed.grantId === claims.grant_id &&
          allowed.sourceJti === claims.jti &&
          allowed.clientId === claims.client_id,
      )
    )
      throw new Error('READ source identity is outside isolated primary')
    if (role !== 'wrong-audience' && claims.aud !== target.resource)
      throw new Error('READ source audience mismatch')
    if (role === 'wrong-audience' && claims.aud === target.resource)
      throw new Error('Negative READ audience source is valid')
    if (role !== 'expired' && (typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000))
      throw new Error('READ source expired before execution')
    if (role === 'expired' && (typeof claims.exp !== 'number' || claims.exp > Date.now() / 1000))
      throw new Error('Negative READ expiry source is valid')
    const expectedScope =
      role === 'write-only' ? 'order:write' : role === 'no-scope' ? '' : 'trade:read'
    if ((claims.scope ?? '') !== expectedScope)
      throw new Error('READ source must have exact role scope')
    principals.set(role, {
      uid: '740001',
      agentId: manifest.binding.agentId,
      sessionId: claims.sid,
      grantId: claims.grant_id,
      sourceJti: claims.jti,
      clientId: claims.client_id,
    })
  }
  if (!principals.has('read')) throw new Error('READ control source missing')
  return principals
}

export async function verifyReadControlSource(
  target: ReadTarget,
  token: string,
  signal: AbortSignal,
) {
  const issuer = localUrl(target.issuer, '/')
  const response = await fetch(new URL('/.well-known/jwks.json', issuer), {
    redirect: 'manual',
    signal,
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('READ AS keys unavailable')
  }
  const bytes = await readBoundedBody(response, 262144, signal)
  const keys = createLocalJWKSet(JSON.parse(new TextDecoder().decode(bytes)))
  await jwtVerify(token, keys, {
    issuer: target.issuer,
    audience: target.resource,
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'sub', 'sid', 'jti', 'agent_id', 'grant_id', 'client_id'],
  })
}

interface Metrics {
  toolPosts: number
  inflight: number
  peakInflight: number
  initialized: number
  closed: number
  cancelledRequests: number
}
interface Session {
  client: Client
  close(): Promise<void>
  lastStatus?: number
  challengePresent?: boolean
  callSignal?: AbortSignal
}

export function createReadDriver(options: {
  permit: ReadPermit
  manifest: ReadManifest
  target: ReadTarget
  sources: ReadSources
  control: ReadControl
  // An injected fetch is always labeled memory-double, even while exercising the actual SDK classes.
  fetch?: typeof fetch
}): ReadDriver {
  const { permit, manifest, target, sources, control } = options
  checkReadPermit(permit, target.generation)
  if (manifest.generation !== target.generation || manifest.namespace !== target.namespace)
    throw new Error('READ manifest generation mismatch')
  const resource = localUrl(target.resource, '/mcp')
  localUrl(target.issuer, '/')
  precheckReadSources(manifest, target, sources)
  const nativeFetch = options.fetch ?? fetch
  const sessions = new Set<Session>()
  const fixtures: Record<string, unknown> = { ...manifest.fixtureValues }
  if (Object.keys(fixtures).some((key) => key.endsWith('NextCursor')))
    throw new Error('READ pagination cursors must come from actual first pages')
  const capabilities = new Set(manifest.capabilities)
  for (const role of Object.keys(sources)) capabilities.add(`source.${role}`)
  if (sources['write-only']) capabilities.add('isolatedWriteOnlySource')
  for (const action of ['cancel', 'reconnect', 'parallel-two'])
    if (manifest.cases[`transport.${action}`]) capabilities.add(`transport.${action}`)
  const captured = new Map<string, unknown>()
  const observedArgs = new Map<string, Record<string, unknown>>()
  let before: ReadAudit | undefined, latest: ReadAudit | undefined
  const life = new AbortController()
  async function open(role: ReadCase['role'], metrics: Metrics): Promise<Session> {
    checkReadPermit(permit, target.generation)
    const token = sources[role]
    if (!token) throw new Error('READ role source missing')
    const client = new Client({ name: 'tqx-isolated-read-acceptance', version: '1.0.0' })
    // The SDK exposes a callback property, not EventTarget. Raw exceptions may contain bodies.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    client.onerror = () => {}
    let closed = false
    const session: Session = {
      client,
      close: async () => {
        if (closed) return
        closed = true
        try {
          await client.close()
        } finally {
          metrics.closed++
          sessions.delete(session)
        }
      },
    }
    sessions.add(session)
    const transport = new StreamableHTTPClientTransport(resource, {
      requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' },
      reconnectionOptions: {
        maxReconnectionDelay: 100,
        initialReconnectionDelay: 100,
        reconnectionDelayGrowFactor: 1,
        maxRetries: 0,
      },
      fetch: async (input, init) => {
        checkReadPermit(permit, target.generation)
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.href !== resource.href || !['GET', 'POST'].includes(init?.method ?? 'GET'))
          throw new Error('READ transport target/method denied')
        let isTool = false
        if (init?.method === 'POST') {
          if (typeof init.body !== 'string' || init.body.length > 65536)
            throw new Error('READ transport message denied')
          const message = JSON.parse(init.body) as { method?: string; params?: { name?: string } }
          if (
            !message.method ||
            ![
              'initialize',
              'notifications/initialized',
              'tools/list',
              'tools/call',
              'ping',
              'notifications/cancelled',
            ].includes(message.method)
          )
            throw new Error('READ transport method denied')
          if (message.method === 'tools/call') {
            assertReadTool(message.params?.name ?? '')
            isTool = true
            metrics.toolPosts++
            metrics.inflight++
            metrics.peakInflight = Math.max(metrics.peakInflight, metrics.inflight)
          }
        }
        let finished = false
        let removeAbort = () => {}
        const finish = () => {
          if (!finished) {
            finished = true
            removeAbort()
            if (isTool) metrics.inflight--
          }
        }
        const signal = AbortSignal.any([
          life.signal,
          AbortSignal.timeout(20_000),
          ...(init?.signal ? [init.signal] : []),
          ...(isTool && session.callSignal ? [session.callSignal] : []),
        ])
        if (isTool) {
          const onAbort = () => {
            if (!finished && session.callSignal?.aborted) metrics.cancelledRequests++
          }
          signal.addEventListener('abort', onAbort, { once: true })
          removeAbort = () => signal.removeEventListener('abort', onAbort)
        }
        try {
          const response = await nativeFetch(input, { ...init, redirect: 'manual', signal })
          session.lastStatus = response.status
          session.challengePresent = /^Bearer\s/i.test(
            response.headers.get('www-authenticate') ?? '',
          )
          if (response.status >= 300 && response.status < 400) {
            await response.body?.cancel()
            throw new Error('READ transport redirect denied')
          }
          if (!response.body) {
            finish()
            return response
          }
          const reader = response.body.getReader()
          // Count a request until the SDK consumes/cancels its body, not just until headers arrive.
          const body = new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                const item = await reader.read()
                if (item.done) {
                  finish()
                  reader.releaseLock()
                  controller.close()
                } else controller.enqueue(item.value)
              } catch {
                finish()
                try {
                  reader.releaseLock()
                } catch {}
                controller.error(new Error('READ response interrupted'))
              }
            },
            async cancel() {
              try {
                await reader.cancel()
              } finally {
                finish()
                reader.releaseLock()
              }
            },
          })
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          })
        } catch {
          finish()
          throw new Error('READ transport request failed')
        }
      },
    })
    try {
      await client.connect(transport, { timeout: 15_000 })
      const inventory = await client.listTools(undefined, { timeout: 15_000 })
      const names = inventory.tools.map((tool) => tool.name).toSorted()
      if (
        role === 'read' &&
        (names.length !== READ_TOOLS.length ||
          names.some((name, index) => name !== [...READ_TOOLS].toSorted()[index]))
      )
        throw new Error('READ-only discovery did not contain exactly the seven READ tools')
      if (
        role === 'write-only' &&
        names.some((name) => (READ_TOOLS as readonly string[]).includes(name))
      )
        throw new Error('Write-only source discovered READ tools')
      metrics.initialized++
      return session
    } catch {
      await session.close()
      // Auth failures on initialize are still observed HTTP failures, before tools/call exists.
      return session
    }
  }
  async function call(
    session: Session,
    tool: ReadTool,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ReadObservation> {
    if (session.lastStatus === 401 || session.lastStatus === 403)
      return { httpStatus: session.lastStatus, challengePresent: session.challengePresent }
    session.callSignal = signal
    try {
      return {
        result: await session.client.callTool({ name: tool, arguments: args }, undefined, {
          timeout: 18_000,
          signal,
        }),
      }
    } catch (error) {
      if (session.lastStatus === 401 || session.lastStatus === 403)
        return { httpStatus: session.lastStatus, challengePresent: session.challengePresent }
      if (error instanceof McpError && error.code === -32602)
        return {
          rpcCode: -32602,
          rpcKind: /Tool .*not found/i.test(error.message)
            ? 'tool_unavailable'
            : 'invalid_arguments',
        }
      return {}
    } finally {
      session.callSignal = undefined
    }
  }
  async function waitQuiescent() {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const audit = await control.audit()
      if (audit.integrityOk !== true || audit.activeReadAttempts === undefined)
        throw new Error('READ active audit missing')
      if (audit.activeReadAttempts === 0) return true
      await delay(50)
    }
    throw new Error('READ requests did not settle')
  }
  const primaryIsBound = manifest.allowedOAuth.some(
    (entry) => entry.sourceJti === decodeJwt(sources.read).jti,
  )
  return {
    layer: options.fetch ? 'memory-double' : 'official-mcp-sdk',
    subject: '740001',
    capabilities,
    fixtureValues: fixtures,
    supportsCase: (test) =>
      !!manifest.cases[test.id] &&
      Object.hasOwn(manifest.datasets, manifest.cases[test.id]!.datasetId),
    setup: async (test) => {
      checkReadPermit(permit, target.generation)
      await control.setup(test)
      before = await control.audit()
    },
    teardown: async (test) => {
      await waitQuiescent()
      await control.teardown(test)
    },
    audit: async () => {
      latest = await control.audit()
      return latest
    },
    observe: async (tool, args, role, test) => {
      assertReadTool(tool)
      if (test) observedArgs.set(test.id, args)
      const metrics: Metrics = {
        toolPosts: 0,
        inflight: 0,
        peakInflight: 0,
        initialized: 0,
        closed: 0,
        cancelledRequests: 0,
      }
      const action = test?.action ?? 'call'
      const owned: Session[] = []
      let observation: ReadObservation = {},
        cancelledAfterReadStarted = false
      try {
        let session = await open(role, metrics)
        owned.push(session)
        if (action === 'reconnect') {
          await session.close()
          session = await open(role, metrics)
          owned.push(session)
        }
        if (action === 'parallel-two') {
          const peer = await open(role, metrics)
          owned.push(peer)
          const [first, second] = await Promise.all([
            call(session, tool, args),
            call(peer, tool, args),
          ])
          observation = {
            ...first,
            transport: { action, ...metrics, quiescent: false, peers: [second] },
          }
        } else if (action === 'cancel') {
          const prior = await control.audit()
          const abort = new AbortController()
          const pending = call(session, tool, args, abort.signal)
          try {
            const deadline = Date.now() + 5000
            let started = false
            while (Date.now() < deadline) {
              const audit = await control.audit()
              if (
                audit.tradingReadAttempts > prior.tradingReadAttempts &&
                audit.activeReadAttempts! > 0 &&
                audit.lastReadId !== prior.lastReadId
              ) {
                started = true
                break
              }
              await delay(25)
            }
            if (!started) throw new Error('READ cancellation never reached active Trading request')
            abort.abort()
            observation = await pending
            cancelledAfterReadStarted =
              abort.signal.aborted &&
              metrics.cancelledRequests === 1 &&
              classifyReadObservation(observation).kind === 'unclassified'
          } finally {
            abort.abort()
            await pending
            await session.close()
          }
        } else observation = await call(session, tool, args)
      } finally {
        await Promise.all(owned.map((session) => session.close()))
      }
      const quiescent = await waitQuiescent()
      observation.transport = {
        action,
        toolPosts: metrics.toolPosts,
        peakInflight: metrics.peakInflight,
        initialized: metrics.initialized,
        closed: metrics.closed,
        quiescent,
        ...(action === 'cancel' ? { cancelledAfterReadStarted } : {}),
        ...(observation.transport?.peers ? { peers: observation.transport.peers } : {}),
      }
      return observation
    },
    semanticChecks: async (test, data, observation) => {
      const checks = evaluateReadSemantics(manifest, test, data, captured)
      const classified = observation ? classifyReadObservation(observation) : undefined
      let sanitizedPublicError = false
      if (
        classified?.kind === 'tool_error' &&
        observation?.result &&
        typeof observation.result === 'object' &&
        'content' in observation.result &&
        Array.isArray(observation.result.content)
      ) {
        const content = observation.result.content
        if (
          content.length === 1 &&
          content[0]?.type === 'text' &&
          typeof content[0]?.text === 'string'
        ) {
          try {
            const raw = JSON.parse(content[0].text) as Record<string, unknown>
            sanitizedPublicError =
              !!raw &&
              typeof raw === 'object' &&
              !Array.isArray(raw) &&
              Object.keys(raw).length === 1 &&
              raw.error === classified.errorCode
          } catch {
            /* Unknown/private text is not a safe public error. */
          }
        }
      }
      const dispatched =
        !!before && !!latest && latest.tradingReadAttempts > before.tradingReadAttempts
      const notFound =
        sanitizedPublicError &&
        ['order_not_found', 'signal_not_found'].includes(classified?.errorCode ?? '')
      if (test.checks.includes('bounded-sanitized-error'))
        checks['bounded-sanitized-error'] = sanitizedPublicError
      if (test.checks.includes('no-data-fabrication'))
        checks['no-data-fabrication'] =
          sanitizedPublicError && classified?.errorCode === test.expectedCode
      if (test.checks.includes('not-found-not-null-success'))
        checks['not-found-not-null-success'] = notFound && dispatched
      if (test.checks.includes('no-data-disclosure')) checks['no-data-disclosure'] = notFound
      for (const check of ['backend-date-validation', 'inclusive-HK-date-range', 'range-bounded'])
        if (test.checks.includes(check))
          checks[check] =
            dispatched && sanitizedPublicError && classified?.errorCode === test.expectedCode
      checks['sdk-attempts-at-most-3'] =
        !!before &&
        !!latest &&
        latest.tradingReadAttempts - before.tradingReadAttempts >= 1 &&
        latest.tradingReadAttempts - before.tradingReadAttempts <= 3
      checks['scoped-to-primary-B-only'] = primaryIsBound
      checks['only-isolated-B-grant'] = primaryIsBound
      if (control.semantic) {
        const remote = await control.semantic(test, {
          kind: classified?.kind ?? 'unclassified',
          errorCode: classified?.errorCode ?? null,
          httpStatus: observation?.httpStatus ?? null,
          challengePresent: observation?.challengePresent === true,
          hasData: data !== undefined,
          ...(data === undefined ? {} : { data }),
        })
        const externalEvidence = new Set([
          'foreign-existence-proven-privately',
          'fixture-only-not-provider-availability',
        ])
        for (const [check, verdict] of Object.entries(remote)) {
          if (Object.hasOwn(checks, check))
            checks[check] = checks[check] === true && verdict === true
          else if (externalEvidence.has(check)) checks[check] = verdict === true
        }
        if (test.scenario.startsWith('read_') && remote['scoped-to-primary-B-only'] !== true)
          delete checks['scoped-to-primary-B-only']
      } else if (test.scenario.startsWith('read_')) delete checks['scoped-to-primary-B-only']
      if (test.checks.includes('document-observed-refusal'))
        checks['document-observed-refusal'] =
          sanitizedPublicError &&
          classified?.errorCode === 'permission_denied' &&
          data === undefined
      if (test.checks.includes('no-arbitrary-path-or-host')) {
        const evidence = control.requestEvidence?.(test) ?? []
        checks['no-arbitrary-path-or-host'] = await encodedReadPathProof(
          target,
          test.tool,
          observedArgs.get(test.id) ?? {},
          evidence,
        )
      }
      if (
        data !== undefined &&
        test.checks.every((check) => builtInReadChecks.has(check) || checks[check] === true)
      ) {
        captured.set(test.id, data)
        if (
          test.id === `${test.tool}.page-first` &&
          data &&
          typeof data === 'object' &&
          'next_cursor' in data &&
          typeof data.next_cursor === 'string' &&
          data.next_cursor.length > 0 &&
          data.next_cursor.length <= 512
        ) {
          fixtures[`${test.tool}NextCursor`] = data.next_cursor
          capabilities.add(`${test.tool}NextCursor`)
        }
      }
      return checks
    },
    close: async () => {
      life.abort()
      await Promise.all([...sessions].map((session) => session.close()))
    },
  }
}
