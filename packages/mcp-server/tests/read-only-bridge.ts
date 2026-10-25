import { z } from 'zod'
import { readManifestSchema, type ReadManifest } from './read-only-contract'

function plainManifestNumbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainManifestNumbers)
  if (!value || typeof value !== 'object') return value
  const entries = Object.entries(value)
  if (
    entries.length === 1 &&
    ['$numberInt', '$numberLong', '$numberDouble'].includes(entries[0]![0])
  ) {
    const [kind, raw] = entries[0]!
    if (typeof raw !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw))
      throw new Error('Invalid canonical manifest number')
    const number = Number(raw)
    if (!Number.isFinite(number) || (kind !== '$numberDouble' && !Number.isSafeInteger(number)))
      throw new Error('Manifest number cannot be represented without integer precision loss')
    if (kind === '$numberInt' && (number < -2147483648 || number > 2147483647))
      throw new Error('Invalid canonical int32')
    return number
  }
  // Decimal128 and all ordinary decimal/ID strings remain unchanged. Never approximate them.
  return Object.fromEntries(entries.map(([key, item]) => [key, plainManifestNumbers(item)]))
}

// Backend export has one persisted dataset/catalog and many case-bound selectors. This adapter
// preserves that actual declaration instead of inventing dataset counts/digests for the TS client.
export function bridgeReadManifest(input: unknown): ReadManifest {
  const backend = z
    .object({
      datasetId: z.string().min(1),
      source: z.string().min(1),
      datasets: z.record(z.string(), z.unknown()).optional(),
      documents: z.object({
        fixture_read_catalog: z.array(z.record(z.string(), z.unknown())).min(1),
      }),
      cases: z.record(z.string(), z.object({ datasetId: z.string() }).passthrough()),
    })
    .passthrough()
    .parse(plainManifestNumbers(input))
  const datasets = backend.datasets ?? {
    [backend.datasetId]: {
      source: backend.source,
      catalog: backend.documents.fixture_read_catalog,
    },
  }
  if (Object.values(backend.cases).some((test) => !Object.hasOwn(datasets, test.datasetId)))
    throw new Error('READ case references an undeclared backend dataset')
  return readManifestSchema.parse({
    ...backend,
    datasets,
  })
}
