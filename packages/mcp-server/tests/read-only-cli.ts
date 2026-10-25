import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import {
  createReadDriver,
  precheckReadSources,
  verifyReadControlSource,
  type ReadSources,
} from './read-only-client'
import { readManifestSchema, type ReadTarget } from './read-only-contract'
import { planSummary, readOnlyPlan } from './read-only-plan'
import { privateReadPath, ReadFileControl } from './read-only-private'
import { checkReadPermit, runReadOnly, type ReadPermit } from './read-only-runner'

async function main() {
  const { values } = parseArgs({
    options: {
      plan: { type: 'boolean' },
      'execute-B': { type: 'boolean' },
      generation: { type: 'string' },
      expires: { type: 'string' },
      rate: { type: 'string' },
      private: { type: 'string' },
      contract: { type: 'string' },
      manifest: { type: 'string' },
      sources: { type: 'string' },
      cases: { type: 'string' },
    },
  })
  if (!values['execute-B']) {
    console.log(JSON.stringify(planSummary(), null, 2))
    return
  }
  const permit: ReadPermit = {
    approved: true,
    phase: 'B',
    subject: '740001',
    generation: values.generation ?? '',
    expiresAt: Date.parse(values.expires ?? ''),
    maxToolObservationsPerMinute: Number(values.rate),
  }
  // Reject absent/stale opt-in before reading any private file, token or controller.
  checkReadPermit(permit, permit.generation)
  if (values.plan || !values.private || !values.contract || !values.manifest || !values.sources)
    throw new Error('Incomplete explicit READ invocation')
  const load = async (path: string) => {
    const text = await readFile(await privateReadPath(values.private!, path), 'utf8')
    if (text.length > 4_194_304) throw new Error('Private READ input oversized')
    return JSON.parse(text) as unknown
  }
  // Root supplies this minimal fresh target contract alongside its broader run contract.
  const target = z
    .object({
      schemaVersion: z.literal(1),
      testOnly: z.literal(true),
      phase: z.literal('B'),
      generation: z.literal(permit.generation),
      namespace: z.string().min(1),
      subject: z.literal('740001'),
      issuer: z.string(),
      resource: z.string(),
      apiResource: z.string().optional(),
    })
    .parse(await load(values.contract)) satisfies ReadTarget
  const manifest = readManifestSchema.parse(await load(values.manifest))
  if (target.generation !== manifest.generation || target.namespace !== manifest.namespace)
    throw new Error('READ private inputs belong to different runs')
  manifest.controlDir = await privateReadPath(values.private, manifest.controlDir)
  if (!manifest.controlDir.split(/[/\\]/).includes('read-b-control'))
    throw new Error('READ execution requires its independent read-b-control directory')
  const bundle = z
    .object({
      schemaVersion: z.literal(1),
      testOnly: z.literal(true),
      phase: z.literal('B'),
      generation: z.literal(permit.generation),
      subject: z.literal('740001'),
      sources: z.record(z.string(), z.string().min(1).max(32768)),
    })
    .parse(await load(values.sources))
  if (!bundle.sources.read) throw new Error('READ source missing')
  const sources = bundle.sources as ReadSources
  const principal = precheckReadSources(manifest, target, sources).get('read')!
  const selected = values.cases ? new Set(values.cases.split(',')) : undefined
  const cases = readOnlyPlan().filter((test) => !selected || selected.has(test.id))
  if (selected && (cases.length !== selected.size || cases.length === 0))
    throw new Error('Unknown READ case selection')
  await verifyReadControlSource(target, sources.read, AbortSignal.timeout(5000))
  const evidenceDirectory = resolve(values.private, `read-evidence-${randomUUID()}`)
  await mkdir(evidenceDirectory, { mode: 0o700 })
  const report = await runReadOnly({
    permit,
    generation: permit.generation,
    cases,
    openDriver: async () => ({
      ...createReadDriver({
        permit,
        target,
        manifest,
        sources,
        control: new ReadFileControl(manifest, permit, principal),
      }),
      record: async (test, stage, value) => {
        await writeFile(
          resolve(evidenceDirectory, `${test.id}.${stage}.json`),
          JSON.stringify(value, null, 2),
          { flag: 'wx', mode: 0o600 },
        )
      },
    }),
  })
  await writeFile(
    resolve(evidenceDirectory, 'report.redacted.json'),
    JSON.stringify(report, null, 2),
    { flag: 'wx', mode: 0o600 },
  )
  console.log(JSON.stringify({ evidenceDirectory }))
  console.log(JSON.stringify(report, null, 2))
  if (report.counts.failed) process.exitCode = 1
}
try {
  await main()
} catch {
  console.error('READ acceptance stopped; private details and credentials withheld')
  process.exitCode = 1
}
