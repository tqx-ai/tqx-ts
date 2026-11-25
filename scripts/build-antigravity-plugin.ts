import { relative, resolve } from 'node:path'

import { buildAntigravityPlugin } from './lib/antigravity-plugin'

const root = resolve(import.meta.dirname, '..')
const archive = buildAntigravityPlugin({
  sourceDirectory: resolve(root, 'plugins/agent-plugin'),
  outputDirectory: resolve(root, 'dist/antigravity-plugin'),
  licenseFile: resolve(root, 'LICENSE'),
})
process.stdout.write(`ok - Built Antigravity plugin directory and ${relative(root, archive)}\n`)
