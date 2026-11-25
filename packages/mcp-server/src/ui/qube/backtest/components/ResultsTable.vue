<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { Report, ResultPage } from '../../../../research/backtest-report/contract'
import type { HostActions } from '../adapters/host'
import { marketTime } from '../format'

const props = defineProps<{
  report?: Report
  host?: HostActions
  canQuery: boolean
  fullscreen: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const field = ref<ResultPage['field']>('trades'),
  keyword = ref('')
const page = shallowRef<ResultPage>(),
  loading = ref(false),
  status = ref('')
const offsets = ref([0])
let active = true,
  request = 0
const columns = {
  trades: [
    ['Time', 'display_ts', 'ts', 'timestamp', 'datetime', 'trade_date', 'time', 'date'],
    ['Symbol', 'symbol', 'code', 'instrument', 'symbol_code'],
    ['Side', 'direction', 'side', 'action', 'offset'],
    ['Quantity', 'quantity', 'qty', 'volume'],
    ['Price', 'price', 'fill_price'],
    ['Fee', 'commission', 'fee'],
  ],
  symbol_performance: [
    ['Symbol', 'symbol', 'code', 'instrument', 'symbol_code'],
    ['Name', 'name', 'symbol_name', 'instrument_name'],
    ['Trades', 'trade_count'],
    ['P&L', 'net_pnl', 'final_pnl', 'total_pnl', 'pnl'],
  ],
  account_summary: [
    ['Market value', 'market_value'],
    ['Margin', 'margin'],
    ['Total fee', 'total_fee'],
  ],
} as const
const previousDisabled = computed(
  () => !props.canQuery || loading.value || offsets.value.length <= 1,
)
function cell(row: ResultPage['rows'][number], names: readonly string[]) {
  const key = names.slice(1).find((name) => row[name] !== null && row[name] !== undefined)
  const value = key ? row[key] : null
  if (value === null || value === undefined) return '\u2014'
  return names[0] === 'Time' &&
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? marketTime(value, props.report?.summary.market)
    : String(value)
}
async function load(offset: number) {
  if (!props.canQuery || !props.host || !props.report) {
    status.value = 'Report queries unavailable in this host.'
    return
  }
  const version = ++request,
    runId = props.report.runId,
    selected = field.value
  page.value = undefined
  loading.value = true
  status.value = 'Loading\u2026'
  try {
    const data = await props.host.query({
      type: props.report.type,
      runId,
      operation: 'result',
      field: selected,
      offset,
      limit: props.fullscreen ? 20 : 5,
      keyword: keyword.value || undefined,
    })
    if (
      !active ||
      version !== request ||
      props.report?.runId !== runId ||
      data.operation !== 'result'
    )
      return
    if (data.result.field !== selected) throw new Error('Result section mismatch')
    const result = data.result
    page.value = result
    status.value = `${result.rows.length ? `${result.offset + 1}\u2013${result.offset + result.rows.length}` : '0'} of ${result.total} records${result.partial ? ' · Partial' : ''}${result.availableFrom !== undefined ? ` · Available from ${result.availableFrom}` : ''}${result.availableTotal !== undefined ? ` · Available total ${result.availableTotal}` : ''}${!result.rows.length ? ' · No available rows' : ''}`
  } catch (cause) {
    if (active && version === request)
      status.value = cause instanceof Error ? cause.message : 'Result page unavailable'
  } finally {
    if (version === request) loading.value = false
  }
}
function search() {
  offsets.value = [0]
  void load(0)
}
function next() {
  if (!page.value?.hasMore || page.value.nextOffset === undefined) return
  offsets.value.push(page.value.nextOffset)
  void load(page.value.nextOffset)
}
function previous() {
  if (offsets.value.length > 1) {
    offsets.value.pop()
    void load(offsets.value.at(-1) ?? 0)
  }
}
function toggle(event: Event) {
  open.value = (event.target as HTMLDetailsElement).open
}
watch(open, (value) => {
  if (value && !page.value && !loading.value) void load(0)
})
watch(field, search)
watch([() => props.report, () => props.fullscreen, () => props.canQuery], () => {
  request++
  loading.value = false
  page.value = undefined
  status.value = ''
  offsets.value = [0]
  if (open.value) void load(0)
})
onBeforeUnmount(() => {
  active = false
  request++
})
</script>

<template>
  <details class="results" :open="open" @toggle="toggle">
    <summary>Explore results<span aria-hidden="true">+</span></summary>
    <p class="detail-note">Backtest records across the selected run.</p>
    <form class="search-form" :inert="!canQuery" @submit.prevent="search">
      <label class="sr-only" for="result-field">Result section</label
      ><select id="result-field" v-model="field" name="field">
        <option value="trades">Trades</option>
        <option value="symbol_performance">Symbol performance</option>
        <option value="account_summary">Account summary</option></select
      ><label class="sr-only" for="result-keyword">Search records</label
      ><input
        id="result-keyword"
        v-model="keyword"
        name="keyword"
        placeholder="Search records"
        maxlength="200"
      /><button type="submit" class="secondary">Search</button>
    </form>
    <div class="result-records">
      <table class="result-table" :aria-busy="loading">
        <template v-if="page"
          ><thead>
            <tr>
              <th v-for="names in columns[field]" :key="names[0]" scope="col">{{ names[0] }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in page.rows" :key="index">
              <td v-for="names in columns[field]" :key="names[0]" :data-label="names[0]">
                {{ cell(row, names) }}
              </td>
            </tr>
          </tbody></template
        >
      </table>
    </div>
    <div class="pagination">
      <span class="result-status" role="status">{{ status }}</span
      ><button type="button" data-action="previous" :disabled="previousDisabled" @click="previous">
        Previous</button
      ><button
        type="button"
        data-action="next"
        :disabled="!canQuery || loading || !page?.hasMore"
        @click="next"
      >
        Next
      </button>
    </div>
  </details>
</template>
