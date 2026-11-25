// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps'

import {
  applyHostLayout,
  clearHostLayout,
  measureHostSize,
} from '../src/ui/qube/backtest/adapters/layout'

afterEach(() => {
  clearHostLayout()
  vi.restoreAllMocks()
})

describe('standard host container constraints', () => {
  it.each([
    [{ width: 720 }, { height: 1285 }],
    [
      { maxWidth: 560, maxHeight: 800 },
      { width: 560, height: 800 },
    ],
    [{ width: 720, height: 640 }, {}],
    [{ maxWidth: 560, height: 640 }, { width: 560 }],
    [{ width: 720, maxHeight: 800.5 }, { height: 800 }],
    [{ maxHeight: 0 }, { width: 720, height: 0 }],
    [{}, { width: 720, height: 1285 }],
  ] satisfies Array<
    [McpUiHostContext['containerDimensions'], { width?: number; height?: number }]
  >)('negotiates flexible axes only for %j', (containerDimensions, expected) => {
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue({
      height: 1284.5,
    } as DOMRect)
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(720)
    for (const displayMode of ['inline', 'fullscreen'] as const)
      expect(measureHostSize({ displayMode, containerDimensions })).toEqual(expected)
  })
  it('uses viewport dimensions for fixed axes, bounds flexible axes and releases previous constraints', () => {
    const style = document.documentElement.style
    applyHostLayout({ containerDimensions: { maxWidth: 560, maxHeight: 800 } })
    expect(style.maxWidth).toBe('560px')
    expect(style.maxHeight).toBe('800px')
    applyHostLayout({ containerDimensions: { width: 720, height: 640 } })
    expect(style.width).toBe('100%')
    expect(style.height).toBe('100vh')
    expect(style.maxWidth).toBe('')
    expect(style.maxHeight).toBe('')
    applyHostLayout({})
    expect(style.width).toBe('')
    expect(style.height).toBe('')
  })
})
