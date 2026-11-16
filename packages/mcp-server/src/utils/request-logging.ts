import type { McpServer, Server } from '@modelcontextprotocol/server'
import { isJSONRPCResponse } from '@modelcontextprotocol/server'
import { Hono } from 'hono'

import { getLogger, logContext, logLabel } from './logger'

const httpLog = getLogger('http')
const protocolLog = getLogger('protocol')

/** Normalize HTTP paths in logs without retaining arbitrary unmatched routes. */
export function logPath(path: string): string {
  if (path === '/mcp') return '/mcp'
  if (path.startsWith('/.well-known/')) return '/.well-known/[metadata]'
  return '[unmatched]'
}

export function createLoggedApp() {
  const app = new Hono()
  app.use('*', async (c, next) => {
    if (c.req.path === '/healthz') return next()
    return logContext.run({ requestId: crypto.randomUUID() }, async () => {
      const startedAt = performance.now()
      const fields = {
        method: c.req.method,
        path: logPath(c.req.path),
      }
      c.header('X-Request-ID', logContext.getStore()!.requestId)
      httpLog.info({ event: 'mcp.http_received', ...fields })
      try {
        await next()
      } finally {
        const status = c.error ? 500 : c.res.status
        const level = status >= 500 ? 'error' : 'info'
        httpLog[level]({
          event: 'mcp.http_completed',
          ...fields,
          status,
          durationMs: Math.round(performance.now() - startedAt),
        })
      }
    })
  })
  return app
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/** Read only protocol labels from the SDK's bounded, already parsed body. */
export function recordMcpRequest(body: unknown, protocolVersion?: string) {
  const context = logContext.getStore()
  if (!context) return
  const message = object(body)
  const params = object(message.params)
  const meta = object(params['_meta'])
  const client = object(meta['io.modelcontextprotocol/clientInfo'] ?? params.clientInfo)
  Object.assign(context, {
    rpcId: typeof message.id === 'number' ? message.id : logLabel(message.id),
    rpcMethod: logLabel(message.method),
    targetName: logLabel(params.name),
    protocolVersion: logLabel(
      meta['io.modelcontextprotocol/protocolVersion'] ?? params.protocolVersion ?? protocolVersion,
    ),
    clientName: logLabel(client.name),
    clientVersion: logLabel(client.version),
  })
  protocolLog.info({ event: 'mcp.request_received' })
}

/** Observe terminal SDK messages without consuming or buffering HTTP/SSE bodies. */
export function observeMcpServer<T extends McpServer | Server>(server: T): T {
  const context = logContext.getStore()
  const startedAt = performance.now()
  const connect = server.connect.bind(server)
  server.connect = async (transport) => {
    const send = transport.send.bind(transport)
    let completed = false
    const complete = (result: string, errorCode?: number) => {
      if (completed || context?.rpcId === undefined) return
      completed = true
      logContext.run(context, () => {
        const level = result === 'success' ? 'info' : 'warn'
        protocolLog[level]({
          event: 'mcp.request_completed',
          result,
          errorCode,
          durationMs: Math.round(performance.now() - startedAt),
        })
      })
    }
    transport.send = async (message, options) => {
      if (isJSONRPCResponse(message)) {
        if ('error' in message) complete('protocol_error', message.error.code)
        else complete(message.result.isError === true ? 'tool_error' : 'success')
      }
      await send(message, options)
    }
    await connect(transport)
    const close = transport.onclose
    // The SDK Transport exposes callback properties rather than EventTarget methods.
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    transport.onclose = () => {
      complete('cancelled')
      close?.()
    }
  }
  return server
}
