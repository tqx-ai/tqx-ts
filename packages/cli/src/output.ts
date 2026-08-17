import pc from 'picocolors'

import {
  TqxApiError,
  TqxError,
  TqxNetworkError,
  TqxProtocolError,
  TqxValidationError,
} from '@tqx-ai/sdk'
import { isRecord } from './utils/basic/type-guard'
import { getRuntimeProcess } from './utils/runtime'

export type OutputMode = 'color' | 'plain' | 'json'

export interface WritableOutput {
  readonly isTTY?: boolean
  write(chunk: string): unknown
}

export interface LoadingIndicator {
  stop(): void
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
const SPINNER_INTERVAL_MS = 80
const TIMESTAMP_FIELDS = new Set([
  'as_of',
  'created_at',
  'executed_at',
  'submitted_at',
  'updated_at',
])

export class Output {
  readonly #colors: ReturnType<typeof pc.createColors>

  constructor(
    readonly mode: OutputMode,
    private readonly stdout: WritableOutput = getRuntimeProcess().stdout,
    private readonly stderr: WritableOutput = getRuntimeProcess().stderr,
  ) {
    this.#colors = pc.createColors(mode === 'color')
  }

  success(data: unknown): void {
    const rendered = this.mode === 'json' ? JSON.stringify(data, null, 2) : this.renderHuman(data)
    this.stdout.write(`${rendered}\n`)
  }

  message(message: string): void {
    if (this.mode === 'json') return
    this.stdout.write(`${message}\n`)
  }

  loading(message = 'Loading...'): LoadingIndicator {
    if (this.mode === 'json' || this.stderr.isTTY !== true) return { stop() {} }

    let frameIndex = 0
    let stopped = false
    const render = () => {
      const frame = this.#colors.cyan(SPINNER_FRAMES[frameIndex]!)
      this.stderr.write(`\r${frame} ${message}`)
      frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length
    }

    render()
    const timer = setInterval(render, SPINNER_INTERVAL_MS)
    timer.unref()

    return {
      stop: () => {
        if (stopped) return
        stopped = true
        clearInterval(timer)
        this.stderr.write('\r\u001b[2K')
      },
    }
  }

  error(error: unknown): void {
    const details = errorDetails(error)
    if (this.mode === 'json') {
      this.stderr.write(`${JSON.stringify({ error: details }, null, 2)}\n`)
      return
    }
    const prefix = this.#colors.red(this.#colors.bold('Error'))
    const metadata = [
      details.status === undefined ? null : `HTTP ${details.status}`,
      details.content_type,
      details.request_id ? `request ${details.request_id}` : null,
    ].filter((value): value is string => Boolean(value))
    const suffix = metadata.length ? this.#colors.dim(` (${metadata.join(', ')})`) : ''
    const message = formatErrorMessage(details)
    const issues = details.issues
      ?.map((issue) => `\n  ${this.#colors.yellow(issue.path)}: ${issue.message}`)
      .join('')
    const url = details.url ? `\n  ${this.#colors.cyan('url')}: ${details.url}` : ''
    const data =
      details.data === undefined
        ? ''
        : `\n  ${this.#colors.cyan('data')}:\n${indentLines(JSON.stringify(details.data, null, 2), '    ')}`
    const conflictHint = formatVersionConflictHint(details)
    this.stderr.write(
      `${prefix}: ${message}${suffix}${issues ?? ''}${url}${data}${conflictHint ?? ''}\n`,
    )
  }

  warning(message: string): void {
    if (this.mode === 'json') return
    this.stderr.write(`${this.#colors.yellow(this.#colors.bold('Warning'))}: ${message}\n`)
  }

  private renderHuman(data: unknown): string {
    if (Array.isArray(data)) return data.map((item) => this.renderHuman(item)).join('\n')
    if (!isRecord(data)) return this.formatValue(data)

    const rendered = this.renderRecord(data)
    if (isSignalData(data)) {
      return `${rendered}\n${this.#colors.dim(
        'Note: state is the signal lifecycle, not the order status. ACCEPTED does not mean submitted or filled; use order_id with orders get and trades to confirm execution.',
      )}`
    }
    if (isOrderOperationAck(data)) {
      return `${rendered}\n${this.#colors.dim(
        'Note: accepted confirms only that the operation request was accepted; query the order and trades to confirm its final state.',
      )}`
    }
    return rendered
  }

  private renderRecord(data: Record<string, unknown>): string {
    const entries = Object.entries(data)
    if (entries.length === 1 && Array.isArray(entries[0]?.[1])) {
      return this.renderTable(entries[0][1] as unknown[])
    }
    const width = Math.max(...entries.map(([key]) => key.length), 0)
    return entries
      .map(([key, value]) => {
        const label = this.#colors.cyan(key.padEnd(width))
        return `${label}  ${this.formatValue(value, key)}`
      })
      .join('\n')
  }

