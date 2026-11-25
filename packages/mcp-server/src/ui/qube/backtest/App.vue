<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import MetricsPanel from './components/MetricsPanel.vue'
import EquityChart from './components/EquityChart.vue'
import ResultsTable from './components/ResultsTable.vue'
import FrozenParameters from './components/FrozenParameters.vue'
import BrandSignature from './components/BrandSignature.vue'
import { formatValue, numeric } from './format'
import { useReport } from './use-report'

const {
  identity,
  report,
  host,
  capabilities,
  alert,
  canQuery,
  connected,
  fullscreen,
  refresh,
  analyze,
  openLink,
} = useReport()
const selection = shallowRef<Record<string, unknown>>({}),
  resultsOpen = shallowRef(false)
const statuses = {
  succeeded: 'Completed',
  running: 'Running',
  queued: 'Queued',
  preparing: 'Preparing',
  failed: 'Failed',
  cancelled: 'Cancelled',
}
const summary = computed(() => report.value?.summary)
const additional = computed(() => {
  const s = summary.value
  return s
    ? [
        [
          s.status === 'succeeded' ? 'Final equity' : 'Current equity',
          formatValue(s.metrics.equity.value, s.currency),
        ],
        [
          'Trades',
          s.metrics.tradeCount.value === null ? '—' : numeric(s.metrics.tradeCount.value, 0),
        ],
        ['Sortino', s.metrics.sortino.value === null ? '—' : numeric(s.metrics.sortino.value)],
        ['Calmar', s.metrics.calmar.value === null ? '—' : numeric(s.metrics.calmar.value)],
      ]
    : []
})
watch(
  () => identity.value?.runId,
  () => {
    selection.value = {}
    resultsOpen.value = false
  },
)
function trade(day: string) {
  resultsOpen.value = true
  alert.value = `${day}: trade-day counts are summaries. The table is paginated across the backtest; it is not filtered to this date.`
}
</script>

<template>
  <main id="backtest-app" class="preview" :data-mode="fullscreen ? 'fullscreen' : 'inline'">
    <div class="eyebrow"><span class="eyebrow-mark" aria-hidden="true"></span>BACKTEST REPORT</div>
    <article class="report" aria-labelledby="report-title">
      <div class="report-body">
        <header class="report-heading">
          <h1 id="report-title">{{ summary?.title ?? 'Backtest report' }}</h1>
          <div class="heading-aside">
            <div class="run-status" role="status" :data-status="summary?.status">
              {{ summary ? statuses[summary.status] : 'Loading'
              }}{{
                summary && !summary.terminal && summary.progress !== null
                  ? ` · ${numeric(summary.progress, 0)}%`
                  : ''
              }}
            </div>
            <div class="date-range">
              {{ [summary?.period.from, summary?.period.to].filter(Boolean).join(' — ') }}
            </div>
          </div>
        </header>
        <div v-if="alert" class="alert" role="status">{{ alert }}</div>
        <MetricsPanel :key="identity?.runId" :summary="summary" />
        <EquityChart
          :key="identity?.runId"
          :report="report"
          :host="host"
          :can-query="canQuery"
          :fullscreen="fullscreen"
          @selection="selection = $event"
          @error="alert = $event"
          @trade="trade"
        />
        <div class="secondary-metrics" aria-label="Additional full-period metrics">
          <div v-for="[label, value] in additional" :key="label" class="secondary-metric">
            <span>{{ label }}</span
            ><strong>{{ value }}</strong>
          </div>
        </div>
        <div class="warnings" aria-label="Data limitations">
          <p v-for="warning in summary?.warnings" :key="warning">{{ warning }}</p>
        </div>
        <ResultsTable
          :key="identity?.runId"
          v-model:open="resultsOpen"
          :report="report"
          :host="host"
          :can-query="canQuery"
          :fullscreen="fullscreen"
        />
        <FrozenParameters
          :key="identity?.runId"
          :summary="summary"
          :can-open-link="connected && !!capabilities.openLinks"
          @open-link="openLink"
        />
        <div class="report-actions">
          <button
            type="button"
            data-action="refresh"
            class="text-button"
            :disabled="!canQuery || !identity"
            @click="refresh"
          >
            Refresh</button
          ><button
            v-if="connected && capabilities.message"
            type="button"
            data-action="analyze"
            class="secondary"
            :disabled="!report"
            @click="analyze(selection)"
          >
            Analyze backtest
          </button>
        </div>
      </div>
    </article>
    <BrandSignature />
  </main>
</template>
