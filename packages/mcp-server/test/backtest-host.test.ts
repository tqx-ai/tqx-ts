import { afterEach, describe, expect, it, vi } from 'vitest'

import { connectHost, readToolResult, type HostEvents } from '../src/ui/qube/backtest/adapters/host'
import { REPORT_META } from '../src/research/backtest-report/contract'
import { fixture } from '../src/ui/qube/backtest/dev/fixtures'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
async function flush() {
  // Drain successive SDK transport and schema-validation microtasks, including under fake timers.
  await Array.from({ length: 12 }).reduce<Promise<void>>(
    (task) => task.then(() => {}),
    Promise.resolve(),
  )
}
async function setup() {
  const postMessage = vi.fn(),
    parent = { postMessage }
  const listeners = new Map<string, EventListener>()
  vi.stubGlobal('window', {
    parent,
    addEventListener: (name: string, handler: EventListener) => listeners.set(name, handler),
    removeEventListener: (name: string) => listeners.delete(name),
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const events: HostEvents = {
    input: vi.fn(),
    result: vi.fn(),
    context: vi.fn(),
    error: vi.fn(),
    teardown: vi.fn(),
  }
  const host = connectHost(events)
  async function receive(message: Record<string, unknown>, source: unknown = parent) {
    listeners.get('message')?.({
      source,
      data: { jsonrpc: '2.0', ...message },
    } as unknown as Event)
    await flush()
  }
  await flush()
  async function initialize(openLinks = true) {
    const initial = postMessage.mock.calls[0]![0]
    expect(initial).toMatchObject({
      method: 'ui/initialize',
      params: {
        protocolVersion: '2026-01-26',
        appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
      },
    })
    await receive({
      id: initial.id,
      result: {
        protocolVersion: '2026-01-26',
        hostInfo: { name: 'Test host', version: '1' },
        hostCapabilities: {
          serverTools: {},
          message: { text: {} },
          updateModelContext: {},
          ...(openLinks ? { openLinks: {} } : {}),
        },
        hostContext: { displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] },
      },
    })
  }
  return { host, events, receive, initialize, postMessage, listeners, parent }
}
const report = fixture('hk-loss')
const result = () => ({
  content: [],
  structuredContent: report.summary,
  _meta: { [REPORT_META]: report },
})

describe('official MCP Apps SDK adapter', () => {
  it('uses SDK openLink and handles host denial and disconnect', async () => {
    const s = await setup()
    await s.initialize()
    const url = 'https://www.tqx.ai/qube/strategies/0123456789abcdef01234567'
    const opened = s.host.openLink(url)
    await flush()
    let request = s.postMessage.mock.calls.at(-1)![0]
    expect(request).toMatchObject({ method: 'ui/open-link', params: { url } })
    await s.receive({ id: request.id, result: {} })
    await opened
    const denied = s.host.openLink(url)
    const rejection = expect(denied).rejects.toThrow('Host did not open the link')
    await flush()
    request = s.postMessage.mock.calls.at(-1)![0]
    await s.receive({ id: request.id, result: { isError: true } })
    await rejection
    s.host.dispose()
    await expect(s.host.openLink(url)).rejects.toThrow('does not support external links')
  })
  it('does not send link requests without the host capability', async () => {
    const s = await setup()
    await s.initialize(false)
    const sent = s.postMessage.mock.calls.length
    await expect(s.host.openLink('https://www.tqx.ai')).rejects.toThrow(
      'does not support external links',
    )
    expect(s.postMessage).toHaveBeenCalledTimes(sent)
    s.host.dispose()
  })
  it('registers handlers before initialization and accepts result-before-input notifications', async () => {
    const s = await setup()
    await s.receive({ method: 'ui/notifications/tool-result', params: result() })
    await s.receive({
      method: 'ui/notifications/tool-input',
      params: { arguments: { type: 'qube', runId: report.runId } },
    })
    expect(s.events.result).toHaveBeenCalledWith(report)
    expect(s.events.input).toHaveBeenCalledWith({ type: 'qube', runId: report.runId })
    await s.initialize()
    expect(s.postMessage).toHaveBeenLastCalledWith(
      { jsonrpc: '2.0', method: 'ui/notifications/initialized' },
      '*',
    )
    expect(s.events.context).toHaveBeenCalledWith(
      expect.objectContaining({ displayMode: 'inline' }),
      expect.objectContaining({ serverTools: {} }),
    )
    s.host.dispose()
  })
  it('reports natural height again when the host returns to inline without a content resize', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
    vi.stubGlobal('document', {
      body: {},
      documentElement: {
        getBoundingClientRect: () => ({ height: 1284 }),
        clientWidth: 720,
      },
    })
    const s = await setup()
    await s.initialize()
    frames.shift()!(0)
    const context = (displayMode: string) =>
      s.receive({
        method: 'ui/notifications/host-context-changed',
        params: { displayMode },
      })
    await context('fullscreen')
    expect(frames).toHaveLength(0)
    await context('inline')
    expect(frames).toHaveLength(1)
    frames.shift()!(0)
    expect(s.postMessage).toHaveBeenLastCalledWith(
      {
        jsonrpc: '2.0',
        method: 'ui/notifications/size-changed',
        params: { height: 1284, width: 720 },
      },
      '*',
    )
    await context('inline')
    await context('fullscreen')
    const sent = s.postMessage.mock.calls.length
    frames.shift()!(0)
    expect(s.postMessage).toHaveBeenCalledTimes(sent)
    s.host.dispose()
  })
  it('uses SDK source validation and merges partial host context updates', async () => {
    const s = await setup()
    await s.receive({ method: 'ui/notifications/tool-result', params: result() }, {})
    expect(s.events.result).not.toHaveBeenCalled()
    await s.initialize()
    await s.receive({ method: 'ui/notifications/host-context-changed', params: { theme: 'dark' } })
    expect(s.events.context).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: 'dark', displayMode: 'inline' }),
      expect.objectContaining({ serverTools: {} }),
    )
    s.host.dispose()
  })
  it('uses SDK tools/call and rejects mismatched TQX response identities', async () => {
    const s = await setup()
    await s.initialize()
    const promise = s.host.query({ type: 'qube', runId: report.runId, operation: 'overview' })
    await flush()
    const request = s.postMessage.mock.calls.at(-1)![0]
    expect(request).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'tqx_backtest_view_query',
        arguments: { type: 'qube', runId: report.runId, operation: 'overview' },
      },
    })
    await s.receive({ id: request.id, result: result() })
    await expect(promise).resolves.toEqual(report)
    const stale = structuredClone(report)
    stale.runId = stale.summary.runId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    const next = s.host.query({ type: 'qube', runId: report.runId, operation: 'overview' })
    const rejection = expect(next).rejects.toThrow('identity mismatch')
    await flush()
    await s.receive({
      id: s.postMessage.mock.calls.at(-1)![0].id,
      result: { content: [], _meta: { [REPORT_META]: stale } },
    })
    await rejection
    s.host.dispose()
  })
  it('acknowledges teardown before closing and rejects pending queries', async () => {
    vi.useFakeTimers()
    const s = await setup()
    await s.initialize()
    const pending = s.host.query({ type: 'qube', runId: report.runId, operation: 'overview' })
    const rejection = expect(pending).rejects.toThrow(/closed/i)
    await s.receive({ id: 'teardown', method: 'ui/resource-teardown', params: {} })
    expect(s.events.teardown).toHaveBeenCalledOnce()
    expect(s.postMessage).toHaveBeenLastCalledWith(
      { jsonrpc: '2.0', id: 'teardown', result: {} },
      '*',
    )
    await vi.advanceTimersByTimeAsync(0)
    await rejection
    expect(s.listeners.size).toBe(0)
    s.host.dispose()
    expect(s.events.teardown).toHaveBeenCalledOnce()
  })
  it('bounds SDK host waits and validates TQX payloads with Valibot', async () => {
    vi.useFakeTimers()
    const s = await setup()
    await s.initialize()
    const pending = s.host.query({ type: 'qube', runId: report.runId, operation: 'overview' })
    const rejection = expect(pending).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(20_000)
    await rejection
    expect(() => readToolResult({ isError: true })).toThrow('without starting a new backtest')
    await s.receive({
      method: 'ui/notifications/tool-result',
      params: { content: [], _meta: { [REPORT_META]: { unsafe: true } } },
    })
    expect(s.events.error).toHaveBeenCalledWith(expect.stringContaining('incompatible'))
    s.host.dispose()
  })
  it('uses SDK message/context APIs and cleans up on pagehide without a host teardown', async () => {
    const s = await setup()
    await s.initialize()
    const analysis = s.host.analyze({ runId: report.runId })
    await flush()
    let request = s.postMessage.mock.calls.at(-1)![0]
    expect(request.method).toBe('ui/update-model-context')
    await s.receive({ id: request.id, result: {} })
    request = s.postMessage.mock.calls.at(-1)![0]
    expect(request.method).toBe('ui/message')
    await s.receive({ id: request.id, result: {} })
    await analysis
    s.listeners.get('pagehide')!(new Event('pagehide'))
    await flush()
    expect(s.events.teardown).toHaveBeenCalledOnce()
    expect(s.listeners.size).toBe(0)
    await expect(
      s.host.query({ type: 'qube', runId: report.runId, operation: 'overview' }),
    ).rejects.toThrow('unavailable')
  })
})
