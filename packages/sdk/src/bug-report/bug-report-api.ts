import * as v from 'valibot'

import APIs from '../config/APIs'
import {
  BugReportResultSchema,
  CreateBugReportInputSchema,
  type CreateBugReportInput,
  type BugReportResult,
} from './schemas'
import { TqxValidationError } from '../errors'

type Request = <TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  path: string,
  options: { schema: TSchema; method?: 'POST'; body?: unknown; headers?: Record<string, string> },
) => Promise<v.InferOutput<TSchema>>

export interface BugsApi {
  report(input: CreateBugReportInput): Promise<BugReportResult>
}

export class BugsApiClient implements BugsApi {
  readonly #request: Request

  constructor(request: Request) {
    this.#request = request
  }

  async report(input: CreateBugReportInput): Promise<BugReportResult> {
    const result = v.safeParse(CreateBugReportInputSchema, input)
    if (!result.success) throw new TqxValidationError('Invalid SDK input', result.issues)
    const parsed = result.output
    return this.#request(APIs.BUG_REPORTS, {
      schema: BugReportResultSchema,
      method: 'POST',
      headers: parsed.idempotencyKey ? { 'Idempotency-Key': parsed.idempotencyKey } : undefined,
      body: { title: parsed.title, description: parsed.description },
    })
  }
}
