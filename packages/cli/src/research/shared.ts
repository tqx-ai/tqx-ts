import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

import type { Backtest, BacktestParameters, QubeMarket, QubePage } from '@tqx-ai/sdk'

import { CliUsageError } from '../utils/errors'
import { optionalFloat, optionalNumber } from '../utils/numbers'
import { isRecord } from '../utils/basic/type-guard'

type FactorDirection = 0 | 1

type StatusLike = {
  status?: string
  progress?: unknown
  cancelled?: boolean
  cli_status?: string
} & Record<string, unknown>

type StatusResult = StatusLike & { id: number }

type BacktestDisplayResult = StatusResult & { partial_result?: true }

export interface ContentArgs {
  code?: string
  formula?: string
  file?: string
}

export interface BacktestArgs {
  startDate?: string
  endDate?: string
  startCapital?: string
  commissionRate?: string
  slippage?: string
  frequency?: string
  symbols?: string
}

export interface ListArgs {
  offset?: string
  limit?: string
  market?: string
  keyword?: string
}

export interface WaitArgs {
  pollInterval?: string
  timeout?: string
}

interface ResearchMarketClient {
  research: {
    deleteFactor(id: number): Promise<void>
    deleteStrategy(id: number): Promise<void>
  }
}

export const listArgs = {
  market: {
    type: 'enum' as const,
    options: ['all', 'stock', 'future', 'hk', 'us', 'STOCK', 'FUTURE', 'HK', 'US'],
    default: 'all',
  },
  limit: {
    type: 'string' as const,
    description:
      'Maximum number of results (1-100) for specific market, can be doubled with "--market=all"',
  },
  offset: { type: 'string' as const, description: 'Offset into the list' },
  keyword: { type: 'string' as const, description: 'Filter by name or keyword' },
  includeContent: { type: 'boolean' as const, description: 'Include source code in results' },
}

export const backtestArgs = {
  startDate: { type: 'string' as const, description: 'Start date (YYYYMMDD or YYYY-MM-DD)' },
  endDate: { type: 'string' as const, description: 'End date (YYYYMMDD or YYYY-MM-DD)' },
  startCapital: { type: 'string' as const, description: 'Initial capital' },
  commissionRate: { type: 'string' as const, description: 'Commission rate' },
  slippage: { type: 'string' as const, description: 'Slippage' },
  frequency: { type: 'enum' as const, options: ['1d', '1M'], description: 'Bar frequency' },
  symbols: { type: 'string' as const, description: 'Comma-separated symbols' },
}

export const waitArgs = {
  pollInterval: { type: 'string' as const, description: 'Poll interval in seconds' },
  timeout: { type: 'string' as const, description: 'Maximum wait time in seconds' },
  noWait: { type: 'boolean' as const, description: 'Submit without waiting for completion' },
}

export function resourceIdArg(description: string) {
  return { type: 'positional' as const, required: true, description }
}

export function selectContent(
  args: ContentArgs,
  allowFormula: boolean,
): { value: string; type: 'python' | 'formula' } {
  const selected = selectOptionalContent(args, allowFormula)
  if (selected === undefined) {
    throw new CliUsageError(
      allowFormula
        ? 'one of --code, --formula, or --file is required'
        : 'one of --code or --file is required',
    )
  }
  return selected
}

export function selectOptionalContent(
  args: ContentArgs,
  allowFormula: boolean,
): { value: string; type: 'python' | 'formula' } | undefined {
  const candidates = [
    args.code === undefined ? undefined : { value: args.code, type: 'python' as const },
    args.formula === undefined ? undefined : { value: args.formula, type: 'formula' as const },
    args.file === undefined
      ? undefined
      : { value: readSourceFile(args.file), type: 'python' as const },
  ].filter((value) => value !== undefined)
  if (!allowFormula && args.formula !== undefined) {
    throw new CliUsageError('--formula is not supported for this command')
  }
  if (candidates.length > 1) {
    throw new CliUsageError('only one of --code, --formula, or --file may be provided')
  }
  const selected = candidates[0]
  if (selected === undefined) return undefined
  if (!selected.value.trim()) throw new CliUsageError('source code or formula cannot be empty')
  if (selected.type === 'python' && allowFormula) validateFactorCode(selected.value)
  return selected
}

