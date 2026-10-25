import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { ReadCase } from './read-only-plan'

const id = z.string().min(1).max(256)
export const principalSchema = z.object({
  uid: z.literal('740001'),
  agentId: id,
  sessionId: id,
  grantId: id,
  sourceJti: id,
  clientId: id,
})
export type ReadPrincipal = z.infer<typeof principalSchema>
const pointer = z
  .string()
  .max(1024)
  .refine((value) => value === '' || value.startsWith('/'))
const ruleSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('equal'), path: pointer, value: z.unknown() }),
  z.object({ op: z.literal('absent'), path: pointer }),
  z.object({
    op: z.literal('type'),
    path: pointer,
    type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'null']),
  }),
  z.object({ op: z.literal('length'), path: pointer, value: z.number().int().nonnegative() }),
  z.object({ op: z.literal('keys'), path: pointer, value: z.array(z.string()) }),
  z.object({ op: z.literal('allEqual'), path: pointer, key: id, value: z.unknown() }),
  z.object({ op: z.literal('ids'), path: pointer, key: id, ids: z.array(id) }),
  z.object({
    op: z.literal('unionIds'),
    path: pointer,
    key: id,
    ids: z.array(id),
    withCaseId: id,
    otherPath: pointer.optional(),
  }),
])
export type SemanticRule = z.infer<typeof ruleSchema>
export const readManifestSchema = z.object({
  schemaVersion: z.literal(1),
  testOnly: z.literal(true),
  phase: z.literal('B'),
  generation: z.string().regex(/^owner-\d{8}-[a-f0-9]{8}$/),
  namespace: id,
  subject: z.literal('740001'),
  binding: z.object({
    uid: z.literal('740001'),
    agentId: id,
    accountId: id,
    brokerUserId: id,
    brokerCompanyId: z.literal('4'),
  }),
  allowedOAuth: z
    .array(z.object({ sessionId: id, grantId: id, sourceJti: id, clientId: id }))
    .min(1),
  capabilities: z.array(id),
  fixtureValues: z.record(z.string(), z.unknown()),
  datasets: z.record(z.string(), z.unknown()),
  controlDir: id,
  cases: z.record(
    z.string(),
    z
      .object({
        datasetId: id,
        expectedPrivateSemantics: z.record(z.string(), z.array(ruleSchema).min(1)).default({}),
      })
      .passthrough(),
  ),
})
export type ReadManifest = z.infer<typeof readManifestSchema>
export interface ReadTarget {
  issuer: string
  resource: string
  generation: string
  namespace: string
  apiResource?: string
}
export interface ReadRequestEvidence {
  method: string
  origin: string
  rawPath: string | null
  queryPresent: boolean
  status: number
  locationPresent?: boolean
}

// Missing is distinct from explicit null/undefined. Never traverse a prototype.
const missing = Symbol('missing')
function at(input: unknown, path: string): unknown {
  if (path === '') return input
  let value = input
  for (const encoded of path.slice(1).split('/')) {
    if (/~(?:[^01]|$)/.test(encoded)) return missing
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~')
    if (['__proto__', 'prototype', 'constructor'].includes(key)) return missing
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return missing
    value = (value as Record<string, unknown>)[key]
  }
  return value
}
function ids(value: unknown, key: string): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.map((row) => at(row, `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`))
  return result.every((item) => typeof item === 'string') ? result : undefined
}
export function evaluateReadRules(
  rules: readonly SemanticRule[],
  data: unknown,
  captured: ReadonlyMap<string, unknown>,
): boolean {
  if (!rules.length) return false
  return rules.every((rule) => {
    const value = at(data, rule.path)
    if (rule.op === 'absent') return value === missing
    if (value === missing) return false
    switch (rule.op) {
      case 'equal':
        return isDeepStrictEqual(value, rule.value)
      case 'type':
        return rule.type === 'null'
          ? value === null
          : rule.type === 'array'
            ? Array.isArray(value)
            : rule.type === 'object'
              ? !!value && typeof value === 'object' && !Array.isArray(value)
              : typeof value === rule.type
      case 'length':
        return (Array.isArray(value) || typeof value === 'string') && value.length === rule.value
      case 'keys':
        return (
          !!value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          isDeepStrictEqual(Object.keys(value).toSorted(), [...rule.value].toSorted())
        )
      case 'allEqual':
        return (
          Array.isArray(value) &&
          value.every((row) => isDeepStrictEqual(at(row, `/${rule.key}`), rule.value))
        )
      case 'ids':
        return isDeepStrictEqual(ids(value, rule.key), rule.ids)
      case 'unionIds': {
        if (!captured.has(rule.withCaseId)) return false
        const previous = ids(
          at(captured.get(rule.withCaseId), rule.otherPath ?? rule.path),
          rule.key,
        )
        const current = ids(value, rule.key)
        if (!previous || !current) return false
        const joined = [...previous, ...current]
        return (
          new Set(joined).size === joined.length &&
          isDeepStrictEqual(joined.toSorted(), [...rule.ids].toSorted())
        )
      }
    }
  })
}
export function evaluateReadSemantics(
  manifest: ReadManifest,
  test: ReadCase,
  data: unknown,
  captured: ReadonlyMap<string, unknown>,
): Record<string, boolean> {
  const config = manifest.cases[test.id]
  if (!config || !Object.hasOwn(manifest.datasets, config.datasetId))
    throw new Error('Missing READ case dataset')
  return Object.fromEntries(
    Object.entries(config.expectedPrivateSemantics).map(([check, rules]) => [
      check,
      evaluateReadRules(rules, data, captured),
    ]),
  )
}
