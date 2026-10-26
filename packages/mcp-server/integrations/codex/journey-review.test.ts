import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { ObservationWindow } from './observation-window'

const utc = Date.parse('2026-10-26T08:00:00Z')
const time = (wall: number, mono = wall) => ({ utcMs: utc + wall, monotonicMs: mono })
const input = {
  runId: 'review-run-A',
  ownerTaskId: 'review-task',
  intentId: 'read-existing-order',
  server: 'synthetic-server',
  reference: { kind: 'order' as const, id: 'order-A' },
  budgetMs: 10000,
  intervalMs: 1000,
  requestTimeoutMs: 3000,
}
test('review: resume counts downtime in addition to already consumed monotonic budget', () => {
  const window = ObservationWindow.start(input, time(0))
  const saved = window.checkpoint(time(1000, 5000))
  const restored = ObservationWindow.resume(saved, input.ownerTaskId, time(2000, 0))
  expect(restored.checkpoint(time(2000, 0)).consumedMs).toBe(6000)
  expect(restored.next(time(2000, 0)).remainingMs).toBe(4000)
})
test('review: a different order receipt cannot make this order terminal', () => {
  const window = ObservationWindow.start(input, time(0))
  const read = window.beginRead(time(0))!
  const wrongReceipt = {
    kind: 'snapshot' as const,
    order_id: 'order-B',
    evidenceRef: 'synthetic-other-run',
    orderStatus: 'FILLED' as const,
    terminalSource: 'channel' as const,
  }
  window.completeRead(read.sequence, wrongReceipt, time(10))
  expect(window.checkpoint(time(10))).toMatchObject({
    stopReason: 'evidence_insufficient',
    lastOrderStatus: null,
    lastReadError: 'reference_mismatch',
  })
})
test('review: missing actual response identity is evidence insufficient, not a terminal order', () => {
  const window = ObservationWindow.start(input, time(0))
  const read = window.beginRead(time(0))!
  window.completeRead(
    read.sequence,
    {
      kind: 'snapshot',
      evidenceRef: 'synthetic-missing-identity',
      orderStatus: 'FILLED',
      terminalSource: 'channel',
    },
    time(10),
  )
  expect(window.checkpoint(time(10))).toMatchObject({
    stopReason: 'evidence_insufficient',
    lastOrderStatus: null,
    lastReadError: 'missing_reference',
  })
})
test('review: metadata cannot be spliced from the previous snapshot into a new TIMEOUT', () => {
  const window = ObservationWindow.start(input, time(0))
  const first = window.beginRead(time(0))!
  const original = {
    kind: 'snapshot' as const,
    order_id: 'order-A',
    evidenceRef: 'synthetic-first',
    orderStatus: 'TIMEOUT' as const,
    statusSource: 'CHANNEL',
    statusReason: 'DAY_EXPIRED',
    isStale: true,
  }
  window.completeRead(first.sequence, original, time(10))
  const second = window.beginRead(time(1010))!
  const incomplete = {
    kind: 'snapshot' as const,
    order_id: 'order-A',
    evidenceRef: 'synthetic-second',
    orderStatus: 'TIMEOUT' as const,
  }
  window.completeRead(second.sequence, incomplete, time(1020))
  expect(window.checkpoint(time(1020))).toMatchObject({
    lastEvidenceRef: 'synthetic-second',
    lastStatusSource: null,
    lastStatusReason: null,
    lastIsStale: null,
  })
})
test('review CLI: explicit stop with an in-flight GET keeps user_stop and permits a late receipt', () => {
  const base = fileURLToPath(new URL('./', import.meta.url))
  const folder = mkdtempSync(resolve(base, 'work/observation-review-cli-'))
  const childEnv: Record<string, string> = {}
  for (const name of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP'])
    if (process.env[name]) childEnv[name] = process.env[name]!
  let index = 0
  const run = (data: unknown) => {
    const file = resolve(folder, 'step-' + index++ + '.json')
    writeFileSync(file, JSON.stringify(data))
    const result = spawnSync(
      'bun',
      ['--no-env-file', resolve(base, 'journey-harness.ts'), 'window', file],
      {
        encoding: 'utf8',
        windowsHide: true,
        env: childEnv,
      },
    )
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  }
  const started = run({ action: 'start', observation: input })
  const pending = run({ action: 'begin', record: started.record, ownerTaskId: input.ownerTaskId })
  const stopped = run({ action: 'stop', record: pending.record, ownerTaskId: input.ownerTaskId })
  expect(stopped.record.stopReason).toBe('user_stop')
  const received = run({
    action: 'complete',
    record: stopped.record,
    ownerTaskId: input.ownerTaskId,
    sequence: pending.permit.sequence,
    outcome: {
      kind: 'snapshot',
      order_id: 'order-A',
      orderStatus: 'SUBMITTED',
      evidenceRef: 'synthetic-late-receipt',
    },
  })
  expect(received.record).toMatchObject({
    stopReason: 'user_stop',
    inFlight: null,
    supplementaryResults: 1,
  })
})
