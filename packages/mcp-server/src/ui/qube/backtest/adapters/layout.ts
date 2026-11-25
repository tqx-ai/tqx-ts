import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps'

const axes = ['width', 'height'] as const
function dimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

// Follow the standard fixed / flexible / unbounded axes independently of display mode.
export function applyHostLayout(context: McpUiHostContext) {
  const style = document.documentElement.style
  const bounds: Partial<Record<'width' | 'height' | 'maxWidth' | 'maxHeight', number>> | undefined =
    context.containerDimensions
  for (const axis of axes) {
    const maximum = axis === 'width' ? 'maxWidth' : 'maxHeight'
    const fixed = bounds && axis in bounds ? bounds[axis] : undefined
    const limit = bounds && maximum in bounds ? bounds[maximum] : undefined
    style[axis] = dimension(fixed) ? (axis === 'width' ? '100%' : '100vh') : ''
    style[maximum] = !dimension(fixed) && dimension(limit) ? `${limit}px` : ''
  }
}

export function measureHostSize(context: McpUiHostContext) {
  const bounds: Partial<Record<'width' | 'height' | 'maxWidth' | 'maxHeight', number>> | undefined =
    context.containerDimensions
  const rect = document.documentElement.getBoundingClientRect()
  const size: { width?: number; height?: number } = {}
  for (const axis of axes) {
    const maximum = axis === 'width' ? 'maxWidth' : 'maxHeight'
    const fixed = bounds && axis in bounds ? bounds[axis] : undefined
    if (dimension(fixed)) continue
    const limit = bounds && maximum in bounds ? bounds[maximum] : undefined
    const natural = axis === 'width' ? document.documentElement.clientWidth : rect.height
    size[axis] = Math.max(
      0,
      dimension(limit) ? Math.min(Math.ceil(natural), Math.floor(limit)) : Math.ceil(natural),
    )
  }
  return size
}

export function clearHostLayout() {
  const style = document.documentElement.style
  for (const name of ['width', 'height', 'max-width', 'max-height']) style.removeProperty(name)
}
