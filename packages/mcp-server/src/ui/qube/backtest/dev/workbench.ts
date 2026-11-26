import * as v from 'valibot'

import { REPORT_META, reportSchema } from '../../../../research/backtest-report/contract'
import type { Report } from '../../../../research/backtest-report/contract'
import { fixtureResearch } from '../adapters/fixture'
import type { ResearchCall } from '../adapters/research'
import { fixture, scenarios, type Scenario } from './fixtures'

const find = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const frame = find<HTMLIFrameElement>('app'),
  trace = find('trace'),
  status = find('status')
const scenario = find<HTMLSelectElement>('scenario'),
  width = find<HTMLSelectElement>('width')
const delivery = find<HTMLSelectElement>('delivery'),
  latency = find<HTMLInputElement>('latency')
const reject = find<HTMLInputElement>('reject'),
  limited = find<HTMLInputElement>('text-host')
const displayMode = find<HTMLSelectElement>('display-mode')
const heightConstraint = find<HTMLSelectElement>('height-constraint')
const reuseView = find<HTMLInputElement>('reuse-view')
const params = new URLSearchParams(location.search)
if (['natural', 'max:600', 'max:800', 'fixed:640'].includes(params.get('height') ?? ''))
  heightConstraint.value = params.get('height')!
const buildMode = find<HTMLSelectElement>('build')
buildMode.value = params.get('build') === 'hmr' ? 'hmr' : 'production'
const devConfig = fetch('/dev-config').then((response) => response.json()) as Promise<{
  hmrUrl: string
}>
for (const name of scenarios) {
  const option = document.createElement('option')
  option.value = option.textContent = name
  scenario.append(option)
}
scenario.value = scenarios.includes(params.get('scenario') as Scenario)
  ? params.get('scenario')!
  : 'hk-loss'
if (['320', '480', '720', '960'].includes(params.get('width') ?? ''))
  width.value = params.get('width')!
let generation = 0,
  mode = params.get('mode') === 'fullscreen' ? 'fullscreen' : 'inline'
displayMode.value = mode
let data = fixture(scenario.value as Scenario),
  query = fixtureResearch(data),
  recording: Report | undefined
let html = ''
function log(message: string) {
  trace.textContent =
    `${new Date().toISOString().slice(11, 23)} ${message}\n${trace.textContent ?? ''}`.slice(
      0,
      8000,
    )
}
function send(message: Record<string, unknown>) {
  frame.contentWindow?.postMessage({ jsonrpc: '2.0', ...message }, '*')
}
function notification(method: string, payload: Record<string, unknown>) {
  log(`host → ${method}`)
  send({ method, params: payload })
}
function heightBounds() {
  const [kind, value] = heightConstraint.value.split(':')
  return kind === 'fixed'
    ? { height: Number(value) }
    : kind === 'max'
      ? { maxHeight: Number(value) }
      : {}
}
function context() {
  return {
    theme: 'dark',
    displayMode: mode,
    availableDisplayModes: limited.checked ? ['inline'] : ['inline', 'fullscreen'],
    containerDimensions:
      mode === 'fullscreen'
        ? { width: Math.max(960, Number(width.value)), height: 820 }
        : { width: Number(width.value), ...heightBounds() },
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  }
}
let inlineHeight = 1100
function resize() {
  frame.style.width = `${mode === 'fullscreen' ? Math.max(960, Number(width.value)) : width.value}px`
  const bounds = heightBounds()
  const height = bounds.height ?? Math.min(inlineHeight, bounds.maxHeight ?? Infinity)
  frame.style.height = `${mode === 'fullscreen' ? 820 : height}px`
}
function toolResult(report: Report) {
  return {
    content: [{ type: 'text', text: JSON.stringify(report.summary) }],
    structuredContent: report.summary,
    _meta: { [REPORT_META]: report },
  }
}
const input = () =>
  notification('ui/notifications/tool-input', { arguments: { type: data.type, runId: data.runId } })
