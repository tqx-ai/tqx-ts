<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { ChartData, Report } from '../../../../research/backtest-report/contract'
import type { HostActions } from '../adapters/host'
import { renderChart, renderOverview } from '../chart'
import { formatValue, marketTime } from '../format'

const props = defineProps<{
  report?: Report
  host?: HostActions
  canQuery: boolean
  fullscreen: boolean
}>()
const emit = defineEmits<{
  selection: [value: Record<string, unknown>]
  error: [message: string]
  trade: [day: string]
}>()
const plot = ref<HTMLElement>(),
  overview = ref<HTMLElement>()
const chart = shallowRef<ChartData | null>(null),
  fullChart = computed(() => props.report?.chart)
const returns = ref(false),
  strategy = ref(true),
  benchmark = ref(true),
  markers = ref(false)
const from = ref(''),
  to = ref(''),
  start = ref(0),
  end = ref(0),
  loading = ref(false)
const range = shallowRef<{ from?: string; to?: string }>({})
let inspected: { ts: string; equity: number | null; series: 'strategy' | 'benchmark' } | null = null
let request = 0,
  active = true,
  cleanup = () => {},
  resize: ResizeObserver | undefined
let debounce: ReturnType<typeof setTimeout> | undefined
const lastIndex = computed(() => Math.max(0, (fullChart.value?.points.length ?? 1) - 1))
const time = (value: string) => marketTime(value, props.report?.summary.market)
const format = (value: number | null, percent: boolean) =>
  formatValue(value, props.report?.summary.currency, percent)
const chartNote = computed(() => {
  const c = chart.value
  if (!c)
    return props.report?.summary.sections.chart.state === 'error'
      ? 'Use the range controls to request a smaller window.'
      : ''
  return `${c.points.length} plotted samples / ${c.sourceCount} source points${c.sampled ? ' · Sampled' : ''}${c.partial || c.complete !== true ? ' · Partial / completeness unconfirmed' : ''}${c.benchmark ? '' : ' · No benchmark provided'} · ${props.report?.summary.market === 'us' ? 'America/New_York' : props.report?.summary.market === 'hk' ? 'Asia/Hong_Kong' : 'Timezone unavailable'}`
})
function selection() {
  emit('selection', {
    selectedSample: inspected,
    range: { ...range.value },
    sampled: chart.value?.sampled,
    partial: chart.value?.partial,
    complete: chart.value?.complete,
  })
}
function draw() {
  if (!plot.value) return
  cleanup()
  inspected = null
  selection()
  if (!chart.value || !props.report) {
    const message = document.createElement('p')
    message.className = 'chart-empty'
    message.textContent =
      props.report?.summary.sections.chart.message ?? 'Waiting for backtest results\u2026'
    plot.value.replaceChildren(message)
    return
  }
  cleanup = renderChart(plot.value, chart.value, {
    initial: props.report.summary.initialCapital,
    returns: returns.value,
    strategy: strategy.value,
    benchmark: benchmark.value,
    markers: markers.value,
    format,
    time,
    inspect(point) {
      inspected = point
      selection()
    },
    trade(day) {
      emit('trade', day)
    },
  })
}
function drawOverview() {
  if (overview.value)
    renderOverview(overview.value, fullChart.value?.points ?? [], start.value, end.value)
}
async function requestChart() {
  if (!props.report || !props.host || !props.canQuery) return
  const version = ++request,
    runId = props.report.runId
  loading.value = true
  try {
    const data = await props.host.query({
      type: props.report.type,
      runId,
      operation: 'chart',
      ...range.value,
      maxPoints: props.fullscreen ? 1200 : 600,
    })
    if (
      !active ||
      version !== request ||
      props.report?.runId !== runId ||
      data.operation !== 'chart'
    )
      return
    chart.value = data.chart
    emit('error', '')
  } catch (cause) {
    if (active && version === request)
      emit(
        'error',
        cause instanceof Error
          ? cause.message
          : 'Chart query unavailable. Previously loaded curve retained.',
      )
  } finally {
    if (version === request) loading.value = false
  }
}
watch(
  () => props.report,
  (next) => {
    request++
    loading.value = false
    clearTimeout(debounce)
    chart.value = next?.chart ?? null
    if (next?.summary.initialCapital == null) returns.value = false
    start.value = 0
    end.value = lastIndex.value
    if (range.value.from || range.value.to) void requestChart()
    else {
      from.value = next?.summary.period.from ?? next?.chart?.range.from?.slice(0, 10) ?? ''
      to.value = next?.summary.period.to ?? next?.chart?.range.to?.slice(0, 10) ?? ''
    }
  },
  { immediate: true },
)
watch(
  () => props.canQuery,
  (enabled) => {
    if (!enabled) {
      request++
      loading.value = false
      clearTimeout(debounce)
    }
  },
)
watch([chart, returns, strategy, benchmark, markers], draw, { flush: 'post' })
watch([fullChart, start, end], drawOverview, { flush: 'post' })
function apply() {
  if (!from.value || !to.value || from.value > to.value) {
    emit('error', 'Select a valid start and end date.')
    return
  }
  clearTimeout(debounce)
  const anchors = fullChart.value?.dateAnchors
  range.value = {
    from: anchors?.find((day) => day.day === from.value)?.from ?? from.value,
    to: anchors?.find((day) => day.day === to.value)?.to ?? to.value,
  }
  selection()
  void requestChart()
}
function brush(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.name === 'range-start') start.value = input.valueAsNumber
  else end.value = input.valueAsNumber
  if (!fullChart.value?.points.length) return
  if (start.value > end.value) start.value = end.value
  const first = fullChart.value.points[start.value]!,
    last = fullChart.value.points[end.value]!
  from.value = time(first.ts).slice(0, 10)
  to.value = time(last.ts).slice(0, 10)
  range.value = { from: first.ts, to: last.ts }
  selection()
  clearTimeout(debounce)
  debounce = setTimeout(() => void requestChart(), 250)
}
function reset() {
  request++
  loading.value = false
  clearTimeout(debounce)
  range.value = {}
  chart.value = fullChart.value ?? null
  from.value = props.report?.summary.period.from ?? fullChart.value?.range.from?.slice(0, 10) ?? ''
  to.value = props.report?.summary.period.to ?? fullChart.value?.range.to?.slice(0, 10) ?? ''
  start.value = 0
  end.value = lastIndex.value
  inspected = null
  selection()
}
onMounted(() => {
  draw()
  drawOverview()
  let width = plot.value?.clientWidth
  resize = new ResizeObserver(() => {
    if (plot.value?.clientWidth !== width) {
      width = plot.value?.clientWidth
      draw()
    }
  })
  if (plot.value) resize.observe(plot.value)
})
onBeforeUnmount(() => {
  active = false
  request++
  clearTimeout(debounce)
  cleanup()
  resize?.disconnect()
})
</script>

