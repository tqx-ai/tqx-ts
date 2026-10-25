import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
const base = import.meta.dirname
const native = process.argv[2]
assert(native)
const root = await mkdtemp(resolve(base, 'work/distribution-native-'))
const home = resolve(root, 'private isolated HOME')
await mkdir(home)
const config =
  'mcp_oauth_credentials_store = "file"\n[mcp_servers.unrelated_distribution_fixture]\nenabled = false\nurl = "http://127.0.0.1:1/mcp"\n'
await writeFile(resolve(home, 'config.toml'), config)
const env = {}
for (const name of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC'])
  if (process.env[name]) env[name] = process.env[name]
Object.assign(env, {
  CODEX_HOME: home,
  HOME: home,
  USERPROFILE: home,
  APPDATA: home,
  LOCALAPPDATA: home,
  TMP: home,
  TEMP: home,
  NO_PROXY: '127.0.0.1,localhost',
  no_proxy: '127.0.0.1,localhost',
})
async function run(command, args, json = true) {
  const child = spawn(command, args, {
    env,
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let out = '',
    error = ''
  child.stdout.on('data', (value) => {
    out += value
  })
  child.stderr.on('data', (value) => {
    error += value
  })
  const code = await new Promise((ok, fail) => {
    child.once('exit', ok)
    child.once('error', fail)
  })
  assert.equal(code, 0, 'Isolated native CLI command failed')
  return json ? JSON.parse(out) : out.trim()
}
const requests = []
const server = createServer((req, res) => {
  assert(!req.headers.authorization, 'No fixture login or bearer is expected')
  requests.push({ method: req.method, path: req.url })
  res
    .writeHead(404, { 'content-type': 'application/json' })
    .end('{"fixture":"PUBLIC_DISTRIBUTION_NO_AUTH"}')
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const origin = `http://127.0.0.1:${server.address().port}`
const suffix = randomBytes(6).toString('hex')
const names = {
  server: `dist-${suffix}`,
  plugin: `dist-${suffix}-plugin`,
  marketplace: `dist-${suffix}-market`,
}
const source = resolve(root, 'source & spaced directory')
const selector = resolve(root, 'selector standalone.mjs')
const md = await readFile(resolve(base, 'INSTALL_LOCAL_PLUGIN_WITH_CODEX.md'), 'utf8')
const blocks = [...md.matchAll(/```javascript\r?\n([\s\S]*?)```/g)]
await writeFile(selector, blocks[1][1])
const report = {
  date: '2026-10-25',
  layer: 'actual installed native CLI; isolated home; local manifest install only',
  personalProfileTouched: false,
  oauthLoginStarted: false,
  actualAccountOrBrokerProof: false,
  steps: [],
}
try {
  report.clientVersion = await run(native, ['--version'], false)
  const args = [
    selector,
    '--mcp-url',
    `${origin}/mcp`,
    '--issuer',
    origin,
    '--web-origin',
    origin,
    '--server',
    names.server,
    '--plugin',
    names.plugin,
    '--marketplace',
    names.marketplace,
    '--output-dir',
    source,
  ]
  const generated = await run(process.execPath, args)
  await run(native, ['plugin', 'marketplace', 'add', generated.source, '--json'])
  await run(native, ['plugin', 'add', `${names.plugin}@${names.marketplace}`, '--json'])
  const installed = await run(native, ['plugin', 'list', '--json'])
  const entry = installed.installed.find(
    (item) => item.pluginId === `${names.plugin}@${names.marketplace}`,
  )
  assert(entry?.enabled && entry.version === '0.3.0')
  const mcp = await run(native, ['mcp', 'get', names.server, '--json'])
  assert.equal(mcp.transport.url, `${origin}/mcp`)
  report.steps.push({ case: 'cold native marketplace/plugin install and MCP load', passed: true })
  await run(native, ['plugin', 'add', `${names.plugin}@${names.marketplace}`, '--json'])
  const repeated = await run(process.execPath, [
    selector,
    '--config',
    resolve(source, 'deployment-binding.json'),
    '--output-dir',
    source,
  ])
  assert.equal(repeated.source, source)
  report.steps.push({
    case: 'same source repeated CLI install and selector idempotence',
    passed: true,
  })
  const upgrade = await run(process.execPath, [...args, '--version', '0.3.1'])
  await run(native, ['plugin', 'marketplace', 'remove', names.marketplace, '--json'])
  await run(native, ['plugin', 'marketplace', 'add', upgrade.source, '--json'])
  await run(native, ['plugin', 'add', `${names.plugin}@${names.marketplace}`, '--json'])
  const after = await run(native, ['plugin', 'list', '--json'])
  assert.equal(
    after.installed.find((item) => item.pluginId === `${names.plugin}@${names.marketplace}`)
      .version,
    '0.3.1',
  )
  const oldSource = JSON.parse(
    await readFile(resolve(source, `plugins/${names.plugin}/plugin.json`), 'utf8'),
  )
  assert.equal(oldSource.version, '0.3.0')
  const configAfter = await readFile(resolve(home, 'config.toml'), 'utf8')
  assert(
    configAfter.includes('[mcp_servers.unrelated_distribution_fixture]') &&
      configAfter.includes('http://127.0.0.1:1/mcp'),
  )
  report.steps.push({
    case: 'same-ID source upgrade using supported isolated marketplace refresh; old source/unrelated config retained',
    passed: true,
  })
  await run(native, ['plugin', 'remove', `${names.plugin}@${names.marketplace}`, '--json'])
  await run(native, ['plugin', 'marketplace', 'remove', names.marketplace, '--json'])
  report.steps.push({
    case: 'only dedicated fixture registration removed via public CLI',
    passed: true,
  })
  report.requests = requests
  report.passed = true
} catch {
  report.passed = false
  report.failure =
    'Native isolated packaging assertion failed; no real login or personal profile used'
  process.exitCode = 1
} finally {
  server.closeAllConnections()
  await new Promise((ok) => server.close(ok))
  await writeFile(resolve(root, 'evidence.json'), JSON.stringify(report, null, 2))
  console.log(
    JSON.stringify({
      privateEvidence: resolve(root, 'evidence.json'),
      passed: report.passed,
      steps: report.steps,
      personalProfileTouched: false,
      oauthLoginStarted: false,
    }),
  )
}
