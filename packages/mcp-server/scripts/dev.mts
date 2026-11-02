import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { waitForServer } from './wait-for-server'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const hostname = '127.0.0.1'
const port = 61102
const baseUrl = `http://${hostname}:${port}`
const controller = new AbortController()
const stopped = new Promise<void>((resolve) => {
  controller.signal.addEventListener('abort', () => resolve(), { once: true })
})
const children: { pid: number | undefined; exited: Promise<number>; kill: () => void }[] = []
let exitCode = 0

function stop(code: number) {
  if (controller.signal.aborted) return
  exitCode = code
  controller.abort()
}

function start(command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })
  const exited = new Promise<number>((resolve) => {
    child.once('error', (error) => {
      console.error(`[mcp-dev] Could not start ${command}: ${error.message}`)
      resolve(1)
    })
    child.once('exit', (code) => resolve(code ?? 1))
  })
  children.push({ pid: child.pid, exited, kill: () => child.kill('SIGTERM') })
  void exited.then(stop)
}

function killChildren(signal: NodeJS.Signals) {
  for (const child of children) {
    if (child.pid === undefined) continue
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).once(
          'error',
          child.kill,
        )
      } else {
        // Inspector launches descendants; signal the whole process group.
        process.kill(-child.pid, signal)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
}

process.once('SIGINT', () => stop(130))
process.once('SIGTERM', () => stop(143))

try {
  // Avoid mistaking an already-running server's health check for this child's readiness.
  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(port, hostname, () => {
      probe.close((error) => (error ? reject(error) : resolve()))
    })
  })
  controller.signal.throwIfAborted()
  start('bun', ['--hot', 'src/index.ts'])
  await waitForServer(`${baseUrl}/healthz`, controller.signal)
  controller.signal.throwIfAborted()
  console.log('[mcp-dev] Server is ready. Starting MCP Inspector...')
  start('bunx', [
    '@modelcontextprotocol/inspector',
    '--server-url',
    `${baseUrl}/mcp`,
    '--transport',
    'http',
  ])
  await stopped
} catch (error) {
  if (!controller.signal.aborted) {
    console.error(`[mcp-dev] ${error instanceof Error ? error.message : String(error)}`)
    stop(1)
  }
} finally {
  const forceKill = setTimeout(() => killChildren('SIGKILL'), 2000)
  killChildren('SIGTERM')
  await Promise.all(children.map((child) => child.exited))
  clearTimeout(forceKill)
  killChildren('SIGKILL')
  process.exitCode = exitCode
}
