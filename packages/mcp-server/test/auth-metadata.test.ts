import { describe, expect, it } from 'vitest'

import { createApp } from '../src/app'
import { testConfig } from './helpers/oauth'

describe('OAuth resource discovery', () => {
  const app = createApp({ config: testConfig })

  it.each(['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource'])(
    'publishes anonymous resource metadata at %s',
    async (path) => {
      const response = await app.request(`http://127.0.0.1${path}`, {
        headers: { Host: '127.0.0.1' },
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        resource: testConfig.resourceUrl,
        authorization_servers: [testConfig.issuer],
        bearer_methods_supported: ['header'],
        scopes_supported: [
          'research:read',
          'research:write',
          'research:run',
          'trade:read',
          'order:write',
          'ranking:read',
        ],
        resource_name: 'TQX MCP Server',
      })
    },
  )

  it.each(['GET', 'POST', 'DELETE'])(
    'challenges anonymous %s /mcp using the configured public URL',
    async (method) => {
      const response = await app.request('http://127.0.0.1/mcp', {
        method,
        headers: { Host: '127.0.0.1', 'X-Forwarded-Host': 'attacker.example.test' },
      })
      expect(response.status).toBe(401)
      expect(response.headers.get('WWW-Authenticate')).toContain(
        'resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"',
      )
      expect(await response.text()).not.toContain('attacker')
    },
  )

  it('derives the well-known route for an externally prefixed resource', async () => {
    const prefixed = createApp({
      config: { ...testConfig, resourceUrl: 'https://mcp.example.test/server/mcp' },
    })
    const response = await prefixed.request(
      'http://127.0.0.1/.well-known/oauth-protected-resource/server/mcp',
      {
        headers: { Host: '127.0.0.1' },
      },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveProperty('resource', 'https://mcp.example.test/server/mcp')
  })

  it('does not publish AS routes or device authorization routes', async () => {
    await Promise.all(
      [
        '/.well-known/oauth-authorization-server',
        '/oauth/authorize',
        '/oauth/callback',
        '/oauth/device/authorization',
      ].map(async (path) => {
        const response = await app.request(`http://127.0.0.1${path}`, {
          headers: { Host: '127.0.0.1' },
        })
        expect(response.status).toBe(404)
      }),
    )
  })

  it('rejects a Host outside the explicit allowlist', async () => {
    const response = await app.request('http://attacker.example.test/mcp', {
      headers: { Host: 'attacker.example.test' },
    })
    expect(response.status).toBe(403)
  })

  it('lets allowed browsers read the authentication challenge', async () => {
    const response = await app.request('http://127.0.0.1/mcp', {
      headers: { Host: '127.0.0.1', Origin: 'http://localhost:6274' },
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:6274')
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('WWW-Authenticate')
  })

  it('answers browser preflight without executing MCP authentication', async () => {
    const response = await app.request('http://127.0.0.1/mcp', {
      method: 'OPTIONS',
      headers: {
        Host: '127.0.0.1',
        Origin: 'http://localhost:6274',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization,Content-Type,Mcp-Method',
      },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    expect(response.headers.get('WWW-Authenticate')).toBeNull()
  })

  it.each([
    'http://localhost:9999',
    'https://localhost:6274',
    'null',
    'https://attacker.example.test',
  ])('rejects an unapproved exact Origin %s', async (origin) => {
    const response = await app.request('http://127.0.0.1/mcp', {
      method: 'OPTIONS',
      headers: { Host: '127.0.0.1', Origin: origin },
    })
    expect(response.status).toBe(403)
  })
})
