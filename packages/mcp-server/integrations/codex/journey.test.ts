import { afterEach, describe, expect, it, vi } from 'vitest'
import { ObservationWindow, transferObservation, type ObservationClock } from './observation-window'
import {
  assessJourneyEvidence,
  authorizationNextAction,
  prepareJourney,
  unavailableToolsAction,
  journeyRequirements,
  type JourneyEvidence,
  type JourneyInput,
  type ModelMcpEvent,
} from './journey-acceptance'

const start = Date.parse('2026-10-26T08:00:00Z')
const now = (elapsed = 0, monotonic = elapsed): ObservationClock => ({
  utcMs: start + elapsed,
  monotonicMs: monotonic,
})
const input: JourneyInput = {
  caseId: 'MON-01',
  runId: 'offline-run',
  ownerTaskId: 'task-A',
  intentId: 'original-intent',
  intentKeyDigest: 'a'.repeat(64),
  server: 'tqx-test',
  reference: { kind: 'order', id: 'order-A' },
  budgetMs: 10000,
  intervalMs: 1000,
  requestTimeoutMs: 4000,
  buildRef: 'offline-structure-only',
}
function window() {
  return ObservationWindow.start(input, now())
}
function snapshot(
  window: ObservationWindow,
  elapsed: number,
  status: 'SUBMITTED' | 'PARTIAL_FILLED' = 'SUBMITTED',
) {
  const read = window.beginRead(now(elapsed))
  expect(read).toBeDefined()
  window.completeRead(
    read!.sequence,
    {
      kind: 'snapshot',
      evidenceRef: 'synthetic-snapshot',
      order_id: 'order-A',
      orderStatus: status,
      signalState: 'ACCEPTED',
    },
    now(elapsed + 10),
  )
}
function evidence(): JourneyEvidence {
  const observation = window()
  snapshot(observation, 0)
  observation.stop(now(100))
  return {
    caseId: input.caseId,
    runId: input.runId,
    buildRef: input.buildRef,
    layer: 'C',
    surface: 'desktop',
    record: observation.checkpoint(now(100)),
    events: [
      {
        origin: 'actual_model_mcp',
        runId: input.runId,
        sessionId: 'synthetic-session',
        taskId: input.ownerTaskId,
        turnId: 'synthetic-turn',
        callId: 'synthetic-marker',
        server: input.server,
        tool: 'getOrder',
        arguments: { orderId: 'order-A' },
        startedUtcMs: start,
        endedUtcMs: start + 10,
        rawMarkerRef: 'synthetic-reference-not-an-actual-call',
        resultRef: 'synthetic-result',
        outcome: 'snapshot',
        order_id: 'order-A',
        orderStatus: 'SUBMITTED',
      },
    ],
    audit: {
      baselineRef: 'synthetic-before',
      afterRef: 'synthetic-after',
      writeHttpDelta: 0,
      operationDelta: 0,
      writeEffectDelta: 0,
    },
  }
}
afterEach(() => vi.unstubAllGlobals())
describe('MON/REC pure observation budget, never a trading executor', () => {
  it('MON-01 gates a same-reference read and exposes caller waiting outside tool arguments', () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('Network prohibited')
    })
    const observation = window()
    const read = observation.beginRead(now(0))
    expect(read).toEqual({
      sequence: 1,
      server: 'tqx-test',
      tool: 'getOrder',
      arguments: { orderId: 'order-A' },
      callerWaitMs: 4000,
    })
    expect(observation.next(now(1)).action).toBe('in_flight')
  })
  it('MON-06 preserves partial and accepted as different intermediate states', () => {
    const observation = window()
    snapshot(observation, 0, 'PARTIAL_FILLED')
    expect(observation.checkpoint(now(20))).toMatchObject({
      lastOrderStatus: 'PARTIAL_FILLED',
      lastSignalState: 'ACCEPTED',
      stopReason: null,
    })
    expect(observation.next(now(500)).action).toBe('wait')
    expect(observation.beginRead(now(1010))?.arguments).toEqual({ orderId: 'order-A' })
  })
  it('MON-01 only confirmed fresh terminal evidence ends early', () => {
    const observation = window()
    const read = observation.beginRead(now())!
    observation.completeRead(
      read.sequence,
      {
        kind: 'snapshot',
        evidenceRef: 'synthetic-final',
        order_id: 'order-A',
        orderStatus: 'FILLED',
        terminalSource: 'channel',
      },
      now(10),
    )
    expect(observation.next(now(20))).toMatchObject({ action: 'stop', reason: 'terminal' })
    expect(observation.beginRead(now(30))).toBeUndefined()
  })
  it('MON-14 keeps monitor exhaustion independent of accepted and channel order state', () => {
    const observation = window()
    const read = observation.beginRead(now())!
    observation.completeRead(
      read.sequence,
      {
        kind: 'snapshot',
        evidenceRef: 'synthetic-budget',
        order_id: 'order-A',
        orderStatus: 'SUBMITTED',
        signalState: 'ACCEPTED',
        monitorStatus: 'BUDGET_EXHAUSTED',
        monitorStopReason: 'monitor_budget',
        statusSource: 'CHANNEL',
      },
      now(10),
    )
    expect(observation.checkpoint(now(20))).toMatchObject({
      stopReason: null,
      lastOrderStatus: 'SUBMITTED',
      lastSignalState: 'ACCEPTED',
      lastMonitorStatus: 'BUDGET_EXHAUSTED',
      lastMonitorStopReason: 'monitor_budget',
    })
  })
  it('MON-14/15 ambiguous TIMEOUT is not channel expiry proof', () => {
    const observation = window()
    const read = observation.beginRead(now())!
    expect(() =>
      observation.completeRead(
        read.sequence,
        {
          kind: 'snapshot',
          evidenceRef: 'synthetic-timeout',
          order_id: 'order-A',
          orderStatus: 'TIMEOUT',
          terminalSource: 'channel',
        },
        now(10),
      ),
    ).toThrow('not channel-terminal')
    observation.completeRead(
      read.sequence,
      {
        kind: 'snapshot',
        evidenceRef: 'synthetic-timeout',
        order_id: 'order-A',
        orderStatus: 'TIMEOUT',
        statusSource: null,
        statusReason: null,
      },
      now(10),
    )
    expect(observation.checkpoint(now(20)).stopReason).toBeNull()
  })
  it('channel TIMEOUT requires CHANNEL/DAY_EXPIRED and a fresh authoritative observation', () => {
    const observation = window()
    const read = observation.beginRead(now())!
    observation.completeRead(
      read.sequence,
      {
        kind: 'snapshot',
        evidenceRef: 'synthetic-expiry',
        order_id: 'order-A',
        orderStatus: 'TIMEOUT',
        statusSource: 'CHANNEL',
        statusReason: 'DAY_EXPIRED',
        isStale: false,
        terminalSource: 'channel',
      },
      now(10),
    )
    expect(observation.next(now(20))).toMatchObject({ action: 'stop', reason: 'terminal' })
  })
  it('stale FILLED is recorded separately but cannot confirm current terminal state', () => {
    const observation = window()
    const read = observation.beginRead(now())!
    expect(() =>
      observation.completeRead(
        read.sequence,
        {
          kind: 'snapshot',
          evidenceRef: 'synthetic-stale',
          order_id: 'order-A',
          orderStatus: 'FILLED',
          isStale: true,
          terminalSource: 'channel',
        },
        now(10),
      ),
    ).toThrow('Stale')
    observation.completeRead(
      read.sequence,
      {
        kind: 'snapshot',
        order_id: 'order-A',
        evidenceRef: 'synthetic-stale',
        orderStatus: 'FILLED',
        isStale: true,
      },
      now(10),
    )
    expect(observation.checkpoint(now(20))).toMatchObject({ lastIsStale: true, stopReason: null })
  })
  it('MON-02/03/13 starts no GET exactly at deadline and never edits order status', () => {
    const observation = window()
    snapshot(observation, 0)
    expect(observation.beginRead(now(10000))).toBeUndefined()
    expect(observation.checkpoint(now(10000))).toMatchObject({
      stopReason: 'deadline',
      lastOrderStatus: 'SUBMITTED',
    })
  })
  it('MON-13 permits a pre-deadline late result without rewriting the original stop reason', () => {
    const observation = window()
    const read = observation.beginRead(now(9000))!
    expect(read.callerWaitMs).toBe(1000)
    observation.completeRead(
      read.sequence,
      {
        kind: 'snapshot',
        evidenceRef: 'synthetic-late-fill',
        order_id: 'order-A',
        orderStatus: 'FILLED',
        terminalSource: 'channel',
      },
      now(11000),
    )
    expect(observation.checkpoint(now(11000))).toMatchObject({
      stopReason: 'deadline',
      lastOrderStatus: 'FILLED',
      supplementaryResults: 1,
    })
  })
  it('MON-04/18 stops only this task and accepts earlier in-flight completion', () => {
    const observation = window()
    const other = window()
    const read = observation.beginRead(now())!
    observation.stop(now(100))
    observation.completeRead(
      read.sequence,
      {
        kind: 'snapshot',
        order_id: 'order-A',
        evidenceRef: 'synthetic-late-stop',
        orderStatus: 'SUBMITTED',
      },
      now(200),
    )
    expect(observation.beginRead(now(300))).toBeUndefined()
    expect(observation.checkpoint(now(300))).toMatchObject({
      stopReason: 'user_stop',
      supplementaryResults: 1,
      lastOrderStatus: 'SUBMITTED',
    })
    expect(other.next(now(300)).action).toBe('read')
  })
  it.each(['network', 'timeout', 'rate_limited'] as const)(
    'MON-07 read %s does not rewrite order or signal',
    (category) => {
      const observation = window()
      snapshot(observation, 0)
      const read = observation.beginRead(now(1010))!
      observation.completeRead(
        read.sequence,
        { kind: 'error', category, evidenceRef: 'synthetic-read-error' },
        now(1020),
      )
      expect(observation.checkpoint(now(1030))).toMatchObject({
        lastOrderStatus: 'SUBMITTED',
        lastSignalState: 'ACCEPTED',
        lastReadError: category,
        stopReason: null,
      })
    },
  )
  it('MON-08 retry-after exceeding remaining budget never schedules a final GET', () => {
    const observation = window()
    const read = observation.beginRead(now())!
    observation.completeRead(
      read.sequence,
      {
        kind: 'error',
        category: 'rate_limited',
        retryAfterMs: 50000,
        evidenceRef: 'synthetic-429',
      },
      now(10),
    )
    expect(observation.next(now(20))).toMatchObject({ action: 'wait', waitMs: 9980 })
    expect(observation.beginRead(now(10000))).toBeUndefined()
    expect(observation.checkpoint(now(10000)).readCount).toBe(1)
  })
  it.each(['auth_denied', 'not_found'] as const)(
    'AUTH-04/MON-12 %s stops without inventing terminal order state',
    (category) => {
      const observation = window()
      snapshot(observation, 0)
      const read = observation.beginRead(now(1010))!
      observation.completeRead(
        read.sequence,
        { kind: 'error', category, evidenceRef: 'synthetic-denial' },
        now(1020),
      )
      expect(observation.checkpoint(now(1030))).toMatchObject({
        lastOrderStatus: 'SUBMITTED',
        lastSignalState: 'ACCEPTED',
        stopReason: category,
      })
      expect(observation.beginRead(now(2000))).toBeUndefined()
    },
  )
  it('MON-17 serializes a slow query and does not add unsupported tool timing args', () => {
    const observation = window()
    const read = observation.beginRead(now(8000))!
    expect(read.callerWaitMs).toBe(2000)
    expect(read.arguments).toEqual({ orderId: 'order-A' })
    expect(observation.beginRead(now(9000))).toBeUndefined()
    observation.completeRead(
      read.sequence,
      { kind: 'error', category: 'timeout', evidenceRef: 'synthetic-slow' },
      now(10001),
    )
    expect(observation.next(now(10002)).action).toBe('stop')
  })
  it('REC-03/09 persists UTC budget but never a monotonic absolute timestamp', () => {
    const saved = window().checkpoint(now(1000))
    expect(JSON.stringify(saved)).not.toMatch(/monotonic/i)
    const resumed = ObservationWindow.resume(saved, 'task-A', now(7000, 50))
    expect(resumed.next(now(7100, 150))).toMatchObject({ action: 'read', remainingMs: 2900 })
    expect(resumed.checkpoint(now(7100, 150)).deadlineUtcMs).toBe(start + 10000)
  })
  it('REC-09 sleep past deadline cannot silently renew a task', () => {
    const saved = window().checkpoint(now(1000))
    const resumed = ObservationWindow.resume(saved, 'task-A', now(20000, 5))
    expect(resumed.next(now(20000, 5))).toMatchObject({ action: 'stop', reason: 'deadline' })
  })
  it('REC-03 backward wall clock or backward process monotonic time is uncertain', () => {
    const saved = window().checkpoint(now(2000))
    expect(
      ObservationWindow.resume(saved, 'task-A', now(1000, 9)).next(now(1000, 9)),
    ).toMatchObject({ action: 'stop', reason: 'clock_uncertain' })
    const active = window()
    active.next(now(100, 100))
    expect(active.next(now(200, 50))).toMatchObject({ action: 'stop', reason: 'clock_uncertain' })
  })
  it('REC-01/02 requires explicit task handoff without resetting the deadline or key', () => {
    const saved = window().checkpoint(now(1000))
    expect(() => ObservationWindow.resume(saved, 'task-B', now(2000))).toThrow('ownership')
    const handed = transferObservation(saved, 'task-A', 'task-B')
    expect(handed).toMatchObject({
      ownerTaskId: 'task-B',
      deadlineUtcMs: saved.deadlineUtcMs,
      intentKeyDigest: saved.intentKeyDigest,
    })
    expect(ObservationWindow.resume(handed, 'task-B', now(2000)).next(now(2000)).action).toBe(
      'read',
    )
  })
  it('REC-03 unresolved old in-flight read blocks automatic cross-process overlap', () => {
    const active = window()
    active.beginRead(now())
    const saved = active.checkpoint(now(10))
    expect(() => transferObservation(saved, 'task-A', 'task-B')).toThrow('in-flight')
    expect(ObservationWindow.resume(saved, 'task-A', now(20, 0)).next(now(20, 0))).toMatchObject({
      action: 'stop',
      reason: 'prior_read_unresolved',
    })
  })
  it('an explicit matching completed read receipt can advance a public checkpoint across processes', () => {
    const active = window()
    const read = active.beginRead(now())!
    const saved = active.checkpoint(now(10))
    const received = ObservationWindow.receive(
      saved,
      'task-A',
      read.sequence,
      {
        kind: 'snapshot',
        evidenceRef: 'synthetic-matching-receipt',
        order_id: 'order-A',
        orderStatus: 'PARTIAL_FILLED',
        signalState: 'ACCEPTED',
        signalOrderStatusSource: 'CHANNEL',
      },
      now(20, 1),
    )
    expect(received.checkpoint(now(20, 1))).toMatchObject({
      inFlight: null,
      stopReason: null,
      lastOrderStatus: 'PARTIAL_FILLED',
      lastSignalOrderStatusSource: 'CHANNEL',
    })
    expect(received.next(now(30, 11)).action).toBe('wait')
    expect(() =>
      ObservationWindow.receive(
        saved,
        'task-A',
        read.sequence + 1,
        {
          kind: 'snapshot',
          evidenceRef: 'wrong-receipt',
        },
        now(20, 1),
      ),
    ).toThrow('matching')
  })
  it('a receipt after persisted user stop keeps the original stop, key and order reference', () => {
    const active = window()
    const read = active.beginRead(now())!
    active.stop(now(10))
    const received = ObservationWindow.receive(
      active.checkpoint(now(10)),
      'task-A',
      read.sequence,
      {
        kind: 'error',
        category: 'timeout',
        evidenceRef: 'synthetic-stopped-receipt',
      },
      now(20, 1),
    )
    expect(received.checkpoint(now(20, 1))).toMatchObject({
      stopReason: 'user_stop',
      supplementaryResults: 1,
      intentKeyDigest: input.intentKeyDigest,
      reference: input.reference,
    })
  })
  it('signal observation uses the same original signal and ACCEPTED never implies a filled order', () => {
    const active = ObservationWindow.start(
      { ...input, reference: { kind: 'signal', id: 'signal-A' } },
      now(),
    )
    const read = active.beginRead(now())!
    expect(read).toMatchObject({ tool: 'getSignal', arguments: { signalId: 'signal-A' } })
    active.completeRead(
      read.sequence,
      {
        kind: 'snapshot',
        signal_id: 'signal-A',
        signalState: 'ACCEPTED',
        evidenceRef: 'synthetic-signal',
      },
      now(10),
    )
    expect(active.checkpoint(now(10))).toMatchObject({
      lastOrderStatus: null,
      lastSignalState: 'ACCEPTED',
      stopReason: null,
    })
  })
  it('a rejected signal ends that submission observation without inventing an order terminal state', () => {
    const active = ObservationWindow.start(
      { ...input, reference: { kind: 'signal', id: 'signal-A' } },
      now(),
    )
    const read = active.beginRead(now())!
    active.completeRead(
      read.sequence,
      {
        kind: 'snapshot',
        signal_id: 'signal-A',
        signalState: 'REJECTED',
        evidenceRef: 'synthetic-rejected-submission',
      },
      now(10),
    )
    expect(active.checkpoint(now(10))).toMatchObject({
      lastOrderStatus: null,
      lastSignalState: 'REJECTED',
      stopReason: 'submission_rejected',
    })
    expect(active.beginRead(now(1010))).toBeUndefined()
  })
  it.each([null, undefined])(
    'read-only old-order observation does not require an original write key: %s',
    (intentKeyDigest) => {
      const readOnly = { ...input, intentKeyDigest }
      const active = ObservationWindow.start(readOnly, now())
      expect(active.beginRead(now())?.arguments).toEqual({ orderId: 'order-A' })
      expect(prepareJourney(readOnly).prompts.naturalObserve).toContain('order-A')
      expect(prepareJourney(readOnly).executed).toBe(false)
      expect(active.checkpoint(now()).intentKeyDigest).toBe(intentKeyDigest)
    },
  )
  it('REC-09 rejects a tampered persistent deadline and preserves a prior stop', () => {
    const active = window()
    active.stop(now(50))
    const saved = active.checkpoint(now(50))
    expect(() =>
      ObservationWindow.resume(
        { ...saved, deadlineUtcMs: saved.deadlineUtcMs + 1 },
        'task-A',
        now(100),
      ),
    ).toThrow('changed')
    expect(ObservationWindow.resume(saved, 'task-A', now(100)).next(now(100))).toMatchObject({
      reason: 'user_stop',
    })
  })
  it('keeps returned checkpoints isolated from caller mutation', () => {
    const active = window()
    const saved = active.checkpoint(now())
    saved.reference.id = 'another-order'
    expect(active.beginRead(now())?.arguments).toEqual({ orderId: 'order-A' })
  })
})
describe('AUTH/ENV actual-session input and evidence, not automatic acceptance', () => {
  it.each([true, false])(
    'AUTH-08/09 human says done=%s cannot turn pending into success',
    (humanSaysDone) => {
      expect(
        authorizationNextAction({ state: 'pending', processActive: true, humanSaysDone }),
      ).toBe('WAIT_SAME_FLOW')
      expect(
        authorizationNextAction({ state: 'expired', processActive: false, humanSaysDone }),
      ).toBe('NEEDS_FRESH_HUMAN_FLOW')
      expect(
        authorizationNextAction({ state: 'native_complete', processActive: false, humanSaysDone }),
      ).toBe('VERIFY_ACTUAL_READ')
      expect(
        authorizationNextAction({ state: 'denied', processActive: false, humanSaysDone }),
      ).toBe('REPORT_DENIAL')
    },
  )
  it('ENV-04/05/EXT-04 distinguish metadata/override/timeout/auth instead of clearing credentials', () => {
    expect(unavailableToolsAction('metadata_unreachable')).toBe('RESTORE_ISOLATED_AS_KEEP_GRANT')
    expect(unavailableToolsAction('project_override')).toBe(
      'CHECK_EFFECTIVE_URL_AND_ALLOWLIST_IN_TARGET_CWD',
    )
    expect(unavailableToolsAction('timeout')).toBe('CHECK_REACHABILITY_AND_INITIALIZATION_TIMING')
    expect(unavailableToolsAction('auth_rejected')).toBe(
      'REPORT_ACTUAL_AUTH_ERROR_NO_AUTOMATIC_RECONSENT',
    )
  })
  it('prepares natural-language first and controlled diagnostic prompts, always PLANNED', () => {
    const plan = prepareJourney(input)
    expect(plan).toMatchObject({
      executed: false,
      status: 'PLANNED',
      actualMcpCalls: 0,
      sourceCaseCount: 121,
    })
    expect(plan.prompts.naturalObserve).toContain('order-A')
    expect(plan.prompts.naturalObserve).not.toContain('Before every GET')
    expect(plan.prompts.controlledObserve).toContain('BUDGET')
    expect(plan.prompts.controlledObserve).toContain('status_source=CHANNEL')
    expect(plan.prompts.submitOnceBoundary).toContain('end this turn promptly')
    expect(Object.keys(journeyRequirements)).toContain('MON-09')
  })
  it('complete-looking synthetic structure requires Owner inspection and never automatically passes C', () => {
    const report = assessJourneyEvidence(input, evidence())
    expect(report).toMatchObject({
      assessment: 'NEEDS_OWNER_REVIEW',
      actualExecutionVerifiedByScript: false,
      observedMarkerCount: 1,
    })
  })
  it.each(['offline', 'cli_management', 'raw_http'] as const)(
    'rejects %s as actual new model MCP evidence',
    (origin) => {
      const report = evidence()
      report.events[0]!.origin = origin
      expect(assessJourneyEvidence(input, report).assessment).toBe('VIOLATION')
    },
  )
  it('rejects reused markers, another reference/task, and post-stop GETs', () => {
    const report = evidence()
    report.events.push({
      ...report.events[0]!,
      startedUtcMs: start + 101,
      endedUtcMs: start + 102,
      arguments: { orderId: 'another-order' },
      taskId: 'another-task',
    })
    const result = assessJourneyEvidence(input, report)
    expect(result.violations).toContain('duplicate historical tool marker')
    expect(result.violations).toContain('read not bound to original reference')
    expect(result.violations).toContain('event run/task/server mismatch')
    expect(result.violations).toContain('new read at/after deadline or processed stop')
  })
  it('allows a prior in-flight late result but rejects a new read at deadline', () => {
    const report = evidence()
    report.record.stopReason = 'deadline'
    report.record.stopUtcMs = start + 10000
    report.events[0]!.startedUtcMs = start + 9999
    report.events[0]!.endedUtcMs = start + 11000
    expect(assessJourneyEvidence(input, report).assessment).toBe('NEEDS_OWNER_REVIEW')
    report.events[0]!.startedUtcMs = start + 10000
    expect(assessJourneyEvidence(input, report).assessment).toBe('VIOLATION')
  })
  it('rejects writes/effects or an error represented as changed order state', () => {
    const report = evidence()
    report.audit!.writeHttpDelta = 1
    report.events[0]!.tool = 'placeOrder'
    report.events[0]!.outcome = 'read_error'
    expect(assessJourneyEvidence(input, report).violations).toEqual(
      expect.arrayContaining([
        'observation produced agent trading writes/effects',
        'non-read tool during observation',
        'read error presented as order state',
      ]),
    )
  })
  it('does not pass absent calls/audit or claim offline layer as actual C', () => {
    const report = evidence()
    report.layer = 'U'
    report.events = []
    delete report.audit
    expect(assessJourneyEvidence(input, report).assessment).toBe('INCOMPLETE')
  })
  it('does not hide overlapping GETs or invented tool timeout arguments', () => {
    const report = evidence()
    const first = report.events[0]!
    report.events.push({
      ...first,
      callId: 'second-marker',
      startedUtcMs: start + 5,
      endedUtcMs: start + 20,
      arguments: { orderId: 'order-A', timeoutMs: 5 },
    } satisfies ModelMcpEvent)
    expect(assessJourneyEvidence(input, report).violations).toEqual(
      expect.arrayContaining(['invalid/nonserial event timeline', 'invented MCP timing argument']),
    )
  })
})
