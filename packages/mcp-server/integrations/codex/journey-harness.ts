import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assessJourneyEvidence,
  prepareJourney,
  type JourneyEvidence,
  type JourneyInput,
} from './journey-acceptance'
import {
  ObservationWindow,
  type ObservationInput,
  type ObservationRecord,
  type ReadOutcome,
} from './observation-window'

async function main() {
  const [mode, path, extra] = process.argv.slice(2)
  if (!path || extra || !['plan', 'check', 'window'].includes(mode ?? ''))
    throw new Error('Use plan, check or window with one public JSON input')
  const parsed = JSON.parse(await readFile(path, 'utf8')) as {
    input: JourneyInput
    evidence?: JourneyEvidence
    action?: 'start' | 'next' | 'begin' | 'complete' | 'stop'
    observation?: ObservationInput
    record?: ObservationRecord
    ownerTaskId?: string
    sequence?: number
    outcome?: ReadOutcome
  }
  if (mode === 'window') {
    const now = { utcMs: Date.now(), monotonicMs: performance.now() }
    let window: ObservationWindow
    if (parsed.action === 'start' && parsed.observation)
      window = ObservationWindow.start(parsed.observation, now)
    else {
      if (
        !parsed.record ||
        !parsed.ownerTaskId ||
        !['next', 'begin', 'complete', 'stop'].includes(parsed.action ?? '')
      )
        throw new Error('Missing observation checkpoint/action/owner')
      if (parsed.action === 'complete') {
        if (!parsed.sequence || !parsed.outcome) throw new Error('Missing actual read receipt')
        window = ObservationWindow.receive(
          parsed.record,
          parsed.ownerTaskId,
          parsed.sequence,
          parsed.outcome,
          now,
        )
      } else if (parsed.action === 'stop')
        window = ObservationWindow.stopCheckpoint(parsed.record, parsed.ownerTaskId, now)
      else window = ObservationWindow.resume(parsed.record, parsed.ownerTaskId, now)
    }
    const permit = parsed.action === 'begin' ? window.beginRead(now) : undefined
    console.log(
      JSON.stringify(
        { executed: false, permit, decision: window.next(now), record: window.checkpoint(now) },
        null,
        2,
      ),
    )
  } else if (mode === 'plan') console.log(JSON.stringify(prepareJourney(parsed.input), null, 2))
  else {
    if (!parsed.evidence) throw new Error('Missing evidence')
    const report = assessJourneyEvidence(parsed.input, parsed.evidence)
    console.log(JSON.stringify(report, null, 2))
    if (report.assessment !== 'NEEDS_OWNER_REVIEW') process.exitCode = 2
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main().catch(() => {
    console.error(
      'Journey public input could not be checked; no model, network, authentication or trading action was executed.',
    )
    process.exitCode = 1
  })
