import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import {
  principalSchema,
  type ReadManifest,
  type ReadPrincipal,
  type ReadRequestEvidence,
} from './read-only-contract'
import { checkReadPermit, type ReadAudit, type ReadPermit } from './read-only-runner'
import type { ReadCase } from './read-only-plan'

export async function privateReadPath(directory: string, file: string): Promise<string> {
  const root = await realpath(directory)
  const path = await realpath(file)
  const suffix = relative(root, path)
  if (
    !suffix ||
    suffix.startsWith('..') ||
    isAbsolute(suffix) ||
    /(?:^|[/\\])\.codex(?:[/\\]|$)/i.test(path)
  )
    throw new Error('READ path is outside explicit private directory')
  return path
}
const auditSchema = z.object({
  businessDigest: z.string().min(1),
  tradingReadAttempts: z.number().int().nonnegative(),
  tradingWriteAttempts: z.number().int().nonnegative(),
  effects: z.number().int().nonnegative(),
  activeReadAttempts: z.number().int().nonnegative(),
  lastReadId: z.string().nullable(),
  integrityOk: z.literal(true),
})
interface ReadControlFiles {
  writeNew(path: string, body: string): Promise<void>
  publish(temporary: string, path: string): Promise<void>
  read(path: string): Promise<string>
}
const nativeFiles: ReadControlFiles = {
  writeNew: (path, body) => writeFile(path, body, { flag: 'wx', mode: 0o600 }),
  publish: (temporary, path) => rename(temporary, path),
  read: (path) => readFile(path, 'utf8'),
}
export class ReadFileControl {
  private current?: ReadCase
  private evidence = new Map<string, ReadRequestEvidence[]>()
  constructor(
    private readonly manifest: ReadManifest,
    private readonly permit: ReadPermit,
    private readonly principal: ReadPrincipal,
    private readonly files: ReadControlFiles = nativeFiles,
  ) {
    checkReadPermit(permit, manifest.generation)
    principalSchema.parse(principal)
    if (
      principal.agentId !== manifest.binding.agentId ||
      !manifest.allowedOAuth.some(
        (entry) =>
          entry.sessionId === principal.sessionId &&
          entry.grantId === principal.grantId &&
          entry.sourceJti === principal.sourceJti &&
          entry.clientId === principal.clientId,
      )
    )
      throw new Error('READ control principal is outside manifest')
  }
  private async rpc(
    action: 'setup' | 'audit' | 'teardown' | 'semantic',
    test: ReadCase,
    observed?: unknown,
  ) {
    // Expiry closes new setup, while audit/teardown must still settle an already started case.
    if (action === 'setup') checkReadPermit(this.permit, this.manifest.generation)
    const item = this.manifest.cases[test.id]
    if (!item || !Object.hasOwn(this.manifest.datasets, item.datasetId))
      throw new Error('Unmapped READ case')
    const id = randomUUID()
    const request = {
      schemaVersion: 1,
      testOnly: true,
      phase: 'B',
      id,
      generation: this.manifest.generation,
      namespace: this.manifest.namespace,
      subject: '740001',
      binding: this.manifest.binding,
      action,
      caseId: test.id,
      datasetId: item.datasetId,
      principal: this.principal,
      ...(observed === undefined ? {} : { observed }),
    }
    // Unique, append-only files; publish a complete request atomically. Never remove controller history.
    const directory = this.manifest.controlDir
    const temporary = resolve(directory, `request-${id}.tmp`)
    await this.files.writeNew(temporary, JSON.stringify(request))
    await this.files.publish(temporary, resolve(directory, `request-${id}.json`))
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      let body: string
      try {
        body = await this.files.read(resolve(directory, `response-${id}.json`))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          // Do not retain a filesystem exception (it may expose private paths).
          // eslint-disable-next-line preserve-caught-error
          throw new Error('READ control unavailable')
        }
        await delay(50)
        continue
      }
      if (body.length > 1_048_576) throw new Error('READ control response oversized')
      const response = z
        .object({
          schemaVersion: z.literal(1),
          id: z.literal(id),
          generation: z.literal(this.manifest.generation),
          action: z.literal(action),
          caseId: z.literal(test.id),
          ok: z.literal(true),
          synthetic: z.literal(true),
          mode: z.literal('PAPER'),
          fake: z.literal(true).optional(),
          broker: z.literal('fake').optional(),
          audit: auditSchema.optional(),
          checks: z.record(z.string(), z.boolean()).optional(),
          evidence: z
            .object({
              requests: z
                .array(
                  z.object({
                    method: z.string(),
                    origin: z.string(),
                    rawPath: z.string().nullable(),
                    queryPresent: z.boolean(),
                    status: z.number().int(),
                    locationPresent: z.boolean().optional(),
                  }),
                )
                .max(16),
            })
            .optional(),
        })
        .parse(JSON.parse(body))
      if (!response.fake && response.broker !== 'fake')
        throw new Error('READ broker isolation not confirmed')
      return response
    }
    throw new Error('READ control timed out')
  }
  async setup(test: ReadCase) {
    this.current = test
    await this.rpc('setup', test)
  }
  async teardown(test: ReadCase) {
    await this.rpc('teardown', test)
    this.current = undefined
  }
  async audit(): Promise<ReadAudit> {
    if (!this.current) throw new Error('READ control has no selected case')
    const response = await this.rpc('audit', this.current)
    if (!response.audit) throw new Error('READ audit missing')
    return response.audit
  }
  async semantic(test: ReadCase, observed: unknown): Promise<Record<string, boolean>> {
    const response = await this.rpc('semantic', test, observed)
    this.evidence.set(test.id, response.evidence?.requests ?? [])
    return response.checks ?? {}
  }
  requestEvidence(test: ReadCase): readonly ReadRequestEvidence[] {
    return this.evidence.get(test.id) ?? []
  }
}
