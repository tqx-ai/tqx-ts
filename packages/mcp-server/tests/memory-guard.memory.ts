import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync, openSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { loadEnvFile } from 'node:process'
import { connect as tlsConnect } from 'node:tls'
import { describe, expect, it } from 'vitest'
import { createApplication } from '../src/app'
import { supportedScopes } from '../src/config'
import { createExchange } from '../src/exchange'
import { createMemoryConfig } from './memory-config'
import { assertMemoryImport } from './memory-policy'

describe('memory-only guard enforcement', () => {
  it('builds an explicit default-off application/exchange config without inheriting service env', async () => {
    const previous = process.env.MCP_TRADING_TOOLS_ENABLED
    process.env.MCP_TRADING_TOOLS_ENABLED = 'true'
    const endpoints = {
      issuer: 'http://127.0.0.1:45001',
      resource: 'http://127.0.0.1:45002/mcp',
      apiResource: 'http://127.0.0.1:45003/api',
      tradingBaseUrl: 'http://127.0.0.1:45003',
    }
    try {
      const config = createMemoryConfig(endpoints)
      expect(config).toMatchObject({
        tradingToolsEnabled: false,
        tradingWriteToolsEnabled: false,
        issuer: endpoints.issuer,
        resource: endpoints.resource,
        tlsCertFile: undefined,
        tlsKeyFile: undefined,
      })
      const application = createApplication(config)
      const exchange = createExchange(config)
      try {
        expect(application.activeRequestCount).toBe(0)
        expect(
          supportedScopes(createMemoryConfig(endpoints, { tools: true, writes: true })),
        ).toEqual(['trade:read', 'order:write'])
      } finally {
        application.beginShutdown()
        await application.closeRequests()
        exchange.close()
      }
    } finally {
      if (previous === undefined) delete process.env.MCP_TRADING_TOOLS_ENABLED
      else process.env.MCP_TRADING_TOOLS_ENABLED = previous
    }
  })
  it('rejects remote endpoints before constructing an application, exchange or connection', () => {
    expect(() =>
      createMemoryConfig({
        issuer: 'https://remote.invalid',
        resource: 'http://127.0.0.1:45002/mcp',
        apiResource: 'http://127.0.0.1:45003/api',
        tradingBaseUrl: 'http://127.0.0.1:45003',
      }),
    ).toThrow('Memory endpoints')
  })
  it('blocks file/credential/private-key writes and dotenv reads before execution', async () => {
    expect(() => writeFileSync('never-created-memory-test.pem', 'synthetic')).toThrow('Memory-only')
    await expect(writeFile('never-created-memory-test.json', 'synthetic')).rejects.toThrow(
      'Memory-only',
    )
    expect(() => mkdtempSync('never-created-memory-test-')).toThrow('Memory-only')
    expect(() => openSync('never-created-memory-test.txt', 'w')).toThrow('Memory-only')
    expect(() => readFileSync('.env.local')).toThrow('Memory-only')
    expect(() => loadEnvFile('.env.local')).toThrow('Memory-only')
  })
  it('blocks subprocesses, external fetch, and existing localhost service connections', async () => {
    expect(() => spawn(process.execPath, ['--version'])).toThrow('Memory-only')
    await expect(fetch('https://example.com')).rejects.toThrow('Memory-only')
    await expect(fetch('http://127.0.0.1:26823/oauth/token')).rejects.toThrow('Memory-only')
    expect(() => connect({ host: '127.0.0.1', port: 16379 })).toThrow('Memory-only')
    expect(() => tlsConnect({ host: '127.0.0.1', port: 27017 })).toThrow('Memory-only')
  })
  it.each([
    'redis',
    'ioredis',
    'mongodb',
    'mongoose',
    'pg',
    'mysql2',
    'better-sqlite3',
    'node:sqlite',
    'bun:sqlite',
    '@prisma/client',
    'dotenv',
  ])('rejects connector import %s', (id) => {
    expect(() => assertMemoryImport(id)).toThrow('Memory-only')
  })
  it('allows only a newly owned temporary loopback HTTP server', async () => {
    const server = createServer((_req, res) => res.end('memory-only'))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing fixture port')
      const response = await fetch(`http://127.0.0.1:${address.port}`)
      expect(await response.text()).toBe('memory-only')
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
