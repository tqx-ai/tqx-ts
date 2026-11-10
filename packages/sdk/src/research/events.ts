/* eslint-disable no-await-in-loop */
import * as v from 'valibot'

import APIs from '../config/APIs'
import { TqxNetworkError, TqxProtocolError } from '../errors'
import {
  BacktestSchema,
  FactorAnalysisSchema,
  FactorTuningSchema,
  StrategyTuningSchema,
  parseResearchInput,
} from './schemas'
import { resourceId } from './shared'

export const ResearchEventOptionsSchema = v.strictObject({
  after: v.optional(v.pipe(v.number(), v.safeInteger(), v.minValue(0))),
  signal: v.optional(v.custom<AbortSignal>((value) => value instanceof AbortSignal)),
})
export type ResearchEventOptions = v.InferInput<typeof ResearchEventOptionsSchema>
export interface ResearchEvent<T> {
  event: 'snapshot' | 'done' | 'error' | 'cancelled'
  id: string
  seq: number
  value: T
}
export type ResearchStreamRequest = (
  path: string,
  options: { query: Record<string, string | number | undefined>; signal?: AbortSignal },
) => Promise<Response>

/** Protocol 1 supplies full snapshots. Pass the last seq as after when reconnecting. */
export class ResearchEventsApi {
  constructor(private readonly request: ResearchStreamRequest) {}

  streamFactorAnalysis(id: string, options: ResearchEventOptions = {}) {
    return this.stream(
      `${APIs.RESEARCH_FACTOR_ANALYSES}/${resourceId(id)}/events`,
      id,
      'run',
      FactorAnalysisSchema,
      options,
    )
  }
  streamBacktest(id: string, options: ResearchEventOptions = {}) {
    return this.stream(
      `${APIs.RESEARCH_BACKTESTS}/${resourceId(id)}/events`,
      id,
      'run',
      BacktestSchema,
      options,
    )
  }
  streamFactorTuning(id: string, options: ResearchEventOptions = {}) {
    return this.stream(
      `${APIs.RESEARCH_FACTOR_TUNINGS}/${resourceId(id)}/events`,
      id,
      'tuning',
      FactorTuningSchema,
      options,
    )
  }
  streamStrategyTuning(id: string, options: ResearchEventOptions = {}) {
    return this.stream(
      `${APIs.RESEARCH_STRATEGY_TUNINGS}/${resourceId(id)}/events`,
      id,
      'tuning',
      StrategyTuningSchema,
      options,
    )
  }

  private async *stream<
    TSchema extends v.BaseSchema<unknown, { id: string }, v.BaseIssue<unknown>>,
  >(
    path: string,
    id: string,
    key: 'run' | 'tuning',
    schema: TSchema,
    options: ResearchEventOptions,
  ): AsyncGenerator<ResearchEvent<v.InferOutput<TSchema>>> {
    const parsed = parseResearchInput(ResearchEventOptionsSchema, options)
    if (parsed.signal?.aborted) return
    const response = await this.request(path, {
      query: { protocol: 1, after: parsed.after },
      signal: parsed.signal,
    })
    const invalid = () =>
      new TqxProtocolError(
        'The TQX API returned an invalid research event',
        response.status,
        response.headers.get('X-Request-ID'),
        response.headers.get('Content-Type'),
        response.url || null,
      )
    const reader = response.body!.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let pending = ''
    let event = ''
    let eventId = ''
    let data: string[] = []
    let eventSize = 0
    let finished = false
    try {
      while (!finished && !parsed.signal?.aborted) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
          chunk = await reader.read()
        } catch (cause) {
          if (parsed.signal?.aborted) return
          throw new TqxNetworkError('Unable to read the TQX research event stream', {
            cause,
            status: response.status,
            requestId: response.headers.get('X-Request-ID'),
            url: response.url || null,
          })
        }
        try {
          pending += decoder.decode(chunk.value, { stream: !chunk.done })
        } catch {
          throw invalid()
        }
        finished = chunk.done
        if (pending.length > 2 * 1024 * 1024) throw invalid()
        let newline: number
        while ((newline = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, newline).replace(/\r$/, '')
          pending = pending.slice(newline + 1)
          if (line === '') {
            if (data.length) {
              let raw: unknown
              try {
                raw = JSON.parse(data.join('\n'))
              } catch {
                throw invalid()
              }
              const result = v.safeParse(
                v.looseObject({
                  seq: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
                  [key]: schema,
                }),
                raw,
              )
              if (
                !result.success ||
                !['snapshot', 'done', 'error', 'cancelled'].includes(event) ||
                (result.output[key] as { id: string }).id !== id
              )
                throw invalid()
              yield {
                event: event as ResearchEvent<never>['event'],
                id: eventId,
                seq: result.output.seq as number,
                value: result.output[key] as v.InferOutput<TSchema>,
              }
              if (event !== 'snapshot') return
            }
            event = ''
            eventId = ''
            data = []
            eventSize = 0
          } else if (!line.startsWith(':')) {
            const colon = line.indexOf(':')
            const field = colon === -1 ? line : line.slice(0, colon)
            const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
            if (field === 'event') event = value
            if (field === 'id') eventId = value
            if (field === 'data') {
              eventSize += value.length
              if (eventSize > 2 * 1024 * 1024) throw invalid()
              data.push(value)
            }
          }
        }
        if (finished && (pending.trim() || data.length)) throw invalid()
      }
    } finally {
      try {
        await reader.cancel()
      } catch {
        /* The stream may already be closed. */
      }
      reader.releaseLock()
    }
  }
}
