import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertLiveIntegrationAllowed } from './local-policy'

assertLiveIntegrationAllowed()

// Creates a fresh isolated home; never writes to the default user home or keyring.
const repo = resolve(import.meta.dirname, '../..')
const root = resolve(repo, 'work/codex/clients')
await mkdir(root, { recursive: true })
const home = await mkdtemp(resolve(root, 'home-'))
await writeFile(
  resolve(home, 'config.toml'),
  await readFile(resolve(import.meta.dirname, 'config.example.toml')),
)
await writeFile(
  resolve(home, 'start-isolated.ps1'),
  [
    '$ErrorActionPreference = "Stop"',
    '$env:CODEX_HOME = $PSScriptRoot',
    '$env:NO_PROXY = "127.0.0.1,localhost,::1"',
    'codex mcp login tqx --scopes trade:read --oauth-client-registration dcr',
    '',
  ].join('\n'),
)
console.log(`Isolated client prepared: ${home}`)
console.log(
  'Run its start-isolated.ps1 while the Owner local environment is READY. No global configuration has been changed.',
)