const deliverResult = () => notification('ui/notifications/tool-result', toolResult(data))
function deliver() {
  if (delivery.value === 'result-first') {
    deliverResult()
    input()
  } else {
    input()
    deliverResult()
  }
  if (delivery.value === 'duplicate') deliverResult()
  if (delivery.value === 'stale') {
    const stale = structuredClone(data)
    stale.runId = stale.summary.runId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    notification('ui/notifications/tool-result', toolResult(stale))
  }
}
async function restart() {
  generation++
  status.textContent = 'Connecting'
  if (limited.checked) mode = 'inline'
  displayMode.value = mode
  displayMode.disabled = limited.checked
  data = recording ?? fixture(scenario.value as Scenario)
  query = fixtureResearch(data, recording === undefined)
  if (buildMode.value === 'hmr') {
    frame.removeAttribute('srcdoc')
    frame.sandbox.value = 'allow-scripts allow-same-origin'
    frame.src = (await devConfig).hmrUrl
  } else {
    frame.removeAttribute('src')
    frame.sandbox.value = 'allow-scripts'
    html = await (await fetch('/app.html')).text()
    const policy =
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
    frame.srcdoc = html.replace(
      '<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`,
    )
  }
  resize()
  const search = new URLSearchParams({
    scenario: scenario.value,
    width: width.value,
    mode,
    build: buildMode.value,
    height: heightConstraint.value,
  })
  history.replaceState(null, '', `?${search}`)
}
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || event.data?.jsonrpc !== '2.0') return
  const message = event.data as {
    id?: string | number
    method?: string
    params?: Record<string, unknown>
  }
  const current = generation,
    args = message.params ?? {}
  if (message.id === 'teardown') {
    status.textContent = 'Disconnected'
    log('App acknowledged teardown')
    return
  }
  if (!message.method) return
  const started = performance.now()
  log(
    `app → ${message.method}${message.id === undefined ? '' : ` #${message.id}`} · ${new TextEncoder().encode(JSON.stringify(event.data)).length} bytes`,
  )
  const respond = (result: unknown) => {
    if (current === generation) send({ id: message.id, result })
  }
  if (message.method === 'ui/initialize') {
    respond({
      protocolVersion: '2026-01-26',
      hostInfo: { name: 'TQX local simulator', version: '1.0.0' },
      hostCapabilities: limited.checked
        ? {}
        : { serverTools: {}, message: { text: {} }, updateModelContext: {}, openLinks: {} },
      hostContext: context(),
    })
  } else if (message.method === 'ui/notifications/initialized') {
    status.textContent = 'Connected'
    deliver()
  } else if (message.method === 'ui/notifications/size-changed') {
    if (mode !== 'fullscreen' && typeof args.height === 'number') {
      inlineHeight = Math.max(0, args.height)
      resize()
    }
  } else if (message.method === 'tools/call') {
    if (find<HTMLInputElement>('stall').checked) {
      log('Response dropped for timeout simulation')
      return
    }
    const readQuery = query
    setTimeout(
      async () => {
        if (current !== generation) return
        try {
          if (reject.checked || args.name !== 'tqx_research_call')
            throw new Error('Injected query error')
          const request = args.arguments as {
            action: Parameters<ResearchCall>[0]
            input: Record<string, unknown>
          }
          const result = await readQuery(request.action, request.input)
          respond(result)
          log(
            `host → result #${message.id} · ${Math.round(performance.now() - started)} ms · ${new TextEncoder().encode(JSON.stringify(result)).length} bytes`,
          )
        } catch {
          respond({
            isError: true,
            content: [{ type: 'text', text: 'Local fixture query rejected' }],
          })
          log(`host → query error #${message.id}`)
        }
      },
      Math.max(0, Math.min(5000, Number(latency.value) || 0)),
    )
  } else if (message.method === 'ui/open-link') {
    if (
      limited.checked ||
      typeof args.url !== 'string' ||
      !/^https:\/\/www\.tqx\.ai\/qube\/strategies\/[a-f\d]{24}$/i.test(args.url)
    ) {
      respond({ isError: true })
      return
    }
    window.open(args.url, '_blank', 'noopener,noreferrer')
    respond({})
    log('Strategy link opened in a new tab')
  } else if (message.method === 'ui/request-display-mode') {
    if (!limited.checked) mode = args.mode === 'fullscreen' ? 'fullscreen' : 'inline'
    displayMode.value = mode
    resize()
    respond({ mode })
    notification('ui/notifications/host-context-changed', context())
  } else if (message.method === 'ui/update-model-context' || message.method === 'ui/message') {
    respond({})
    log('Conversation context accepted locally; no external message sent')
  } else if (message.id !== undefined)
    send({ id: message.id, error: { code: -32601, message: 'Unsupported local method' } })
})
let runSequence = 0
scenario.addEventListener('change', () => {
  recording = undefined
  if (reuseView.checked && status.textContent === 'Connected') {
    data = fixture(scenario.value as Scenario)
    data.runId = data.summary.runId = (++runSequence).toString(16).padStart(24, '0')
    query = fixtureResearch(data, true)
    deliver()
  } else void restart()
})
heightConstraint.addEventListener('change', () => {
  resize()
  notification('ui/notifications/host-context-changed', context())
})
displayMode.addEventListener('change', () => {
  mode = displayMode.value === 'fullscreen' && !limited.checked ? 'fullscreen' : 'inline'
  displayMode.value = mode
  resize()
  notification('ui/notifications/host-context-changed', context())
})
width.addEventListener('change', () => {
  resize()
  notification('ui/notifications/host-context-changed', context())
})
for (const element of [delivery, limited, buildMode])
  element.addEventListener('change', () => void restart())
find('restart').addEventListener('click', () => void restart())
find('teardown').addEventListener('click', () =>
  send({ id: 'teardown', method: 'ui/resource-teardown', params: {} }),
)
find<HTMLInputElement>('recording').addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    if (file.size > 524_288) throw new Error('Recording exceeds 512 KiB')
    recording = v.parse(reportSchema, JSON.parse(await file.text()))
    await restart()
    log('Loaded sanitized overview locally')
  } catch {
    status.textContent = 'Invalid recording'
    log('Recording rejected by report schema or size limit')
  }
})
const changes = new EventSource('/events')
changes.addEventListener('message', (event) => {
  if (event.data === 'reload') location.reload()
  else if (buildMode.value === 'production') void restart()
})
void restart()
