/* eslint-disable no-await-in-loop */
// Artifact traversal and ordered manifest publication deliberately await each owned file.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rmdir,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const self = fileURLToPath(import.meta.url)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = async (file) => JSON.parse(await readFile(file, 'utf8'))
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .toSorted()
            .map((key) => [key, canonical(value[key])]),
        )
      : value
const excludedDirectory =
  /^(?:node_modules|test|tests|__tests__|fixtures|examples?|docs?|bench(?:marks?)?|scripts|coverage|\.git)$/i
const forbiddenPath =
  /(?:^|\/)(?:\.[^/]*|[^/]*\.(?:pem|key|map|ts|tsx)|run-contract[^/]*|exchange\.secret|[^/]*(?:authcache|credentials|oauth-profile)[^/]*)(?:\/|$)/i
const allowedRuntimeFile = (name) =>
  /\.(?:[cm]?js|json|wasm)$/i.test(name) ||
  /^(?:LICENSE|LICENCE|COPYING|NOTICE)(?:[-._].*)?$/i.test(name)

function scan(bytes, path, secrets = []) {
  assert(!forbiddenPath.test(path), `Forbidden artifact path: ${path}`)
  const text = bytes.toString('utf8')
  assert(
    !/-----BEGIN [A-Z ]*KEY-----\r?\n[A-Za-z0-9+/=\r\n]{80,}-----END [A-Z ]*KEY-----/.test(text),
    `Embedded key: ${path}`,
  )
  assert(
    !/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text),
    `Literal JWT: ${path}`,
  )
  assert(
    !/[A-Z]:[\\/]Users[\\/]|owner-\d{8}-[a-f0-9]{8}|tqx_v2_\d{8}_[a-f0-9]{8}/i.test(text),
    `Local runtime material: ${path}`,
  )
  for (const secret of secrets)
    assert(!bytes.includes(secret), `Private credential detected: ${path}`)
}

async function walk(directory, prefix = '') {
  const result = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name),
      name = prefix ? `${prefix}/${item.name}` : item.name
    assert(!item.isSymbolicLink(), `Artifact symlink: ${name}`)
    if (item.isDirectory()) result.push(...(await walk(path, name)))
    else {
      assert(item.isFile(), `Unexpected artifact type: ${name}`)
      result.push(name)
    }
  }
  return result
}

async function audit(directory, secrets = []) {
  const manifest = await json(join(directory, 'manifest.json'))
  const expected = [...manifest.files.map((file) => file.path), 'manifest.json'].toSorted()
  assert.deepEqual((await walk(directory)).toSorted(), expected)
  for (const file of manifest.files) {
    assert(
      file.path === 'Dockerfile' ||
        file.path === 'verify-package.mjs' ||
        file.path === 'package.json' ||
        /^bundle\/(?:index|schema|protocol-[A-Za-z0-9_-]+)\.mjs$/.test(file.path) ||
        file.path.startsWith('node_modules/'),
    )
    const bytes = await readFile(join(directory, file.path))
    assert.equal(bytes.length, file.bytes)
    assert.equal(hash(bytes), file.sha256)
    scan(bytes, file.path, secrets)
  }
  scan(await readFile(join(directory, 'manifest.json')), 'manifest.json', secrets)
  return manifest
}

