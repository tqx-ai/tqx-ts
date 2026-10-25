// Test fixture only. No actual Codex/OAuth credentials, accounts or exchanges.
import { createHash, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'

const args = process.argv.slice(2)
if (process.env.TQX_DISTRIBUTION_MOCK === 'unsupported') {
  console.error('Synthetic CLI does not support this request')
  process.exit(2)
}
const override = args[args.indexOf('-c') + 1]
if (!override?.startsWith('mcp_oauth_callback_url=') || !args.includes('--no-browser'))
  process.exit(2)
const redirect = JSON.parse(override.slice('mcp_oauth_callback_url='.length)) as string
const issuer = process.env.TQX_DISTRIBUTION_ISSUER!
const state = randomBytes(16).toString('hex')
const authorize = new URL('/oauth/authorize', issuer)
authorize.searchParams.set('redirect_uri', redirect)
authorize.searchParams.set('resource', process.env.TQX_DISTRIBUTION_RESOURCE!)
authorize.searchParams.set('scope', 'trade:read order:write')
authorize.searchParams.set('state', state)
authorize.searchParams.set('code_challenge_method', 'S256')
authorize.searchParams.set('code_challenge', createHash('sha256').update(state).digest('base64url'))
console.log(authorize.href)
const input = createInterface({ input: process.stdin })
input.once('line', (line) => {
  const callback = new URL(line)
  const registered = new URL(redirect)
  const valid =
    callback.origin === registered.origin &&
    callback.pathname === registered.pathname &&
    callback.searchParams.get('state') === state &&
    callback.searchParams.get('iss') === issuer
  process.exit(
    valid && !callback.searchParams.has('error') && process.env.TQX_DISTRIBUTION_MOCK !== 'fail'
      ? 0
      : 1,
  )
})
input.once('close', () => process.exit(1))
