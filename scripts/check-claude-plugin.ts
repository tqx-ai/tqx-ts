import { resolve } from 'node:path'

import { checkClaudePlugin } from './lib/claude-plugin'

const root = resolve(import.meta.dirname, '..')
checkClaudePlugin({
  sourceDirectory: resolve(root, 'plugins/agent-plugin'),
  outputDirectory: resolve(root, 'dist/claude-plugin'),
  licenseFile: resolve(root, 'LICENSE'),
})
process.stdout.write('ok - Claude plugin directory and ZIP match the canonical sources\n')