<template>
  <section class="chart-section" aria-label="Backtest curve">
    <div class="chart-heading">
      <div class="chart-title">
        <h2>Equity curve</h2>
        <span class="chart-unit">{{
          report ? (returns ? '%' : (report.summary.currency ?? 'Currency unavailable')) : ''
        }}</span>
      </div>
      <div class="chart-controls">
        <div class="chart-switch" role="group" aria-label="Chart values">
          <button
            type="button"
            data-action="equity"
            :aria-pressed="!returns"
            @click="returns = false"
          >
            Equity</button
          ><button
            type="button"
            data-action="return"
            :aria-pressed="returns"
            :disabled="report?.summary.initialCapital == null"
            @click="returns = true"
          >
            Return
          </button>
        </div>
      </div>
    </div>
    <div class="legend" role="group" aria-label="Chart series">
      <button
        type="button"
        data-action="strategy"
        :aria-pressed="strategy"
        @click="strategy = !strategy"
      >
        Strategy</button
      ><button
        type="button"
        data-action="benchmark"
        :aria-pressed="benchmark"
        :disabled="!chart?.benchmark"
        @click="benchmark = !benchmark"
      >
        {{ chart?.benchmark?.standardSymbol ?? 'No benchmark' }}</button
      ><button
        type="button"
        data-action="markers"
        :aria-pressed="markers"
        @click="markers = !markers"
      >
        Trades
      </button>
    </div>
    <div ref="plot" class="plot" :aria-busy="loading"></div>
    <div class="query-controls" :inert="!canQuery">
      <div ref="overview" class="overview" aria-label="Full-period curve overview"></div>
      <div class="brush" role="group" aria-label="Select overview sample range">
        <label
          >From sample<input
            type="range"
            name="range-start"
            min="0"
            :max="lastIndex"
            :value="start"
            aria-label="Start sample"
            @input="brush" /></label
        ><label
          >To sample<input
            type="range"
            name="range-end"
            min="0"
            :max="lastIndex"
            :value="end"
            aria-label="End sample"
            @input="brush"
        /></label>
      </div>
      <form class="range-form" @submit.prevent="apply">
        <label>From<input v-model="from" type="date" name="from" required /></label
        ><label>To<input v-model="to" type="date" name="to" required /></label
        ><button type="submit" class="secondary">Apply</button
        ><button type="button" data-action="reset" class="text-button" @click="reset">Reset</button>
      </form>
    </div>
    <p class="chart-note">{{ chartNote }}</p>
  </section>
</template>
