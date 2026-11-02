const MAX_DOCUMENT_BYTES = 65_536
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
    (contentType !== 'application/json' && contentType !== 'application/jwk-set+json') ||
    Number(response.headers.get('Content-Length')) > MAX_DOCUMENT_BYTES ||
    !response.body
  ) {
    await response.body?.cancel()
    throw new Error('OAuth discovery unavailable')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    // eslint-disable-next-line no-constant-condition -- Read a bounded stream to completion.
    while (true) {
      // eslint-disable-next-line no-await-in-loop -- Streaming reads must be sequential.
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_DOCUMENT_BYTES) throw new Error('OAuth discovery document too large')
      text += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}
