import { TradingError } from '../trading/errors'

export class ResearchError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ResearchError'
  }
}

export function researchError(error: unknown) {
  if (error instanceof ResearchError)
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      requestId: error.requestId,
    }
  // The shared exchange/provider currently use TradingError. Never expose their
  // messages as Research diagnostics or leak arbitrary upstream error payloads.
  if (error instanceof TradingError) {
    const code =
      error.kind === 'authorization'
        ? 'AUTHORIZATION_REQUIRED'
        : error.kind === 'busy'
          ? 'BUSY'
          : 'TOKEN_EXCHANGE_ERROR'
    return { code, message: 'Research authorization exchange unavailable' }
  }
  return { code: 'INTERNAL_ERROR', message: 'Research operation unavailable' }
}
