import { completable } from '@modelcontextprotocol/server'
import type { CompleteCallback, StandardSchemaV1 } from '@modelcontextprotocol/server'
import type { StandardJsonSchema } from '@valibot/to-json-schema'
import type * as v from 'valibot'

import { toolSchema } from './tool-schema'

type PromptCompleters<TEntries extends v.ObjectEntries> = {
  [K in keyof TEntries]?: CompleteCallback<StandardSchemaV1<string, string>>
}

type PromptSchema<TEntries extends v.ObjectEntries> = StandardJsonSchema<
  v.InferInput<v.ObjectSchema<TEntries, undefined>>,
  v.InferOutput<v.ObjectSchema<TEntries, undefined>>
> & {
  readonly shape: Record<string, StandardSchemaV1>
}

function unwrapOptionalEntry(entry: v.GenericSchema): StandardSchemaV1 {
  const candidate = entry as { type?: unknown; wrapped?: v.GenericSchema }
  if (candidate.type === 'optional' && candidate.wrapped) {
    return candidate.wrapped
  }
  return entry
}

/**
 * Wrap a Valibot object schema for `McpServer.registerPrompt` without Zod.
 *
 * The MCP SDK derives prompt argument metadata from Standard JSON Schema and
 * looks up argument completers on `argsSchema.shape[name]`. Each completable
 * field is wrapped on a fresh lightweight handle so repeated per-request server
 * registrations never mutate shared Valibot schema instances.
 */
export function promptSchema<TEntries extends v.ObjectEntries>(
  schema: v.ObjectSchema<TEntries, undefined>,
  completions: PromptCompleters<TEntries> = {},
): PromptSchema<TEntries> {
  const standard = toolSchema(schema)
  const shape: Record<string, StandardSchemaV1> = {}

  for (const [key, entry] of Object.entries(schema.entries)) {
    const inner = unwrapOptionalEntry(entry)
    const complete = completions[key as keyof TEntries]
    if (complete) {
      const handle: StandardSchemaV1<string, string> = {
        '~standard': inner['~standard'] as StandardSchemaV1.Props<string, string>,
      }
      shape[key] = completable(handle, complete)
    } else {
      shape[key] = inner
    }
  }

  return Object.defineProperty({ ...standard }, 'shape', {
    value: shape,
    enumerable: false,
    writable: false,
    configurable: false,
  }) as PromptSchema<TEntries>
}
