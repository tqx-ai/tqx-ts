import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { expect, it } from 'vitest'

it('synchronizes bundle headers and marketplace MCP configuration on version bumps', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tqx-plugin-version-'))
  const root = resolve(import.meta.dirname, '../..')
  try {
    mkdirSync(join(temporaryDirectory, 'scripts'))
    cpSync(
      resolve(root, 'scripts/sync-plugin-version.ts'),
      join(temporaryDirectory, 'scripts/sync-plugin-version.ts'),
    )
    cpSync(
      resolve(root, 'plugins/agent-plugin'),
      join(temporaryDirectory, 'plugins/agent-plugin'),
      { recursive: true },
    )
    cpSync(resolve(root, '.claude-plugin'), join(temporaryDirectory, '.claude-plugin'), {
      recursive: true,
    })
    writeFileSync(
      join(temporaryDirectory, 'package.json'),
      JSON.stringify({ version: '1.2.3-beta.1' }),
    )

    execFileSync('bun', ['scripts/sync-plugin-version.ts'], {
      cwd: temporaryDirectory,
      stdio: 'pipe',
    })

    const read = (path: string) => JSON.parse(readFileSync(join(temporaryDirectory, path), 'utf8'))
    const manifest = read('plugins/agent-plugin/plugin.json')
    const server = read('plugins/agent-plugin/mcp.json').mcpServers.tqx
    const marketplace = read('.claude-plugin/marketplace.json').plugins[0]
    expect(manifest.version).toBe('1.2.3-beta.1')
    expect(server).toMatchObject({
      type: 'streamable-http',
      url: 'https://www.tqx.ai/mcp?tqx_distribution=agent-plugin',
      headers: {
        'X-TQX-Distribution': 'agent-plugin',
        'X-TQX-Skill-Bundle-Version': '1.2.3-beta.1',
      },
    })
    expect(marketplace.version).toBe(manifest.version)
    expect(marketplace.mcpServers.tqx).toEqual({ ...server, type: 'http' })
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
})
