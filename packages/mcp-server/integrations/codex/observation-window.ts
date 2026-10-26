import assert from 'node:assert/strict'
import type { OrderStatus, SignalState } from '@tqx-ai/sdk'

// No IO, sleeping, trading client or credential store. The caller owns execution.
export interface ObservationClock {
  utcMs: number
  monotonicMs: number
}
export interface ObservationInput {
  runId: string
  ownerTaskId: string
  intentId: string
  intentKeyDigest?: string | null
  server: string
  reference: { kind: 'order' | 'signal'; id: string }
  budgetMs: number
  intervalMs: number
  requestTimeoutMs: number
}
export type ObservationStop =
  | 'deadline'
  | 'user_stop'
  | 'terminal'
  | 'auth_denied'
  | 'not_found'
  | 'clock_uncertain'
  | 'prior_read_unresolved'
  | 'submission_rejected'
  | 'evidence_insufficient'
export interface ObservationRecord extends ObservationInput {
  schemaVersion: 1
  startUtcMs: number
  deadlineUtcMs: number
  lastCheckpointUtcMs: number
  consumedMs: number
  nextReadConsumedMs: number
  readCount: number
  inFlight: number | null
  stopReason: ObservationStop | null
  stopUtcMs: number | null
  lastOrderStatus: OrderStatus | null
  lastSignalState: SignalState | null
  lastStatusSource: string | null
  lastStatusReason: string | null
  lastIsStale: boolean | null
  lastMonitorStatus: string | null
  lastMonitorStopReason: string | null
  lastSignalOrderStatusSource: string | null
  lastEvidenceRef: string | null
  lastSnapshotEvidenceRef: string | null
  lastReadError: string | null
  supplementaryResults: number
}
export type ReadOutcome =
  | {
      kind: 'snapshot'
      order_id?: string | null
      signal_id?: string | null
      evidenceRef: string
      orderStatus?: OrderStatus
      signalState?: SignalState
      statusSource?: string | null
      statusReason?: string | null
      isStale?: boolean | null
      monitorStatus?: string | null
      monitorStopReason?: string | null
      signalOrderStatusSource?: string | null
      terminalSource?: 'authoritative_order' | 'channel'
    }
  | {
      kind: 'error'
      category: 'network' | 'timeout' | 'rate_limited' | 'auth_denied' | 'not_found'
      evidenceRef: string
      retryAfterMs?: number
    }
