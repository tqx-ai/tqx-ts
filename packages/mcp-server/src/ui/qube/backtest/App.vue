<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import MetricsPanel from './components/MetricsPanel.vue'
import BacktestCurve from './components/BacktestCurve.vue'
import BrandSignature from './components/BrandSignature.vue'
import { useReport } from './use-report'

const { identity, report, capabilities, alert, connected, fullscreen, analyze, openLink } =
  useReport()
const selection = shallowRef<Record<string, unknown>>({})
const summary = computed(() => report.value?.summary)
const canOpenLink = computed(() => connected.value && !!capabilities.value.openLinks)
watch(
  () => identity.value?.runId,
  () => {
    selection.value = {}
  },
)
function details(event: MouseEvent) {
  if (!canOpenLink.value || !report.value?.strategyUrl) return
  event.preventDefault()
  void openLink(report.value.strategyUrl)
}
</script>

<template>
  <main id="backtest-app" class="preview" :data-mode="fullscreen ? 'fullscreen' : 'inline'">
    <article class="report" aria-labelledby="report-title">
      <div class="report-body">
        <header class="report-heading">
          <h1 id="report-title">{{ summary?.title ?? 'Backtest report' }}</h1>
          <button
            v-if="connected && capabilities.message?.text"
            type="button"
            data-action="analyze"
            class="secondary"
            :disabled="!report"
            @click="analyze(selection)"
          >
            Analyze
          </button>
        </header>
        <div v-if="alert" class="alert" role="status">{{ alert }}</div>
        <div v-if="summary && summary.status !== 'succeeded'" class="alert" role="status">
          {{ summary.status }}{{ summary.progress === null ? '' : ` · ${summary.progress}%` }}
        </div>
        <div class="card-content">
          <BacktestCurve :key="identity?.runId" :report="report" @selection="selection = $event" />
          <MetricsPanel :key="identity?.runId" :summary="summary" />
        </div>
        <footer class="card-footer">
          <div class="strategy-id">
            <span>Strategy ID</span><code>{{ summary?.strategyId ?? '—' }}</code>
          </div>
          <a
            v-if="report?.strategyUrl"
            class="strategy-link"
            :href="report.strategyUrl"
            target="_blank"
            rel="noopener noreferrer"
            @click="details"
            >View details <span aria-hidden="true">↗</span></a
          >
        </footer>
      </div>
    </article>
    <BrandSignature />
  </main>
</template>