function readSourceFile(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : ''
    throw new CliUsageError(`unable to read source file "${path}"${reason}`)
  }
}

function validateFactorCode(code: string): void {
  if (!/\bfactors\s*\[\s*['"][^'"]+['"]\s*\]/.test(code)) {
    throw new CliUsageError('factor Python code must reference at least one factors["field"] value')
  }
}

export function strategyWarnings(code: string, market: QubeMarket, strict: boolean): string[] {
  void code
  void market
  void strict
  return []
}

export function toMarket(value: string): QubeMarket {
  if (value.toUpperCase() === 'STOCK') return 'stock'
  if (value.toUpperCase() === 'FUTURE') return 'future'
  if (value.toUpperCase() === 'HK') return 'hk'
  if (value.toUpperCase() === 'US') return 'us'
  throw new CliUsageError(`unsupported market: ${value}`)
}

export function resourceId(value: string | undefined, name: string): number {
  const parsed = optionalNumber(value)
  if (parsed === undefined || parsed <= 0)
    throw new CliUsageError(`${name} must be a positive integer`)
  return parsed
}

export function resourceIds(values: string[] | undefined, name: string): number[] {
  const ids = (values ?? []).map((value) => resourceId(value, name))
  if (ids.length === 0) throw new CliUsageError(`${name} is required`)
  return ids
}

export function numberArg(value: string | undefined, name: string): number {
  const number = optionalFloat(value)
  if (number === undefined) throw new CliUsageError(`${name} is required`)
  return number
}

export function positiveInteger(value: string | undefined, name: string): number {
  const number = optionalNumber(value)
  if (number === undefined || number <= 0)
    throw new CliUsageError(`${name} must be a positive integer`)
  return number
}

export function boundedInteger(
  value: string | undefined,
  name: string,
  min: number,
  max: number,
): number {
  const number = positiveInteger(value, name)
  if (number < min || number > max)
    throw new CliUsageError(`${name} must be between ${min} and ${max}`)
  return number
}

export function factorDirection(value: string | undefined): FactorDirection | undefined {
  if (value === undefined) return undefined
  const normalized = value?.trim().toLowerCase()
  if (normalized === '1' || normalized === 'positive') return 1
  if (normalized === '0' || normalized === 'negative') return 0
  throw new CliUsageError('factorDirection must be Positive, Negative, 1, or 0')
}

