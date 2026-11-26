import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { SKILLS_EXTENSION_ID, SkillsClient } from '@modelcontextprotocol/client/ext/skills'
import { memorySkillFiles } from '@modelcontextprotocol/server/ext/skills'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app'
import { REPORT_URI } from '../src/apps/qube/backtest/resource'
import { createFilteredSkillFiles, loadPluginSkills, PLUGIN_SKILLS_DIRECTORY } from '../src/skills'
import { createOAuthFixture, testConfig } from './helpers/oauth'
import { envelope, ID, researchConfig, resource } from './helpers/research'

const oauth = await createOAuthFixture()
const token = await oauth.sign({ scope: 'trade:read' })
const researchReadToken = await oauth.sign({ sub: 'user-a', scope: 'research:read' })

const disposals: Array<() => Promise<void> | void> = []
afterEach(async () => {
  await Promise.all(disposals.splice(0).map((dispose) => dispose()))
})

function createClientFetch(app: ReturnType<typeof createApp>): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const headers = new Headers(request.headers)
    if (!headers.has('Host')) headers.set('Host', new URL(request.url).host)
    return app.request(request.url, {
      method: request.method,
      headers,
      body: request.body,
      signal: request.signal,
      // @ts-expect-error -- Node fetch duplex option for streaming request bodies
      duplex: request.body ? 'half' : undefined,
    })
  }
}

