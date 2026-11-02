import { describe, expect, it } from 'vitest'

import { loadMcpConfig } from '../src/config'
import { testEnvironment } from './helpers/oauth'

describe('MCP OAuth configuration', () => {
  it('normalizes public URLs and explicit comma-separated allowlists', () => {
    expect(
      loadMcpConfig({
        ...testEnvironment,
        TQX_MCP_RESOURCE_URL: 'https://mcp.example.test/mcp/',
        TQX_MCP_ALLOWED_HOSTS: ' MCP.example.test,127.0.0.1',
        TQX_MCP_ALLOWED_ORIGINS: 'http://localhost:6274/,http://localhost:6274',
      }),
    ).toEqual({
      resourceUrl: 'https://mcp.example.test/mcp',
      issuer: 'https://auth.example.test',
      allowedHosts: ['mcp.example.test', '127.0.0.1'],
      allowedOrigins: ['http://localhost:6274'],
    })
  })

  it.each(Object.keys(testEnvironment))('requires explicit %s without echoing values', (name) => {
    expect(() => loadMcpConfig({ ...testEnvironment, [name]: undefined })).toThrow(name)
  })

  it.each([
    'http://auth.example.test',
    'https://user:secret@auth.example.test',
    'https://auth.example.test#',
    'https://auth.example.test?key=secret',
    'not-a-url-secret',
  ])('rejects unsafe issuer configuration %s', (issuer) => {
    expect(() => loadMcpConfig({ ...testEnvironment, TQX_MCP_OAUTH_ISSUER: issuer })).toThrow(
      '[mcp-config] Invalid or missing TQX_MCP_OAUTH_ISSUER',
    )
  })

  it.each(['*', 'https://mcp.example.test', 'mcp.example.test:443', 'user@host', 'a,,b'])(
    'rejects host allowlist %s',
    (hosts) => {
      expect(() => loadMcpConfig({ ...testEnvironment, TQX_MCP_ALLOWED_HOSTS: hosts })).toThrow(
        'TQX_MCP_ALLOWED_HOSTS',
      )
    },
  )

  it.each([
    '*',
    'null',
    'https://example.test/path',
    'http://example.test',
    'https://example.test,,',
  ])('rejects origin allowlist %s', (origins) => {
    expect(() => loadMcpConfig({ ...testEnvironment, TQX_MCP_ALLOWED_ORIGINS: origins })).toThrow(
      'TQX_MCP_ALLOWED_ORIGINS',
    )
  })

  it('allows an explicitly empty origin list for native clients', () => {
    expect(
      loadMcpConfig({ ...testEnvironment, TQX_MCP_ALLOWED_ORIGINS: '' }).allowedOrigins,
    ).toEqual([])
  })

  it('allows loopback HTTP only outside production', () => {
    const environment = {
      ...testEnvironment,
      TQX_MCP_RESOURCE_URL: 'http://127.0.0.1:61102/mcp',
      TQX_MCP_OAUTH_ISSUER: 'http://localhost:26823',
    }
    expect(loadMcpConfig(environment).issuer).toBe('http://localhost:26823')
    expect(() => loadMcpConfig({ ...environment, NODE_ENV: 'production' })).toThrow(
      'TQX_MCP_RESOURCE_URL',
    )
  })

  it('requires HTTPS browser origins in production', () => {
    expect(() => loadMcpConfig({ ...testEnvironment, NODE_ENV: 'production' })).toThrow(
      'TQX_MCP_ALLOWED_ORIGINS',
    )
  })
})
