import assert from 'node:assert/strict'
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, expect, test } from 'vitest'

const base = fileURLToPath(new URL('./', import.meta.url))
let root: string, kit: string, mockBinary: string
const evidence: { case: string; passed: boolean; layer: string }[] = []
const children = new Set<ChildProcessWithoutNullStreams>()
function isolatedEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC'])
    if (process.env[key]) env[key] = process.env[key]
  return {
    ...env,
    CODEX_HOME: home,
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    TMP: home,
    TEMP: home,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
  }
}
async function freshHome(name: string) {
  const home = resolve(root, name)
  await mkdir(home, { recursive: true })
  return home
}
function nodePlan(args: string[], cwd = root, home = root) {
  return JSON.parse(
    execFileSync(process.execPath, [resolve(kit, 'tqx-environment-source.mjs'), ...args], {
      cwd,
      env: isolatedEnv(home),
      encoding: 'utf8',
    }),
  )
}
beforeAll(async () => {
  root = await mkdtemp(resolve(base, 'work/distribution-cold-'))
  kit = resolve(root, 'unrelated machine & spaces \u6d4b\u8bd5')
  await mkdir(kit)
  const md = await readFile(resolve(base, 'INSTALL_LOCAL_PLUGIN_WITH_CODEX.md'), 'utf8')
  const blocks = [...md.matchAll(/```javascript\r?\n([\s\S]*?)```/g)]
  expect(blocks).toHaveLength(2)
  for (const [index, name] of ['tqx-callback-login.mjs', 'tqx-environment-source.mjs'].entries()) {
    const path = resolve(kit, name)
    await writeFile(path, blocks[index]![1]!)
    execFileSync(process.execPath, ['--check', path], { cwd: kit, env: isolatedEnv(root) })
  }
  mockBinary = resolve(root, `mock codex & local${process.platform === 'win32' ? '.exe' : ''}`)
  execFileSync(
    'bun',
    [
      '--no-env-file',
      'build',
      resolve(base, 'distribution-mock-codex.ts'),
      '--compile',
      '--outfile',
      mockBinary,
    ],
    { cwd: kit, env: isolatedEnv(root), stdio: 'pipe' },
  )
})
afterAll(async () => {
  for (const child of children) {
    child.stdin.end()
    if (child.exitCode === null) child.kill()
  }
  await writeFile(
    resolve(root, 'selfcheck.json'),
    JSON.stringify(
      {
        date: '2026-10-25',
        platform: process.platform,
        nodeVersion: process.version,
        source:
          'only code extracted from delivered single MD; no repository/module imports at runtime',
        evidence,
        personalProfileAccessed: false,
        actualHumanConsent: false,
        actualNativeCliPkceTestedHere: false,
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      distributionEvidence: resolve(root, 'selfcheck.json'),
      cases: evidence.length,
    }),
  )
})
test('copied code runs cold outside the repository without node_modules; three labels show effective values', async () => {
  for (const environment of ['local', 'test', 'prod']) {
    const plan = nodePlan(['--environment', environment, '--plan'], kit)
    expect(plan.binding.environment).toBe(environment)
    expect(plan.binding.valueSources.resource).toBe('local-default')
    expect(plan.installed).toBe(false)
  }
  const output = nodePlan(['--output-dir', './relative source'], kit)
  expect(output.source).toBe(resolve(kit, 'relative source'))
  expect(output.loginStarted).toBe(false)
  evidence.push({
    case: 'MD-only cold Node runtime and relative/spaced/non-ASCII paths',
    passed: true,
    layer: 'isolated Node standalone',
  })
})
test('existing public config/aliases/version survive repeat and upgrade; unrelated files stay unchanged', async () => {
  const home = await freshHome('existing-public-home')
  const config = resolve(home, 'public connection.json')
  const existing = {
    environment: 'dev-pro',
    resource: 'https://mcp.example.test/mcp',
    issuer: 'https://as.example.test',
    webOrigin: 'https://web.example.test',
    server: 'legacy_tqx',
    plugin: 'legacy-tqx',
    marketplace: 'legacy-market',
    version: '0.2.0',
  }
  await writeFile(config, JSON.stringify(existing))
  const first = nodePlan(['--config', config, '--output-dir', resolve(home, 'source')])
  const source = first.source
  const sentinel = resolve(source, 'unrelated.txt')
  await writeFile(sentinel, 'preserve me')
  const repeated = nodePlan([
    '--config',
    resolve(source, 'deployment-binding.json'),
    '--output-dir',
    source,
  ])
  expect(repeated.source).toBe(source)
  expect(repeated.binding).toMatchObject(existing)
  const oldPlugin = resolve(source, 'plugins/legacy-tqx/plugin.json')
  const before = await readFile(oldPlugin, 'utf8')
  const upgraded = nodePlan(['--config', config, '--version', '0.3.1', '--output-dir', source])
  expect(upgraded.source).not.toBe(source)
  expect(upgraded.binding.server).toBe(existing.server)
  expect(await readFile(oldPlugin, 'utf8')).toBe(before)
  expect(await readFile(sentinel, 'utf8')).toBe('preserve me')
  expect(await readFile(config, 'utf8')).toBe(JSON.stringify(existing))
  evidence.push({
    case: 'existing config, idempotent repeat, provenance change and source-only upgrade preservation',
    passed: true,
    layer: 'isolated Node standalone',
  })
})
test('malformed public config fails without touching existing files and a corrected retry succeeds', async () => {
  const home = await freshHome('failure-recovery')
  const config = resolve(home, 'broken.json')
  await writeFile(config, '{broken public json')
  let errorText = ''
  try {
    nodePlan(['--config', config, '--output-dir', resolve(home, 'source')])
  } catch (error) {
    errorText = String((error as { stderr?: unknown }).stderr)
  }
  expect(errorText).toContain('Existing connections were not changed')
  expect(errorText).not.toContain('{broken')
  expect(await readFile(config, 'utf8')).toBe('{broken public json')
  await writeFile(config, JSON.stringify({ server: 'existing_alias', version: '0.2.0' }))
  expect(
    nodePlan(['--config', config, '--output-dir', resolve(home, 'source')]).binding.server,
  ).toBe('existing_alias')
  evidence.push({
    case: 'source failure and recovery without profile reset',
    passed: true,
    layer: 'isolated Node standalone',
  })
})

