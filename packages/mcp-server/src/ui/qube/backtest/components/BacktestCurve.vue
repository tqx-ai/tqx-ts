<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Report } from '../../../../research/backtest-report/contract'
import { renderChart } from '../chart'
import { formatValue, marketTime } from '../format'

const props = defineProps<{ report?: Report }>()
const emit = defineEmits<{ selection: [value: Record<string, unknown>] }>()
const note = computed(() => {
  const chart = props.report?.chart
  if (!chart) return ''
  return [
    chart.sampled ? 'Sampled curve' : '',
    chart.partial || chart.complete !== true ? 'Completeness unconfirmed' : '',
  ]
    .filter(Boolean)
    .join(' · ')
})
const plot = ref<HTMLElement>()
let cleanup = () => {},
  observer: ResizeObserver | undefined
function draw() {
  if (!plot.value) return
  cleanup()
  const report = props.report
  if (!report?.chart) {
    const empty = document.createElement('p')
    empty.className = 'chart-empty'
    empty.textContent = report?.summary.sections.chart.message ?? 'Waiting for backtest results…'
    plot.value.replaceChildren(empty)
    return
  }
  cleanup = renderChart(plot.value, report.chart, {
    height: 180,
    initial: report.summary.initialCapital,
    returns: report.summary.initialCapital !== null,
    strategy: true,
    benchmark: false,
    markers: false,
    format: (value, percent) => formatValue(value, report.summary.currency, percent),
    time: (value) => marketTime(value, report.summary.market),
    inspect: (point) =>
      emit('selection', {
        selectedSample: point,
        sampled: report.chart?.sampled,
        partial: report.chart?.partial,
        complete: report.chart?.complete,
      }),
    trade() {},
  })
}
watch(() => props.report, draw, { flush: 'post' })
onMounted(() => {
  draw()
  let width = plot.value?.clientWidth
  observer = new ResizeObserver(() => {
    if (plot.value?.clientWidth !== width) {
      width = plot.value?.clientWidth
      draw()
    }
  })
  if (plot.value) observer.observe(plot.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cleanup()
})
</script>

<template>
  <section class="card-curve" aria-label="Backtest curve">
    <div ref="plot" class="plot"></div>
    <p v-if="note" class="curve-note">{{ note }}</p>
  </section>
</template>
