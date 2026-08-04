import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sdkDirectory = resolve(root, 'packages/sdk')
const cliDirectory = resolve(root, 'packages/cli')
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'tqx-package-smoke-'))
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

  writeFileSync(
    resolve(temporaryDirectory, 'package.json'),
    JSON.stringify({ name: 'tqx-package-smoke', private: true }, null, 2),
  )
  run(
    'Install packed SDK and CLI with npm',
    npm,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', sdkTarball, cliTarball],
    temporaryDirectory,
  )

  const installedCliPackageJson = readJson(
    resolve(temporaryDirectory, 'node_modules/@tqx-ai/cli/package.json'),
  )
  const installedSdkVersion = installedCliPackageJson.dependencies?.['@tqx-ai/sdk']
  if (installedSdkVersion !== sdkPackageJson.version) {
    throw new Error(
      `CLI dependency was not rewritten to the SDK version: expected ${sdkPackageJson.version}, received ${installedSdkVersion}`,
    )
  }
  process.stdout.write(`ok - CLI dependency rewritten to ${installedSdkVersion}\n`)

  for (const packageName of ['sdk', 'cli']) {
    const licensePath = resolve(temporaryDirectory, `node_modules/@tqx-ai/${packageName}/LICENSE`)
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
    temporaryDirectory,
  )
  run(
    'Installed Node CJS SDK require',
    'node',
    ['--eval', "if (typeof require('@tqx-ai/sdk').TqxClient !== 'function') process.exit(1)"],
    temporaryDirectory,
  )
  run(
    'Installed Node CLI version',
    'node',
    [resolve(temporaryDirectory, 'node_modules/@tqx-ai/cli/dist/index.mjs'), '-V'],
    temporaryDirectory,
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
  version: string
}
