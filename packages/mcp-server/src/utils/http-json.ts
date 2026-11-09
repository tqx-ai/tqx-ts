// Callers own timeout signals and map all failures to credential-free domain errors.
export async function readJson(response: Response, maxBytes: number): Promise<unknown> {
  const type = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json' || Number(response.headers.get('Content-Length')) > maxBytes) {
    await response.body?.cancel()
    throw new Error('Invalid JSON response')
  }
  if (!response.body) throw new Error('Empty response')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let bytes = 0
  try {
    // eslint-disable-next-line no-constant-condition -- Bounded sequential stream reader.
    while (true) {
      // eslint-disable-next-line no-await-in-loop -- Consume the stream in order.
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > maxBytes) throw new Error('JSON response too large')
      text += decoder.decode(part.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
