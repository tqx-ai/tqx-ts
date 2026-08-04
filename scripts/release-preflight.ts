import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rootPackageJson = readJson(resolve(root, 'package.json'))
const lernaJson = readJson(resolve(root, 'lerna.json'))
const sdkPackageJson = readJson(resolve(root, 'packages/sdk/package.json'))
const cliPackageJson = readJson(resolve(root, 'packages/cli/package.json'))
const expectedVersion = rootPackageJson.version

const versions = new Map([
  ['package.json', rootPackageJson.version],
  ['lerna.json', lernaJson.version],
  ['packages/sdk/package.json', sdkPackageJson.version],
  ['packages/cli/package.json', cliPackageJson.version],
])

for (const [file, version] of versions) {
  if (version !== expectedVersion) {
    throw new Error(`${file} has version ${version}; expected ${expectedVersion}`)
  }
}
process.stdout.write(`ok - All workspace versions are ${expectedVersion}\n`)

for (const [name, packageJson] of [
  ['root', rootPackageJson],
  ['SDK', sdkPackageJson],
  ['CLI', cliPackageJson],
] as const) {
  if (packageJson.license !== 'GPL-3.0-only') {
    throw new Error(`${name} package license must be GPL-3.0-only`)
  }
}
process.stdout.write('ok - All package licenses are GPL-3.0-only\n')

if (cliPackageJson.dependencies?.['@tqx-ai/sdk'] !== 'workspace:*') {
  throw new Error('CLI must use workspace:* for its local SDK dependency')
}
process.stdout.write('ok - CLI uses the workspace SDK dependency\n')

for (const key of [
  'TQX_BUILD_BASE_URL',
  'TQX_BUILD_TRADING_BASE_URL',
  'TQX_BUILD_GET_API_KEY_URL',
]) {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`${key} is required for a production release`)

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${key} must be an absolute URL`)
  }
  if (url.protocol !== 'https:') throw new Error(`${key} must use HTTPS`)
  if (key === 'TQX_BUILD_BASE_URL' && !url.pathname.replace(/\/+$/, '').endsWith('/pandaApi')) {
    throw new Error(`${key} must end with /pandaApi for Qube research requests`)
  }
}
process.stdout.write('ok - Production URLs are configured with HTTPS\n')

const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
if (!changelog.includes(`## ${expectedVersion}`)) {
  throw new Error(`CHANGELOG.md is missing a ${expectedVersion} release section`)
}
process.stdout.write(`ok - CHANGELOG includes ${expectedVersion}\n`)

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson
}

interface PackageJson {
  dependencies?: Record<string, string>
  license?: string
  version: string
}
