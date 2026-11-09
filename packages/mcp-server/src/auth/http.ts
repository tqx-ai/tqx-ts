const REQUEST_TIMEOUT_MS = 5000

// Only public discovery documents use this reader. No credentials are sent upstream.
export async function fetchOAuthJson(
  url: string,
  fetchImplementation: typeof globalThis.fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const response = await fetchImplementation(url, {
    method: 'GET',
    headers: { Accept: 'application/json, application/jwk-set+json' },
    redirect: 'error',
    credentials: 'omit',
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  })
  const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()
  if (
    response.status !== 200 ||
    (contentType !== 'application/json' && contentType !== 'application/jwk-set+json')
  ) {
    await response.body?.cancel()
    throw new Error('OAuth discovery unavailable')
  }

  return (await response.json()) as unknown
}
