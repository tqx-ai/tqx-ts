import assert from 'node:assert/strict'
import type { V2Case } from './v2-matrix'

export type BatchStatus = 'accepted' | 'failed' | 'unknown' | 'not_submitted'
export interface BatchItem {
  index: number
  idempotencyKey: string
  status: BatchStatus
  data?: unknown
  error?: unknown
  request_id?: string | null
}
export interface FixtureAudit {
  synthetic: true
  mode: 'PAPER'
  broker: 'fake'
  generation: string
  caseId: string
  attempts: {
    index: number
    idempotencyKey: string
    outcome: 'accepted' | 'failed' | 'unknown'
    transportIndex?: number
    request_id?: string
  }[]
  effects: {
    id: string
    index: number
    idempotencyKey: string
    backendKey?: string
    request_id?: string
    correlation?: 'operation_request_id'
  }[]
  settled: true
  maxConcurrent: number
  grantRevoked?: boolean
  sessionExpired?: boolean
}
// Real HTTP evidence keeps transport order and proves each backend-key mapping.
// Memory model evidence deliberately does not pretend to have real request IDs.
export function validateLiveAuditProvenance(audit: FixtureAudit) {
  let previous = -1
  for (const attempt of audit.attempts) {
    assert(
      Number.isInteger(attempt.transportIndex) && attempt.transportIndex! > previous,
      'Preserve every real HTTP transport ordinal',
    )
    previous = attempt.transportIndex!
  }
  for (const effect of audit.effects) {
    assert.equal(
      effect.correlation,
      'operation_request_id',
      'Effect needs authoritative operation/request correlation',
    )
    assert(effect.backendKey && effect.request_id, 'Preserve backend key and operation request ID')
    const matches = audit.attempts.filter((attempt) => attempt.request_id === effect.request_id)
    assert.equal(
      matches.length,
      1,
      'Effect request ID must identify exactly one actual HTTP attempt',
    )
    assert.equal(matches[0]!.idempotencyKey, effect.idempotencyKey)
    assert.equal(matches[0]!.index, effect.index)
  }
}
export function validateAudit(audit: FixtureAudit, test: V2Case, generation: string) {
  assert.equal(audit.synthetic, true)
  assert.equal(audit.mode, 'PAPER')
  assert.equal(audit.broker, 'fake')
  assert.equal(audit.generation, generation)
  assert.equal(audit.caseId, test.id)
  assert.equal(audit.settled, true, 'Fixture has not reached a settled observation')
  assert(audit.maxConcurrent >= 0 && audit.maxConcurrent <= 1, 'Fixture observed concurrent writes')
  assert.equal(
    new Set(audit.effects.map((effect) => effect.id)).size,
    audit.effects.length,
    'Fixture effects must have unique identities',
  )
  assert.equal(
    new Set(audit.effects.map((effect) => effect.idempotencyKey)).size,
    audit.effects.length,
    'One stable key caused multiple broker effects',
  )
  const counts = new Map<string, number>()
  const indexKeys = new Map<number, string>()
  let previousIndex = -1
  for (const attempt of audit.attempts) {
    assert(
      Number.isInteger(attempt.index) && attempt.index >= 0 && attempt.index >= previousIndex,
      'HTTP item indexes must be nondecreasing',
    )
    previousIndex = attempt.index
    const previousKey = indexKeys.get(attempt.index)
    assert(
      previousKey === undefined || previousKey === attempt.idempotencyKey,
      'One logical item used multiple transport keys',
    )
    indexKeys.set(attempt.index, attempt.idempotencyKey)
    if (test.maxLogicalItems !== undefined)
      assert(
        attempt.index < test.maxLogicalItems,
        'Request reached an item beyond the logical limit',
      )
    const identity = `${attempt.index}:${attempt.idempotencyKey}`
    counts.set(identity, (counts.get(identity) ?? 0) + 1)
    const repetitions = ['replay', 'unknownReplay', 'conflict'].includes(test.expectation) ? 2 : 1
    assert(
      counts.get(identity)! <= (test.maxTransportAttemptsPerItem ?? 3) * repetitions,
      'SDK transport attempts exceed the configured total budget',
    )
  }
  if (!test.writes || test.expectation === 'invalid' || test.expectation === 'denied') {
    assert.equal(audit.attempts.length, 0, 'Rejected call reached protected writes')
    assert.equal(audit.effects.length, 0, 'Rejected call produced effects')
  }
}
export function validateBatch(
  items: BatchItem[],
  keys: string[],
  audit: FixtureAudit,
  test: V2Case,
) {
  assert.equal(items.length, keys.length, 'Every batch item needs an explicit outcome')
  assert.equal(new Set(keys).size, keys.length, 'Successful batch fixture needs unique stable keys')
  let stopped = false
  let accepted = 0
  let attempted = 0
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    assert(item)
    assert.equal(item.index, index)
    assert.equal(item.idempotencyKey, keys[index])
    assert(['accepted', 'failed', 'unknown', 'not_submitted'].includes(item.status))
    if (stopped)
      assert.equal(item.status, 'not_submitted', 'Batch continued after failure or uncertainty')
    if (item.status === 'accepted') {
      accepted++
      assert(item.data !== undefined, 'Accepted item must retain its signal/request data')
    } else if (item.status === 'failed' || item.status === 'unknown') stopped = true
    if (item.status !== 'not_submitted') attempted++
  }
  for (const attempt of audit.attempts) {
    assert(attempt.index < attempted, 'HTTP request reached a not_submitted item')
    assert.equal(attempt.idempotencyKey, keys[attempt.index], 'A retry changed its stable key')
  }
  for (const effect of audit.effects) {
    assert.equal(effect.idempotencyKey, keys[effect.index])
    assert(
      ['accepted', 'unknown'].includes(items[effect.index]?.status ?? ''),
      'Effect belongs to a failed or unsubmitted item',
    )
  }
  for (const item of items.filter((item) => item.status === 'accepted'))
    assert(
      audit.attempts.some((attempt) => attempt.index === item.index),
      'Accepted item lacks any actual HTTP evidence',
    )
  assert(audit.effects.length >= accepted, 'Accepted outcomes are missing fixture effects')
  assert(
    audit.effects.length <= accepted + items.filter((item) => item.status === 'unknown').length,
    'Fixture contains unexplained effects',
  )
  if (test.scenario === 'normal') assert(items.every((item) => item.status === 'accepted'))
  else {
    assert.equal(items[0]?.status, 'accepted')
    assert.equal(items[1]?.status, test.scenario === 'uncertain_at_2' ? 'unknown' : 'failed')
    assert(items.slice(2).every((item) => item.status === 'not_submitted'))
    if (test.scenario === 'revoke_before_2') assert.equal(audit.grantRevoked, true)
    if (test.scenario === 'expire_before_2') assert.equal(audit.sessionExpired, true)
  }
}
