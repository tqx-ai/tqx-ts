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

describe('compact backtest card', () => {
  it('shows only the curve, four metrics and strategy identity, with analysis in the heading', () => {
    expect(root.querySelector('h1')!.textContent).toBe('Adaptive momentum')
    expect(root.querySelector('.plot svg')).not.toBeNull()
    expect(
      [...root.querySelectorAll('.metric-label')].map((node) =>
        node.firstChild?.textContent?.trim(),
      ),
    ).toEqual(['Total return', 'Annualized return', 'Sharpe ratio', 'Max drawdown'])
    expect(root.querySelector('.strategy-id')!.textContent).toContain(
      fixture('hk-loss').summary.strategyId,
    )
    expect(root.querySelector('.report-heading [data-action="analyze"]')).not.toBeNull()
    expect(
      root.querySelectorAll(
        'details, table, .query-controls, .secondary-metrics, [data-action="refresh"]',
      ),
    ).toHaveLength(0)
    const signature = root.querySelector('.report-footer')!
    expect(signature.textContent).toContain('Painted by TQX')
    expect(signature.querySelector('[aria-label="TQX"]')).not.toBeNull()
    expect(signature.closest('.report')).toBeNull()
    expect(root.querySelector('.report')!.nextElementSibling).toBe(signature)
    expect(actions.query).not.toHaveBeenCalled()
  })
  it('opens the server-provided details URL through the host and reports rejection', async () => {
    const next = fixture('hk-loss')
    next.strategyUrl = `https://web.example.test/qube/strategies/${next.summary.strategyId}`
    next.summary.fetchedAt = '2026-01-01T00:00:00Z'
    events.result(next)
    await settle()
    const link = root.querySelector<HTMLAnchorElement>('.strategy-link')!
    expect(link.href).toBe(next.strategyUrl)
    expect(link.textContent).toContain('View details')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(actions.openLink).toHaveBeenCalledWith(next.strategyUrl)
    vi.mocked(actions.openLink).mockRejectedValueOnce(new Error('Denied'))
    link.click()
    await settle()
    expect(root.querySelector('.alert')!.textContent).toContain('could not open this strategy')
  })
  it('keeps a normal external details link when the host cannot open links', async () => {
    events.context({ displayMode: 'inline' }, {})
    await settle()
    const link = root.querySelector<HTMLAnchorElement>('.strategy-link')!
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(actions.openLink).not.toHaveBeenCalled()
  })
  it('sends actual metrics and inspected samples to analysis', async () => {
    root
      .querySelector('svg')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    await settle()
    click('[data-action="analyze"]')
    expect(actions.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: fixture('hk-loss').runId,
        metrics: fixture('hk-loss').summary.metrics,
        selectedSample: expect.objectContaining({ series: 'strategy' }),
        complete: true,
      }),
    )
    events.context({ displayMode: 'inline' }, { message: {} })
    await settle()
    expect(root.querySelector('[data-action="analyze"]')).toBeNull()
  })
  it('accepts result-before-input for a new run and rejects stale results', async () => {
    const next = fixture('us-profit')
    next.runId = next.summary.runId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    next.summary.strategyId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
    next.strategyUrl = `https://other.example.test/qube/strategies/${next.summary.strategyId}`
    events.result(next)
    await settle()
    expect(root.querySelector('.metric-primary .metric-value')!.textContent).toBe('-5.06%')
    events.input({ type: 'qube', runId: next.runId })
    await settle()
    events.result(fixture('hk-loss'))
    await settle()
    expect(root.querySelector('.metric-primary .metric-value')!.textContent).toBe('21.90%')
    click('.strategy-link')
    expect(actions.openLink).toHaveBeenLastCalledWith(next.strategyUrl)
  })
  it.each(['missing', 'chart-error', 'failed', 'running'] as const)(
    'renders %s honestly',
    async (scenario) => {
      const next = fixture(scenario)
      next.runId = next.summary.runId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
      events.input({ type: 'qube', runId: next.runId })
      events.result(next)
      await settle()
      if (scenario === 'missing')
        expect([...root.querySelectorAll('.metric-value')].map((node) => node.textContent)).toEqual(
          ['—', '—', '—', '—'],
        )
      if (scenario === 'chart-error') expect(root.querySelector('.chart-empty')).not.toBeNull()
      if (scenario === 'failed' || scenario === 'running')
        expect(root.querySelector('.alert')!.textContent).toContain(scenario)
    },
  )
  it('preserves host constraints and cleans up on teardown', async () => {
    events.context(
      {
        containerDimensions: { maxWidth: 560, maxHeight: 600 },
        safeAreaInsets: { top: 8, right: 4, bottom: 6, left: 2 },
      },
      {},
    )
    await settle()
    expect(document.documentElement.style.maxHeight).toBe('600px')
    expect(document.documentElement.style.getPropertyValue('--safe-top')).toBe('8px')
    events.teardown()
    await settle()
    expect(root.querySelector('[data-action="analyze"]')).toBeNull()
    app.unmount()
    expect(actions.dispose).toHaveBeenCalledOnce()
    expect(document.documentElement.style.maxHeight).toBe('')
  })
})
