import { CliUsageError } from './errors'

export function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isInteger(number)) throw new CliUsageError(`Expected an integer, received ${value}`)
  return number
}

export function optionalFloat(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isFinite(number)) throw new CliUsageError(`Expected a number, received ${value}`)
  return number
}