  private renderTable(items: unknown[]): string {
    if (items.length === 0) return this.#colors.dim('No results')
    if (!items.every(isRecord)) return items.map((item) => this.formatValue(item)).join('\n')
    const columns = [...new Set(items.flatMap((item) => Object.keys(item)))]
    const rows = items.map((item) =>
      columns.map((column) => this.formatScalar(item[column], column)),
    )
    const widths = columns.map((column, index) =>
      Math.max(column.length, ...rows.map((row) => stripAnsi(row[index] ?? '').length)),
    )
    const header = columns
      .map((column, index) => this.#colors.cyan(this.#colors.bold(column.padEnd(widths[index]!))))
      .join('  ')
    const body = rows
      .map((row) => row.map((value, index) => padAnsi(value, widths[index]!)).join('  '))
      .join('\n')
    return `${header}\n${body}`
  }

  private formatValue(value: unknown, field?: string): string {
    if (Array.isArray(value)) {
      if (value.every(isRecord)) return `\n${this.renderTable(value)}`
      return value.map((item) => this.formatScalar(item, field)).join(', ')
    }
    if (isRecord(value)) return `\n${JSON.stringify(value, null, 2)}`
    return this.formatScalar(value, field)
  }

  private formatScalar(value: unknown, field?: string): string {
    if (value === null || value === undefined) return this.#colors.dim('-')
    if (value === true) return this.#colors.green('true')
    if (value === false) return this.#colors.red('false')
    if (typeof value === 'number') return this.#colors.yellow(String(value))
    if (typeof value === 'string' && field && TIMESTAMP_FIELDS.has(field)) {
      return formatLocalTimestamp(value)
    }
    return String(value)
  }
}

function isSignalData(value: Record<string, unknown>): boolean {
  return (
    typeof value.signal_id === 'string' &&
    typeof value.state === 'string' &&
    'order_status' in value
  )
}

function isOrderOperationAck(value: Record<string, unknown>): boolean {
  return (
    typeof value.order_id === 'string' &&
    typeof value.accepted === 'boolean' &&
    !('signal_id' in value) &&
    !('status' in value)
  )
}

function formatLocalTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offset = `${sign}${pad2(Math.floor(absoluteOffset / 60))}:${pad2(absoluteOffset % 60)}`

  return [
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
    `.${String(date.getMilliseconds()).padStart(3, '0')}${offset}`,
  ].join('')
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export interface ErrorOutput {
  message: string
  code?: string
  status?: number
  request_id?: string | null
  content_type?: string | null
  url?: string | null
  data?: unknown
  issues?: ValidationIssueOutput[]
}

export interface ValidationIssueOutput {
  path: string
  message: string
}

export function errorDetails(error: unknown): ErrorOutput {
  if (error instanceof TqxApiError) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
      request_id: error.requestId,
      ...(error.data !== null && error.data !== undefined ? { data: error.data } : {}),
    }
  }
  if (error instanceof TqxProtocolError) {
    return {
      message: error.message,
      code: 'protocol_error',
      status: error.status,
      request_id: error.requestId,
      ...(error.contentType ? { content_type: error.contentType } : {}),
      ...(error.url ? { url: error.url } : {}),
    }
  }
  if (error instanceof TqxNetworkError) {
    return {
      message: error.message,
      code: 'network_error',
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(error.requestId !== undefined ? { request_id: error.requestId } : {}),
      ...(error.url ? { url: error.url } : {}),
    }
  }
  if (error instanceof TqxValidationError) {
    return {
      message: 'Invalid input',
      code: 'validation_error',
      issues: error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: issue.message,
      })),
    }
  }
  if (error instanceof TqxError) return { message: error.message, code: error.name }
  if (error instanceof Error) return { message: error.message }
  return { message: String(error) }
}

function formatErrorMessage(details: ErrorOutput): string {
  if (details.status === 409 && isVersionConflictDetails(details)) return 'Version conflict'
  return details.message
}

function formatVersionConflictHint(details: ErrorOutput): string | null {
  if (details.status !== 409) return null
  if (details.code !== 'version_conflict' && !containsVersionConflictMarker(details.data))
    return null
  const latestVersionId = findLatestVersionId(details.data)
  if (latestVersionId === undefined) return null

  const versionId = String(latestVersionId)
  return [
    '',
    `  latest_version_id: ${versionId}`,
    `  Retry with --baseVersionId=${versionId}.`,
    '  Use --confirmRebase to save against the latest HEAD instead.',
  ].join('\n')
}

function containsVersionConflictMarker(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (isVersionConflictMarker(value)) return true
  return containsVersionConflictMarker(value.detail) || containsVersionConflictMarker(value.data)
}

function isVersionConflictDetails(details: ErrorOutput): boolean {
  return details.code === 'version_conflict' || containsVersionConflictMarker(details.data)
}

function findLatestVersionId(value: unknown): string | number | undefined {
  if (!isRecord(value)) return undefined

  const direct = readVersionId(value.latest_version_id) ?? readVersionId(value.latestVersionId)
  if (direct !== undefined) return direct

  if (isVersionConflictMarker(value)) {
    const nested = findLatestVersionId(value.data)
    if (nested !== undefined) return nested
  }

  const detail = findLatestVersionId(value.detail)
  if (detail !== undefined) return detail

  return findLatestVersionId(value.data)
}

function isVersionConflictMarker(value: Record<string, unknown>): boolean {
  return (
    readVersionCode(value.code) === 'version_conflict' ||
    readVersionCode(value.error_code) === 'version_conflict' ||
    readVersionCode(value.errorCode) === 'version_conflict'
  )
}

function readVersionCode(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readVersionId(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function formatIssuePath(path: readonly { key: unknown }[] | undefined): string {
  if (!path?.length) return 'input'
  return path.reduce((result, item) => {
    if (typeof item.key === 'number') return `${result}[${item.key}]`
    const key = String(item.key)
    return result ? `${result}.${key}` : key
  }, '')
}

function stripAnsi(value: string): string {
  const pattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')
  return value.replace(pattern, '')
}

function padAnsi(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - stripAnsi(value).length))
}

function indentLines(value: string, indentation: string): string {
  return value
    .split('\n')
    .map((line) => `${indentation}${line}`)
    .join('\n')
}
