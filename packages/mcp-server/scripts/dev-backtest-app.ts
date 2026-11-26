import { watch } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build, serve } from 'bun'
import { createServer } from 'vite'

import { backtestViteConfig } from './backtest-vite'

import { output } from './build-backtest-app'

const ui = new URL('../src/ui/qube/backtest/', import.meta.url)
const compile = promisify(execFile)
let html = '',
  workbench = ''
const listeners = new Set<ReadableStreamDefaultController<Uint8Array>>()
async function rebuild() {
  const result = await build({
    entrypoints: [fileURLToPath(new URL('dev/workbench.ts', ui))],
    target: 'browser',
    format: 'iife',
    minify: false,
  })
  if (!result.success) throw new Error(result.logs.join('\n'))
  // Keep Vite's production NODE_ENV and dependency optimizer out of the HMR process.
  await compile(
    process.execPath,
    [fileURLToPath(new URL('./build-backtest-app.ts', import.meta.url))],
    {
      env: { ...process.env, NODE_ENV: 'production' },
    },
  )
  html = await readFile(output, 'utf8')
  workbench = await result.outputs[0]!.text()
}
process.env.NODE_ENV = 'development'
await rebuild()
const vite = await createServer({
  ...backtestViteConfig(),
  server: {
    host: '127.0.0.1',
    port: 0,
    cors: false,
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src data:; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; frame-src 'none'; base-uri 'none'; form-action 'none'",
    },
  },
})
await vite.listen()
const hmrUrl = vite.resolvedUrls?.local[0]
if (!hmrUrl) throw new Error('Vite did not provide a loopback URL')
const server = serve({
  hostname: '127.0.0.1',
  idleTimeout: 0,
  port: Number(process.env.TQX_APP_DEV_PORT ?? 53043),
  async fetch(request) {
    const path = new URL(request.url).pathname
    const headers = { 'Cache-Control': 'no-store' }
    if (path === '/')
      return new Response(await readFile(new URL('dev/workbench.html', ui), 'utf8'), {
        headers: { ...headers, 'Content-Type': 'text/html' },
      })
    if (path === '/dev-config') return Response.json({ hmrUrl }, { headers })
    if (path === '/app.html')
      return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html' } })
    if (path === '/workbench.js')
      return new Response(workbench, { headers: { ...headers, 'Content-Type': 'text/javascript' } })
    if (path === '/events') {
      let listener: ReadableStreamDefaultController<Uint8Array>
      return new Response(
        new ReadableStream({
          start(controller) {
            listener = controller
            listeners.add(controller)
            controller.enqueue(new TextEncoder().encode(': ready\n\n'))
          },
          cancel() {
            listeners.delete(listener)
          },
        }),
        { headers: { ...headers, 'Content-Type': 'text/event-stream' } },
      )
    }
    return new Response('Not found', { status: 404 })
  },
})
let timer: ReturnType<typeof setTimeout> | undefined,
  rebuilding = false,
  dirty = false,
  outerChanged = false
async function changed() {
  if (rebuilding) {
    dirty = true
    return
  }
  rebuilding = true
  try {
    await rebuild()
    for (const listener of listeners) {
      try {
        listener.enqueue(new TextEncoder().encode(`data: ${outerChanged ? 'reload' : 'ui'}\n\n`))
      } catch {
        listeners.delete(listener)
      }
    }
    outerChanged = false
    console.log('[backtest-app] Production HTML rebuilt; Vue development frame uses HMR')
  } catch (error) {
    console.error(error)
  } finally {
    rebuilding = false
    if (dirty) {
      dirty = false
      void changed()
    }
  }
}
const watchers = [
  watch(fileURLToPath(ui), { recursive: true }, (_event, filename) => {
    if (filename?.startsWith('dev/') || filename?.includes('fixture.')) outerChanged = true
    clearTimeout(timer)
    timer = setTimeout(() => void changed(), 120)
  }),
  watch(
    fileURLToPath(new URL('../src/research/backtest-report/contract.ts', import.meta.url)),
    () => {
      outerChanged = true
      void changed()
    },
  ),
]
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    watchers.forEach((watcher) => watcher.close())
    void vite.close()
    server.stop(true)
    process.exit(0)
  })
console.log(`Backtest App workbench: ${server.url} (synthetic fixtures; no account required)`)
