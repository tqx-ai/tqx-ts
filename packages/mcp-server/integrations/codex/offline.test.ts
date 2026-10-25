import { describe, expect, it, vi } from 'vitest'
import { runMemorySuite } from './v2-memory'
import { CodexClient } from './client'
import {
  assertLiveIntegrationAllowed,
  authorizeLiveIntegration,
  isolatedClientEnvironment,
  type LivePermit,
} from './local-policy'
import { writeFile } from 'node:fs/promises'

const prohibitedIo = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('External network/persistent IO is forbidden in memory validation')
  }),
)
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>()
  return {
    ...real,
    mkdir: prohibitedIo,
    mkdtemp: prohibitedIo,
    readFile: prohibitedIo,
    writeFile: prohibitedIo,
    rename: prohibitedIo,
    access: prohibitedIo,
  }
})
vi.mock('node:child_process', async (original) => {
  const real = await original<typeof import('node:child_process')>()
  return { ...real, spawn: prohibitedIo, execFile: prohibitedIo }
})
import { clientTarget, expectedTools, loopbackUrl, parseScopes, targetConfig } from './target'
import { validateV2Ready, localFixturePath } from './v2-ready'
import { v2Matrix } from './v2-matrix'
import {
  validateAudit,
  validateBatch,
  validateLiveAuditProvenance,
  type FixtureAudit,
} from './v2-evidence'
import { failureStatus, scopeDenied } from './v2-suite'

