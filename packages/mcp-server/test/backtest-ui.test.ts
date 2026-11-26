// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import type { App as VueApp } from 'vue'

import App from '../src/ui/qube/backtest/App.vue'
import type { HostActions, HostEvents } from '../src/ui/qube/backtest/adapters/host'
import type { QueryResult } from '../src/research/backtest-report/contract'
import { fixture } from '../src/ui/qube/backtest/dev/fixtures'

const bridge = vi.hoisted(() => ({ connect: vi.fn() }))
vi.mock('../src/ui/qube/backtest/adapters/host', () => ({ connectHost: bridge.connect }))

let events: HostEvents, app: VueApp, root: HTMLElement, actions: HostActions
const pending: Array<{ resolve(value: QueryResult): void; reject(reason: Error): void }> = []
async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
function click(selector: string) {
  root.querySelector<HTMLElement>(selector)!.click()
}
function openResults() {
  const details = root.querySelector<HTMLDetailsElement>('.results')!
  details.open = true
  details.dispatchEvent(new Event('toggle'))
}
function change(selector: string, value: string) {
  const element = root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!
  element.value = value
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input'))
}
function page(field: 'trades' | 'symbol_performance', symbol: string): QueryResult {
  return {
    schemaVersion: 1,
    type: 'qube',
    runId: fixture('hk-loss').runId,
    operation: 'result',
    result: {
      field,
      rows: [{ symbol, price: '12.3456789012345' }],
      offset: 0,
      limit: 5,
      total: 1,
      hasMore: false,
      partial: false,
    },
  }
}
beforeEach(async () => {
  pending.length = 0
  actions = {
    query: vi.fn(
      () => new Promise<QueryResult>((resolve, reject) => pending.push({ resolve, reject })),
    ),
    display: vi.fn(async () => {}),
    analyze: vi.fn(async () => {}),
    openLink: vi.fn(async () => {}),
    dispose: vi.fn(),
  }
  bridge.connect.mockImplementation((handlers: HostEvents) => {
    events = handlers
    return actions
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(App) })
  app.mount(root)
  events.context(
    { displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] },
    { serverTools: {}, message: { text: {} }, openLinks: {} },
  )
  events.input({ type: 'qube', runId: fixture('hk-loss').runId })
  events.result(fixture('hk-loss'))
  await settle()
})
afterEach(() => {
  app.unmount()
  root.remove()
  vi.unstubAllGlobals()
})