async function connectSkillsClient(
  app: ReturnType<typeof createApp>,
  options: {
    query?: string
    headers?: Record<string, string>
    bearer?: string
    legacy?: boolean
  } = {},
) {
  const client = new Client(
    { name: 'tqx-skills-test', version: '1.0.0' },
    { versionNegotiation: { mode: options.legacy ? 'legacy' : { pin: '2026-07-28' } } },
  )
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1/mcp${options.query ?? ''}`),
    {
      fetch: createClientFetch(app),
      requestInit: {
        headers: {
          Authorization: `Bearer ${options.bearer ?? token}`,
          ...options.headers,
        },
      },
    },
  )
  await client.connect(transport)
  disposals.push(() => client.close())
  return { client, skills: new SkillsClient(client) }
}

async function rawModernRpc(
  app: ReturnType<typeof createApp>,
  method: string,
  params: Record<string, unknown> = {},
  options: {
    query?: string
    headers?: Record<string, string>
    bearer?: string
  } = {},
) {
  const response = await app.request(`http://127.0.0.1/mcp${options.query ?? ''}`, {
    method: 'POST',
    headers: {
      Host: '127.0.0.1',
      Authorization: `Bearer ${options.bearer ?? token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
      ...(typeof params.uri === 'string' ? { 'Mcp-Name': params.uri } : {}),
      ...options.headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  })
  return { response, body: await response.json() }
}

describe('Skills over MCP', () => {
  it.each([false, true])(
    'serves and verifies packaged plugin skills for URL-only clients (legacy=%s)',
    async (legacy) => {
      const app = createApp({ config: testConfig, fetch: oauth.fetch, tradingConfig: null })
      disposals.push(app.dispose)
      const { skills } = await connectSkillsClient(app, { legacy })

      expect(skills.supported).toBe(true)
      expect(skills.directoryRead).toBe(true)

      const listed = await skills.list()
      expect(listed.invalid).toEqual([])
      expect(listed.skills.map((entry) => entry.frontmatter.name)).toEqual([
        'tqx-data',
        'tqx-research',
        'tqx-setup',
        'tqx-trading',
      ])
      if (!legacy) {
        expect(listed).toMatchObject({ ttlMs: 5 * 60 * 1000, cacheScope: 'public' })
      }
      for (const entry of listed.skills) {
        expect(Array.isArray(entry.resources)).toBe(true)
        if (Array.isArray(entry.resources)) {
          for (const item of entry.resources) {
            expect(item.uri).not.toMatch(/__pycache__|\.py[co]$|\/\.|Thumbs\.db|desktop\.ini/)
          }
        }
      }

      const trading = await skills.get('skill://tqx-trading/SKILL.md')
      expect(trading.skill.frontmatter.name).toBe('tqx-trading')

      const tradingManifest = await skills.read(trading.skill)
      expect(tradingManifest.verified).toBe(true)
      expect(tradingManifest.frontmatter?.name).toBe('tqx-trading')
      expect(tradingManifest.body).toContain('# TQX Trading')

      const research = listed.skills.find((entry) => entry.frontmatter.name === 'tqx-research')!
      const mcpReference = await skills.read(research, 'references/mcp.md')
      expect(mcpReference.verified).toBe(true)
      expect(mcpReference.mimeType).toBe('text/markdown')
      expect(mcpReference.text).toContain('tqx_research_call')

      const dataSkill = listed.skills.find((entry) => entry.frontmatter.name === 'tqx-data')!
      const helperScript = await skills.read(dataSkill, 'scripts/tqx_data_auth.py')
      expect(helperScript.verified).toBe(true)
      expect(helperScript.mimeType).toBe('text/x-python')
      expect(helperScript.text).toContain('def ')

      const logo = await skills.read(trading.skill, 'assets/tqx-trading-1118.png')
      expect(logo.verified).toBe(true)
      expect(logo.mimeType).toBe('image/png')
      expect(Buffer.from(logo.bytes.subarray(0, 8))).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      )

      const directory = await skills.readDirectory('skill://tqx-research/references')
      expect(directory.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'skill://tqx-research/references/data',
            name: 'data',
            mimeType: 'inode/directory',
          }),
          expect.objectContaining({
            uri: 'skill://tqx-research/references/mcp.md',
            name: 'mcp.md',
            mimeType: 'text/markdown',
          }),
        ]),
      )
    },
  )

  it.each([
    ['query marker', { query: '?tqx_distribution=agent-plugin', headers: {} }],
    [
      'header marker',
      {
        query: '',
        headers: {
          'X-TQX-Distribution': 'agent-plugin',
          'X-TQX-Skill-Bundle-Version': '0.8.0',
        },
      },
    ],
  ])('omits remote skills when %s declares local plugin skills', async (_label, marker) => {
    const app = createApp({ config: testConfig, fetch: oauth.fetch, tradingConfig: null })
    disposals.push(app.dispose)

    const [{ skills: modernSkills }, { skills: legacySkills }] = await Promise.all([
      connectSkillsClient(app, marker),
      connectSkillsClient(app, { ...marker, legacy: true }),
    ])
    expect(modernSkills.supported).toBe(false)
    expect(legacySkills.supported).toBe(false)

    const discover = await rawModernRpc(app, 'server/discover', {}, marker)
    expect(discover.body.result.capabilities).toMatchObject({ resources: {} })
    expect(discover.body.result.capabilities.extensions?.[SKILLS_EXTENSION_ID]).toBeUndefined()

    const templates = await rawModernRpc(app, 'resources/templates/list', {}, marker)
    expect(templates.body.result.resourceTemplates).toEqual([])

    const listAttempt = await rawModernRpc(app, 'skills/list', {}, marker)
    expect(listAttempt.body.error?.code).toBe(-32601)

    const getAttempt = await rawModernRpc(
      app,
      'skills/get',
      { uri: 'skill://tqx-trading/SKILL.md' },
      marker,
    )
    expect(getAttempt.body.error?.code).toBe(-32601)

    const readAttempt = await rawModernRpc(
      app,
      'resources/read',
      { uri: 'skill://tqx-trading/SKILL.md' },
      marker,
    )
    expect(readAttempt.body.error?.code).toBe(-32602)
  })

  it('isolates concurrent plugin and URL-only connections on the same app', async () => {
    const app = createApp({ config: testConfig, fetch: oauth.fetch, tradingConfig: null })
    disposals.push(app.dispose)

    const [pluginDiscover, urlDiscover, explicitUrlDiscover] = await Promise.all([
      rawModernRpc(app, 'server/discover', {}, { query: '?tqx_distribution=agent-plugin' }),
      rawModernRpc(app, 'server/discover'),
      rawModernRpc(
        app,
        'server/discover',
        {},
        {
          query: '?tqx_distribution=mcp-url',
          headers: { 'X-TQX-Distribution': 'agent-plugin' },
        },
      ),
    ])

    expect(
      pluginDiscover.body.result.capabilities.extensions?.[SKILLS_EXTENSION_ID],
    ).toBeUndefined()
    expect(urlDiscover.body.result.capabilities.extensions?.[SKILLS_EXTENSION_ID]).toEqual({
      directoryRead: true,
    })
    expect(explicitUrlDiscover.body.result.capabilities.extensions?.[SKILLS_EXTENSION_ID]).toEqual({
      directoryRead: true,
    })
  })

  it('coexists with Qube Research resources and preserves per-resource scope boundaries', async () => {
    const upstreamFetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
      const pathname = new URL(String(url)).pathname
      if (pathname.endsWith('/strategies')) {
        return envelope({
          strategies: [{ ...resource('strategy'), id: ID, title: 'Momentum' }],
          has_more: false,
          next_cursor: null,
        })
      }
      if (pathname.endsWith('/factors')) {
        return envelope({ factors: [], has_more: false, next_cursor: null })
      }
      return envelope({ detail: { code: 'NOT_FOUND' } }, 404, 404)
    })
    const exchange = vi.fn(async ({ scopes }: { scopes: readonly string[] }) => ({
      token: 'exchanged-secret',
      scopes,
      expiresAt: Date.now() + 300_000,
    }))
    const app = createApp({
      config: testConfig,
      fetch: oauth.fetch,
      tradingConfig: null,
      researchConfig,
      research: { fetch: upstreamFetch, exchange },
    })
    disposals.push(app.dispose)

    // A trading-only token can still discover and read public TQX skills, without research:read.
    const skillList = await rawModernRpc(app, 'skills/list', {}, { bearer: token })
    expect(skillList.response.status).toBe(200)
    expect(skillList.body.result.skills).toHaveLength(4)

    const skillRead = await rawModernRpc(
      app,
      'resources/read',
      { uri: 'skill://tqx-setup/SKILL.md' },
      { bearer: token },
    )
    expect(skillRead.response.status).toBe(200)
    expect(skillRead.body.result.contents[0].text).toContain('# TQX MCP Setup')

    // Research resources remain protected by research:read.
    const protectedStrategy = await rawModernRpc(
      app,
      'resources/read',
      { uri: `tqx://qube/strategies/${ID}` },
      { bearer: token },
    )
    expect(protectedStrategy.response.status).toBe(403)
    const protectedReport = await rawModernRpc(
      app,
      'resources/read',
      { uri: REPORT_URI },
      { bearer: token },
    )
    expect(protectedReport.response.status).toBe(403)

    // Qube resources/list keeps returning only user strategies/factors, while templates omit skill:// for plugins.
    const researchResources = await rawModernRpc(
      app,
      'resources/list',
      {},
      { bearer: researchReadToken },
    )
    expect(researchResources.body.result.resources.map((row: { uri: string }) => row.uri)).toEqual([
      `tqx://qube/strategies/${ID}`,
    ])
    const pluginTemplates = await rawModernRpc(
      app,
      'resources/templates/list',
      {},
      { query: '?tqx_distribution=agent-plugin', bearer: researchReadToken },
    )
    expect(
      pluginTemplates.body.result.resourceTemplates.map(
        (item: { uriTemplate: string }) => item.uriTemplate,
      ),
    ).toEqual([
      'tqx://qube/strategies/{strategy}',
      'tqx://qube/strategies/{strategy}/versions/{version}',
      'tqx://qube/factors/{factor}',
    ])
  })

  it('filters local cache artifacts, rejects empty skill roots, and aligns with Docker layout', async () => {
    const filtered = createFilteredSkillFiles(
      memorySkillFiles({
        'demo/SKILL.md': '---\nname: demo\ndescription: Demo skill\n---\n# Demo\n',
        'demo/scripts/run.py': 'print(1)\n',
        'demo/scripts/__pycache__/run.cpython-314.pyc': 'bytecode',
        'demo/.DS_Store': 'junk',
        'demo/Thumbs.db': 'junk',
      }),
    )
    expect(await filtered.list('demo/scripts')).toEqual([{ name: 'run.py', kind: 'file' }])
    await expect(filtered.list('demo/scripts/__pycache__')).rejects.toThrow('No such skill')
    await expect(filtered.read('demo/.DS_Store')).rejects.toThrow('No such skill')

    const tempEmpty = mkdtempSync(join(tmpdir(), 'tqx-empty-skills-'))
    disposals.push(() => rmSync(tempEmpty, { recursive: true, force: true }))
    await expect(loadPluginSkills(tempEmpty)).rejects.toThrow('No packaged skills found')

    const tempInvalid = mkdtempSync(join(tmpdir(), 'tqx-invalid-skills-'))
    disposals.push(() => rmSync(tempInvalid, { recursive: true, force: true }))
    mkdirSync(join(tempInvalid, 'broken'), { recursive: true })
    writeFileSync(join(tempInvalid, 'broken/SKILL.md'), '# Missing frontmatter\n')
    await expect(loadPluginSkills(tempInvalid)).rejects.toThrow()

    const workspaceRoot = resolve(import.meta.dirname, '../../..')
    expect(PLUGIN_SKILLS_DIRECTORY).toBe(resolve(workspaceRoot, 'plugins/agent-plugin/skills'))
    const dockerfile = readFileSync(
      resolve(workspaceRoot, 'packages/mcp-server/docker/Dockerfile'),
      'utf8',
    )
    const dockerignore = readFileSync(
      resolve(workspaceRoot, 'packages/mcp-server/docker/Dockerfile.dockerignore'),
      'utf8',
    )
    expect(dockerfile).toContain(
      'COPY --chown=bun:bun plugins/agent-plugin/skills /app/plugins/agent-plugin/skills',
    )
    expect(dockerignore).toContain('!plugins/agent-plugin/skills/**')
    expect(dockerignore).toContain('**/__pycache__')
  })
})
