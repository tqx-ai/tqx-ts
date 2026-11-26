import type { ChartData } from '../../../research/backtest-report/contract'

type Point = ChartData['points'][number]
const NS = 'http://www.w3.org/2000/svg'
function svg(tag: string, attributes: Record<string, string | number>) {
  const element = document.createElementNS(NS, tag)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value))
  return element
}

export function nearestSample(points: readonly Point[], timestamp: number): number {
  if (!points.length) return -1
  let low = 0,
    high = points.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (Date.parse(points[mid]!.ts) < timestamp) low = mid + 1
    else high = mid
  }
  return low > 0 &&
    Math.abs(Date.parse(points[low - 1]!.ts) - timestamp) <=
      Math.abs(Date.parse(points[low]!.ts) - timestamp)
    ? low - 1
    : low
}
export function pointValue(equity: number | null, initial: number | null, returns: boolean) {
  return equity === null
    ? null
    : returns
      ? initial !== null && initial > 0
        ? equity / initial - 1
        : null
      : equity
}

export interface ChartOptions {
  initial: number | null
  returns: boolean
  strategy: boolean
  benchmark: boolean
  markers: boolean
  format(value: number | null, returns: boolean): string
  time(value: string): string
  inspect(point: (Point & { series: 'strategy' | 'benchmark' }) | null): void
  trade(day: string): void
}