const target = clientTarget({ TQX_CODEX_PROFILE: 'v2', TQX_CODEX_SCOPES: 'trade:read order:write' })
const now = Date.parse('2026-10-25T12:00:00Z')
function ready() {
  return {
    schemaVersion: 2,
    contract: 'tqx-mcp-v2',
    ready: true,
    generation: 'isolated-1',
    issuedAt: '2026-10-25T12:00:00Z',
    expiresAt: '2026-10-25T13:00:00Z',
    fixtureNamespace: 'tqx_v2_20261025_random123',
    synthetic: true,
    mode: 'PAPER',
    broker: 'fake',
    issuer: target.issuer,
    mcpResource: target.resource,
    apiResource: target.apiResource,
    redis: { host: '127.0.0.1', port: 16379, db: 0, prefix: 'tqx_v2_20261025_random123:' },
    mongo: { database: 'tqx_v2_20261025_random123' },
    scopes: ['trade:read', 'order:write'],
    tools: expectedTools(target),
    controlDir: './control',
    fixtureData: './fixtures.json',
  }
}
describe('offline client target and READY guards', () => {
  it('keeps the old two-read-tool baseline without upgrading its authorization', () => {
    const baseline = clientTarget({})
    expect(baseline.resource).toBe('http://127.0.0.1:3002/mcp')
    expect(expectedTools(baseline)).toEqual(['getAccount', 'listPositions'])
    expect(() => clientTarget({ TQX_CODEX_SCOPES: 'order:write' })).toThrow()
    expect(targetConfig(target)).not.toContain('secret')
    expect(targetConfig(target)).not.toContain('enabled_tools')
  })
  it('filters v2 inventories by explicitly requested scope', () => {
    expect(expectedTools({ ...target, scopes: ['trade:read'] })).toHaveLength(7)
    expect(expectedTools({ ...target, scopes: ['order:write'] })).toHaveLength(4)
    expect(expectedTools(target)).toHaveLength(11)
    expect(clientTarget({ TQX_CODEX_PROFILE: 'v2' }).scopes).toEqual(['trade:read'])
  })
  it.each([
    'https://example.com/mcp',
    'http://127.0.0.1.evil/mcp',
    'http://user:secret@127.0.0.1/mcp',
    'http://127.0.0.1/mcp?token=x',
    'http://127.0.0.1/mcp#x',
    'http://2130706433/mcp',
  ])('rejects remote/credential/noncanonical fixture URL %s', (value) => {
    expect(() => loopbackUrl(value, '/mcp')).toThrow()
  })
  it('rejects unsupported scopes and service-secret inputs', () => {
    expect(() => parseScopes('trade:read trade:read')).toThrow()
    expect(() => parseScopes('order:write ranking:read')).toThrow()
    expect(() => clientTarget({ TQX_CODEX_CLIENT_SECRET: 'synthetic' })).toThrow()
    expect(() => localFixturePath('C:/fixture', '../other')).toThrow()
  })
  it('requires a fresh matching Owner declaration of the isolated namespace', () => {
    expect(validateV2Ready(ready(), target, now).generation).toBe('isolated-1')
    for (const change of [
      { ready: false },
      { schemaVersion: 1 },
      { generation: '..' },
      { issuedAt: '2026-10-23T12:00:00Z' },
      { issuedAt: '2026-10-25T11:29:00Z' },
      { issuedAt: '2026-10-25T12:01:00Z' },
      { expiresAt: '2026-10-25T14:00:01Z' },
      { fixtureNamespace: 'tqx_v2_20261023_random123' },
      { controlDir: '../other' },
      { mode: 'LIVE' },
      { broker: 'real' },
      { synthetic: false },
      { expiresAt: '2026-10-22T00:00:00Z' },
      { mcpResource: 'http://127.0.0.1:3002/mcp' },
      { clientSecret: 'synthetic' },
      { redis: { host: '127.0.0.1', port: 16379, db: 0, prefix: 'tqx:' } },
    ])
      expect(() => validateV2Ready({ ...ready(), ...change }, target, now)).toThrow()
  })
})
describe('offline scope and batch evidence matrix', () => {
  it('runs all 45 model cases with network/persistent IO tripwires and explicit non-Codex evidence', async () => {
    vi.stubGlobal('fetch', prohibitedIo)
    try {
      expect(() => fetch('http://127.0.0.1:1/never-contact')).toThrow('forbidden')
      expect(() => writeFile('never-created', 'never-persisted')).toThrow('forbidden')
      prohibitedIo.mockClear()
      const report = await runMemorySuite()
      expect(report).toMatchObject({
        actualCodex: false,
        clientKind: 'in-process-protocol',
        persistence: false,
        externalNetwork: false,
      })
      expect(report.cases).toHaveLength(45)
      expect(report.cases.every((test) => test.status === 'passed')).toBe(true)
      expect(prohibitedIo).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('rejects absent or forged permits before any real client IO', async () => {
    expect(() => assertLiveIntegrationAllowed()).toThrow('isolated-test')
    expect(() => assertLiveIntegrationAllowed({ ready: ready() } as unknown as LivePermit)).toThrow(
      'isolated-test',
    )
    expect(() => new CodexClient('never-created', 'never-created')).toThrow('isolated-test')
    await expect(authorizeLiveIntegration(target, {})).rejects.toThrow('opt-in')
    await expect(
      authorizeLiveIntegration(target, { TQX_CODEX_LIVE: 'isolated-test' }),
    ).rejects.toThrow('generation and namespace')
    expect(prohibitedIo).not.toHaveBeenCalled()
  })
  it('does not inherit account credentials, user configuration or a user HOME', () => {
    vi.stubEnv('OPENAI_API_KEY', 'never-forward')
    vi.stubEnv('CODEX_ACCESS_TOKEN', 'never-forward')
    vi.stubEnv('CODEX_HOME', 'never-reuse')
    try {
      const env = isolatedClientEnvironment('isolated-home')
      expect(env.CODEX_HOME).toBe('isolated-home')
      expect(env.USERPROFILE).toBe('isolated-home')
      expect(env.OPENAI_API_KEY).toBeUndefined()
      expect(env.CODEX_ACCESS_TOKEN).toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it('does not count outages, bad credentials or internal failures as scope denial', () => {
    expect(failureStatus('oauth')).toBe('failed')
    expect(failureStatus('arm')).toBe('blocked')
    expect(failureStatus('case')).toBe('failed')
    expect(scopeDenied({ status: 503, body: { error: 'unavailable' } }, 'placeOrder')).toBe(false)
    expect(scopeDenied({ status: 401, body: { error: 'invalid_token' } }, 'placeOrder')).toBe(false)
    expect(
      scopeDenied(
        { status: 200, body: { error: { code: -32603, message: 'internal error' } } },
        'placeOrder',
      ),
    ).toBe(false)
    expect(
      scopeDenied(
        { status: 200, body: { error: { code: -32602, message: 'Tool placeOrder not found' } } },
        'placeOrder',
      ),
    ).toBe(true)
  })
  it('covers all eleven tools, scope isolation and bounded sequential scenarios', () => {
    const matrix = v2Matrix()
    expect(new Set(matrix.map((test) => test.id)).size).toBe(matrix.length)
    expect(new Set(matrix.map((test) => test.tool)).size).toBe(11)
    expect(matrix.filter((test) => test.expectation === 'denied')).toHaveLength(11)
    expect(matrix.some((test) => test.id === 'batch-over20' && test.maxLogicalItems === 0)).toBe(
      true,
    )
  })
  it('recognizes the observed SDK text denial only for the exact absent tool', () => {
    const probe = (text: string, isError = true, status = 200) => ({
      status,
      body: { result: { isError, content: [{ type: 'text', text }] } },
    })
    for (const test of v2Matrix().filter((test) => test.expectation === 'denied')) {
      expect(scopeDenied(probe(`MCP error -32602: Tool ${test.tool} not found`), test.tool)).toBe(
        true,
      )
      expect(scopeDenied(probe(`Tool ${test.tool} not found`), test.tool)).toBe(true)
      expect(
        scopeDenied(probe(`MCP error -32602: Tool ${test.tool}Extra not found`), test.tool),
      ).toBe(false)
      expect(
        scopeDenied(probe(`MCP error -32602: Invalid arguments for ${test.tool}`), test.tool),
      ).toBe(false)
      expect(scopeDenied(probe(`Tool ${test.tool} not found`, false), test.tool)).toBe(false)
      expect(scopeDenied(probe(`Tool ${test.tool} not found`, true, 503), test.tool)).toBe(false)
    }
  })
  it('requires audit proof of no side effects for invalid calls', () => {
    const test = v2Matrix().find((test) => test.id === 'batch-over20')
    expect(test).toBeDefined()
    const audit: FixtureAudit = {
      synthetic: true,
      mode: 'PAPER',
      broker: 'fake',
      generation: 'isolated-1',
      caseId: test!.id,
      attempts: [],
      effects: [],
      settled: true,
      maxConcurrent: 0,
    }
    validateAudit(audit, test!, 'isolated-1')
    expect(() =>
      validateAudit(
        { ...audit, effects: [{ id: 'side-effect', index: 0, idempotencyKey: 'stable-key-1' }] },
        test!,
        'isolated-1',
      ),
    ).toThrow()
  })
  it('preserves uncertainty and prevents submitting any later batch item', () => {
    const test = v2Matrix().find((test) => test.id === 'batch-uncertain_at_2')!
    const keys = ['stable-key-1', 'stable-key-2', 'stable-key-3']
    const items = [
      {
        index: 0,
        idempotencyKey: keys[0]!,
        status: 'accepted' as const,
        data: { state: 'ACCEPTED', signal_id: 'synthetic' },
      },
      { index: 1, idempotencyKey: keys[1]!, status: 'unknown' as const },
      { index: 2, idempotencyKey: keys[2]!, status: 'not_submitted' as const },
    ]
    const audit: FixtureAudit = {
      synthetic: true,
      mode: 'PAPER',
      broker: 'fake',
      generation: 'isolated-1',
      caseId: test.id,
      attempts: [
        { index: 0, idempotencyKey: keys[0]!, outcome: 'accepted' },
        { index: 1, idempotencyKey: keys[1]!, outcome: 'unknown' },
      ],
      effects: [{ id: 'synthetic-effect', index: 0, idempotencyKey: keys[0]! }],
      settled: true,
      maxConcurrent: 1,
    }
    validateBatch(items, keys, audit, test)
    const retryAudit = {
      ...audit,
      attempts: [audit.attempts[0]!, audit.attempts[1]!, audit.attempts[1]!, audit.attempts[1]!],
    }
    validateAudit(retryAudit, test, 'isolated-1')
    validateBatch(items, keys, retryAudit, test)
    expect(() =>
      validateAudit(
        { ...retryAudit, attempts: [...retryAudit.attempts, audit.attempts[1]!] },
        test,
        'isolated-1',
      ),
    ).toThrow()
    expect(() =>
      validateAudit(
        { ...audit, effects: [...audit.effects, { ...audit.effects[0]!, id: 'duplicate-effect' }] },
        test,
        'isolated-1',
      ),
    ).toThrow()
    expect(() =>
      validateBatch(
        [
          { ...items[0]!, status: 'accepted' },
          { ...items[1]!, status: 'unknown' },
          { ...items[2]!, status: 'accepted', data: {} },
        ],
        keys,
        audit,
        test,
      ),
    ).toThrow()
    expect(() =>
      validateAudit({ ...audit, attempts: audit.attempts.toReversed() }, test, 'isolated-1'),
    ).toThrow()
  })
  it('rejects guessed effect-key mappings and compressed real HTTP retries', () => {
    const audit: FixtureAudit = {
      synthetic: true,
      mode: 'PAPER',
      broker: 'fake',
      generation: 'isolated-1',
      caseId: 'live-provenance',
      settled: true,
      maxConcurrent: 1,
      attempts: [
        {
          index: 0,
          transportIndex: 4,
          idempotencyKey: 'stable-key-1',
          request_id: 'request-a',
          outcome: 'accepted',
        },
        {
          index: 0,
          transportIndex: 5,
          idempotencyKey: 'stable-key-1',
          request_id: 'request-b',
          outcome: 'accepted',
        },
      ],
      effects: [
        {
          id: 'effect-a',
          index: 0,
          idempotencyKey: 'stable-key-1',
          backendKey: 'different-action-key',
          request_id: 'request-a',
          correlation: 'operation_request_id',
        },
      ],
    }
    validateLiveAuditProvenance(audit)
    expect(() =>
      validateLiveAuditProvenance({
        ...audit,
        effects: [{ ...audit.effects[0]!, request_id: 'guessed-id' }],
      }),
    ).toThrow()
    expect(() =>
      validateLiveAuditProvenance({
        ...audit,
        effects: [{ ...audit.effects[0]!, idempotencyKey: 'changed-key' }],
      }),
    ).toThrow()
    expect(() =>
      validateLiveAuditProvenance({
        ...audit,
        effects: [{ ...audit.effects[0]!, correlation: undefined }],
      }),
    ).toThrow()
    expect(() =>
      validateLiveAuditProvenance({
        ...audit,
        attempts: [{ ...audit.attempts[0]!, transportIndex: undefined }],
      }),
    ).toThrow()
    expect(() =>
      validateLiveAuditProvenance({ ...audit, attempts: audit.attempts.toReversed() }),
    ).toThrow()
    expect(() =>
      validateLiveAuditProvenance({
        ...audit,
        attempts: [...audit.attempts, { ...audit.attempts[0]!, transportIndex: 6 }],
      }),
    ).toThrow()
  })
  it('allows item 2 to fail before transport without inventing an HTTP row or JWT expiry', () => {
    const test = v2Matrix().find((test) => test.id === 'batch-expire_before_2')!
    const keys = ['stable-expiry-1', 'stable-expiry-2', 'stable-expiry-3']
    const audit: FixtureAudit = {
      synthetic: true,
      mode: 'PAPER',
      broker: 'fake',
      generation: 'isolated-1',
      caseId: test.id,
      attempts: [{ index: 0, idempotencyKey: keys[0]!, outcome: 'accepted' }],
      effects: [{ id: 'expiry-effect', index: 0, idempotencyKey: keys[0]! }],
      settled: true,
      maxConcurrent: 1,
      sessionExpired: true,
    }
    const items = [
      {
        index: 0,
        idempotencyKey: keys[0]!,
        status: 'accepted' as const,
        data: { state: 'ACCEPTED' },
      },
      { index: 1, idempotencyKey: keys[1]!, status: 'failed' as const },
      { index: 2, idempotencyKey: keys[2]!, status: 'not_submitted' as const },
    ]
    validateAudit(audit, test, 'isolated-1')
    validateBatch(items, keys, audit, test)
    expect(() => validateBatch(items, keys, { ...audit, sessionExpired: false }, test)).toThrow()
    expect(audit).not.toHaveProperty('sourceExpired')
  })
})
