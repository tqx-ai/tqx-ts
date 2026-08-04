import type { BaseIssue } from 'valibot'

export class TqxError extends Error {
  override readonly name: string = 'TqxError'
}

export class TqxConfigurationError extends TqxError {
  override readonly name = 'TqxConfigurationError'
}

export class TqxValidationError extends TqxError {
  override readonly name = 'TqxValidationError'

  constructor(
    message: string,
    readonly issues: readonly BaseIssue<unknown>[],
  ) {
    super(message)
  }
}

export class TqxNetworkError extends TqxError {
  override readonly name = 'TqxNetworkError'
}

export class TqxProtocolError extends TqxError {
  override readonly name = 'TqxProtocolError'

  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null = null,
    readonly contentType: string | null = null,
    readonly url: string | null = null,
  ) {
    super(message)
  }
}

export class TqxApiError extends TqxError {
  override readonly name = 'TqxApiError'

  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null,
    readonly data: unknown = null,
  ) {
    super(message)
  }
}
