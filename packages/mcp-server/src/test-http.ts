import { isIP } from 'node:net'
import { mcpEnvironment } from './environment'

function invalidOrigins(): never {
  // Configuration may contain secrets or malformed input; never echo its value.
  throw new Error('Invalid configuration: TQX_TEST_HTTP_ORIGINS')
}

export function testHttpOrigins(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  const origins = new Set<string>()
  // An irrelevant variable must neither open transport nor add a startup gate elsewhere.
  if (mcpEnvironment(env) !== 'test') return origins
  const raw = env.TQX_TEST_HTTP_ORIGINS?.trim()
  if (!raw) return origins
  for (const entry of raw.split(',')) {
    const value = entry.trim()
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return invalidOrigins()
    }
    const [first, second] = url.hostname.split('.').map(Number)
    const privateAddress =
      first === 10 ||
      (first === 172 && second! >= 16 && second! <= 31) ||
      (first === 192 && second === 168)
    // origin equality rejects normalized IP spellings, default ports, URL parts and wildcards.
    if (
      url.protocol !== 'http:' ||
      isIP(url.hostname) !== 4 ||
      !privateAddress ||
      (url.port !== '' && Number(url.port) < 1) ||
      url.origin !== value ||
      /[\s"\\?#]/.test(value)
    )
      return invalidOrigins()
    origins.add(value)
  }
  return origins
}

export function isTestHttpUrl(value: string, origins: ReadonlySet<string>): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  // Compare the raw hostname before URL normalization can hide alternate IP spellings.
  // Keep each caller's existing port normalization, exact-resource and route/path checks.
  const rawHost = /^http:\/\/([^/:]+)(?::\d+)?(?:\/|$)/i.exec(value)?.[1]
  return (
    url.protocol === 'http:' &&
    origins.has(url.origin) &&
    !/[\s"\\?#]/.test(value) &&
    !url.username &&
    !url.password &&
    rawHost === url.hostname
  )
}
