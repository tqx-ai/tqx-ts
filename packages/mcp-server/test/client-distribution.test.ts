import { describe, expect, it } from 'vitest'

import { readClientDistribution } from '../src/utils/client-distribution'

function read(query = '', headers: Record<string, string> = {}) {
  return readClientDistribution(new Request(`https://www.tqx.ai/mcp${query}`, { headers }))
}

describe('MCP client distribution', () => {
  it('treats an unmarked URL connection as having no local skills', () => {
    expect(read()).toEqual({
      distribution: 'mcp-url',
      distributionSource: 'default',
      hasLocalSkills: false,
    })
  })

  it('reads plugin markers from query parameters before conflicting headers', () => {
    expect(
      read('?tqx_distribution=agent-plugin&tqx_skill_bundle_version=1.2.3', {
        'X-TQX-Distribution': 'mcp-url',
        'X-TQX-Skill-Bundle-Version': '0.8.0',
      }),
    ).toEqual({
      distribution: 'agent-plugin',
      distributionSource: 'query',
      hasLocalSkills: true,
      skillBundleVersion: '1.2.3',
    })
  })

  it('lets a URL marker disable skills even when the header declares a plugin', () => {
    expect(
      read('?tqx_distribution=mcp-url', {
        'X-TQX-Distribution': 'agent-plugin',
        'X-TQX-Skill-Bundle-Version': '0.8.0',
      }),
    ).toEqual({
      distribution: 'mcp-url',
      distributionSource: 'query',
      hasLocalSkills: false,
    })
  })

  it('falls back to case-insensitive headers when query markers are absent or blank', () => {
    expect(
      read('?tqx_distribution=%20&tqx_skill_bundle_version=', {
        'x-tqx-distribution': 'agent-plugin',
        'x-tqx-skill-bundle-version': '0.8.0-beta.1+build.2',
      }),
    ).toEqual({
      distribution: 'agent-plugin',
      distributionSource: 'header',
      hasLocalSkills: true,
      skillBundleVersion: '0.8.0-beta.1+build.2',
    })
  })

  it('reads the bundle version from headers with a query source marker', () => {
    expect(
      read('?tqx_distribution=agent-plugin', {
        'X-TQX-Skill-Bundle-Version': '0.8.0',
      }),
    ).toMatchObject({ hasLocalSkills: true, skillBundleVersion: '0.8.0' })
  })

  it('does not infer skill availability from a bundle version alone', () => {
    expect(read('?tqx_skill_bundle_version=0.8.0')).toEqual({
      distribution: 'mcp-url',
      distributionSource: 'default',
      hasLocalSkills: false,
    })
  })

  it('treats unknown query markers as URL-only without using lower-priority headers', () => {
    expect(
      read('?tqx_distribution=unknown', {
        'X-TQX-Distribution': 'agent-plugin',
      }),
    ).toEqual({
      distribution: 'mcp-url',
      distributionSource: 'query',
      hasLocalSkills: false,
    })
  })

  it.each(['secret-value', '1'.repeat(129), '0.8.0%0Ainjected'])(
    'ignores invalid version %s',
    (version) => {
      expect(
        read(`?tqx_distribution=agent-plugin&tqx_skill_bundle_version=${version}`, {
          'X-TQX-Skill-Bundle-Version': '0.8.0',
        }),
      ).toEqual({
        distribution: 'agent-plugin',
        distributionSource: 'query',
        hasLocalSkills: true,
      })
    },
  )
})
