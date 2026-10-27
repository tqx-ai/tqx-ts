import childProcess from 'node:child_process'
import dgram from 'node:dgram'
import fs from 'node:fs'
import promises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import process from 'node:process'
import tls from 'node:tls'
import { memoryOnlyError } from './memory-policy'

export function installMemoryGuards() {
  const restores: (() => void)[] = []
  const owned = new Set<number>()
  const nativeFetch = globalThis.fetch
  function patch(target: object, key: string, replacement: unknown) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    if (!descriptor || typeof descriptor.value !== 'function') return
    Object.defineProperty(target, key, { ...descriptor, value: replacement })
    restores.push(() => Object.defineProperty(target, key, descriptor))
  }
  const portAllowed = (host: unknown, port: unknown) =>
    host === '127.0.0.1' && owned.has(Number(port))
  patch(globalThis, 'fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      !portAllowed(url.hostname, url.port)
    )
      return Promise.reject(new Error('Memory-only fetch target is not an owned fixture'))
    return nativeFetch(input, init)
  })
  const listen = net.Server.prototype.listen
  patch(net.Server.prototype, 'listen', function (this: net.Server, ...args: unknown[]) {
    const first = args[0]
    const options = first && typeof first === 'object' ? (first as net.ListenOptions) : undefined
    const port = Number(options ? options.port : first)
    const host = options ? options.host : args[1]
    if (host !== '127.0.0.1' || !Number.isInteger(port) || (port !== 0 && !owned.has(port)))
      memoryOnlyError()
    this.once('listening', () => {
      const address = this.address()
      if (!address || typeof address === 'string') memoryOnlyError()
      owned.add(address.port)
      this.once('close', () => owned.delete(address.port))
    })
    return Reflect.apply(listen, this, args)
  })
  const connect = net.Socket.prototype.connect
  patch(net.Socket.prototype, 'connect', function (this: net.Socket, ...args: unknown[]) {
    // Node's public connect overload also normalizes arguments into [options, callback].
    const first = Array.isArray(args[0]) ? args[0][0] : args[0]
    const options =
      first && typeof first === 'object'
        ? (first as { host?: string; port?: number; path?: string })
        : undefined
    const host = options ? options.host : args[1]
    const port = options ? options.port : first
    if (options?.path || !portAllowed(host, port)) memoryOnlyError()
    return Reflect.apply(connect, this, args)
  })
  patch(tls, 'connect', memoryOnlyError)
  patch(dgram, 'createSocket', memoryOnlyError)
  for (const key of ['exec', 'execFile', 'execSync', 'execFileSync', 'fork', 'spawn', 'spawnSync'])
    patch(childProcess, key, memoryOnlyError)
  const writes = [
    'writeFile',
    'appendFile',
    'mkdir',
    'mkdtemp',
    'rm',
    'rmdir',
    'unlink',
    'rename',
    'copyFile',
    'cp',
    'truncate',
    'chmod',
    'chown',
    'lchown',
    'lchmod',
    'utimes',
    'lutimes',
    'link',
    'symlink',
    'createWriteStream',
  ]
  for (const key of writes) {
    patch(fs, key, memoryOnlyError)
    patch(fs, `${key}Sync`, memoryOnlyError)
    patch(promises, key, async () => memoryOnlyError())
  }
  for (const key of [
    'write',
    'writeSync',
    'writev',
    'writevSync',
    'ftruncate',
    'ftruncateSync',
    'fchmod',
    'fchmodSync',
    'fchown',
    'fchownSync',
  ]) {
    const original = (fs as unknown as Record<string, (...args: unknown[]) => unknown>)[key]
    if (original)
      patch(fs, key, (...args: unknown[]) => {
        if (args[0] !== 1 && args[0] !== 2) memoryOnlyError()
        return original(...args)
      })
  }
  function readOnlyOpen(target: object, key: string) {
    const original = (target as Record<string, (...args: unknown[]) => unknown>)[key]
    patch(target, key, (...args: unknown[]) => {
      const flags = args[1] ?? 'r'
      if (
        typeof flags === 'string'
          ? !['r', 'rs', 'sr'].includes(flags)
          : typeof flags !== 'number' ||
            (flags &
              (fs.constants.O_WRONLY |
                fs.constants.O_RDWR |
                fs.constants.O_CREAT |
                fs.constants.O_TRUNC |
                fs.constants.O_APPEND)) !==
              0
      )
        memoryOnlyError()
      return original!(...args)
    })
  }
  readOnlyOpen(fs, 'open')
  readOnlyOpen(fs, 'openSync')
  readOnlyOpen(promises, 'open')
  for (const [target, key] of [
    [fs, 'readFile'],
    [fs, 'readFileSync'],
    [promises, 'readFile'],
  ] as const) {
    const original = (target as unknown as Record<string, (...args: unknown[]) => unknown>)[key]!
    patch(target, key, (...args: unknown[]) => {
      if (
        /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|credentials[^\\/]*|[^\\/]+\.(?:pem|key|p12|pfx))$/i.test(
          String(args[0]),
        )
      )
        memoryOnlyError()
      return original(...args)
    })
  }
  patch(process, 'loadEnvFile', memoryOnlyError)
  // Do not inherit real service locations, credentials, SDK overrides or proxy routing.
  const environment = Object.entries(process.env).filter(([key]) =>
    /^(?:MCP_|TQX_|REDIS|MONGO|DATABASE|SQLITE|PG|MYSQL|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$|NODE_USE_ENV_PROXY$)/i.test(
      key,
    ),
  )
  for (const [key] of environment) delete process.env[key]
  restores.push(() => {
    for (const [key, value] of environment) process.env[key] = value
  })
  syncBuiltinESMExports()
  return {
    restore() {
      for (const restore of restores.toReversed()) restore()
      syncBuiltinESMExports()
    },
  }
}
