import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import type { Identity, QueryResult, Report } from '../../../research/backtest-report/contract'
import {
  connectHost,
  type HostActions,
  type HostCapabilities,
  type HostContext,
  type HostInfo,
} from './adapters/host'
import { identityKey } from './format'
import { applyHostLayout, clearHostLayout } from './adapters/layout'

export function useReport() {
  const identity = shallowRef<Identity>(),
    report = shallowRef<Report>()
  const host = shallowRef<HostActions>(),
    context = shallowRef<HostContext>({})
  const capabilities = shallowRef<HostCapabilities>({}),
    alert = shallowRef('')
  const hostInfo = shallowRef<HostInfo>()
  const connected = shallowRef(false)
  let awaitingInput: Report | undefined
  let active = true,
    refreshRequest = 0
  const canQuery = computed(() => connected.value && !!capabilities.value.serverTools)
  const fullscreen = computed(() => context.value.displayMode === 'fullscreen')
  function accept(data: QueryResult, buffer = false) {
    if (!active || data.operation !== 'overview') return
    if (identity.value && identityKey(identity.value) !== identityKey(data)) {
      if (buffer) awaitingInput = data
      return
    }
    if (
      report.value?.summary.fetchedAt === data.summary.fetchedAt &&
      identityKey(report.value) === identityKey(data)
    )
      return
    identity.value = { type: data.type, runId: data.runId }
    report.value = data
    alert.value = ''
  }
  onMounted(() => {
    host.value = connectHost({
      input(next) {
        if (identity.value && identityKey(identity.value) !== identityKey(next)) {
          report.value = undefined
          alert.value = ''
          refreshRequest++
        }
        identity.value = next
        const buffered = awaitingInput
        awaitingInput = undefined
        if (buffered && identityKey(buffered) === identityKey(next)) accept(buffered)
      },
      result: (data) => accept(data, true),
      context(next, caps, info) {
        context.value = next
        capabilities.value = caps
        hostInfo.value = info
        connected.value = true
      },
      error(message) {
        alert.value = message
      },
      teardown() {
        active = false
        awaitingInput = undefined
        connected.value = false
        refreshRequest++
        alert.value = 'Report disconnected. Restart to reconnect.'
      },
    })
  })
  watch(
    context,
    (next) => {
      applyHostLayout(next)
      for (const side of ['top', 'right', 'bottom', 'left'] as const)
        document.documentElement.style.setProperty(
          `--safe-${side}`,
          `${next.safeAreaInsets?.[side] ?? 0}px`,
        )
    },
    { flush: 'sync' },
  )
  async function refresh() {
    if (!canQuery.value || !identity.value || !host.value) return
    const current = ++refreshRequest,
      key = identityKey(identity.value)
    try {
      const data = await host.value.query({ ...identity.value, operation: 'overview' })
      if (
        active &&
        current === refreshRequest &&
        identity.value &&
        identityKey(identity.value) === key
      )
        accept(data)
    } catch {
      if (active && current === refreshRequest)
        alert.value = 'Refresh unavailable. Previously loaded data is retained.'
    }
  }
  async function analyze(selection: Record<string, unknown>) {
    if (!report.value || !connected.value) return
    try {
      await host.value?.analyze({
        type: report.value.type,
        runId: report.value.runId,
        metrics: report.value.summary.metrics,
        ...selection,
      })
    } catch {
      alert.value = 'The host could not send this analysis request.'
    }
  }
  async function openLink(url: string) {
    if (!connected.value || !host.value) return
    try {
      await host.value.openLink(url)
    } catch {
      if (active) alert.value = 'The host could not open this strategy. You can copy its link.'
    }
  }
  onBeforeUnmount(() => {
    active = false
    awaitingInput = undefined
    refreshRequest++
    host.value?.dispose()
    clearHostLayout()
    for (const side of ['top', 'right', 'bottom', 'left'])
      document.documentElement.style.removeProperty(`--safe-${side}`)
  })
  return {
    identity,
    report,
    host,
    hostInfo,
    context,
    capabilities,
    alert,
    canQuery,
    connected,
    fullscreen,
    refresh,
    analyze,
    openLink,
  }
}
