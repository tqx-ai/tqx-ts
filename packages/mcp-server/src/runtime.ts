import { readFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { type ApplicationOptions, createApplication } from './app'
import type { Config } from './config'

export async function startService(config: Config, options: ApplicationOptions = {}) {
  const application = createApplication(config, options)
  const server =
    config.tlsCertFile && config.tlsKeyFile
      ? createHttpsServer(
          {
            cert: await readFile(config.tlsCertFile),
            key: await readFile(config.tlsKeyFile),
            minVersion: 'TLSv1.2',
          },
          application.app,
        )
      : createHttpServer(application.app)
  server.requestTimeout = config.requestTimeoutMs
  server.headersTimeout = config.headersTimeoutMs
  server.keepAliveTimeout = config.keepAliveTimeoutMs
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(config.port, config.host)
  })
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => {
    if (!closing) {
      application.beginShutdown()
      closing = new Promise<void>((resolve) => {
        const force = setTimeout(() => {
          server.closeAllConnections()
          void application.closeRequests()
        }, config.shutdownTimeoutMs)
        force.unref()
        server.close(() => {
          clearTimeout(force)
          void application.closeRequests().then(resolve)
        })
        server.closeIdleConnections()
      })
    }
    return closing
  }
  return {
    server,
    close,
    application,
    address: server.address() as AddressInfo,
  }
}

export function installShutdownHandlers(
  close: () => Promise<void>,
  report: (message: string) => void = console.error,
) {
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    report('MCP service shutting down')
    void close()
      .catch(() => {
        report('MCP shutdown failed')
        process.exitCode = 1
      })
      .finally(() => {
        process.off('SIGINT', stop)
        process.off('SIGTERM', stop)
      })
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  return () => {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}
