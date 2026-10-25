import { TqxClient } from '@tqx-ai/sdk'
import type { ReadRequestEvidence, ReadTarget } from './read-only-contract'

// This computes an EXPECTATION using the public SDK's actual URL builder. It sends no request.
// Passing proof still requires matching append-only evidence from the separately running backend.
export async function encodedReadPathProof(
  target: ReadTarget,
  tool: string,
  args: Record<string, unknown>,
  requests: readonly ReadRequestEvidence[],
): Promise<boolean> {
  if (!target.apiResource || !['getOrder', 'getSignal'].includes(tool) || requests.length !== 1)
    return false
  const base = new URL(target.apiResource)
  if (
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    !base.port ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    return false
  const rawId = args[tool === 'getOrder' ? 'orderId' : 'signalId']
  if (typeof rawId !== 'string') return false
  let expected: URL | undefined,
    expectedMethod: string | undefined,
    calls = 0
  const client = new TqxClient({
    baseUrl: base.origin,
    tradingBaseUrl: base.origin,
    bearerToken: 'synthetic-url-projection',
    runtimeEnvironment: {},
    fetch: async (input, init) => {
      calls++
      expected = new URL(input instanceof Request ? input.url : String(input))
      expectedMethod = init?.method ?? 'GET'
      return Response.json({ error: 'permission_denied' }, { status: 403 })
    },
  })
  try {
    if (tool === 'getOrder') await client.trading.getOrder(rawId)
    else await client.trading.getSignal(rawId)
  } catch {
    /* The inert 403 is intentional: only URL construction is being projected. */
  }
  const actual = requests[0]!
  return (
    calls === 1 &&
    !!expected &&
    expected.origin === base.origin &&
    expectedMethod === 'GET' &&
    expected.search === '' &&
    expected.hash === '' &&
    expected.pathname.endsWith(`/${encodeURIComponent(rawId)}`) &&
    actual.method === 'GET' &&
    actual.origin === expected.origin &&
    actual.rawPath === expected.pathname &&
    actual.queryPresent === false &&
    actual.status === 403
  )
}
