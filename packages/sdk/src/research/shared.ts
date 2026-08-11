/* eslint-disable no-await-in-loop */

import * as v from 'valibot'

import {
  ListQubeResourcesInputSchema,
  parseResearchInput,
  PollIntervalSchema,
  PollTimeoutSchema,
  type ListQubeResourcesInput,
  type PollOptions,
  type PollResult,
  type QubePage,
  QubePageResponseSchema,
  ResourceIdSchema,
} from './schemas'

export interface ResearchRequestOptions<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
> {
  schema: TSchema
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: unknown
  headers?: Record<string, string>
}

export type ResearchRequest = <
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  path: string,
  options: ResearchRequestOptions<TSchema>,
) => Promise<v.InferOutput<TSchema>>

export function resourceId(value: number): string {
  return String(parseResearchInput(ResourceIdSchema, value))
}

export async function listResources<T>(
  request: ResearchRequest,
  path: string,
  input: ListQubeResourcesInput,
  itemSchema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>,
): Promise<QubePage<T>> {
  const parsed = parseResearchInput(ListQubeResourcesInputSchema, input)
  const response = await request(`${path}/page`, {
    schema: QubePageResponseSchema,
    query: {
      offset: parsed.offset ?? 0,
      limit: parsed.limit ?? 100,
      market: parsed.market,
      keyword: parsed.keyword,
    },
  })
  const items = Array.isArray(response)
    ? response
    : Array.isArray(response.items)
      ? response.items
      : []
  const parsedItems = items.map((item) => parseResearchInput(itemSchema, item))
  return {
    items: parsedItems,
    hasMore: !Array.isArray(response) && response.has_more === true,
    nextOffset:
      !Array.isArray(response) && typeof response.next_offset === 'number'
        ? response.next_offset
        : null,
  }
}

export async function pollResource<T extends { status?: string }>(
  fetchResult: () => Promise<T>,
  terminalStatuses: Set<string>,
  options: PollOptions<T>,
): Promise<PollResult<T>> {
  const interval = parseResearchInput(PollIntervalSchema, options.interval ?? 2)
  const timeout = parseResearchInput(PollTimeoutSchema, options.timeout ?? 600)
  const started = Date.now()
  while (true) {
    const result = await fetchResult()
    options.progressCallback?.(result)
    if (terminalStatuses.has(String(result.status ?? '').toLowerCase())) return result
    if ((Date.now() - started) / 1000 >= timeout) {
      return { ...result, cli_status: 'TIMEOUT', timeout_seconds: timeout }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, interval * 1000))
  }
}