export function normalizeDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const match = value.trim().match(/^\d{4}(?:-)?\d{2}(?:-)?\d{2}$/)
  if (!match) throw new CliUsageError(`Expected a YYYYMMDD or YYYY-MM-DD date, received ${value}`)
  const normalized = `${match[0].slice(0, 4)}-${match[0].replaceAll('-', '').slice(4, 6)}-${match[0].replaceAll('-', '').slice(6, 8)}`
  const parsed = new Date(`${normalized}T00:00:00Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(normalized.slice(0, 4)) ||
    parsed.getUTCMonth() !== Number(normalized.slice(5, 7)) - 1 ||
    parsed.getUTCDate() !== Number(normalized.slice(8, 10))
  ) {
    throw new CliUsageError(`Invalid date: ${value}`)
  }
  return normalized
}

export function backtestParameters(
  args: BacktestArgs,
  defaults: boolean,
  savedParams?: unknown,
): BacktestParameters {
  const saved = savedBacktestParameters(savedParams)
  const periodStart = normalizeDate(args.startDate) ?? saved.periodStart
  const periodEnd = normalizeDate(args.endDate) ?? saved.periodEnd
  if (periodStart !== undefined && periodEnd !== undefined && periodStart >= periodEnd) {
    throw new CliUsageError('endDate must be later than startDate')
  }
  const initBalance =
    optionalNumber(args.startCapital) ?? saved.initBalance ?? (defaults ? 10_000_000 : undefined)
  if (initBalance !== undefined && initBalance <= 0) {
    throw new CliUsageError('startCapital must be a positive integer')
  }
  const commissionRate =
    optionalFloat(args.commissionRate) ?? saved.commissionRate ?? (defaults ? 1 : undefined)
  const slippage = optionalFloat(args.slippage) ?? saved.slippage ?? (defaults ? 0 : undefined)
  if (
    (commissionRate !== undefined && commissionRate < 0) ||
    (slippage !== undefined && slippage < 0)
  ) {
    throw new CliUsageError('commissionRate and slippage cannot be negative')
  }
  return {
    periodStart,
    periodEnd,
    initBalance,
    commissionRate,
    slippage,
    frequency:
      args.frequency === undefined
        ? (saved.frequency ?? (defaults ? '1d' : undefined))
        : (args.frequency as '1d' | '1M'),
    symbols: args.symbols === undefined ? saved.symbols : parseSymbols(args.symbols),
  }
}

function savedBacktestParameters(value: unknown): BacktestParameters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const params = value as Record<string, unknown>
  const backtest = params.backtest
  if (typeof backtest !== 'object' || backtest === null || Array.isArray(backtest)) return {}
  const raw = backtest as Record<string, unknown>
  return {
    periodStart: typeof raw.period_start === 'string' ? raw.period_start : undefined,
    periodEnd: typeof raw.period_end === 'string' ? raw.period_end : undefined,
    initBalance: typeof raw.init_balance === 'number' ? raw.init_balance : undefined,
    commissionRate: typeof raw.commission_rate === 'number' ? raw.commission_rate : undefined,
    slippage: typeof raw.slippage === 'number' ? raw.slippage : undefined,
    frequency: raw.frequency === '1d' || raw.frequency === '1M' ? raw.frequency : undefined,
    symbols:
      Array.isArray(raw.symbols) && raw.symbols.every((item) => typeof item === 'string')
        ? raw.symbols
        : undefined,
  }
}

function parseSymbols(value: string): string[] {
  const symbols = value
    .split(',')
    .map((symbol) => symbol.trim())
    .filter(Boolean)
  if (symbols.length === 0) throw new CliUsageError('symbols must contain at least one symbol')
  return symbols
}

export function hasBacktestInput(args: BacktestArgs): boolean {
  return [
    args.startDate,
    args.endDate,
    args.startCapital,
    args.commissionRate,
    args.slippage,
    args.frequency,
    args.symbols,
  ].some((value) => value !== undefined)
}

export function pollOptions(args: { pollInterval?: string; timeout?: string }): {
  interval?: number
  timeout?: number
} {
  const interval =
    args.pollInterval === undefined ? undefined : numberArg(args.pollInterval, 'pollInterval')
  const timeout = args.timeout === undefined ? undefined : numberArg(args.timeout, 'timeout')
  if (interval !== undefined && interval <= 0)
    throw new CliUsageError('pollInterval must be positive')
  if (timeout !== undefined && timeout < 0) throw new CliUsageError('timeout cannot be negative')
  return { interval, timeout }
}

function isCancelledBacktest(result: StatusLike): boolean {
  const progress = isRecord(result.progress) ? result.progress : undefined
  return (
    result.cancelled === true ||
    String(result.status ?? '').toLowerCase() === 'cancelled' ||
    (typeof progress?.terminal === 'string' && progress.terminal.toLowerCase() === 'cancelled')
  )
}

export function normalizeBacktestDisplay(result: Backtest): BacktestDisplayResult {
  const display: BacktestDisplayResult = { ...result } as BacktestDisplayResult
  if (!isCancelledBacktest(display)) return display
  display.status = 'cancelled'
  display.cancelled = true
  display.partial_result = true
  return display
}

export function resultStatus(result: StatusLike): string {
  const record = result as Record<string, unknown>
  if (record.cli_status === 'TIMEOUT') return 'TIMEOUT'
  const progress = isRecord(record.progress) ? record.progress : undefined
  const terminal = progress?.terminal
  if (typeof terminal === 'string' && terminal.toLowerCase() === 'cancelled') return 'CANCELLED'
  switch (String(result.status ?? '').toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'running':
      return 'RUNNING'
    case 'done':
      return 'SUCCESS'
    case 'failed':
      return 'FAILED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return String(result.status ?? 'UNKNOWN').toUpperCase()
  }
}

export function resultResponse<T extends StatusResult>(
  result: T,
  idName: 'analysis_id' | 'run_id',
): Record<string, unknown> {
  const status = resultStatus(result)
  return { success: status === 'SUCCESS', status, [idName]: result.id, result }
}

export function listInput(args: ListArgs): {
  offset?: number
  limit?: number
  market?: QubeMarket
  keyword?: string
} {
  const offset = args.offset === undefined ? undefined : optionalNumber(args.offset)
  const limit = args.limit === undefined ? undefined : optionalNumber(args.limit)
  if (offset !== undefined && offset < 0) throw new CliUsageError('offset cannot be negative')
  if (limit !== undefined && (limit < 1 || limit > 100))
    throw new CliUsageError('limit must be between 1 and 100')
  return {
    offset,
    limit,
    market: args.market === undefined || args.market === 'all' ? undefined : toMarket(args.market),
    keyword: args.keyword,
  }
}

export function pageResponse(
  page: QubePage<Record<string, unknown>>,
  key: 'factors' | 'strategies' | 'backtests',
  includeContent: boolean,
): Record<string, unknown> {
  const items = page.items.map((item) => {
    const result: Record<string, unknown> = { ...item }
    if (!includeContent) delete result.code
    if (key === 'backtests') {
      result.equity_count = Array.isArray(result.equity) ? result.equity.length : 0
      result.trade_count = Array.isArray(result.trades) ? result.trades.length : 0
      delete result.equity
      delete result.trades
      delete result.log
      delete result.metric_views
    }
    return result
  })
  return {
    success: true,
    count: items.length,
    [key]: items,
    has_more: page.hasMore,
    next_offset: page.nextOffset,
  }
}

export async function ensureMarket(
  client: ResearchMarketClient,
  resource: 'factor' | 'strategy',
  id: number,
  actual: QubeMarket | undefined,
  expected: QubeMarket,
): Promise<void> {
  if (actual === undefined || actual === expected) return
  if (resource === 'factor') await client.research.deleteFactor(id)
  else await client.research.deleteStrategy(id)
  throw new CliUsageError(
    `Qube returned market ${actual} instead of ${expected}; the incorrectly mapped resource was deleted`,
  )
}

export function addDownload(
  output: Record<string, unknown>,
  result: Record<string, unknown>,
  destination: string | undefined,
  defaultFilename: string,
): void {
  if (destination === undefined) return
  try {
    const path = resolveDownloadPath(destination, defaultFilename)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    output.downloaded_file = path
  } catch (error) {
    output.download_error = error instanceof Error ? error.message : String(error)
  }
}

function resolveDownloadPath(destination: string, defaultFilename: string): string {
  const requested = destination === '' ? resolve(homedir(), 'Downloads') : resolve(destination)
  const hasDirectoryHint =
    destination === '' ||
    destination.endsWith('/') ||
    destination.endsWith('\\') ||
    (existsSync(requested) && statSync(requested).isDirectory())
  return hasDirectoryHint ? resolve(requested, defaultFilename) : requested
}
