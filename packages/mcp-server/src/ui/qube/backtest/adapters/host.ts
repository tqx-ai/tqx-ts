import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps'
import type { McpUiHostCapabilities, McpUiHostContext } from '@modelcontextprotocol/ext-apps'
import * as v from 'valibot'

import {
  REPORT_META,
  queryResultSchema,
  viewInput,
} from '../../../../research/backtest-report/contract'
import type { Identity, Query, QueryResult } from '../../../../research/backtest-report/contract'

const object = v.record(v.string(), v.unknown())
const requestOptions = { timeout: 20_000, maxTotalTimeout: 20_000 }
export type HostContext = McpUiHostContext
export type HostCapabilities = McpUiHostCapabilities
export interface HostActions {
  query(input: Query): Promise<QueryResult>
  display(mode: 'inline' | 'fullscreen'): Promise<void>
  analyze(context: Record<string, unknown>): Promise<void>
  openLink(url: string): Promise<void>
  dispose(): void
}
export interface HostEvents {
  input(identity: Identity): void
  result(data: QueryResult): void
  context(context: HostContext, capabilities: HostCapabilities): void
  error(message: string): void
  teardown(): void
}

export function connectHost(events: HostEvents): HostActions {
  const app = new App(
    { name: 'TQX Qube Backtest', version: '1.0.0' },
    { availableDisplayModes: ['inline', 'fullscreen'] },
    { autoResize: false, strict: true },
  )
  let active = true,
    ready = false,
    resizeFrame = 0
  let teardownTimer: ReturnType<typeof setTimeout> | undefined
  function shutdown() {
    if (!active) return
    active = ready = false
    observer?.disconnect()
    cancelAnimationFrame(resizeFrame)
    clearTimeout(teardownTimer)
    window.removeEventListener('pagehide', dispose)
    events.teardown()
  }
  function dispose() {
    clearTimeout(teardownTimer)
    shutdown()
    void app.close().catch(() => {})
  }
  function publishContext() {
    if (!active) return
    events.context(app.getHostContext() ?? {}, app.getHostCapabilities() ?? {})
    notifySize()
  }
  function accept(callback: () => void) {
    if (!active) return
    try {
      callback()
    } catch {
      events.error('Report data unavailable or incompatible. Refresh this report.')
    }
  }
  // Protocol lifecycle and routing belong to the SDK; Valibot checks only TQX data.
  app.ontoolinput = (params) => accept(() => events.input(v.parse(viewInput, params.arguments)))
  app.ontoolresult = (params) => accept(() => events.result(readToolResult(params)))
  app.ontoolcancelled = () => {
    if (active) events.error('Tool call cancelled. Previously loaded data is retained.')
  }
  app.onhostcontextchanged = () => {
    if (ready) publishContext()
  }
  app.onteardown = () => {
    shutdown()
    // Let the SDK acknowledge the request before closing its transport.
    teardownTimer = setTimeout(dispose, 0)
    return {}
  }
  // eslint-disable-next-line unicorn/prefer-add-event-listener -- MCP Protocol exposes onclose, not a DOM event.
  app.onclose = () => {
    if (ready) shutdown()
  }
  // eslint-disable-next-line unicorn/prefer-add-event-listener -- MCP Protocol exposes onerror, not a DOM event.
  app.onerror = () => {
    if (active) events.error('Host communication failed. Refresh this report.')
  }
  // Layout policy: inline grows naturally; fullscreen keeps its host-sized viewport.
  function notifySize() {
    if (!observer || !active || !ready || app.getHostContext()?.displayMode === 'fullscreen') return
    cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => {
      if (!active || !ready || app.getHostContext()?.displayMode === 'fullscreen') return
      void app
        .sendSizeChanged({
          height: Math.ceil(document.documentElement.getBoundingClientRect().height),
          width: Math.ceil(document.documentElement.clientWidth),
        })
        .catch(() => {})
    })
  }
  const observer =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(notifySize)
  window.addEventListener('pagehide', dispose)
  if (window.parent === window) {
    events.error(
      'Open this report in an MCP Apps host. For local preview, use the development workbench.',
    )
  } else {
    void app
      .connect(new PostMessageTransport(window.parent, window.parent), requestOptions)
      .then(() => {
        if (!active) return
        ready = true
        publishContext()
        observer?.observe(document.body)
      })
      .catch(() => {
        if (active) events.error('Unable to connect to the MCP Apps host.')
        dispose()
      })
  }
  return {
    async query(input) {
      if (!active || !ready || !app.getHostCapabilities()?.serverTools)
        throw new Error('Host connection unavailable')
      const result = await app.callServerTool(
        {
          name: 'tqx_backtest_view_query',
          arguments: input,
        },
        requestOptions,
      )
      const data = readToolResult(result)
      if (
        data.type !== input.type ||
        data.runId !== input.runId ||
        data.operation !== input.operation
      )
        throw new Error('Report response identity mismatch')
      return data
    },
    async display(mode) {
      if (!active || !ready || !app.getHostContext()?.availableDisplayModes?.includes(mode))
        throw new Error('Display mode unavailable')
      await app.requestDisplayMode({ mode }, requestOptions)
    },
    async openLink(url) {
      if (!active || !ready || !app.getHostCapabilities()?.openLinks)
        throw new Error('This host does not support external links')
      const result = await app.openLink({ url }, requestOptions)
      if (result.isError) throw new Error('Host did not open the link')
    },
    async analyze(context) {
      if (!active || !ready || !app.getHostCapabilities()?.message)
        throw new Error('This host does not support conversation messages')
      if (app.getHostCapabilities()?.updateModelContext)
        await app.updateModelContext({ structuredContent: context }, requestOptions)
      const result = await app.sendMessage(
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this Qube backtest view using the actual metrics and completeness flags: ${JSON.stringify(context)}`,
            },
          ],
        },
        requestOptions,
      )
      if (result.isError) throw new Error('Host did not deliver the analysis request')
    },
    dispose,
  }
}

export function readToolResult(result: Record<string, unknown>): QueryResult {
  if (result.isError) throw new Error('Report query failed. Retry without starting a new backtest.')
  const meta = v.parse(object, result['_meta'])
  const value = meta[REPORT_META]
  if (JSON.stringify(value)?.length > 600_000)
    throw new Error('Report response exceeds the UI limit')
  const data = v.parse(queryResultSchema, value)
  if (
    data.operation === 'overview' &&
    (data.summary.type !== data.type || data.summary.runId !== data.runId)
  )
    throw new Error('Report identity mismatch')
  return data
}
