import * as v from 'valibot'

const distributionSchema = v.picklist(['agent-plugin', 'mcp-url'])
const versionSchema = v.pipe(
  v.string(),
  v.maxLength(128),
  v.regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
)

export interface ClientDistribution {
  distribution: v.InferOutput<typeof distributionSchema>
  distributionSource: 'query' | 'header' | 'default'
  hasLocalSkills: boolean
  skillBundleVersion?: string
}

/** Resolve request-local skill availability using query markers before headers. */
export function readClientDistribution(request: Request): ClientDistribution {
  const query = new URL(request.url).searchParams
  const queryMarker = query.get('tqx_distribution')?.trim()
  const headerMarker = request.headers.get('X-TQX-Distribution')?.trim()
  const marker = queryMarker || headerMarker
  const distribution = v.safeParse(distributionSchema, marker)
  const version = v.safeParse(
    versionSchema,
    query.get('tqx_skill_bundle_version')?.trim() ||
      request.headers.get('X-TQX-Skill-Bundle-Version')?.trim(),
  )
  const value = distribution.success ? distribution.output : 'mcp-url'
  return {
    distribution: value,
    distributionSource: queryMarker ? 'query' : headerMarker ? 'header' : 'default',
    // This is a routing policy based on client markers, not a filesystem probe.
    hasLocalSkills: value === 'agent-plugin',
    ...(value === 'agent-plugin' && version.success ? { skillBundleVersion: version.output } : {}),
  }
}