describe('Vue backtest report lifecycle', () => {
  it('opens the current strategy through the host and reports a rejected link', async () => {
    const url = 'https://www.tqx.ai/qube/strategies/0123456789abcdef01234567'
    const link = root.querySelector<HTMLAnchorElement>('.strategy-link')!
    expect(link.href).toBe(url)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(actions.openLink).toHaveBeenCalledWith(url)
    vi.mocked(actions.openLink).mockRejectedValueOnce(new Error('Denied'))
    link.click()
    await settle()
    expect(root.querySelector('.alert')!.textContent).toContain('could not open this strategy')
    const next = fixture('us-profit')
    next.runId = next.summary.runId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    next.summary.strategyId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
    events.input({ type: 'qube', runId: next.runId })
    events.result(next)
    await settle()
    click('.strategy-link')
    expect(actions.openLink).toHaveBeenLastCalledWith(
      'https://www.tqx.ai/qube/strategies/bbbbbbbbbbbbbbbbbbbbbbbb',
    )
    events.teardown()
    await settle()
    expect(root.querySelector('.strategy-link')).toBeNull()
  })
  it('keeps the strategy ID as text when external links are unsupported', async () => {
    events.context({ displayMode: 'inline' }, { serverTools: {} })
    await settle()
    expect(root.querySelector('.strategy-link')).toBeNull()
    expect(root.querySelector('.parameters')!.textContent).toContain(
      fixture('hk-loss').summary.strategyId,
    )
    expect(actions.openLink).not.toHaveBeenCalled()
  })
  it('uses standard text-message capability rather than the host name', async () => {
    events.context(
      { displayMode: 'inline', userAgent: 'any-host' },
      { serverTools: {}, message: {} },
      { name: 'Antigravity', version: '99' },
    )
    await settle()
    expect(root.querySelector('[data-action="analyze"]')).toBeNull()
    events.context(
      { displayMode: 'inline', userAgent: 'another-host' },
      { serverTools: {}, message: { text: {} } },
      { name: 'Other host', version: '1' },
    )
    await settle()
    click('[data-action="analyze"]')
    expect(actions.analyze).toHaveBeenCalledOnce()
  })
  it('accepts a new run result before its input in the same mounted view and rejects the old run', async () => {
    openResults()
    await settle()
    const next = fixture('us-profit')
    next.runId = next.summary.runId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    events.result(next)
    await settle()
    expect(root.querySelector('h1')!.textContent).toBe('Adaptive momentum')
    events.input({ type: 'qube', runId: next.runId })
    await settle()
    expect(root.querySelector('.metric-primary .metric-value')!.textContent).toBe('21.90%')
    expect(root.querySelector<HTMLDetailsElement>('.results')!.open).toBe(false)
    pending[0]!.resolve(page('trades', 'OLD RUN'))
    events.result(fixture('hk-loss'))
    await settle()
    expect(root.querySelector('.metric-primary .metric-value')!.textContent).toBe('21.90%')
    expect(root.textContent).not.toContain('OLD RUN')
    click('[data-action="refresh"]')
    expect(actions.query).toHaveBeenLastCalledWith({
      type: 'qube',
      runId: next.runId,
      operation: 'overview',
    })
  })
  it('clears host sizing constraints on context changes and unmount', async () => {
    events.context(
      { displayMode: 'inline', containerDimensions: { width: 720, maxHeight: 800 } },
      {},
    )
    await settle()
    expect(document.documentElement.style.maxHeight).toBe('800px')
    events.context(
      { displayMode: 'fullscreen', containerDimensions: { width: 960, height: 640 } },
      {},
    )
    await settle()
    expect(document.documentElement.style.height).toBe('100vh')
    expect(document.documentElement.style.maxHeight).toBe('')
    events.context({ displayMode: 'inline', containerDimensions: {} }, {})
    await settle()
    expect(document.documentElement.style.height).toBe('')
    events.context({ containerDimensions: { maxWidth: 560, maxHeight: 600 } }, {})
    await settle()
    app.unmount()
    expect(document.documentElement.style.maxWidth).toBe('')
    expect(document.documentElement.style.maxHeight).toBe('')
  })
  it('initializes the overview to the full sample range', () => {
    const end = root.querySelector<HTMLInputElement>('[name="range-end"]')!
    expect(end.max).toBe('179')
    expect(end.value).toBe('179')
  })
  it('adapts result pagination to host-controlled mode changes without requesting a mode', async () => {
    openResults()
    await settle()
    expect(actions.query).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 5 }))
    events.context({ displayMode: 'fullscreen' }, { serverTools: {} })
    await settle()
    expect(root.querySelector('main')!.dataset.mode).toBe('fullscreen')
    expect(actions.query).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 20 }))
    pending[0]!.resolve(page('trades', 'STALE INLINE'))
    await settle()
    expect(root.querySelector('table')!.textContent).not.toContain('STALE INLINE')
    events.context({ displayMode: 'inline' }, { serverTools: {} })
    await settle()
    expect(root.querySelector('main')!.dataset.mode).toBe('inline')
    expect(actions.query).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 5 }))
    expect(actions.display).not.toHaveBeenCalled()
  })
  it('rejects stale refreshes after switching runs and clears missing values', async () => {
    click('[data-action="refresh"]')
    const next = fixture('missing')
    next.runId = next.summary.runId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    events.input({ type: 'qube', runId: next.runId })
    events.result(next)
    await settle()
    pending[0]!.resolve(fixture('hk-loss'))
    await settle()
    expect([...root.querySelectorAll('.metric-value')].map((node) => node.textContent)).toEqual([
      '—',
      '—',
      '—',
      '—',
    ])
    expect(root.querySelector<HTMLButtonElement>('[data-action="return"]')!.disabled).toBe(true)
    click('[data-action="refresh"]')
    expect(actions.query).toHaveBeenLastCalledWith({
      type: 'qube',
      runId: next.runId,
      operation: 'overview',
    })
  })
  it('keeps the newest result section when queries finish out of order', async () => {
    openResults()
    await settle()
    change('[name="field"]', 'symbol_performance')
    await settle()
    expect(pending).toHaveLength(2)
    pending[1]!.resolve(page('symbol_performance', 'LATEST'))
    await settle()
    pending[0]!.resolve(page('trades', 'STALE'))
    await settle()
    expect(root.querySelector('table')!.textContent).toContain('LATEST')
    expect(root.querySelector('table')!.textContent).not.toContain('STALE')
    expect(root.querySelector('th')!.textContent).toBe('Symbol')
  })
  it('preserves backend decimal strings and clears rows when a search fails', async () => {
    openResults()
    await settle()
    pending[0]!.resolve(page('trades', '<unsafe>'))
    await settle()
    expect(root.querySelector('table')!.textContent).toContain('12.3456789012345')
    expect(root.querySelector('table unsafe')).toBeNull()
    change('[name="keyword"]', 'new search')
    click('.search-form .secondary')
    await settle()
    expect(root.querySelectorAll('tbody tr')).toHaveLength(0)
    pending[1]!.reject(new Error('Unavailable'))
    await settle()
    expect(root.querySelectorAll('tbody tr')).toHaveLength(0)
    expect(root.querySelector('.result-status')!.textContent).toBe('Unavailable')
  })
  it.each(['button', 'Enter'])(
    'queries chart dates and result keywords through %s without native submission',
    async (trigger) => {
      const submit = vi.fn()
      root.addEventListener('submit', submit)
      change('[name="from"]', '2025-02-01')
      change('[name="to"]', '2025-03-01')
      await settle()
      if (trigger === 'button') click('.range-form .secondary')
      else
        root
          .querySelector('[name="to"]')!
          .dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
          )
      await settle()
      expect(actions.query).toHaveBeenLastCalledWith(
        expect.objectContaining({
          operation: 'chart',
          from: '2025-02-01',
          to: '2025-03-01',
        }),
      )
      openResults()
      await settle()
      change('[name="keyword"]', '00700.HK')
      await settle()
      if (trigger === 'button') click('.search-form .secondary')
      else
        root
          .querySelector('[name="keyword"]')!
          .dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
          )
      await settle()
      expect(actions.query).toHaveBeenLastCalledWith(
        expect.objectContaining({
          operation: 'result',
          keyword: '00700.HK',
          offset: 0,
        }),
      )
      expect(submit).not.toHaveBeenCalled()
    },
  )
  it('does not let an old chart response overwrite Reset', async () => {
    click('.range-form .secondary')
    await settle()
    expect(pending).toHaveLength(1)
    click('[data-action="reset"]')
    pending[0]!.resolve({
      schemaVersion: 1,
      type: 'qube',
      runId: fixture('hk-loss').runId,
      operation: 'chart',
      chart: fixture('single').chart!,
    })
    await settle()
    expect(root.querySelector('.chart-note')!.textContent).toContain('180 plotted samples')
  })
  it('disables queries after teardown and releases the host on unmount', async () => {
    click('[data-action="refresh"]')
    events.teardown()
    pending[0]!.resolve(fixture('us-profit'))
    await settle()
    expect(root.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.disabled).toBe(true)
    expect(root.querySelector('h1')!.textContent).toBe('Adaptive momentum')
    app.unmount()
    expect(actions.dispose).toHaveBeenCalledOnce()
  })
})
