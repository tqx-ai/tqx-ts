import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { unzipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildClaudePlugin, checkClaudePlugin } from '../lib/claude-plugin'

const root = resolve(import.meta.dirname, '../..')
let temporaryDirectory: string
let options: { sourceDirectory: string; outputDirectory: string; licenseFile: string }

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'tqx-claude-plugin-'))
  options = {
    sourceDirectory: join(temporaryDirectory, 'source'),
    outputDirectory: join(temporaryDirectory, 'native'),
    licenseFile: resolve(root, 'LICENSE'),
  }
  cpSync(resolve(root, 'plugins/agent-plugin'), options.sourceDirectory, { recursive: true })
})

afterEach(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

describe('Claude plugin distribution', () => {
  it('provides a repository marketplace with portable skills and native HTTP MCP configuration', () => {
    const marketplace = JSON.parse(
      readFileSync(resolve(root, '.claude-plugin/marketplace.json'), 'utf8'),
    )
    const canonical = JSON.parse(readFileSync(source('plugin.json'), 'utf8'))
    const mcp = JSON.parse(readFileSync(source('mcp.json'), 'utf8'))
    const workspace = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    expect(marketplace.name).toBe('tqx-plugins')
    expect(marketplace.owner).toEqual(canonical.author)
    expect(marketplace.plugins).toHaveLength(1)
    const [entry] = marketplace.plugins
    expect(entry).toMatchObject({
      name: canonical.name,
      displayName: canonical.extensions['com.openai'].interface.displayName,
      source: './plugins/agent-plugin',
      version: workspace.version,
      description: canonical.description,
      author: canonical.author,
      homepage: canonical.homepage,
      repository: canonical.repository,
      license: canonical.license,
      strict: false,
    })
    expect(entry.version).toBe(canonical.version)
    expect(mcp.mcpServers.tqx.headers['X-TQX-Skill-Bundle-Version']).toBe(workspace.version)
    expect(entry.mcpServers).toEqual(
      Object.fromEntries(
        Object.entries(mcp.mcpServers).map(([name, server]) => [
          name,
          { ...(server as Record<string, unknown>), type: 'http' },
        ]),
      ),
    )
    const pluginRoot = resolve(root, entry.source)
    for (const skill of ['tqx-setup', 'tqx-trading', 'tqx-data', 'tqx-research']) {
      expect(existsSync(resolve(pluginRoot, 'skills', skill, 'SKILL.md'))).toBe(true)
    }
    expect(existsSync(resolve(pluginRoot, '.claude-plugin/plugin.json'))).toBe(false)
    expect(existsSync(resolve(pluginRoot, '.mcp.json'))).toBe(false)
  })

  it('packages native metadata, MCP, and identical skill resources without altering the source', () => {
    const sourceManifest = readFileSync(source('plugin.json'))
    const sourceMcp = readFileSync(source('mcp.json'))
    const archivePath = buildClaudePlugin(options)
    const archive = unzipSync(readFileSync(archivePath))
    const manifest = JSON.parse(readFileSync(output('.claude-plugin/plugin.json'), 'utf8'))
    const canonical = JSON.parse(sourceManifest.toString())
    expect(manifest).toMatchObject({
      name: canonical.name,
      version: canonical.version,
      author: canonical.author,
      license: canonical.license,
      displayName: canonical.extensions['com.openai'].interface.displayName,
      icon: './assets/logo.png',
      supportUrl: canonical.extensions['com.openai'].interface.supportURL,
      privacyPolicyUrl: canonical.extensions['com.openai'].interface.privacyPolicyURL,
      termsOfServiceUrl: canonical.extensions['com.openai'].interface.termsOfServiceURL,
    })
    expect(manifest).not.toHaveProperty('$schema')
    expect(manifest).not.toHaveProperty('extensions')
    expect(JSON.parse(readFileSync(output('.mcp.json'), 'utf8'))).toEqual({
      mcpServers: {
        tqx: {
          type: 'http',
          url: 'https://tqxtest.uatpandaai.com/mcp?tqx_distribution=agent-plugin',
          headers: {
            'X-TQX-Distribution': 'agent-plugin',
            'X-TQX-Skill-Bundle-Version': canonical.version,
          },
        },
      },
    })
    for (const path of [
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'README.md',
      'LICENSE',
      'skills/tqx-setup/SKILL.md',
      'skills/tqx-trading/SKILL.md',
      'skills/tqx-data/SKILL.md',
      'skills/tqx-research/SKILL.md',
      'skills/tqx-research/agents/openai.yaml',
      'skills/tqx-research/assets/tqx-research-1118.png',
      'skills/tqx-research/references/mcp.md',
      'skills/tqx-research/references/workflow.md',
      'skills/tqx-research/references/data/index.md',
      'skills/tqx-research/references/strategy-examples.md',
      'skills/tqx-data/scripts/tqx_data_auth.py',
      'skills/tqx-data/references/api-reference.md',
      'skills/tqx-data/assets/tqx-data-1118.png',
    ]) {
      expect(Buffer.from(archive[path]!)).toEqual(readFileSync(output(path)))
      if (path.startsWith('skills/') || path === 'README.md') {
        expect(readFileSync(output(path))).toEqual(readFileSync(source(path)))
      }
    }
    expect(readFileSync(output('LICENSE'))).toEqual(readFileSync(options.licenseFile))
    expect(readFileSync(output('assets/logo.png'))).toEqual(
      readFileSync(source('com.openai/assets/logo.png')),
    )
    expect(archive).not.toHaveProperty('plugin.json')
    expect(archive).not.toHaveProperty('mcp.json')
    expect(archive).not.toHaveProperty('AGENTS.md')
    expect(readFileSync(source('plugin.json'))).toEqual(sourceManifest)
    expect(readFileSync(source('mcp.json'))).toEqual(sourceMcp)
    expect(() => checkClaudePlugin(options)).not.toThrow()
  })

  it('propagates source updates and detects stale metadata, resources, and archives', () => {
    buildClaudePlugin(options)
    const manifest = JSON.parse(readFileSync(source('plugin.json'), 'utf8'))
    manifest.version = '9.8.7'
    manifest.extensions['com.openai'].interface.displayName = 'TQX Updated'
    manifest.extensions['com.openai'].interface.supportURL = 'https://support.example.test'
    writeFileSync(source('plugin.json'), JSON.stringify(manifest))
    writeFileSync(source('skills/tqx-data/references/new.md'), 'A new canonical resource.\n')
    expect(() => checkClaudePlugin(options)).toThrow('directory is stale')
    const previousArchive = readFileSync(`${options.outputDirectory}.zip`)
    buildClaudePlugin(options)
    expect(JSON.parse(readFileSync(output('.claude-plugin/plugin.json'), 'utf8'))).toMatchObject({
      version: '9.8.7',
      displayName: 'TQX Updated',
      supportUrl: 'https://support.example.test',
    })
    expect(readFileSync(output('skills/tqx-data/references/new.md'), 'utf8')).toBe(
      'A new canonical resource.\n',
    )
    writeFileSync(`${options.outputDirectory}.zip`, previousArchive)
    expect(() => checkClaudePlugin(options)).toThrow('ZIP is stale')
  })

  it('builds reproducibly and removes files left by an earlier build', () => {
    buildClaudePlugin(options)
    const first = readFileSync(`${options.outputDirectory}.zip`)
    writeFileSync(output('obsolete.md'), 'old')
    expect(() => checkClaudePlugin(options)).toThrow('directory is stale')
    buildClaudePlugin(options)
    expect(existsSync(output('obsolete.md'))).toBe(false)
    expect(readFileSync(`${options.outputDirectory}.zip`)).toEqual(first)
    writeFileSync(output('skills/tqx-trading/SKILL.md'), 'modified after generation')
    expect(() => checkClaudePlugin(options)).toThrow('directory is stale')
  })

  it('discovers only immediate skill directories and excludes local caches and hidden files', () => {
    mkdirSync(source('skills/undiscovered/nested'), { recursive: true })
    writeFileSync(source('skills/undiscovered/nested/SKILL.md'), 'not a top-level skill')
    mkdirSync(source('skills/tqx-data/__pycache__'))
    writeFileSync(source('skills/tqx-data/__pycache__/helper.pyc'), 'cache')
    writeFileSync(source('skills/tqx-data/.env'), 'LOCAL_ONLY=value')
    writeFileSync(source('skills/tqx-data/.DS_Store'), 'system file')
    buildClaudePlugin(options)
    const archive = unzipSync(readFileSync(`${options.outputDirectory}.zip`))
    expect(
      Object.keys(archive).some((path) => /undiscovered|__pycache__|\.env|\.DS_Store/.test(path)),
    ).toBe(false)
  })

  it('rejects unsupported transports before replacing an existing distribution', () => {
    buildClaudePlugin(options)
    const previous = readFileSync(`${options.outputDirectory}.zip`)
    const mcp = JSON.parse(readFileSync(source('mcp.json'), 'utf8'))
    mcp.mcpServers.tqx = { type: 'stdio', command: 'node', args: ['server.js'] }
    writeFileSync(source('mcp.json'), JSON.stringify(mcp))
    expect(() => buildClaudePlugin(options)).toThrow('only adapts streamable-http')
    expect(readFileSync(`${options.outputDirectory}.zip`)).toEqual(previous)
  })

  it('rejects output that overlaps the portable source', () => {
    for (const outputDirectory of [
      options.sourceDirectory,
      source('generated'),
      temporaryDirectory,
    ]) {
      expect(() => buildClaudePlugin({ ...options, outputDirectory })).toThrow('must be separate')
    }
    expect(existsSync(source('plugin.json'))).toBe(true)
  })

  it('rejects symbolic links in skill resources', () => {
    symlinkSync(temporaryDirectory, source('skills/tqx-data/external'), 'junction')
    expect(() => buildClaudePlugin(options)).toThrow('non-regular file')
  })

  it('rejects an icon path outside the portable package', () => {
    const manifest = JSON.parse(readFileSync(source('plugin.json'), 'utf8'))
    manifest.extensions['com.openai'].interface.logo = '../outside.png'
    writeFileSync(source('plugin.json'), JSON.stringify(manifest))
    expect(() => buildClaudePlugin(options)).toThrow('must stay inside')
  })
})

function source(path: string): string {
  return resolve(options.sourceDirectory, path)
}

function output(path: string): string {
  return resolve(options.outputDirectory, path)
}
