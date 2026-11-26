<script setup lang="ts">
import { computed } from 'vue'
import type { Summary } from '../../../../research/backtest-report/contract'
import { formatValue } from '../format'

const props = defineProps<{ summary?: Summary; canOpenLink: boolean }>()
const emit = defineEmits<{ openLink: [url: string] }>()
const strategyUrl = computed(() =>
  props.summary
    ? `https://www.tqx.ai/qube/strategies/${encodeURIComponent(props.summary.strategyId)}`
    : '',
)
const parameters = computed(() => {
  const s = props.summary
  return s
    ? [
        ['Product', s.type],
        ['Run ID', s.runId],
        ['Strategy ID', s.strategyId],
        ['Market', s.market?.toUpperCase()],
        ['Period start', s.period.from],
        ['Period end', s.period.to],
        ['Initial capital', formatValue(s.initialCapital, s.currency)],
        ['Frequency', s.frequency === '1d' ? 'Daily' : s.frequency === '1M' ? 'Minute' : null],
        ['Commission rate (engine units)', s.parameters.commissionRate],
        ['Slippage (engine units)', s.parameters.slippage],
        ['Benchmark', s.parameters.standardSymbol],
        ['Source revision', s.sourceRevision],
        ['Config revision', s.configRevision],
      ]
    : []
})
</script>

<template>
  <details>
    <summary>Frozen parameters<span aria-hidden="true">+</span></summary>
    <dl class="parameters">
      <template v-for="[key, value] in parameters" :key="key ?? ''"
        ><dt>{{ key }}</dt>
        <dd>
          <a
            v-if="key === 'Strategy ID' && canOpenLink"
            class="strategy-link"
            :href="strategyUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open strategy in TQX"
            title="Open strategy in TQX"
            @click.prevent="emit('openLink', strategyUrl)"
          >
            <span>{{ value }}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </a>
          <template v-else>{{ value ?? '—' }}</template>
        </dd></template
      >
    </dl>
  </details>
</template>
