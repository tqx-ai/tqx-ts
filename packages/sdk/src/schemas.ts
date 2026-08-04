import * as v from 'valibot'

import { nullableString } from './utils/schema-utils'

export const ApiEnvelopeSchema = v.looseObject({
  code: v.string(),
  message: v.string(),
  data: v.unknown(),
  request_id: nullableString,
  timestamp: v.number(),
})

export const ApiKeyVerificationDataSchema = v.looseObject({
  valid: v.literal(true),
})

export const HealthDataSchema = v.looseObject({
  status: v.string(),
  service: v.string(),
  version: v.string(),
})

export type ApiKeyVerificationData = v.InferOutput<typeof ApiKeyVerificationDataSchema>
export type HealthData = v.InferOutput<typeof HealthDataSchema>
