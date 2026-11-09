import { setTimeout as delay } from 'node:timers/promises'

export async function waitForServer(url: string, signal: AbortSignal, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let lastFailure = 'No response'

  /* eslint-disable no-await-in-loop -- Readiness checks must poll sequentially. */
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    try {
      const response = await fetch(url, {
        // Bun must reconnect: an earlier socket may belong to a different server
        // that was listening before our loopback listener became ready.
        keepalive: false,
        signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
      })
      if (response.ok) {
        const body: unknown = await response.json()
        if (typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok') {
          return
        }
        lastFailure = 'Health response did not contain status "ok"'
      } else {
        lastFailure = `HTTP ${response.status} ${response.statusText}`.trim()
        await response.body?.cancel()
      }
    } catch (error) {
      signal.throwIfAborted()
      lastFailure = error instanceof Error ? error.message : String(error)
    }
    await delay(100, undefined, { signal })
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(
    `Server did not become ready at ${url} within ${timeoutMs / 1000} seconds (last check: ${lastFailure})`,
  )
}
