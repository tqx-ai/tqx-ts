import * as v from 'valibot'

export const bugReportSchema = v.strictObject({
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20_000)),
  idempotencyKey: v.optional(
    v.pipe(v.string(), v.regex(/^[\x21-\x7e]{1,128}$/, 'Invalid idempotency key')),
  ),
})

export type BugReportInput = v.InferOutput<typeof bugReportSchema>
