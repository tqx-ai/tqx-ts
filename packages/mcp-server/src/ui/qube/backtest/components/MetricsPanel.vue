<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Summary } from '../../../../research/backtest-report/contract'
import { numeric } from '../format'

const props = defineProps<{ summary?: Summary }>()
const metrics = [
  [
    'totalReturn',
    'Total return',
    'Full backtest period',
    'Cumulative return over the full backtest period, reported by the engine.',
  ],
  [
    'annualReturn',
    'Annualized return',
    'Engine annualization',
    'Engine annualized return. Short backtests can amplify this value.',
  ],
  [
    'maxDrawdown',
    'Max drawdown',
    'Peak to trough',
    'Largest peak-to-trough decline reported by the engine; not recalculated from sampled points.',
  ],
  [
    'sharpe',
    'Sharpe ratio',
    'Risk-adjusted return',
    'Engine risk-adjusted return. Its risk-free rate and volatility assumptions are unchanged.',
  ],
] as const
const help = ref<{ button: HTMLButtonElement; message: string }>(),
  tooltip = ref<HTMLElement>()
const position = ref({ left: '12px', top: '0px' })
let pinned = false,
  timer: ReturnType<typeof setTimeout> | undefined
const message = computed(() => help.value?.message ?? '')
function close() {
  clearTimeout(timer)
  help.value = undefined
  pinned = false
}
async function show(event: Event, index: number) {
  clearTimeout(timer)
  const button = event.currentTarget as HTMLButtonElement,
    [key, , , explanation] = metrics[index]!
  const source = props.summary?.metrics[key].source
  help.value = {
    button,
    message: `${explanation}${source ? ` Source: ${source}.` : ' Metric unavailable.'}`,
  }
  await nextTick()
  if (!tooltip.value || help.value?.button !== button) return
  const card = button.closest('.report')!.getBoundingClientRect(),
    box = button.getBoundingClientRect()
  position.value = {
    left: `${Math.max(12, Math.min(card.width - tooltip.value.offsetWidth - 12, box.left - card.left - 8))}px`,
    top: `${box.bottom - card.top + 10}px`,
  }
}
function keepOpen() {
  clearTimeout(timer)
}
function leave() {
  if (!pinned) timer = setTimeout(close, 140)
}
function toggle(event: Event, index: number) {
  if (help.value?.button === event.currentTarget && pinned) close()
  else {
    void show(event, index)
    pinned = true
  }
}
function outside(event: PointerEvent) {
  if (
    event.target !== help.value?.button &&
    !(event.target instanceof Node && tooltip.value?.contains(event.target))
  )
    close()
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}
onMounted(() => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('keydown', onKey)
  document.addEventListener('scroll', close, true)
})
onBeforeUnmount(() => {
  close()
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('scroll', close, true)
})
</script>

<template>
  <section class="metrics" aria-label="Full-period backtest metrics">
    <div
      v-for="([key, label, caption], index) in metrics"
      :key="key"
      class="metric"
      :class="{ 'metric-primary': index === 0 }"
    >
      <div class="metric-label">
        {{ label
        }}<button
          type="button"
          class="metric-info"
          :aria-label="`About ${label.toLowerCase()}`"
          :aria-describedby="help?.button.dataset.metric === key ? 'metric-tooltip' : undefined"
          :data-metric="key"
          @pointerenter="show($event, index)"
          @focus="show($event, index)"
          @pointerleave="leave"
          @blur="close"
          @click="toggle($event, index)"
        >
          i
        </button>
      </div>
      <div
        class="metric-value"
        :class="{
          positive: (summary?.metrics[key].value ?? 0) > 0 && key !== 'maxDrawdown',
          negative:
            (summary?.metrics[key].value ?? 0) < 0 ||
            (key === 'maxDrawdown' && (summary?.metrics[key].value ?? 0) !== 0),
        }"
      >
        {{
          summary?.metrics[key].value == null
            ? '—'
            : key === 'sharpe'
              ? numeric(summary.metrics[key].value)
              : `${numeric(summary.metrics[key].value * 100)}%`
        }}
      </div>
      <div class="metric-caption">{{ caption }}</div>
    </div>
    <div
      v-show="help"
      id="metric-tooltip"
      ref="tooltip"
      class="metric-tooltip"
      role="tooltip"
      :style="position"
      @pointerenter="keepOpen"
      @pointerleave="leave"
    >
      {{ message }}
    </div>
  </section>
</template>