export interface ObservationRead {
  sequence: number
  server: string
  tool: 'getOrder' | 'getSignal'
  arguments: { orderId: string } | { signalId: string }
  callerWaitMs: number
}
const terminalStatuses = new Set<OrderStatus>(['FILLED', 'CANCELLED', 'REJECTED', 'FAILED'])
const orderStatuses = new Set([
  'PENDING',
  'SUBMITTED',
  'PARTIAL_FILLED',
  'MODIFYING',
  'CANCELLING',
  'FILLED',
  'CANCELLED',
  'REJECTED',
  'TIMEOUT',
  'FAILED',
])
const signalStates = new Set(['PENDING', 'ACCEPTED', 'UNKNOWN', 'REJECTED'])
const stops = new Set([
  'deadline',
  'user_stop',
  'terminal',
  'auth_denied',
  'not_found',
  'clock_uncertain',
  'prior_read_unresolved',
  'submission_rejected',
  'evidence_insufficient',
])
function text(value: unknown): asserts value is string {
  assert(
    typeof value === 'string' && value.trim().length > 0,
    'Expected a nonempty public reference',
  )
}
function nonnegative(value: unknown): asserts value is number {
  assert(
    typeof value === 'number' && Number.isFinite(value) && value >= 0,
    'Invalid observation time',
  )
}
function clock(value: ObservationClock) {
  assert(Number.isSafeInteger(value.utcMs) && value.utcMs >= 0, 'Invalid UTC clock')
  nonnegative(value.monotonicMs)
}
function validateInput(input: ObservationInput) {
  for (const value of [
    input.runId,
    input.ownerTaskId,
    input.intentId,
    input.server,
    input.reference?.id,
  ])
    text(value)
  assert(
    input.intentKeyDigest == null || /^[a-f0-9]{64}$/.test(input.intentKeyDigest),
    'Invalid known key digest; never generate a replacement key',
  )
  assert(
    input.reference.kind === 'order' || input.reference.kind === 'signal',
    'Invalid observation reference',
  )
  for (const value of [input.budgetMs, input.intervalMs, input.requestTimeoutMs])
    assert(Number.isSafeInteger(value) && value > 0, 'Observation timing must be positive')
}
export function validateObservationRecord(record: ObservationRecord) {
  const allowed = new Set([
    'runId',
    'ownerTaskId',
    'intentId',
    'intentKeyDigest',
    'server',
    'reference',
    'budgetMs',
    'intervalMs',
    'requestTimeoutMs',
    'schemaVersion',
    'startUtcMs',
    'deadlineUtcMs',
    'lastCheckpointUtcMs',
    'consumedMs',
    'nextReadConsumedMs',
    'readCount',
    'inFlight',
    'stopReason',
    'stopUtcMs',
    'lastOrderStatus',
    'lastSignalState',
    'lastStatusSource',
    'lastStatusReason',
    'lastIsStale',
    'lastMonitorStatus',
    'lastMonitorStopReason',
    'lastSignalOrderStatusSource',
    'lastEvidenceRef',
    'lastSnapshotEvidenceRef',
    'lastReadError',
    'supplementaryResults',
  ])
  assert(
    Object.keys(record).every((key) => allowed.has(key)),
    'Unexpected checkpoint field',
  )
  validateInput(record)
  assert.equal(record.schemaVersion, 1, 'Unsupported observation record')
  for (const value of [record.startUtcMs, record.deadlineUtcMs, record.lastCheckpointUtcMs])
    assert(Number.isSafeInteger(value) && value >= 0, 'Invalid persistent UTC time')
  assert.equal(
    record.deadlineUtcMs,
    record.startUtcMs + record.budgetMs,
    'Persistent budget was changed',
  )
  assert(record.lastCheckpointUtcMs >= record.startUtcMs, 'Invalid checkpoint')
  nonnegative(record.consumedMs)
  nonnegative(record.nextReadConsumedMs)
  assert(record.consumedMs <= record.budgetMs, 'Consumed budget exceeds original budget')
  assert(Number.isSafeInteger(record.readCount) && record.readCount >= 0, 'Invalid read count')
  assert(
    record.inFlight === null || (record.inFlight === record.readCount && record.readCount > 0),
    'Invalid in-flight sequence',
  )
  assert(record.stopReason === null || stops.has(record.stopReason), 'Invalid stop reason')
  assert(
    record.stopUtcMs === null || (Number.isSafeInteger(record.stopUtcMs) && record.stopUtcMs >= 0),
    'Invalid stop time',
  )
  assert.equal(record.stopReason === null, record.stopUtcMs === null, 'Incomplete stop checkpoint')
  assert(
    record.lastOrderStatus === null || orderStatuses.has(record.lastOrderStatus),
    'Invalid stored order status',
  )
  assert(
    record.lastSignalState === null || signalStates.has(record.lastSignalState),
    'Invalid stored signal status',
  )
  assert(
    Number.isSafeInteger(record.supplementaryResults) && record.supplementaryResults >= 0,
    'Invalid late result count',
  )
  for (const value of [
    record.lastStatusSource,
    record.lastStatusReason,
    record.lastMonitorStatus,
    record.lastMonitorStopReason,
    record.lastSignalOrderStatusSource,
    record.lastEvidenceRef,
    record.lastSnapshotEvidenceRef,
    record.lastReadError,
  ])
    assert(value === null || typeof value === 'string', 'Invalid checkpoint metadata')
  assert(
    record.lastIsStale === null || typeof record.lastIsStale === 'boolean',
    'Invalid staleness',
  )
}

export class ObservationWindow {
  private readonly record: ObservationRecord
  private readonly anchorMonotonic: number
  private readonly anchorConsumed: number
  private lastMonotonic: number