async function mockLogin(mode: string, seconds = 10) {
  const transactions = new Map<string, URL>()
  let origin = ''
  let begins = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', origin)
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          issuer: origin,
          authorization_endpoint: `${origin}/oauth/authorize`,
          authorization_response_iss_parameter_supported: true,
        }),
      )
    } else if (url.pathname === '/oauth/authorize') {
      begins++
      const tx = randomUUID()
      transactions.set(tx, url)
      res.writeHead(302, { Location: `${origin}/oauth/consent?tx=${tx}` }).end()
    } else res.writeHead(404).end()
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const address = server.address()
  assert(address && typeof address !== 'string')
  origin = `http://127.0.0.1:${address.port}`
  const home = await freshHome(`mock-home-${randomUUID()}`)
  const sentinel = resolve(home, 'unrelated-user-config.txt')
  await writeFile(sentinel, 'public synthetic existing setting')
  const events: Record<string, unknown>[] = []
  let buffer = ''
  let errorText = ''
  const child = spawn(
    process.execPath,
    [
      resolve(kit, 'tqx-callback-login.mjs'),
      '--server',
      'public_synthetic_fixture',
      '--mcp-url',
      `${origin}/mcp`,
      '--issuer',
      origin,
      '--web-origin',
      origin,
      '--timeout-seconds',
      String(seconds),
      '--codex-bin',
      mockBinary,
    ],
    {
      cwd: kit,
      env: {
        ...isolatedEnv(home),
        TQX_DISTRIBUTION_MOCK: mode,
        TQX_DISTRIBUTION_ISSUER: origin,
        TQX_DISTRIBUTION_RESOURCE: `${origin}/mcp`,
      },
      stdio: 'pipe',
      windowsHide: true,
    },
  )
  children.add(child)
  child.stdout.on('data', (part: Buffer) => {
    buffer += part.toString()
    let index: number
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (line.trim()) events.push(JSON.parse(line))
    }
  })
  child.stderr.on('data', (part: Buffer) => {
    errorText += part.toString()
  })
  const done = new Promise<number | null>((ok, fail) => {
    child.once('exit', ok)
    child.once('error', fail)
  })
  const wait = async (event: string) => {
    const deadline = Date.now() + 6000
    while (Date.now() < deadline) {
      const result = events.find((item) => item.event === event)
      if (result) return result
      if (child.exitCode !== null) break
      await delay(15)
    }
    throw new Error(`Synthetic helper missing ${event}`)
  }
  return {
    child,
    events,
    done,
    wait,
    get errorText() {
      return errorText
    },
    get begins() {
      return begins
    },
    async callback(consent: string, denied = false) {
      const tx = new URL(consent).searchParams.get('tx')!
      const authorize = transactions.get(tx)!
      const url = new URL(authorize.searchParams.get('redirect_uri')!)
      url.searchParams.set('state', authorize.searchParams.get('state')!)
      url.searchParams.set('iss', origin)
      url.searchParams.set(
        denied ? 'error' : 'code',
        denied ? 'access_denied' : 'PUBLIC-SYNTHETIC-CODE',
      )
      return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000) })
    },
    async close() {
      if (child.exitCode === null) {
        child.stdin.end()
        child.kill()
        await done
      }
      children.delete(child)
      server.closeAllConnections()
      await new Promise<void>((ok) => server.close(() => ok()))
      expect(await readFile(sentinel, 'utf8')).toBe('public synthetic existing setting')
    },
  }
}
test('mock CLI waiting is explicit, no success before consent; one bound transaction then CLI0', async () => {
  const login = await mockLogin('success')
  try {
    const ready = await login.wait('awaiting_user_consent')
    await delay(180)
    expect(login.child.exitCode).toBeNull()
    expect(login.events.some((item) => item.event === 'login_finished')).toBe(false)
    expect(login.begins).toBe(1)
    const callback = await login.callback(String(ready.consentUrl))
    expect(callback.status).toBe(303)
    expect(callback.headers.get('location')).toBe(ready.consentUrl)
    await callback.body?.cancel()
    expect(await login.done).toBe(0)
    expect(login.events.find((item) => item.event === 'login_finished')).toMatchObject({
      status: 'succeeded',
      cliExitCode: 0,
      pluginReadVerified: false,
    })
    evidence.push({
      case: 'explicit permission wait then single callback and mock CLI0',
      passed: true,
      layer: 'mock Codex + owned synthetic AS; not real OAuth',
    })
  } finally {
    await login.close()
  }
})
for (const mode of ['deny', 'fail'])
  test(`mock ${mode} never redirects success and a fresh retry is possible`, async () => {
    const login = await mockLogin(mode)
    try {
      const ready = await login.wait('awaiting_user_consent')
      const response = await login.callback(String(ready.consentUrl), mode === 'deny')
      expect(response.status).toBe(mode === 'deny' ? 400 : 502)
      expect(response.headers.get('location')).toBeNull()
      await response.body?.cancel()
      expect(await login.done).toBe(1)
      expect(login.events.find((item) => item.event === 'login_finished')).toMatchObject({
        status: mode === 'deny' ? 'denied' : 'failed',
        cliExitCode: 1,
        pluginReadVerified: false,
      })
      evidence.push({
        case: `mock ${mode} recovery boundary`,
        passed: true,
        layer: 'mock Codex + owned synthetic AS; no real grant',
      })
    } finally {
      await login.close()
    }
  })
