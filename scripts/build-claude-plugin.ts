import { relative, resolve } from 'node:path'

import { buildClaudePlugin } from './lib/claude-plugin'

const root = resolve(import.meta.dirname, '..')
const archive = buildClaudePlugin({
  sourceDirectory: resolve(root, 'plugins/agent-plugin'),
  outputDirectory: resolve(root, 'dist/claude-plugin'),
  licenseFile: resolve(root, 'LICENSE'),
})
process.stdout.write(`ok - Built Claude plugin directory and ${relative(root, archive)}\n`)
