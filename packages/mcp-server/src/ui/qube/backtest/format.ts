import type { Summary } from '../../../research/backtest-report/contract'

export const numeric = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)

export function formatValue(value: number | null, currency?: string | null, percent = false) {
  if (value === null) return '\u2014'
  return percent ? `${numeric(value * 100)}%` : `${currency ? `${currency} ` : ''}${numeric(value)}`
}

export function marketTime(value: string, market?: Summary['market']) {
  if (value.length === 10 || !market) return value
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: market === 'hk' ? 'Asia/Hong_Kong' : 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
}

export const identityKey = (id: { type: string; runId: string }) => `${id.type}:${id.runId}`
