import { type IncomingMessage, request } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { createProtocolServer } from '../src/protocol'
import { fixture, listBody, rpcHeaders } from './fixture'

describe('security review regressions (synthetic only)', () => {
  it('allows another identity to finish when one caller disconnects during shared key retrieval', async () => {
    const f = await fixture()
    f.jwksState.hold = true
    let received = 0
    let firstClosed = false
    f.service.server.on('request', (_req, res) => {
      received++
      if (received === 1)
        res.once('close', () => {
          firstClosed = true
        })
    })
    const disconnected = new AbortController()
    const first = fetch(f.config.resource, {
      method: 'POST',
      signal: disconnected.signal,
      headers: {
        ...rpcHeaders,
        Authorization: `Bearer ${await f.sign({ sub: 'synthetic-first' })}`,
      },
      body: listBody,
    }).catch(() => undefined)
    let second: Promise<Response> | undefined
    try {
      await vi.waitFor(() => expect(f.jwksState.active).toBe(1))
      second = fetch(f.config.resource, {
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
        headers: {
          ...rpcHeaders,
          Authorization: `Bearer ${await f.sign({ sub: 'synthetic-second' })}`,
        },
        body: listBody,
      })
      await vi.waitFor(() => expect(received).toBe(2))
      disconnected.abort()
      await first
      await vi.waitFor(() => expect(firstClosed).toBe(true))
      f.releaseJwks()
      const response = await second
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        id: 7,
        result: { tools: [] },
      })
      expect(f.jwksState.hits).toHaveLength(1)
    } finally {
      disconnected.abort()
      f.releaseJwks()
      await second?.catch(() => undefined)
      await f.close()
    }
  })

  it('closes a server when protocol connect fails before handling the request', async () => {
    let closed: ReturnType<typeof vi.spyOn> | undefined
    const f = await fixture({
      serverFactory: () => {
        const server = createProtocolServer()
        closed = vi.spyOn(server, 'close')
        vi.spyOn(server, 'connect').mockRejectedValue(
          new Error('synthetic internal connect failure'),
        )
        return server
      },
    })
    try {
      const response = await fetch(f.config.resource, {
        method: 'POST',
        headers: { ...rpcHeaders, Authorization: `Bearer ${await f.sign()}` },
        body: listBody,
      })
      expect(response.status).toBe(500)
      expect(await response.text()).not.toContain('synthetic internal connect failure')
      await vi.waitFor(() => {
        expect(closed).toHaveBeenCalledTimes(1)
        expect(f.service.application.activeRequestCount).toBe(0)
      })
    } finally {
      await f.close()
    }
  })

  it('aborts a pending shared JWKS fetch when forced shutdown closes authentication requests', async () => {
    const f = await fixture({}, 30_000)
    f.jwksState.hold = true
    f.config.shutdownTimeoutMs = 50
    const response = fetch(f.config.resource, {
      method: 'POST',
      headers: { ...rpcHeaders, Authorization: `Bearer ${await f.sign()}` },
      body: listBody,
    }).catch(() => undefined)
    try {
      await vi.waitFor(() => expect(f.jwksState.active).toBe(1))
      await f.service.close()
      await response
      await vi.waitFor(() => expect(f.jwksState.active).toBe(0), {
        timeout: 500,
      })
    } finally {
      await f.close()
    }
  })

  it('rejects a token that expires while its request body is being received', async () => {
    const construct = vi.fn(() => createProtocolServer())
    const f = await fixture({ serverFactory: construct })
    let incoming: IncomingMessage | undefined
    f.service.server.on('request', (req) => {
      incoming = req
    })
    const exp = Math.floor(Date.now() / 1000) + 60
    const token = await f.sign({ exp })
    let clock: ReturnType<typeof vi.spyOn> | undefined
    const req = request(f.config.resource, {
      method: 'POST',
      headers: {
        ...rpcHeaders,
        Authorization: `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(listBody),
      },
    })
    const result = new Promise<number>((resolve, reject) => {
      req.on('response', (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode ?? 0))
      })
      req.on('error', reject)
    })
    try {
      req.write(listBody.slice(0, 1))
      // The parser starts consuming only after asynchronous JWT verification.
      await vi.waitFor(() => expect(incoming?.readableFlowing).toBe(true))
      clock = vi.spyOn(Date, 'now').mockReturnValue(exp * 1000)
      req.end(listBody.slice(1))
      expect(await result).toBe(401)
      expect(construct).not.toHaveBeenCalled()
    } finally {
      clock?.mockRestore()
      req.destroy()
      await f.close()
    }
  })
})
