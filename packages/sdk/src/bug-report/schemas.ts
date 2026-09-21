import * as v from 'valibot'

export const CreateBugReportInputSchema = v.strictObject({
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20_000)),
  idempotencyKey: v.optional(
    v.pipe(v.string(), v.regex(/^[\x21-\x7e]{1,128}$/, 'Invalid idempotency key')),
  ),
})

export const BugReportResultSchema = v.strictObject({
  bug_id: v.string(),
  created_at: v.string(),
})

export type CreateBugReportInput = v.InferInput<typeof CreateBugReportInputSchema>
export type BugReportResult = v.InferOutput<typeof BugReportResultSchema>
