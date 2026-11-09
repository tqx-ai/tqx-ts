import * as v from 'valibot'

import { SUPPORTED_SCOPES } from './scopes'

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(2048), v.regex(/^\S+$/))
const timestamp = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const scopes = new Set<string>(SUPPORTED_SCOPES)

export const accessTokenClaimsSchema = v.object({
  iss: identifier,
  aud: identifier,
  sub: identifier,
  client_id: identifier,
  sid: identifier,
  jti: identifier,
  scope: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(512),
    v.check((value) => {
      const values = value.split(' ')
      return values.every((scope) => scopes.has(scope)) && new Set(values).size === values.length
    }),
  ),
  iat: timestamp,
  exp: timestamp,
  nbf: v.optional(timestamp),
  agent_id: v.optional(identifier),
})
