import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CodexClient, type RecordValue } from './client'
import { syntheticFixture } from './synthetic-fixture'
import { assertLiveIntegrationAllowed } from './local-policy'

assertLiveIntegrationAllowed()

const repo = resolve(import.meta.dirname, '../..')
const runs = resolve(repo, 'work/codex/runs')
await mkdir(runs, { recursive: true })
const run = await mkdtemp(resolve(runs, 'plugin-'))
const home = resolve(run, 'home')
const source = resolve(run, 'marketplace')
await mkdir(home)
await cp(resolve(import.meta.dirname, 'distribution'), source, {
  recursive: true,
})
await writeFile(resolve(home, 'config.toml'), 'mcp_oauth_credentials_store = "file"\n')
const fixture = await syntheticFixture(repo)
const mcpPath = resolve(source, 'plugins/tqx-readonly/mcp.json')
const config = JSON.parse(await readFile(mcpPath, 'utf8'))
config.mcpServers.tqx.url = fixture.resource
await writeFile(mcpPath, JSON.stringify(config))
async function command(args: string[]) {
  const child = spawn(process.env.TQX_CODEX_BIN ?? 'codex', args, {
    cwd: home,
    env: { ...process.env, CODEX_HOME: home },
    windowsHide: true,
    stdio: 'pipe',
  })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  child.stderr.resume()
  const code = await new Promise<number | null>((resolve) => child.once('exit', resolve))
  assert.equal(code, 0, 'Isolated plugin command failed')
  return JSON.parse(output) as RecordValue
}
try {
  await command(['plugin', 'marketplace', 'add', source, '--json'])
  await command(['plugin', 'add', 'tqx-readonly@tqx-local-acceptance', '--json'])
  const listing = await command(['plugin', 'list', '--json'])
  assert(
    (listing.installed as RecordValue[]).some(
      (p) => p.name === 'tqx-readonly' && p.enabled === true,
    ),
  )
  const client = new CodexClient(home, home)
  try {
    await client.initialize()
    const initialThread = await client.request('thread/start', {
      cwd: home,
      ephemeral: true,
      approvalPolicy: 'never',
    })
    const initialThreadId = (initialThread.thread as RecordValue).id
    const before = await client.request('mcpServerStatus/list', {
      detail: 'toolsAndAuthOnly',
      threadId: initialThreadId,
    })
    const servers = before.data as RecordValue[]
    const server = servers.find((s) => s.pluginId === 'tqx-readonly@tqx-local-acceptance')
    assert(server, `Installed portable MCP not discovered; server count: ${servers.length}`)
    const login = await client.request('mcpServer/oauth/login', {
      name: server.name,
      ...(process.argv.includes('--probe-default-scopes') ? {} : { scopes: ['trade:read'] }),
      timeoutSecs: 12,
    })
    if (process.argv.includes('--probe-default-scopes')) {
      const url = new URL(String(login.authorizationUrl))
      const scopes = url.searchParams.get('scope')
      const evidence = {
        case: 'unscoped-plugin-login',
        requestedScopes: scopes,
        expectedScopes: 'trade:read',
        pass: scopes === 'trade:read',
        surface: 'isolated installed Codex app-server',
        identity: 'synthetic',
      }
      await writeFile(resolve(run, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
      console.log(JSON.stringify(evidence))
      if (!evidence.pass) process.exitCode = 1
    } else {
      const authorization = await fetch(String(login.authorizationUrl), {
        redirect: 'manual',
      })
      assert.equal(authorization.status, 302)
      const callback = authorization.headers.get('location')
      assert(callback)
      await fetch(callback).then((r) => r.body?.cancel())
      assert.equal((await client.loginCompletion(login.loginId)).success, true)
      const thread = await client.request('thread/start', {
        cwd: home,
        ephemeral: true,
        approvalPolicy: 'never',
      })
      const threadId = (thread.thread as RecordValue).id
      const inventory = await client.request('mcpServerStatus/list', {
        serverName: server.name,
        threadId,
        detail: 'toolsAndAuthOnly',
      })
      const active = (inventory.data as RecordValue[])[0]
      assert(active)
      assert.deepEqual(Object.keys(active.tools as RecordValue).sort(), [
        'getAccount',
        'listPositions',
      ])
      for (const tool of ['getAccount', 'listPositions']) {
        const result = await client.request('mcpServer/tool/call', {
          threadId,
          server: server.name,
          tool,
          arguments: {},
        })
        assert(!result.isError)
      }
      const evidence = {
        case: 'portable-plugin-install-discovery-oauth-tools',
        pass: true,
        pluginId: server.pluginId,
        serverName: server.name,
        identity: 'synthetic',
        surface: 'isolated installed Codex CLI and app-server; desktop UI untested',
      }
      await writeFile(resolve(run, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
      console.log(JSON.stringify(evidence))
    }
  } finally {
    await client.close()
  }
} finally {
  await fixture.close()
}
