import type { SignalData } from './schemas'

export class TradingError extends Error {
  constructor(
    readonly kind: 'validation' | 'network' | 'protocol' | 'api' | 'authorization' | 'busy',
    message: string,
    readonly details: {
      code?: string
      status?: number
      requestId?: string
      outcomeUnknown?: boolean
      signal?: SignalData
    } = {},
  ) {
    super(message)
    this.name = 'TradingError'
  }
}

export function publicError(error: unknown) {
  if (!(error instanceof TradingError))
    return { kind: 'internal', message: 'Trading operation unavailable' }
  return { kind: error.kind, message: error.message, ...error.details }
}
