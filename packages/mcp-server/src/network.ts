export async function abortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let onAbort: () => void = () => undefined
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([operation(), cancelled])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export class UpstreamError extends Error {
  constructor(
    readonly status: 401 | 403 | 502 | 503,
    readonly code: string,
  ) {
    super(code)
  }
}

export async function readBoundedBody(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) throw new UpstreamError(502, 'upstream_protocol_error')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await abortable(() => reader.read(), signal)
      if (done) break
      size += value.length
      if (size > limit) throw new UpstreamError(502, 'upstream_protocol_error')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