async function assemble(values) {
  assert(
    values['frozen-dir'] && values.output,
    'Select the frozen runtime and a new output context',
  )
  const packageRoot = resolve(dirname(self), '../..'),
    frozen = await realpath(values['frozen-dir'])
  const output = resolve(values.output),
    ownedWork = resolve(packageRoot, 'work')
  assert(
    output.startsWith(ownedWork + sep),
    'Generated context must stay in this package owned work directory',
  )
  const baseline = await json(join(frozen, 'runtime-baseline.redacted.json'))
  const schema = await json(join(frozen, 'schema-fingerprint.json'))
  const sourceCommit = baseline.sourceCommit
  const repo = resolve(packageRoot, '../..')
  execFileSync(
    'git',
    [
      'diff',
      '--quiet',
      sourceCommit,
      '--',
      'packages/mcp-server/src',
      'packages/sdk/src',
      'packages/mcp-server/package.json',
      'packages/sdk/package.json',
    ],
    { cwd: repo },
  )
  const repoHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim()
  const sourcePaths = execFileSync(
    'git',
    [
      'ls-files',
      'packages/mcp-server/src',
      'packages/sdk/src',
      'packages/mcp-server/package.json',
      'packages/sdk/package.json',
    ],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split(/\r?\n/)
  const sources = []
  for (const path of sourcePaths)
    sources.push({ path, sha256: hash(await readFile(join(repo, path))) })
  const secrets = []
  if (values['secret-file']) {
    const secret = (await readFile(values['secret-file'], 'utf8')).trim()
    assert(secret.length >= 16, 'Explicit private secret scan input is too short')
    secrets.push(Buffer.from(secret), Buffer.from(`tqx_mcp_server:${secret}`).toString('base64'))
  }
  await mkdir(output)
  const files = [],
    packages = [],
    cache = new Map(),
    defaults = new Map()
  const emit = async (name, bytes) => {
    scan(bytes, name, secrets)
    await mkdir(dirname(join(output, name)), { recursive: true })
    await writeFile(join(output, name), bytes, { flag: 'wx' })
    files.push({ path: name, bytes: bytes.length, sha256: hash(bytes) })
  }
  for (const file of baseline.prepared.files.filter((candidate) =>
    /^(?:index|schema|protocol-[A-Za-z0-9_-]+)\.mjs$/.test(candidate.name),
  )) {
    const bytes = await readFile(join(frozen, 'bundle', file.name))
    assert.equal(hash(bytes), file.sha256)
    await emit(`bundle/${file.name}`, bytes)
  }
  assert.equal(files.length, 3, 'Expected index/schema/protocol frozen runtime modules')
  const roots = ['@modelcontextprotocol/sdk', 'express', 'jose', 'zod']
  const locate = async (name, parent) => {
    const request = createRequire(join(parent, 'package.json'))
    for (const base of request.resolve.paths(name) ?? []) {
      const candidate = join(base, name)
      try {
        await access(join(candidate, 'package.json'))
      } catch {
        continue
      }
      const directory = await realpath(candidate)
      if (!cache.has(directory)) {
        const info = await json(join(directory, 'package.json'))
        cache.set(directory, { directory, info, id: `${info.name}@${info.version}`, edges: [] })
      }
      return cache.get(directory)
    }
    throw new Error(`Missing installed production dependency: ${name}`)
  }
  const queue = []
  for (const name of roots) {
    const node = await locate(name, packageRoot)
    defaults.set(name, node)
    queue.push(node)
  }
  const visited = new Set()
  while (queue.length) {
    const node = queue.shift()
    if (visited.has(node.directory)) continue
    visited.add(node.directory)
    for (const name of Object.keys({
      ...node.info.dependencies,
      ...node.info.optionalDependencies,
    })) {
      let child
      try {
        child = await locate(name, node.directory)
      } catch (error) {
        if (node.info.optionalDependencies?.[name]) continue
        throw error
      }
      node.edges.push({ name, node: child })
      if (!defaults.has(name)) defaults.set(name, child)
      queue.push(child)
    }
  }
  const copyOwnFiles = async (source, destination, prefix = '') => {
    for (const item of await readdir(source, { withFileTypes: true })) {
      if (item.name.startsWith('.') || excludedDirectory.test(item.name)) continue
      const child = join(source, item.name),
        name = prefix ? `${prefix}/${item.name}` : item.name
      if (item.isDirectory()) await copyOwnFiles(child, destination, name)
      else if (
        item.isFile() &&
        allowedRuntimeFile(item.name) &&
        !/\.(?:test|spec)\.[cm]?js$|^(?:tsconfig|jsconfig|package-lock)\.json$/i.test(item.name)
      )
        await emit(`${destination}/${name}`, await readFile(child))
    }
  }
  const install = async (node, destination, available) => {
    packages.push({ name: node.info.name, version: node.info.version, path: destination })
    await copyOwnFiles(node.directory, destination)
    for (const edge of node.edges) {
      if (available.get(edge.name)?.id === edge.node.id) continue
      const nested = new Map(available)
      nested.set(edge.name, edge.node)
      await install(edge.node, `${destination}/node_modules/${edge.name}`, nested)
    }
  }
  for (const [name, node] of defaults) await install(node, `node_modules/${name}`, defaults)
  await emit(
    'package.json',
    Buffer.from(
      JSON.stringify(
        {
          name: 'tqx-mcp-test-artifact',
          private: true,
          type: 'module',
          engines: { node: '>=22.18.0' },
          dependencies: Object.fromEntries(
            roots.map((name) => [name, defaults.get(name).info.version]),
          ),
        },
        null,
        2,
      ),
    ),
  )
  await emit('Dockerfile', await readFile(join(dirname(self), 'Dockerfile')))
  await emit('verify-package.mjs', await readFile(self))
  const manifest = {
    schemaVersion: 1,
    purpose: 'test container packaging; not shared OAuth readiness',
    runtimeSourceCommit: sourceCommit,
    packagingRepoHead: repoHead,
    sdkSourceInlined: true,
    sourceInventory: sources,
    expectedSchema: {
      readToolsSchemaSha256: schema.readToolsSchemaSha256,
      listOrdersSchemaSha256: schema.listOrdersSchemaSha256,
    },
    packages,
    files: files.toSorted((a, b) => a.path.localeCompare(b.path)),
    noEmbeddedRuntimeConfiguration: true,
    requiresNoRegistryInstall: true,
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' })
  await audit(output, secrets)
  const list = `${output}.upload-files.list`
  await writeFile(
    list,
    [...files.map((file) => file.path), 'manifest.json'].toSorted().join('\n') + '\n',
    { flag: 'wx' },
  )
  console.log(
    JSON.stringify({
      assembled: true,
      runtimeSourceCommit: sourceCommit,
      packagingRepoHead: repoHead,
      context: output,
      uploadList: list,
      files: files.length + 1,
      packageInstances: packages.length,
      distinctPackages: cache.size,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      secretScanPassed: true,
      secretsPrinted: false,
    }),
  )
}

async function probe(directory) {
  const manifest = await audit(directory)
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
  const { createProtocolServer, loadConfig } = await import(
    pathToFileURL(join(directory, 'bundle/schema.mjs')).href
  )
  const originalFetch = globalThis.fetch
  let networkCalls = 0
  globalThis.fetch = async () => {
    networkCalls++
    throw new Error('Offline schema inspection forbids network')
  }
  const config = loadConfig({
    MCP_TRADING_TOOLS_ENABLED: 'true',
    MCP_TRADING_WRITE_TOOLS_ENABLED: 'true',
    MCP_EXCHANGE_CLIENT_SECRET: 'synthetic-offline-schema-only',
  })
  const server = createProtocolServer({
    config,
    access: {
      token: 'synthetic-no-access-token',
      scopes: ['trade:read'],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    },
    signal: new AbortController().signal,
  })
  const client = new Client({ name: 'test-package-offline-probe', version: '1' })
  const [left, right] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(right)
    await client.connect(left)
    const { tools } = await client.listTools()
    assert.equal(
      hash(JSON.stringify(canonical(tools))),
      manifest.expectedSchema.readToolsSchemaSha256,
    )
    assert.equal(tools.length, 7)
    assert(tools.every((tool) => tool.annotations?.readOnlyHint))
    assert.equal(
      hash(JSON.stringify(canonical(tools.find((tool) => tool.name === 'listOrders').inputSchema))),
      manifest.expectedSchema.listOrdersSchemaSha256,
    )
    assert.equal(networkCalls, 0)
  } finally {
    await client.close()
    await server.close()
    globalThis.fetch = originalFetch
  }
  const cwd = await mkdtemp(join(tmpdir(), 'tqx-mcp-package-probe-'))
  let child, exited
  const timer = new AbortController()
  try {
    const reservation = createServer()
    await new Promise((done) => reservation.listen(0, '127.0.0.1', done))
    const port = reservation.address().port
    await new Promise((done) => reservation.close(done))
    const base = `http://127.0.0.1:${port}`
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
    }
    for (const key of ['SystemRoot', 'WINDIR', 'PATH'])
      if (process.env[key]) env[key] = process.env[key]
    const wrapper = `process.on('message',m=>{if(m==='shutdown'){process.emit('SIGTERM');process.disconnect()}});await import(${JSON.stringify(pathToFileURL(join(directory, 'bundle/index.mjs')).href)});if(process.exitCode)process.disconnect();else process.send('ready');`
    child = spawn(process.execPath, ['--input-type=module', '--eval', wrapper], {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    child.stdout.on('data', () => {})
    child.stderr.on('data', () => {})
    exited = once(child, 'exit')
    const timeout = () =>
      delay(8000, undefined, { signal: timer.signal }).then(() => {
        throw new Error('Isolated package child timed out')
      })
    const [ready] = await Promise.race([
      once(child, 'message'),
      exited.then(() => {
        throw new Error('Package child exited before ready')
      }),
      timeout(),
    ])
    assert.equal(ready, 'ready')
    const get = (path) =>
      fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
    const health = await get('/healthz')
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { status: 'ok', checks: 'process-only' })
    const metadata = await get('/.well-known/oauth-protected-resource/mcp')
    assert.equal(metadata.status, 200)
    assert.equal((await metadata.json()).resource, `${base}/mcp`)
    const unauthenticated = await get('/mcp')
    assert.equal(unauthenticated.status, 401)
    await unauthenticated.body?.cancel()
    child.send('shutdown')
    const [code] = await Promise.race([exited, timeout()])
    assert.equal(code, 0)
    console.log(
      JSON.stringify({
        passed: true,
        node: process.versions.node,
        artifactFiles: manifest.files.length + 1,
        schema: {
          readTools: 7,
          allOrderFiltersOptional: true,
          toolCalls: 0,
          networkCalls: 0,
          listOrdersSha256: manifest.expectedSchema.listOrdersSchemaSha256,
        },
        health: 200,
        metadata: 200,
        unauthenticated: 401,
        shutdownExit: 0,
        syntheticSchemaContextOnly: true,
        externalServiceCalls: 0,
        actualSharedReadiness: false,
      }),
    )
  } finally {
    timer.abort()
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill()
      await Promise.race([exited, delay(5000)])
    }
    await rmdir(cwd)
  }
}

try {
  const { values } = parseArgs({
    options: {
      assemble: { type: 'boolean' },
      audit: { type: 'boolean' },
      probe: { type: 'boolean' },
      'frozen-dir': { type: 'string' },
      output: { type: 'string' },
      'secret-file': { type: 'string' },
    },
  })
  assert.equal(
    [values.assemble, values.audit, values.probe].filter(Boolean).length,
    1,
    'Choose exactly one packaging action',
  )
  if (values.assemble) await assemble(values)
  else if (values.probe) await probe(dirname(self))
  else {
    const manifest = await audit(dirname(self))
    console.log(
      JSON.stringify({
        audited: true,
        files: manifest.files.length + 1,
        runtimeSourceCommit: manifest.runtimeSourceCommit,
        secretsPrinted: false,
      }),
    )
  }
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : 'MCP test-package operation failed; private inputs withheld',
  )
  process.exitCode = 1
}
