import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { decodeJwt, decodeProtectedHeader } from 'jose'
import { z } from 'zod'
import { privateReadPath } from './read-only-private'
import { checkReadPermit } from './read-only-runner'
import { readBoundedBody } from '../src/network'

// Owner-authorized controlled JWT faults only. These tokens were NOT issued by normal AS flows.
async function main() {
  const { values } = parseArgs({
    options: {
      'controlled-signed-B-faults': { type: 'boolean' },
      generation: { type: 'string' },
      expires: { type: 'string' },
      private: { type: 'string' },
      profile: { type: 'string' },
      sources: { type: 'string' },
      output: { type: 'string' },
    },
  })
  if (!values['controlled-signed-B-faults'])
    throw new Error('Explicit controlled JWT fault opt-in required')
  checkReadPermit(
    {
      approved: true,
      phase: 'B',
      subject: '740001',
      generation: values.generation ?? '',
      expiresAt: Date.parse(values.expires ?? ''),
      maxToolObservationsPerMinute: 20,
    },
    values.generation ?? '',
  )
  if (!values.private || !values.profile || !values.sources || !values.output)
    throw new Error('Missing private JWT fault input')
  const profile = z
    .object({
      testOnly: z.literal(true),
      generation: z.literal(values.generation),
      env: z.object({
        OAUTH_MODE: z.literal('test'),
        OAUTH_ISSUER: z.literal('http://127.0.0.1:26825'),
        OAUTH_RESOURCE_MCP: z.literal('http://127.0.0.1:3004/mcp'),
        OAUTH_SIGNING_PRIVATE_KEY_FILE: z.string(),
        OAUTH_SIGNING_KEY_ID: z.string(),
      }),
    })
    .parse(
      JSON.parse(await readFile(await privateReadPath(values.private, values.profile), 'utf8')),
    )
  const sourcesPath = await privateReadPath(values.private, values.sources)
  const directory = await privateReadPath(values.private, values.output)
  const source = z
    .object({
      schemaVersion: z.literal(1),
      testOnly: z.literal(true),
      phase: z.literal('B'),
      generation: z.literal(values.generation),
      subject: z.literal('740001'),
      sources: z.record(z.string(), z.string()),
    })
    .passthrough()
    .parse(JSON.parse(await readFile(sourcesPath, 'utf8')))
  if (!source.sources.read) throw new Error('Missing real positive READ source')
  const positive = source.sources.read,
    claims = decodeJwt(positive),
    header = decodeProtectedHeader(positive)
  if (
    claims.sub !== '740001' ||
    claims.iss !== profile.env.OAUTH_ISSUER ||
    claims.aud !== profile.env.OAUTH_RESOURCE_MCP ||
    claims.scope !== 'trade:read' ||
    header.alg !== 'RS256' ||
    header.kid !== profile.env.OAUTH_SIGNING_KEY_ID
  )
    throw new Error('Positive source does not match the explicit isolated AS profile')
  const keyPath = await privateReadPath(values.private, profile.env.OAUTH_SIGNING_PRIVATE_KEY_FILE)
  const key = createPrivateKey(await readFile(keyPath)),
    publicKey = createPublicKey(key)
  const response = await fetch(new URL('/.well-known/jwks.json', profile.env.OAUTH_ISSUER), {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('Current isolated AS keys unavailable')
  }
  const bytes = await readBoundedBody(response, 262144, AbortSignal.timeout(5000))
  const jwks = z
    .object({
      keys: z.array(
        z
          .object({
            kid: z.string(),
            kty: z.string(),
            n: z.string().optional(),
            e: z.string().optional(),
          })
          .passthrough(),
      ),
    })
    .parse(JSON.parse(new TextDecoder().decode(bytes)))
  const advertised = jwks.keys.filter((entry) => entry.kid === header.kid)
  const actual = publicKey.export({ format: 'jwk' })
  if (
    advertised.length !== 1 ||
    advertised[0]!.kty !== 'RSA' ||
    advertised[0]!.n !== actual.n ||
    advertised[0]!.e !== actual.e
  )
    throw new Error('Profile signing key does not match the current isolated JWKS')
  const parts = positive.split('.')
  if (
    !verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2]!, 'base64url'),
    )
  )
    throw new Error('AS profile key does not verify the positive source')
  const receipt: Record<string, unknown>[] = []
  for (const [role, claim, value] of [
    ['expired', 'exp', Math.floor(Date.now() / 1000) - 30],
    ['wrong-audience', 'aud', 'http://127.0.0.1:3004/not-mcp'],
    ['no-scope', 'scope', ''],
  ] as const) {
    const payload = { ...claims, [claim]: value }
    if (
      !isDeepStrictEqual(
        Object.fromEntries(Object.entries(payload).filter(([name]) => name !== claim)),
        Object.fromEntries(Object.entries(claims).filter(([name]) => name !== claim)),
      )
    )
      throw new Error('JWT fault changed multiple claims')
    const body = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
    const signature = sign('RSA-SHA256', Buffer.from(body), key)
    if (!verify('RSA-SHA256', Buffer.from(body), publicKey, signature))
      throw new Error('Controlled fault signature invalid')
    source.sources[role] = `${body}.${signature.toString('base64url')}`
    receipt.push({
      role,
      fixtureKind: 'controlled-signed-JWT',
      normalASIssued: false,
      changedClaims: [claim],
      validSignature: true,
    })
  }
  const damaged = [...parts[2]!]
  damaged[0] = damaged[0] === 'A' ? 'B' : 'A'
  const badSignature = damaged.join('')
  if (
    verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(badSignature, 'base64url'),
    )
  )
    throw new Error('Controlled bad signature remained valid')
  source.sources['bad-signature'] = `${parts[0]}.${parts[1]}.${badSignature}`
  receipt.push({
    role: 'bad-signature',
    fixtureKind: 'controlled-signature-corruption',
    normalASIssued: false,
    changedClaims: [],
    validSignature: false,
  })
  source.controlledJwtFaults = receipt
  await writeFile(resolve(directory, 'sources-with-faults.json'), JSON.stringify(source, null, 2), {
    flag: 'wx',
    mode: 0o600,
  })
  await writeFile(
    resolve(directory, 'controlled-jwt-faults.receipt.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        testOnly: true,
        phase: 'B',
        generation: values.generation,
        subject: '740001',
        keyReadOnly: true,
        sharedStateModified: false,
        normalASIssued: false,
        faults: receipt,
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  )
  console.log(
    JSON.stringify({
      ok: true,
      controlledSignedFaults: 3,
      corruptedSignatureFaults: 1,
      normalASIssued: false,
      keyPrinted: false,
      tradingCalls: 0,
    }),
  )
}
try {
  await main()
} catch {
  console.error('Controlled B JWT fault preparation rejected; no key or token details printed')
  process.exitCode = 1
}