test('unsupported mock CLI fails cleanly without starting a consent transaction', async () => {
  const login = await mockLogin('unsupported')
  try {
    expect(await login.done).toBe(1)
    expect(login.begins).toBe(0)
    expect(login.errorText).toContain('No automatic retry was started')
    expect(login.events).toEqual([])
    evidence.push({
      case: 'unsupported CLI no silent fallback or duplicate consent',
      passed: true,
      layer: 'mock CLI startup failure',
    })
  } finally {
    await login.close()
  }
})
test('unanswered permission wait times out and ends only owned processes', async () => {
  const login = await mockLogin('success', 10)
  try {
    await login.wait('awaiting_user_consent')
    expect(await login.done).toBe(1)
    expect(login.events.find((item) => item.event === 'login_finished')).toMatchObject({
      status: 'timed_out',
      cliExitCode: null,
      pluginReadVerified: false,
    })
    evidence.push({
      case: 'bounded unanswered permission timeout',
      passed: true,
      layer: 'mock CLI + owned helper lifetime',
    })
  } finally {
    await login.close()
  }
})
test('artifact input hashes identify extracted code without including fixture binaries', async () => {
  const names = ['tqx-callback-login.mjs', 'tqx-environment-source.mjs']
  for (const name of names) {
    const text = await readFile(resolve(kit, name), 'utf8')
    const imports = [...text.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]!)
    expect(imports.every((item) => item.startsWith('node:'))).toBe(true)
    expect(text).not.toMatch(/C:[/\\]Users[/\\]13518/)
    expect(createHash('sha256').update(text.trimEnd()).digest('hex')).toHaveLength(64)
  }
  evidence.push({
    case: 'Node-builtins only and no author absolute paths in runtime code',
    passed: true,
    layer: 'artifact inspection',
  })
})