export function renderChart(container: HTMLElement, data: ChartData, options: ChartOptions) {
  container.replaceChildren()
  const selected = [
    ...(options.strategy ? [{ points: data.points, benchmark: false }] : []),
    ...(options.benchmark && data.benchmark
      ? [{ points: data.benchmark.points, benchmark: true }]
      : []),
  ]
  const inspectionSeries = selected.find((series) => series.points.length)
  const points = inspectionSeries?.points ?? []
  const all = selected
    .flatMap((series) =>
      series.points.map((p) => pointValue(p.equity, options.initial, options.returns)),
    )
    .filter((n): n is number => n !== null)
  if (!points.length || !all.length) {
    const empty = document.createElement('p')
    empty.className = 'chart-empty'
    empty.textContent = selected.length
      ? 'No curve values available in this range.'
      : 'Select a series to show its curve.'
    container.append(empty)
    return () => {}
  }
  const width = Math.max(260, container.clientWidth),
    height = width < 500 ? 260 : 300,
    left = 8,
    right = 62,
    top = 24,
    bottom = 40
  const times = selected.flatMap((series) => series.points.map((point) => Date.parse(point.ts)))
  const minTime = Math.min(...times),
    maxTime = Math.max(...times)
  let min = Math.min(...all),
    max = Math.max(...all)
  const pad = (max - min) * 0.18 || Math.abs(max) * 0.02 || 1
  min -= pad
  max += pad
  const x = (ts: string) =>
    left +
    (maxTime === minTime ? 0.5 : (Date.parse(ts) - minTime) / (maxTime - minTime)) *
      (width - left - right)
  const y = (value: number) => top + ((max - value) / (max - min)) * (height - top - bottom)
  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'group',
    tabindex: 0,
    'aria-label': 'Backtest curve. Use left and right arrows to inspect returned samples.',
  })
  root.classList.add('equity-chart')
  for (let i = 0; i <= 4; i++) {
    const value = min + ((max - min) * i) / 4
    root.append(
      svg('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), class: 'grid-line' }),
    )
    const label = svg('text', { x: width - right + 16, y: y(value) + 4, class: 'axis-label' })
    label.textContent = options.returns
      ? `${(value * 100).toFixed(1)}%`
      : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(
          value,
        )
    root.append(label)
  }
  const ticks = Math.min(width < 500 ? 2 : 4, points.length)
  for (let i = 0; i < ticks; i++) {
    const index = Math.round((i * (points.length - 1)) / Math.max(1, ticks - 1))
    const point = points[index]!
    const label = svg('text', {
      x: x(point.ts),
      y: height - 8,
      'text-anchor': i === 0 ? 'start' : i === ticks - 1 ? 'end' : 'middle',
      class: 'axis-label',
    })
    label.textContent = options.time(point.ts).slice(0, 10)
    root.append(label)
  }
  for (const series of selected) {
    let path = '',
      open = false
    for (const point of series.points) {
      const value = pointValue(point.equity, options.initial, options.returns)
      if (value === null) {
        open = false
        continue
      }
      path += `${open && !point.breakBefore ? 'L' : 'M'}${x(point.ts).toFixed(2)},${y(value).toFixed(2)} `
      open = true
    }
    root.append(
      svg('path', {
        d: path,
        class: series.benchmark ? 'benchmark-line' : 'strategy-line',
        fill: 'none',
        'vector-effect': 'non-scaling-stroke',
      }),
    )
    if (series.points.filter((p) => p.equity !== null).length === 1) {
      const point = series.points.find((p) => p.equity !== null)!
      root.append(
        svg('circle', {
          cx: x(point.ts),
          cy: y(pointValue(point.equity, options.initial, options.returns)!),
          r: 4,
          class: 'curve-dot',
        }),
      )
    }
  }
  if (options.markers)
    for (const day of data.tradeDays) {
      if (!day.total || Date.parse(day.ts) < minTime || Date.parse(day.ts) > maxTime) continue
      const marker = svg('circle', {
        cx: x(day.ts),
        cy: height - bottom + 12,
        r: 4,
        class: day.buyCount ? 'trade-buy' : 'trade-sell',
        tabindex: 0,
        role: 'button',
        'aria-label': `${day.day}: ${day.buyCount} buys, ${day.sellCount} sells`,
      })
      const open = () => options.trade(day.day)
      marker.addEventListener('click', open)
      marker.addEventListener('keydown', (event) => {
        if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          open()
        }
      })
      root.append(marker)
    }
  const crosshair = svg('line', {
    x1: 0,
    x2: 0,
    y1: top,
    y2: height - bottom,
    class: 'crosshair',
    visibility: 'hidden',
  })
  const dot = svg('circle', { cx: 0, cy: 0, r: 4, class: 'curve-dot', visibility: 'hidden' })
  root.append(crosshair, dot)
  const tooltip = document.createElement('div')
  tooltip.className = 'chart-tooltip'
  tooltip.hidden = true
  tooltip.setAttribute('role', 'status')
  tooltip.setAttribute('aria-live', 'off')
  const date = document.createElement('div'),
    primary = document.createElement('strong'),
    secondary = document.createElement('span')
  tooltip.append(date, primary, secondary)
  let index = 0,
    pinned = false
  function hide() {
    tooltip.hidden = true
    crosshair.setAttribute('visibility', 'hidden')
    dot.setAttribute('visibility', 'hidden')
    options.inspect(null)
  }
  function show(next: number) {
    index = Math.max(0, Math.min(points.length - 1, next))
    const point = points[index]!,
      value = pointValue(point.equity, options.initial, options.returns)
    date.textContent = options.time(point.ts)
    primary.textContent = options.format(value, options.returns)
    secondary.textContent = options.initial
      ? options.format(
          pointValue(point.equity, options.initial, !options.returns),
          !options.returns,
        )
      : ''
    tooltip.hidden = false
    const pixelX = (x(point.ts) / width) * container.clientWidth
    tooltip.style.left = `${Math.max(4, Math.min(container.clientWidth - tooltip.offsetWidth - 4, pixelX + 16))}px`
    tooltip.style.top = '16px'
    for (const name of ['x1', 'x2']) crosshair.setAttribute(name, String(x(point.ts)))
    crosshair.setAttribute('visibility', 'visible')
    dot.setAttribute('cx', String(x(point.ts)))
    dot.setAttribute('cy', String(value === null ? top : y(value)))
    dot.setAttribute('visibility', value === null ? 'hidden' : 'visible')
    options.inspect({ ...point, series: inspectionSeries?.benchmark ? 'benchmark' : 'strategy' })
  }
  function select(event: MouseEvent) {
    const box = root.getBoundingClientRect()
    const unit = Math.max(
      0,
      Math.min(
        1,
        (((event.clientX - box.left) / box.width) * width - left) / (width - left - right),
      ),
    )
    return nearestSample(points, minTime + unit * (maxTime - minTime))
  }
  root.addEventListener('pointermove', (event) => {
    if (!pinned && event instanceof PointerEvent && event.pointerType !== 'touch') {
      tooltip.setAttribute('aria-live', 'off')
      show(select(event))
    }
  })
  root.addEventListener('pointerleave', () => {
    if (!pinned) hide()
  })
  root.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[role=button]')) return
    if (event instanceof MouseEvent) {
      const next = select(event)
      if (pinned && next === index) {
        pinned = false
        hide()
      } else {
        pinned = true
        show(next)
      }
    }
  })
  root.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    pinned = false
    tooltip.setAttribute('aria-live', 'polite')
    if (event.key === 'Escape') hide()
    else
      show(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? points.length - 1
            : index + (event.key === 'ArrowRight' ? 1 : -1),
      )
  })
  root.addEventListener('blur', () => {
    if (!pinned) hide()
  })
  container.append(root, tooltip)
  return () => {
    options.inspect(null)
    container.replaceChildren()
  }
}

export function renderOverview(
  container: HTMLElement,
  points: readonly Point[],
  first: number,
  last: number,
) {
  container.replaceChildren()
  const values = points
    .map((point) => point.equity)
    .filter((value): value is number => value !== null)
  if (!values.length) return
  const min = Math.min(...values),
    max = Math.max(...values)
  const firstTime = Date.parse(points[0]!.ts),
    lastTime = Date.parse(points.at(-1)!.ts)
  const x = (i: number) =>
    ((Date.parse(points[i]!.ts) - firstTime) / (lastTime - firstTime || 1)) * 1000
  const root = svg('svg', {
    viewBox: '0 0 1000 38',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  })
  let path = '',
    open = false
  points.forEach((point, i) => {
    if (point.equity === null) {
      open = false
      return
    }
    path += `${open && !point.breakBefore ? 'L' : 'M'}${x(i)},${32 - ((point.equity - min) / (max - min || 1)) * 26} `
    open = true
  })
  root.append(
    svg('path', {
      d: path,
      fill: 'none',
      class: 'benchmark-line',
      'vector-effect': 'non-scaling-stroke',
    }),
    svg('rect', {
      x: x(first),
      y: 0,
      width: Math.max(1, x(last) - x(first)),
      height: 38,
      class: 'overview-selection',
    }),
  )
  container.append(root)
}
