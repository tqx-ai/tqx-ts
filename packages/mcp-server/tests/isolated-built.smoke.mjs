import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rmdir, writeFile, unlink } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Explicit test opt-in for this entry; never load a checkout's .env.local or inherited runtime env.
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({
  options: { bundle: { type: 'string' }, environment: { type: 'string' } },
})
const bundle = values.bundle ? resolvePath(values.bundle) : join(packageRoot, 'dist/index.mjs')
const environment = values.environment
assert(!environment || ['local', 'test', 'prod'].includes(environment))
const workRoot = join(packageRoot, 'work')
await mkdir(workRoot, { recursive: true })
const cwd = await mkdtemp(join(workRoot, 'built-http-test-'))
assert.equal(dirname(cwd), workRoot)
let child
let exited
const timer = new AbortController()
const createdFiles = []
try {
  if (environment) {
    const baseFile = join(cwd, '.env.local')
    await writeFile(
      baseFile,
      `MCP_OAUTH_ISSUER=http://127.0.0.1:${environment === 'local' ? 1 : 2}\n`,
      { flag: 'wx' },
    )
    createdFiles.push(baseFile)
    if (environment !== 'local') {
      const selectedFile = join(cwd, `.env.${environment}`)
      await writeFile(selectedFile, 'MCP_OAUTH_ISSUER=http://127.0.0.1:1\n', { flag: 'wx' })
      createdFiles.push(selectedFile)
    }
  }
  const reservation = createServer()
  await new Promise((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(0, '127.0.0.1', resolve)
  })
  const port = reservation.address().port
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  )
  const base = `http://127.0.0.1:${port}`
  const wrapper = `
process.on('message', message => {
  if (message === 'shutdown') {
    process.emit('SIGTERM');
    process.disconnect();
  }
});
await import(${JSON.stringify(pathToFileURL(bundle).href)});
if (process.exitCode) process.disconnect();
else process.send('ready');
`
  const env = {
    MCP_HOST: '127.0.0.1',
    MCP_PORT: String(port),
    MCP_RESOURCE: `${base}/mcp`,
    MCP_OAUTH_ISSUER: 'http://127.0.0.1:1',
    MCP_JWKS_URL: 'http://127.0.0.1:1/.well-known/jwks.json',
    MCP_ALLOWED_HOSTS: `127.0.0.1:${port}`,
    MCP_ALLOWED_ORIGINS: base,
    MCP_TRADING_TOOLS_ENABLED: 'false',
    MCP_TRADING_WRITE_TOOLS_ENABLED: 'false',
    MCP_TLS_TERMINATED_BY_PROXY: 'false',
  }
  if (environment) {
    env.TQX_ENV = environment
    delete env.MCP_OAUTH_ISSUER
  }
  for (const key of ['SystemRoot', 'WINDIR', 'PATH'])
    if (process.env[key]) env[key] = process.env[key]
  child = spawn(process.execPath, ['--input-type=module', '--eval', wrapper], {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  exited = once(child, 'exit')
  const ready = once(child, 'message')
  let sawShutdown = false
  let publicOutput = ''
  child.stdout.on('data', (chunk) => {
    publicOutput = (publicOutput + String(chunk)).slice(-8192)
  })
  child.stderr.on('data', (chunk) => {
    if (String(chunk).includes('MCP service shutting down')) sawShutdown = true
  })
  const deadline = () =>
    delay(5_000, undefined, { signal: timer.signal }).then(() => {
      throw new Error('Isolated built HTTP smoke timed out')
    })
  const [message] = await Promise.race([
    ready,
    exited.then(() => {
      throw new Error('Isolated built HTTP smoke startup failed')
    }),
    deadline(),
  ])
  assert.equal(message, 'ready')
  const get = (path) =>
    fetch(`${base}${path}`, { signal: AbortSignal.timeout(5_000), redirect: 'manual' })
  const health = await get('/healthz')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok', checks: 'process-only' })
  const metadata = await get('/.well-known/oauth-protected-resource/mcp')
  assert.equal(metadata.status, 200)
  assert.deepEqual(await metadata.json(), {
    resource: `${base}/mcp`,
    authorization_servers: ['http://127.0.0.1:1'],
    scopes_supported: ['trade:read'],
    bearer_methods_supported: ['header'],
  })
  const unauthorized = await get('/mcp')
  assert.equal(unauthorized.status, 401)
  assert.deepEqual(await unauthorized.json(), { error: 'invalid_token' })
  assert.ok(
    unauthorized.headers
      .get('WWW-Authenticate')
      ?.includes(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`),
  )
  const badOrigin = await fetch(`${base}/healthz`, {
    headers: { Origin: 'https://invalid-test-origin.invalid' },
    signal: AbortSignal.timeout(5_000),
  })
  assert.equal(badOrigin.status, 403)
  await badOrigin.body?.cancel()
  child.send('shutdown')
  const [code] = await Promise.race([exited, deadline()])
  assert.equal(code, 0)
  assert.equal(sawShutdown, true)
  if (environment) assert.ok(publicOutput.includes(`MCP environment=${environment};`))
  console.info(
    'Isolated built Node HTTP smoke passed: clean cwd/env, health=200, metadata=200, unauthenticated=401, forbidden Origin=403, shutdown=0; tools disabled; no external AS/Trading or broker access',
  )
} finally {
  timer.abort()
  try {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill()
      await Promise.race([
        exited,
        delay(5_000).then(() => {
          throw new Error('Isolated smoke child did not exit')
        }),
      ])
    }
  } finally {
    // Remove only the named public fixture files created above, then this test's own empty cwd.
    await Promise.all(createdFiles.map((path) => unlink(path)))
    await rmdir(cwd)
  }
}
