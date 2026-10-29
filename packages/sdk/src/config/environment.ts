import * as v from 'valibot'

import { TqxConfigurationError } from '../errors'

export type TqxEnvironment = 'local' | 'test' | 'prod'
export type TqxRuntimeEnvironment = Readonly<Record<string, string | undefined>>

export interface TqxEndpointOptions {
  baseUrl?: string
  tradingBaseUrl?: string
  /** Optional deployment selection. NODE_ENV never selects a deployment. */
  environment?: TqxEnvironment
}

export interface TqxResolvedEndpoints {
  environment?: TqxEnvironment
  requestedEnvironment?: string
  baseUrl?: string
  tradingBaseUrl: string
}

const environmentSchema = v.picklist(['local', 'test', 'prod'])

/** Resolves public endpoints without network, credentials, or profile file access. */
export function resolveTqxEndpoints(
  options: TqxEndpointOptions = {},
  runtime: TqxRuntimeEnvironment = process.env,
): TqxResolvedEndpoints {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
    throw new TqxConfigurationError('runtimeEnvironment must be an environment object')
  }
  const requested = options.environment !== undefined ? options.environment : runtime.TQX_ENV
  const parsed = v.safeParse(environmentSchema, requested)
  // Unknown/legacy selector values retain the original configuration chain.
  const environment = parsed.success ? parsed.output : undefined
  const prefix = environment ? `TQX_${environment.toUpperCase()}` : undefined
  const profileUrl = (suffix: string) =>
    prefix ? configuredUrl(runtime, `${prefix}_${suffix}`) : undefined
  const runtimeBase = configuredUrl(runtime, 'TQX_BASE_URL')
  // Keep the existing explicit-option/global-variable precedence. Profiles are
  // optional overrides of build defaults, never a new startup prerequisite.
  const base =
    options.baseUrl !== undefined
      ? options.baseUrl
      : (runtimeBase ??
        profileUrl('BASE_URL') ??
        (environment
          ? __TQX_BUILD_DEFAULT_BASE_URL__.trim() || undefined
          : __TQX_BUILD_DEFAULT_BASE_URL__))
  const baseUrl = base === undefined ? undefined : normalizeBaseUrl(base)
  const trading =
    runtimeBase ??
    options.tradingBaseUrl ??
    profileUrl('TRADING_BASE_URL') ??
    profileUrl('BASE_URL') ??
    (__TQX_BUILD_DEFAULT_TRADING_BASE_URL__.trim() || baseUrl)
  return {
    ...(environment ? { environment } : {}),
    ...(typeof requested === 'string' ? { requestedEnvironment: requested } : {}),
    baseUrl,
    tradingBaseUrl: normalizeBaseUrl(trading),
  }
}

function configuredUrl(runtime: TqxRuntimeEnvironment, name: string): string | undefined {
  const value = runtime[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new TqxConfigurationError(`${name} must be a URL string`)
  return value.trim() || undefined
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  if (baseUrl !== undefined && typeof baseUrl !== 'string') {
    throw new TqxConfigurationError('baseUrl must be an absolute HTTP(S) URL')
  }
  const trimmed = baseUrl?.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new TqxConfigurationError(
      'baseUrl is required because the SDK was built without TQX_BUILD_BASE_URL',
    )
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new TqxConfigurationError('baseUrl must be an absolute HTTP(S) URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TqxConfigurationError('baseUrl must use HTTP or HTTPS')
  }
  return parsed.toString().replace(/\/$/, '')
}
