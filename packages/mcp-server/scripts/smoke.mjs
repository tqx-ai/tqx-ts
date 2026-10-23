import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const requestedPort = process.env.MCP_SMOKE_PORT
let port
if (requestedPort !== undefined) {
  assert.match(requestedPort, /^\d+$/)
  port = Number(requestedPort)
  assert.ok(Number.isInteger(port) && port >= 1 && port <= 65535)
} else {
  const reservation = createServer()
  await new Promise((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(0, '127.0.0.1', resolve)
  })
  port = reservation.address().port
  await new Promise((resolve, reject) => {
    reservation.close((error) => (error ? reject(error) : resolve()))
  })
}
const authority = `127.0.0.1:${port}`
const base = `http://${authority}`

// Run the actual built entry, with a portable IPC trigger for the registered SIGTERM
// handler. There is no synthetic token in this smoke: protected access must be 401.
const wrapper = `
process.on('message', message => {
  if (message === 'shutdown') {
    process.emit('SIGTERM');
    process.disconnect();
  }
});
await import('./dist/index.mjs');
if (process.exitCode) process.disconnect();
else process.send('ready');
`
const env = {
  ...process.env,
  MCP_HOST: '127.0.0.1',
  MCP_PORT: String(port),
  MCP_RESOURCE: `${base}/mcp`,
  MCP_OAUTH_ISSUER: 'http://127.0.0.1:26823',
  MCP_JWKS_URL: 'http://127.0.0.1:26823/.well-known/jwks.json',
  MCP_ALLOWED_HOSTS: authority,
  MCP_ALLOWED_ORIGINS: base,
  MCP_TLS_CERT_FILE: '',
  MCP_TLS_KEY_FILE: '',
  MCP_TLS_TERMINATED_BY_PROXY: 'false',
  MCP_TRADING_TOOLS_ENABLED: 'false',
  MCP_TRADING_WRITE_TOOLS_ENABLED: 'false',
}
const child = spawn(process.execPath, ['--input-type=module', '--eval', wrapper], {
  cwd: new URL('..', import.meta.url),
  env,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
})
const exited = once(child, 'exit')
let output = ''
child.stdout.on('data', (chunk) => {
  output += chunk.toString()
})
child.stderr.on('data', (chunk) => {
  output += chunk.toString()
})
const startupTimeout = new AbortController()
try {
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message),
    exited.then(() => {
      throw new Error(`Smoke startup failed: ${output.trim()}`)
    }),
    delay(5_000, undefined, { signal: startupTimeout.signal }).then(() => {
      throw new Error('Smoke startup timed out')
    }),
  ])
  startupTimeout.abort()
  assert.equal(ready, 'ready')
  const get = (path) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(5_000) })
  const health = await get('/healthz')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), {
    status: 'ok',
    checks: 'process-only',
  })
  const metadata = await get('/.well-known/oauth-protected-resource/mcp')
  assert.equal(metadata.status, 200)
  assert.deepEqual(await metadata.json(), {
    resource: `${base}/mcp`,
    authorization_servers: ['http://127.0.0.1:26823'],
    scopes_supported: ['trade:read'],
    bearer_methods_supported: ['header'],
  })
  const unauthorized = await get('/mcp')
  assert.equal(unauthorized.status, 401)
  assert.ok(
    (unauthorized.headers.get('WWW-Authenticate') ?? '').includes(
      `resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
    ),
  )
  assert.deepEqual(await unauthorized.json(), { error: 'invalid_token' })
  child.send('shutdown')
  const [code] = await exited
  assert.equal(code, 0)
  assert.match(output, /MCP service shutting down/)
  console.info(
    'Built Node smoke passed: health=200, metadata=200, unauthenticated MCP=401, SIGTERM handler exit=0; no real OAuth consent or Trading access tested',
  )
} finally {
  startupTimeout.abort()
  if (child.exitCode === null && child.signalCode === null) {
    child.kill()
    await exited
  }
}
