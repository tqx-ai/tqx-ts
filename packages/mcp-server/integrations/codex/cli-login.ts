import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { syntheticFixture } from './synthetic-fixture'

const repo = resolve(import.meta.dirname, '../..')
const root = resolve(repo, 'work/codex/runs')
await mkdir(root, { recursive: true })
const home = await mkdtemp(resolve(root, 'cli-'))
const fixture = await syntheticFixture(repo)
await writeFile(
  resolve(home, 'config.toml'),
  `mcp_oauth_credentials_store = "file"\n[mcp_servers.tqx]\nurl = ${JSON.stringify(fixture.resource)}\nscopes = ["trade:read"]\n`,
)
const child = spawn(
  process.env.TQX_CODEX_BIN ?? 'codex',
  [
    'mcp',
    'login',
    'tqx',
    '--scopes',
    'trade:read',
    '--oauth-client-registration',
    'dcr',
    '--no-browser',
  ],
  {
    cwd: home,
    windowsHide: true,
    stdio: 'pipe',
    env: {
      ...process.env,
      CODEX_HOME: home,
      NO_PROXY: '127.0.0.1,localhost,::1',
      no_proxy: '127.0.0.1,localhost,::1',
    },
  },
)
try {
  let output = ''
  const collect = (chunk: Buffer) => {
    output += chunk.toString()
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve))
  let authorizationUrl: URL | undefined
  for (let i = 0; i < 100; i++) {
    const raw = output.match(/http:\/\/127\.0\.0\.1:\d+\/oauth\/authorize\?[^\s]+/)?.[0]
    if (raw) {
      authorizationUrl = new URL(raw)
      break
    }
    assert(child.exitCode === null, 'CLI exited before authorization')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert(authorizationUrl, 'CLI authorization URL unavailable')
  const callback = new URL(authorizationUrl.searchParams.get('redirect_uri') ?? '')
  const response = await fetch(authorizationUrl, { redirect: 'manual' })
  assert.equal(response.status, 302)
  const location = response.headers.get('location')
  assert(location)
  child.stdin.write(`${location}\n`)
  const exit = await Promise.race([
    exited,
    new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 5000)),
  ])
  assert.equal(exit, 0)
  assert.equal(fixture.state.tokenRequests, 1)
  const result = {
    case: 'installed-codex-cli-login-no-browser',
    pass: true,
    identity: 'synthetic',
    redirectHost: callback.hostname,
    redirectPath: callback.pathname,
    explicitTradeRead: true,
    tokenRequests: 1,
    desktopUI: 'untested',
  }
  await writeFile(resolve(home, 'evidence.json'), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result))
} finally {
  child.kill()
  await fixture.close()
}
