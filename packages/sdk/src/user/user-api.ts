import * as v from 'valibot'

import APIs from '../config/APIs'
import { type ApiKeyVerificationData, type HealthData } from '../schemas'
import { BalanceDataSchema, type BalanceData } from './schemas'

export interface UserApi {
  verify(): Promise<ApiKeyVerificationData>
  getStatus(): Promise<HealthData>
  getBalance(): Promise<BalanceData>
}

export interface UserRequestOptions<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
> {
  schema: TSchema
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | undefined>
  body?: unknown
  headers?: Record<string, string>
}

export type UserRequest = <TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  path: string,
  options: UserRequestOptions<TSchema>,
) => Promise<v.InferOutput<TSchema>>

export interface UserApiClientOptions {
  request: UserRequest
  verify: () => Promise<ApiKeyVerificationData>
  getStatus: () => Promise<HealthData>
}

export class UserApiClient implements UserApi {
  readonly #request: UserRequest
  readonly #verify: () => Promise<ApiKeyVerificationData>
  readonly #getStatus: () => Promise<HealthData>

  constructor(options: UserApiClientOptions) {
    this.#request = options.request
    this.#verify = options.verify
    this.#getStatus = options.getStatus
  }

  verify(): Promise<ApiKeyVerificationData> {
    return this.#verify()
  }

  getStatus(): Promise<HealthData> {
    return this.#getStatus()
  }

  getBalance(): Promise<BalanceData> {
    return this.#request(APIs.USER_BALANCE, { schema: BalanceDataSchema })
  }
}
