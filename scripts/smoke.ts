import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const esm = resolve(root, 'packages/sdk/dist/index.mjs')
const cjs = resolve(root, 'packages/sdk/dist/index.cjs')
const cli = resolve(root, 'packages/cli/dist/index.mjs')
const cliPackageJson = JSON.parse(
  readFileSync(resolve(root, 'packages/cli/package.json'), 'utf8'),
) as { version: string }

check('Node ESM SDK import', 'node', [
  '--input-type=module',
  '--eval',
  `import(${JSON.stringify(pathToFileURL(esm).href)}).then(m => { if (typeof m.TqxClient !== 'function') process.exit(1) })`,
])
check('Node CJS SDK require', 'node', [
  '--eval',
  `if (typeof require(${JSON.stringify(cjs)}).TqxClient !== 'function') process.exit(1)`,
])
check('Node CLI version', 'node', [cli, '-V'], cliPackageJson.version)
check('Node CLI help', 'node', [cli, '-H'], 'TQX trading and research command-line client')
check('Node CLI help includes research', 'node', [cli, '-H'], 'research')
check('Bun CLI version', process.execPath, [cli, '-V'], cliPackageJson.version)

function check(name: string, command: string, args: string[], expectedOutput?: string): void {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd: root })
  if (result.status !== 0 || (expectedOutput && !result.stdout.includes(expectedOutput))) {
    throw new Error(
      `${name} failed\nstdout: ${result.stdout}\nstderr: ${result.stderr}\nstatus: ${result.status}`,
    )
  }
  process.stdout.write(`ok - ${name}\n`)
}
