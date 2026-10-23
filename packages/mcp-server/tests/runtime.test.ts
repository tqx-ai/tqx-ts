import { describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config'
import { installShutdownHandlers, startService } from '../src/runtime'
import { fixture, listBody, rpcHeaders } from './fixture'

describe('service lifecycle', () => {
  it('rejects a port conflict and leaves the first service usable', async () => {
    const f = await fixture()
    try {
      await expect(
        startService({ ...f.config, port: f.service.address.port }),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' })
      expect((await fetch(`${f.base}/healthz`)).status).toBe(200)
      await Promise.all([f.service.close(), f.service.close()])
    } finally {
      await f.close()
    }
  })
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'drains and removes handlers on %s (portable signal event)',
    async (signal) => {
      const f = await fixture()
      const closed = vi.fn(f.service.close)
      const report = vi.fn()
      const before = {
        int: process.listenerCount('SIGINT'),
        term: process.listenerCount('SIGTERM'),
      }
      const remove = installShutdownHandlers(closed, report)
      try {
        // Windows lacks POSIX signal delivery; emit the actual registered Node process event.
        process.emit(signal, signal)
        process.emit(signal, signal)
        await vi.waitFor(() => {
          expect(closed).toHaveBeenCalledTimes(1)
          expect(process.listenerCount('SIGINT')).toBe(before.int)
          expect(process.listenerCount('SIGTERM')).toBe(before.term)
          expect(f.service.server.listening).toBe(false)
        })
        expect(report).toHaveBeenCalledWith('MCP service shutting down')
      } finally {
        remove()
        await f.close()
      }
    },
  )
  it('fails closed when the configured JWKS is unavailable while liveness stays healthy', async () => {
    const f = await fixture()
    f.jwksState.unavailable = true
    try {
      const response = await fetch(f.config.resource, {
        method: 'POST',
        headers: { ...rpcHeaders, Authorization: `Bearer ${await f.sign()}` },
        body: listBody,
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'invalid_token' })
      expect((await fetch(`${f.base}/healthz`)).status).toBe(200)
    } finally {
      await f.close()
    }
  })
  it('rejects new requests once shutdown starts', async () => {
    const config = loadConfig({})
    expect(config.shutdownTimeoutMs).toBeGreaterThan(0)
    const f = await fixture()
    try {
      f.service.application.beginShutdown()
      const response = await fetch(`${f.base}/healthz`)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: 'shutting_down' })
    } finally {
      await f.close()
    }
  })
})
