import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sdkDirectory = resolve(root, 'packages/sdk')
const cliDirectory = resolve(root, 'packages/cli')
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tqx-package-smoke-'))
const sdkInstallDirectory = resolve(temporaryDirectory, 'sdk-install')
const cliInstallDirectory = resolve(temporaryDirectory, 'cli-install')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const sdkPackageJson = readJson(resolve(sdkDirectory, 'package.json'))
const cliPackageJson = readJson(resolve(cliDirectory, 'package.json'))
const sdkTarball = resolve(temporaryDirectory, `tqx-ai-sdk-${sdkPackageJson.version}.tgz`)
const cliTarball = resolve(temporaryDirectory, `tqx-ai-cli-${cliPackageJson.version}.tgz`)

try {
  run(
    'Pack SDK',
    process.execPath,
    ['pm', 'pack', '--destination', temporaryDirectory, '--quiet'],
    sdkDirectory,
  )
  run(
    'Pack CLI',
    process.execPath,
    ['pm', 'pack', '--destination', temporaryDirectory, '--quiet'],
    cliDirectory,
  )

  mkdirSync(sdkInstallDirectory, { recursive: true })
  mkdirSync(cliInstallDirectory, { recursive: true })
  writeFileSync(
    resolve(sdkInstallDirectory, 'package.json'),
    JSON.stringify({ name: 'tqx-sdk-package-smoke', private: true }, null, 2),
  )
  writeFileSync(
    resolve(cliInstallDirectory, 'package.json'),
    JSON.stringify({ name: 'tqx-cli-package-smoke', private: true }, null, 2),
  )
  run(
    'Install packed SDK with npm',
    npm,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', sdkTarball],
    sdkInstallDirectory,
  )
  run(
    'Install packed CLI with npm without the SDK package',
    npm,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', cliTarball],
    cliInstallDirectory,
  )

  const installedCliPackageJson = readJson(
    resolve(cliInstallDirectory, 'node_modules/@tqx-ai/cli/package.json'),
  )
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    if (installedCliPackageJson[field] && '@tqx-ai/sdk' in installedCliPackageJson[field]) {
      throw new Error(`Packed CLI unexpectedly declares @tqx-ai/sdk in ${field}`)
    }
  }
  if (existsSync(resolve(cliInstallDirectory, 'node_modules/@tqx-ai/sdk'))) {
    throw new Error('Installing the packed CLI unexpectedly installed @tqx-ai/sdk')
  }
  process.stdout.write('ok - Packed CLI installs without @tqx-ai/sdk\n')

  for (const packageName of ['sdk', 'cli']) {
    const installDirectory = packageName === 'sdk' ? sdkInstallDirectory : cliInstallDirectory
    const licensePath = resolve(installDirectory, `node_modules/@tqx-ai/${packageName}/LICENSE`)
    if (!existsSync(licensePath)) throw new Error(`Packed ${packageName} is missing LICENSE`)
  }
  process.stdout.write('ok - Packed SDK and CLI include LICENSE\n')

  run(
    'Installed Node ESM SDK import',
    'node',
    [
      '--input-type=module',
      '--eval',
      "import('@tqx-ai/sdk').then(m => { if (typeof m.TqxClient !== 'function') process.exit(1) })",
    ],
    sdkInstallDirectory,
  )
  run(
    'Installed Node CJS SDK require',
    'node',
    ['--eval', "if (typeof require('@tqx-ai/sdk').TqxClient !== 'function') process.exit(1)"],
    sdkInstallDirectory,
  )
  run(
    'Installed Node CLI version',
    'node',
    [resolve(cliInstallDirectory, 'node_modules/@tqx-ai/cli/dist/index.mjs'), '-V'],
    cliInstallDirectory,
    cliPackageJson.version,
  )
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson
}

function run(
  name: string,
  command: string,
  args: string[],
  cwd: string,
  expectedOutput?: string,
): void {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0 || (expectedOutput && !result.stdout.includes(expectedOutput))) {
    throw new Error(
      `${name} failed\nstdout: ${result.stdout}\nstderr: ${result.stderr}\nstatus: ${result.status}`,
    )
  }
  process.stdout.write(`ok - ${name}\n`)
}

interface PackageJson {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  version: string
}
