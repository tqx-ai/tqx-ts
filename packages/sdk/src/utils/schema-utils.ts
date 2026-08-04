import * as v from 'valibot'

export const nullableString = v.nullable(v.string())
export const optionalNullableString = v.optional(nullableString)
