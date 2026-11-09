import { toStandardJsonSchema } from '@valibot/to-json-schema'
import type { StandardJsonSchema } from '@valibot/to-json-schema'
import type * as v from 'valibot'

// Checks and string normalization run in Valibot. JSON Schema describes accepted
// input shapes; symbol patterns must also accept pre-normalized strings.
export function toolSchema<T extends v.GenericSchema>(
  schema: T,
): StandardJsonSchema<v.InferInput<T>, v.InferOutput<T>> {
  const adapter = toStandardJsonSchema(schema)
  const standard = adapter['~standard']
  return {
    '~standard': {
      ...standard,
      jsonSchema: {
        input: (options: Parameters<typeof standard.jsonSchema.input>[0]) =>
          standard.jsonSchema.input({
            ...options,
            libraryOptions: { ignoreActions: ['check', 'trim', 'to_upper_case'] },
          }),
        output: (options: Parameters<typeof standard.jsonSchema.output>[0]) =>
          standard.jsonSchema.output({
            ...options,
            libraryOptions: { ignoreActions: ['check', 'trim', 'to_upper_case'] },
          }),
      },
    },
  }
}
