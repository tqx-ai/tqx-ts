import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const readinessModule = new URL('../scripts/wait-for-server.ts', import.meta.url).href

describe('dev server readiness', () => {
  it('reconnects when an existing connection still serves the previous application', async () => {
    const { stdout } = await exec('bun', [
      '-e',
      `
      import { createServer } from 'node:http'
      import { waitForServer } from ${JSON.stringify(readinessModule)}

      let ready = false
      const connections = new WeakMap()
      const server = createServer((request, response) => {
        // Model an old app remaining reachable through its keep-alive socket.
        if (!connections.has(request.socket)) connections.set(request.socket, ready)
        response.writeHead(connections.get(request.socket) ? 200 : 404, {
          'Content-Type': 'application/json',
        })
        response.end(JSON.stringify({ status: connections.get(request.socket) ? 'ok' : 'old-app' }))
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      const url = 'http://127.0.0.1:' + server.address().port + '/healthz'
      try {
        const initial = await fetch(url)
        if (initial.status !== 404) throw new Error('Expected the old application')
        await initial.text()
        setTimeout(() => { ready = true }, 150)
        await waitForServer(url, new AbortController().signal, 1500)
        console.log('ready')
      } finally {
        server.closeAllConnections()
        server.close()
      }
    `,
    ])

    expect(stdout.trim()).toBe('ready')
  })

  it('reports the last HTTP status when readiness times out', async () => {
    const { stdout } = await exec('bun', [
      '-e',
      `
      import { createServer } from 'node:http'
      import { waitForServer } from ${JSON.stringify(readinessModule)}

      const server = createServer((_request, response) => {
        response.writeHead(503)
        response.end()
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      try {
        await waitForServer('http://127.0.0.1:' + server.address().port + '/healthz', new AbortController().signal, 200)
        throw new Error('Expected a readiness timeout')
      } catch (error) {
        console.log(error.message)
      } finally {
        server.closeAllConnections()
        server.close()
      }
    `,
    ])

    expect(stdout).toContain('last check: HTTP 503')
  })
})