  private constructor(record: ObservationRecord, now: ObservationClock) {
    this.record = structuredClone(record)
    this.anchorMonotonic = now.monotonicMs
    this.anchorConsumed = record.consumedMs
    this.lastMonotonic = now.monotonicMs
  }
  static start(input: ObservationInput, now: ObservationClock) {
    validateInput(input)
    clock(now)
    assert(Number.isSafeInteger(now.utcMs + input.budgetMs), 'Deadline overflow')
    return new ObservationWindow(
      {
        runId: input.runId,
        ownerTaskId: input.ownerTaskId,
        intentId: input.intentId,
        intentKeyDigest: input.intentKeyDigest,
        server: input.server,
        reference: { kind: input.reference.kind, id: input.reference.id },
        budgetMs: input.budgetMs,
        intervalMs: input.intervalMs,
        requestTimeoutMs: input.requestTimeoutMs,
        schemaVersion: 1,
        startUtcMs: now.utcMs,
        deadlineUtcMs: now.utcMs + input.budgetMs,
        lastCheckpointUtcMs: now.utcMs,
        consumedMs: 0,
        nextReadConsumedMs: 0,
        readCount: 0,
        inFlight: null,
        stopReason: null,
        stopUtcMs: null,
        lastOrderStatus: null,
        lastSignalState: null,
        lastStatusSource: null,
        lastStatusReason: null,
        lastIsStale: null,
        lastMonitorStatus: null,
        lastMonitorStopReason: null,
        lastSignalOrderStatusSource: null,
        lastEvidenceRef: null,
        lastSnapshotEvidenceRef: null,
        lastReadError: null,
        supplementaryResults: 0,
      },
      now,
    )
  }
  static resume(record: ObservationRecord, ownerTaskId: string, now: ObservationClock) {
    return ObservationWindow.restore(record, ownerTaskId, now)
  }
  static stopCheckpoint(record: ObservationRecord, ownerTaskId: string, now: ObservationClock) {
    // An explicit stop is not a generic attempt to resume an unresolved GET.
    const window = ObservationWindow.restore(record, ownerTaskId, now, record.inFlight ?? undefined)
    window.stop(now)
    return window
  }
  static receive(
    record: ObservationRecord,
    ownerTaskId: string,
    sequence: number,
    outcome: ReadOutcome,
    now: ObservationClock,
  ) {
    const window = ObservationWindow.restore(record, ownerTaskId, now, sequence)
    window.completeRead(sequence, outcome, now)
    return window
  }
  private static restore(
    record: ObservationRecord,
    ownerTaskId: string,
    now: ObservationClock,
    receiptSequence?: number,
  ) {
    validateObservationRecord(record)
    clock(now)
    assert.equal(record.ownerTaskId, ownerTaskId, 'Observation task ownership mismatch')
    const restored = structuredClone(record)
    // Persist elapsed time and UTC bounds, never a previous process monotonic value.
    restored.consumedMs = Math.min(
      record.budgetMs,
      Math.max(
        record.consumedMs + Math.max(0, now.utcMs - record.lastCheckpointUtcMs),
        now.utcMs - record.startUtcMs,
      ),
    )
    const window = new ObservationWindow(restored, now)
    if (now.utcMs < record.lastCheckpointUtcMs) window.finish('clock_uncertain', now)
    else if (record.inFlight !== null && record.inFlight !== receiptSequence)
      window.finish('prior_read_unresolved', now)
    window.update(now)
    return window
  }
  private finish(reason: ObservationStop, now: ObservationClock) {
    if (this.record.stopReason === null) {
      this.record.stopReason = reason
      this.record.stopUtcMs = now.utcMs
    }
  }
  private update(now: ObservationClock) {
    clock(now)
    if (now.monotonicMs < this.lastMonotonic || now.utcMs < this.record.lastCheckpointUtcMs)
      this.finish('clock_uncertain', now)
    this.lastMonotonic = Math.max(this.lastMonotonic, now.monotonicMs)
    this.record.consumedMs = Math.min(
      this.record.budgetMs,
      Math.max(
        this.record.consumedMs,
        this.anchorConsumed + Math.max(0, now.monotonicMs - this.anchorMonotonic),
      ),
    )
    this.record.lastCheckpointUtcMs = Math.max(this.record.lastCheckpointUtcMs, now.utcMs)
    if (this.record.consumedMs >= this.record.budgetMs || now.utcMs >= this.record.deadlineUtcMs)
      this.finish('deadline', now)
    return Math.max(
      0,
      Math.min(
        this.record.budgetMs - this.record.consumedMs,
        this.record.deadlineUtcMs - now.utcMs,
      ),
    )
  }
  next(now: ObservationClock) {
    const remainingMs = this.update(now)
    if (this.record.stopReason !== null)
      return { action: 'stop' as const, reason: this.record.stopReason, remainingMs }
    if (this.record.inFlight !== null) return { action: 'in_flight' as const, remainingMs }
    const waitMs = Math.min(
      remainingMs,
      Math.max(0, this.record.nextReadConsumedMs - this.record.consumedMs),
    )
    return waitMs > 0
      ? { action: 'wait' as const, waitMs, remainingMs }
      : { action: 'read' as const, remainingMs }
  }
  beginRead(now: ObservationClock): ObservationRead | undefined {
    const next = this.next(now)
    if (next.action !== 'read') return undefined
    this.record.readCount++
    this.record.inFlight = this.record.readCount
    return {
      sequence: this.record.readCount,
      server: this.record.server,
      tool: this.record.reference.kind === 'order' ? 'getOrder' : 'getSignal',
      arguments:
        this.record.reference.kind === 'order'
          ? { orderId: this.record.reference.id }
          : { signalId: this.record.reference.id },
      callerWaitMs: Math.min(this.record.requestTimeoutMs, next.remainingMs),
    }
  }
  completeRead(sequence: number, outcome: ReadOutcome, now: ObservationClock) {
    assert.equal(this.record.inFlight, sequence, 'No matching in-flight read')
    text(outcome.evidenceRef)
    const returnedId =
      outcome.kind === 'snapshot'
        ? this.record.reference.kind === 'order'
          ? outcome.order_id
          : outcome.signal_id
        : undefined
    const referenceError =
      outcome.kind === 'snapshot' && returnedId !== this.record.reference.id
        ? typeof returnedId === 'string' && returnedId.length > 0
          ? 'reference_mismatch'
          : 'missing_reference'
        : null
    if (outcome.kind === 'snapshot' && referenceError === null) {
      for (const value of [
        outcome.statusSource,
        outcome.statusReason,
        outcome.monitorStatus,
        outcome.monitorStopReason,
        outcome.signalOrderStatusSource,
      ])
        assert(value == null || typeof value === 'string', 'Invalid snapshot provenance')
      assert(
        outcome.isStale == null || typeof outcome.isStale === 'boolean',
        'Invalid snapshot staleness',
      )
      assert(
        outcome.terminalSource === undefined ||
          outcome.terminalSource === 'channel' ||
          outcome.terminalSource === 'authoritative_order',
        'Invalid terminal evidence source',
      )
      assert(
        outcome.orderStatus === undefined || orderStatuses.has(outcome.orderStatus),
        'Invalid order state',
      )
      assert(
        outcome.signalState === undefined || signalStates.has(outcome.signalState),
        'Invalid signal state',
      )
      if (outcome.terminalSource !== undefined) {
        const channelExpiry =
          outcome.orderStatus === 'TIMEOUT' &&
          outcome.terminalSource === 'channel' &&
          outcome.statusSource === 'CHANNEL' &&
          outcome.statusReason === 'DAY_EXPIRED'
        assert(outcome.isStale !== true, 'Stale snapshot is not fresh terminal confirmation')
        assert(
          channelExpiry ||
            (outcome.orderStatus !== undefined && terminalStatuses.has(outcome.orderStatus)),
          'TIMEOUT/intermediate signal is not channel-terminal proof',
        )
      }
    } else if (outcome.kind === 'error' && outcome.retryAfterMs !== undefined)
      nonnegative(outcome.retryAfterMs)
    this.update(now)
    const supplementary = this.record.stopReason !== null
    this.record.inFlight = null
    this.record.lastEvidenceRef = outcome.evidenceRef
    if (referenceError !== null) {
      this.record.lastReadError = referenceError
      this.finish('evidence_insufficient', now)
    } else if (outcome.kind === 'snapshot') {
      // One snapshot owns its state, provenance and staleness atomically.
      this.record.lastSnapshotEvidenceRef = outcome.evidenceRef
      this.record.lastOrderStatus = outcome.orderStatus ?? null
      this.record.lastSignalState = outcome.signalState ?? null
      this.record.lastStatusSource = outcome.statusSource ?? null
      this.record.lastStatusReason = outcome.statusReason ?? null
      this.record.lastIsStale = outcome.isStale ?? null
      this.record.lastMonitorStatus = outcome.monitorStatus ?? null
      this.record.lastMonitorStopReason = outcome.monitorStopReason ?? null
      this.record.lastSignalOrderStatusSource = outcome.signalOrderStatusSource ?? null
      this.record.lastReadError = null
      if (outcome.terminalSource !== undefined) this.finish('terminal', now)
      if (
        this.record.reference.kind === 'signal' &&
        outcome.signalState === 'REJECTED' &&
        outcome.isStale !== true
      )
        this.finish('submission_rejected', now)
    } else {
      // A read failure never rewrites the separately recorded order/signal state.
      this.record.lastReadError = outcome.category
      if (outcome.category === 'auth_denied' || outcome.category === 'not_found')
        this.finish(outcome.category, now)
    }
    if (supplementary) this.record.supplementaryResults++
    this.record.nextReadConsumedMs =
      this.record.consumedMs +
      Math.max(this.record.intervalMs, outcome.kind === 'error' ? (outcome.retryAfterMs ?? 0) : 0)
  }
  stop(now: ObservationClock) {
    this.update(now)
    this.finish('user_stop', now)
  }
  checkpoint(now: ObservationClock): ObservationRecord {
    this.update(now)
    return structuredClone(this.record)
  }
}

// Explicit task handoff only; not a service permission grant or a distributed lock.
export function transferObservation(record: ObservationRecord, fromOwner: string, toOwner: string) {
  validateObservationRecord(record)
  assert.equal(record.ownerTaskId, fromOwner, 'Observation task ownership mismatch')
  text(toOwner)
  assert.equal(record.inFlight, null, 'Resolve old in-flight read before handoff')
  return { ...structuredClone(record), ownerTaskId: toOwner }
}
